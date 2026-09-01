-- The growth tab stopped loading, and the reason was hiding in a query plan.
--
-- SYMPTOM: /admin → Growth showed "canceling statement due to statement
-- timeout" (57014) on every load, for every operator, while the snapshot
-- underneath was perfectly healthy — pg_cron was rebuilding it every 12h in
-- 115ms and `select * from growth_snapshots` looked right. So the numbers on
-- screen were whatever the operator last managed to fetch, frozen: stale
-- because the read failed, not because the data was old.
--
-- CAUSE: `admin_report_tz()` (0074) validates a zone name against
-- `pg_timezone_names`, which is a set-returning function that reads and parses
-- the whole tzdata directory — ~50ms a call, and NOT indexable. It shipped as
-- `language sql`, which makes it a candidate for inlining, and 0074's
-- `growth_today()` is also `language sql` and reaches the zone through two
-- nested subqueries:
--
--     from (select t.tz, (now() at time zone t.tz)::date as today
--           from (select public.admin_report_tz(p_tz) as tz) t) d
--
-- The planner flattens both subqueries and inlines the function, so every
-- reference to `d.tz` / `d.today` becomes its own copy of the tzdata scan. Two
-- of those copies land in the per-row Filter on `profiles`:
--
--     Seq Scan on public.profiles  (actual time=2537.167..13694.934 rows=1)
--       Filter: (created_at >= (((now() AT TIME ZONE admin_report_tz('America/Chicago')))::date)::timestamp
--                              AT TIME ZONE admin_report_tz('America/Chicago'))
--       Rows Removed by Filter: 133
--
-- 134 accounts x 2 scans x ~50ms = ~14s for three counts whose own execution is
-- 2ms. The same expression against `plays` and `guest_opens` became an Index
-- Cond, which is evaluated once (48ms) — which is why only one of the three
-- counts was pathological and why nothing about the function looked wrong.
--
-- It is a GROWTH curve, not a constant: the cost is linear in the number of
-- accounts, so this crossed `authenticated`'s 8s statement_timeout at roughly
-- 80 profiles and gets worse with every signup. Nothing in the snapshot path
-- shows it — plpgsql calls `admin_report_tz` once, as a scalar assignment
-- rather than inside a query, which is exactly why the cron rebuild stayed at
-- 115ms while the dashboard read was dying.
--
-- FIX, in two independent parts, because either alone leaves the trap armed:
--
--   1. `admin_report_tz` becomes plpgsql. A plpgsql function is NEVER inlined
--      into a caller's expression tree, so the tzdata scan can no longer be
--      duplicated into a per-row filter by ANY call site, present or future.
--      Semantics are unchanged: trimmed, looked up in pg_timezone_names,
--      unknown or blank falls back to UTC.
--
--   2. `growth_today` becomes plpgsql and resolves the zone and the day into
--      local variables ONCE, the way `compute_growth_metrics` and
--      `admin_overview` already do. The three counts then compare against
--      plain constants.
--
-- The house pattern for an admin metric is unchanged and is worth restating,
-- since it is what (2) restores: take the day from `p_tz` into a local
-- variable at the top, never inline a zone lookup into a query predicate.
--
-- No signature, no return shape and no ACL changes here. `create or replace`
-- keeps the existing grants, and the revokes at the bottom are re-asserted
-- rather than assumed, because these two functions have no require_admin() of
-- their own (see 0074's note — and 0052's scar, where `revoke from public`
-- alone left anon and authenticated standing).

-- ————————————————————— resolve a zone, safely and ONCE —————————————————————
-- plpgsql, deliberately: it is the non-inlinable form. Do not "simplify" this
-- back to `language sql` — that is the whole bug this migration exists to fix,
-- and the failure is invisible in the function body. It only shows in a plan.
create or replace function public.admin_report_tz(p_tz text)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_name text := trim(coalesce(p_tz, ''));
begin
  if v_name = '' then
    return 'UTC';
  end if;
  -- ~50ms: pg_timezone_names parses the tzdata directory and cannot be
  -- indexed. That is fine ONCE per call. It is not fine per row.
  if exists (select 1 from pg_timezone_names n where n.name = v_name) then
    return v_name;
  end if;
  return 'UTC';
end;
$$;

-- ————————————————————————— today, always live —————————————————————————
-- Unchanged in purpose and in returned shape ('day', 'new_accounts',
-- 'players', 'guests') — admin_growth() stitches this over the cached series
-- and reads v_today->>'day' and v_today->'new_accounts'.
--
-- What changed is that v_tz and v_today are resolved once, into variables,
-- before any query runs. `plays.drop_date` and `guest_opens.drop_date` are
-- already the player's LOCAL date so they compare to v_today directly; only
-- `profiles.created_at` is an instant and needs the local-midnight boundary,
-- which is now computed once as v_day_start rather than per row.
create or replace function public.growth_today(p_tz text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz        text := public.admin_report_tz(p_tz);
  v_today     date;
  v_day_start timestamptz;
begin
  v_today     := (now() at time zone v_tz)::date;
  v_day_start := (v_today::timestamp) at time zone v_tz;

  return jsonb_build_object(
    'day',          v_today::text,
    'new_accounts', (select count(*) from public.profiles where created_at >= v_day_start),
    'players',      (select count(distinct user_id) from public.plays where drop_date = v_today),
    'guests',       (select count(distinct guest_id) from public.guest_opens where drop_date = v_today)
  );
end;
$$;

-- Re-assert 0074's lockdown. growth_today returns the operator's live funnel
-- and has no require_admin() of its own; it is safe only because nothing but
-- admin_growth() (which is definer and has already checked) can reach it.
-- `revoke ... from public` is NOT enough on Supabase — ALTER DEFAULT
-- PRIVILEGES grants anon and authenticated by name. Revoke the named roles too.
revoke all on function public.growth_today(text) from public, anon, authenticated;

notify pgrst, 'reload schema';
