-- Growth metrics for the admin dashboard.
--
-- admin_overview() (0026) answers "what are the totals right now". This answers
-- the different question: is the thing growing, and where is it leaking. Those
-- numbers are expensive — distinct-user counts across plays, guest_opens and a
-- dozen feature tables, plus week-over-week retention — so they are NOT computed
-- per page view. They are computed into a snapshot and read from there.
--
-- Freshness is guaranteed twice, on purpose:
--   1. pg_cron runs refresh_growth_snapshot() every 12 hours (best effort — the
--      extension may not be enabled, so the migration tolerates it failing).
--   2. admin_growth() refreshes lazily if the snapshot it finds is older than
--      12 hours. This is the real guarantee, and it holds with no cron at all.
--
-- Everything here is relative to current_date. There are no hardcoded dates.

-- ————————————————————————————— the snapshot —————————————————————————————
-- Exactly one row, ever. The check constraint is the enforcement.
create table if not exists public.growth_snapshots (
  id           integer primary key default 1 check (id = 1),
  payload      jsonb not null,
  computed_at  timestamptz not null default now(),
  compute_ms   integer
);

alter table public.growth_snapshots enable row level security;
-- No policy, deliberately. This is operator-only data (it includes the whole
-- funnel), and it is read exclusively through admin_growth(), which is
-- security definer and re-checks require_admin(). RLS with no policy means a
-- direct client read returns nothing, which is exactly right.

-- ——————————————————————————— compute the numbers ———————————————————————————
-- Internal. No auth check here — the only callers are refresh_growth_snapshot()
-- and admin_growth(), both of which gate access themselves.
create or replace function public.compute_growth_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_players    integer;  -- accounts with at least one recorded daily play
  v_pdenom     numeric;  -- same, floored at 1 so percentages never divide by zero
  v_total_plays integer;
begin
  select count(distinct user_id) into v_players from public.plays;
  v_pdenom := greatest(v_players, 1)::numeric;
  select count(*) into v_total_plays from public.plays;

  return jsonb_build_object(

    -- ——— window ———
    'window', jsonb_build_object(
      'first_signup', (select min(created_at)::date from public.profiles),
      'first_play',   (select min(drop_date) from public.plays),
      'today',        current_date,
      -- The current day is always partial. The client must not trend on it.
      'partial_day',  current_date
    ),

    -- ——— headline ———
    'headline', jsonb_build_object(
      'accounts',        (select count(*) from public.profiles),
      'players',         v_players,
      'zero_play_accts', (select count(*) from public.profiles p
                            where not exists (select 1 from public.plays pl where pl.user_id = p.id)),
      'guests',          (select count(distinct guest_id) from public.guest_opens),
      'plays',           v_total_plays,
      'active_7d',       (select count(distinct user_id) from public.plays
                            where drop_date >= current_date - 6),
      'active_28d',      (select count(distinct user_id) from public.plays
                            where drop_date >= current_date - 27),
      'new_7d',          (select count(*) from public.profiles
                            where created_at >= now() - interval '7 days'),
      'new_prev_7d',     (select count(*) from public.profiles
                            where created_at >= now() - interval '14 days'
                              and created_at <  now() - interval '7 days')
    ),

    -- ——— daily series, last 30 days (includes today; today is partial) ———
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day',          d::text,
        'new_accounts', (select count(*) from public.profiles p where p.created_at::date = d),
        'players',      (select count(distinct pl.user_id) from public.plays pl where pl.drop_date = d),
        'guests',       (select count(distinct g.guest_id) from public.guest_opens g where g.drop_date = d)
      ) order by d)
      from (select generate_series(current_date - 29, current_date, '1 day'::interval)::date as d) s
    ), '[]'::jsonb),

    -- ——— week over week: actives, and how many of last week's came back ———
    -- ISO weeks (Monday-based). retained/prior_actives is the retention rate;
    -- the newest week is partial until Sunday, and is flagged as such.
    'weekly', coalesce((
      with wk as (
        select distinct user_id, date_trunc('week', drop_date)::date as w from public.plays
      ), weeks as (
        select distinct w from wk order by w desc limit 6
      )
      select jsonb_agg(jsonb_build_object(
        'week',          weeks.w::text,
        'actives',       (select count(*) from wk where wk.w = weeks.w),
        'prior_actives', (select count(*) from wk where wk.w = weeks.w - 7),
        'retained',      (select count(*) from wk a where a.w = weeks.w
                            and exists (select 1 from wk b where b.user_id = a.user_id and b.w = weeks.w - 7)),
        'partial',       weeks.w = date_trunc('week', current_date)::date
      ) order by weeks.w)
      from weeks
    ), '[]'::jsonb),

    -- ——— how many distinct days each player has shown up ———
    'depth', (
      with dp as (select user_id, count(distinct drop_date) as d from public.plays group by 1)
      select jsonb_build_object(
        'd1',    count(*) filter (where d = 1),
        'd2',    count(*) filter (where d = 2),
        'd3_6',  count(*) filter (where d between 3 and 6),
        'd7_13', count(*) filter (where d between 7 and 13),
        'd14p',  count(*) filter (where d >= 14),
        'max',   coalesce(max(d), 0)
      ) from dp
    ),

    -- ——— the guest funnel: played without an account ———
    'guests', (
      with g as (select guest_id, count(distinct drop_date) as d from public.guest_opens group by 1)
      select jsonb_build_object(
        'total',      count(*),
        'one_day',    count(*) filter (where d = 1),
        'returned',   count(*) filter (where d >= 2),
        'three_plus', count(*) filter (where d >= 3),
        'max_days',   coalesce(max(d), 0),
        -- Guests seen in the last 7 days who have already come back at least
        -- once: the warmest signup prospects the product has.
        'warm_now',   (select count(*) from (
                         select guest_id from public.guest_opens
                         group by guest_id
                         having count(distinct drop_date) >= 2
                            and max(drop_date) >= current_date - 6
                       ) w)
      ) from g
    ),

    -- ——— feature adoption, as a share of accounts that have ever played ———
    'features', (
      select jsonb_agg(f order by (f->>'users')::int desc) from (
        select jsonb_build_object('key', k, 'label', l, 'users', u,
                                  'pct', round(100.0 * u / v_pdenom)) as f
        from (values
          ('daily',      'Daily drop',              (select count(distinct user_id)::int from public.plays)),
          ('unlocks',    'Collectible unlocks',     (select count(distinct user_id)::int from public.user_unlocks)),
          ('inventory',  'Chest / inventory',       (select count(distinct user_id)::int from public.user_inventory)),
          ('study',      'Study — book accuracy',   (select count(distinct user_id)::int from public.book_accuracy)),
          ('review',     'Verse review (spaced)',   (select count(distinct user_id)::int from public.verse_reviews)),
          ('battles',    'Battles',                 (select count(distinct u)::int from (
                                                       select challenger_id u from public.battles
                                                       union select opponent_id from public.battles) b
                                                     where u is not null)),
          ('buddies',    'Buddies (accepted)',      (select count(distinct u)::int from (
                                                       select requester_id u from public.buddies where status = 'accepted'
                                                       union select addressee_id from public.buddies where status = 'accepted') y)),
          ('focus',      'Focus drill',             (select count(distinct user_id)::int from public.focus_practice_days)),
          ('church',     'Churches',                (select count(*)::int from public.profiles where church_id is not null)),
          ('groups',     'Groups',                  (select count(distinct user_id)::int from public.group_members)),
          ('bible',      'Bible marks',             (select count(distinct user_id)::int from public.bible_marks)),
          ('favorites',  'Saved verses',            (select count(distinct user_id)::int from public.favorite_verses)),
          ('offerings',  'Church offerings',        (select count(distinct user_id)::int from public.church_offerings)),
          ('practice',   'Practice replay',         (select count(distinct user_id)::int from public.practice_plays)),
          ('referrals',  'Referrals',               (select count(*)::int from public.profiles where referred_by is not null))
        ) as t(k, l, u)
      ) rows
    ),

    -- ——— the loops that are supposed to bring people in ———
    'viral', jsonb_build_object(
      'referred_accounts',  (select count(*) from public.profiles where referred_by is not null),
      'buddy_accepted',     (select count(*) from public.buddies where status = 'accepted'),
      'buddy_pending',      (select count(*) from public.buddies where status = 'pending'),
      'buddy_total',        (select count(*) from public.buddies),
      'battles_real',       (select count(*) from public.battles where not is_welcome),
      'battles_real_done',  (select count(*) from public.battles where not is_welcome and status = 'complete'),
      'battles_broadcast',  (select count(*) from public.battles where broadcast),
      'push_subscriptions', (select count(*) from public.push_subscriptions)
    ),

    -- ——— is the game itself tuned right ———
    'quality', jsonb_build_object(
      'avg_pct_correct', (select round(avg(correct_count::numeric / nullif(total_questions, 0)) * 100, 1)
                            from public.plays),
      'avg_secs',        (select round(avg(time_ms) / 1000.0, 1) from public.plays),
      'streak_3plus',    (select count(*) from public.profiles where current_streak >= 3),
      'streak_7plus',    (select count(*) from public.profiles where current_streak >= 7),
      'streak_max',      (select coalesce(max(longest_streak), 0) from public.profiles),
      -- How much of all play comes from the ten heaviest players. High means
      -- the averages above are describing a handful of people.
      'top10_share',     (select round(100.0 * coalesce(sum(n), 0) / greatest(v_total_plays, 1), 1)
                            from (select count(*) as n from public.plays
                                  group by user_id order by count(*) desc limit 10) r)
    ),

    -- ——— money ———
    'money', jsonb_build_object(
      'stripe_granted',   (select count(*) from public.skin_purchases where granted),
      'apple_purchases',  (select count(*) from public.apple_purchases),
      'accounts_w_skins', (select count(*) from public.profiles where coalesce(array_length(owned_skins, 1), 0) > 0)
    ),

    -- ——— can these numbers be trusted ———
    -- Self-monitoring. onboarded_gap counts accounts that have played but were
    -- never flagged onboarded (0053 fixes the cause and backfills; if this ever
    -- climbs again, a write path is bypassing the trigger). rls_disabled lists
    -- any public table left readable/writable by the anon key.
    'health', jsonb_build_object(
      'onboarded_gap', (select count(*) from public.profiles p
                          where not p.onboarded
                            and exists (select 1 from public.plays pl where pl.user_id = p.id)),
      'rls_disabled', coalesce((
        select jsonb_agg(c.relname order by c.relname)
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
      ), '[]'::jsonb)
    )
  );
end;
$$;

-- ——————————————————————————— write the snapshot ———————————————————————————
-- Not granted to authenticated. Callers are pg_cron (as postgres) and
-- admin_growth(), which is definer and has already checked require_admin().
create or replace function public.refresh_growth_snapshot()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz := clock_timestamp();
  v_payload jsonb;
  v_at timestamptz;
begin
  v_payload := public.compute_growth_metrics();
  insert into public.growth_snapshots (id, payload, computed_at, compute_ms)
  values (1, v_payload, now(),
          round(extract(milliseconds from clock_timestamp() - v_start))::int)
  on conflict (id) do update
    set payload = excluded.payload,
        computed_at = excluded.computed_at,
        compute_ms = excluded.compute_ms
  returning computed_at into v_at;
  return v_at;
end;
$$;

revoke execute on function public.refresh_growth_snapshot() from public;
revoke execute on function public.compute_growth_metrics() from public;

-- ——————————————————————————— read it (dashboard) ———————————————————————————
-- Returns the cached snapshot. Refreshes first if it is missing or stale, so
-- the dashboard is correct to within 12 hours whether or not cron is running.
-- p_force lets the operator pull fresh numbers on demand from the UI.
create or replace function public.admin_growth(p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.growth_snapshots%rowtype;
  v_stale boolean;
begin
  perform public.require_admin();

  select * into v_row from public.growth_snapshots where id = 1;
  v_stale := v_row.computed_at is null or v_row.computed_at < now() - interval '12 hours';

  if p_force or v_stale then
    perform public.refresh_growth_snapshot();
    select * into v_row from public.growth_snapshots where id = 1;
  end if;

  return jsonb_build_object(
    'metrics',     v_row.payload,
    'computed_at', v_row.computed_at,
    'compute_ms',  v_row.compute_ms,
    'stale',       v_row.computed_at < now() - interval '12 hours',
    'next_refresh_due', v_row.computed_at + interval '12 hours'
  );
end;
$$;

grant execute on function public.admin_growth(boolean) to authenticated;

-- Seed one immediately so the first dashboard load is instant.
select public.refresh_growth_snapshot();

-- ————————————————————————— schedule it every 12 hours —————————————————————————
-- Best effort. If pg_cron cannot be enabled on this project the migration still
-- succeeds and admin_growth()'s lazy refresh keeps the 12-hour guarantee.
-- cron.schedule() upserts by job name, so re-running this is a no-op.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'refresh-growth-snapshot',
    '0 */12 * * *',
    $cron$select public.refresh_growth_snapshot()$cron$
  );
  raise notice 'growth: pg_cron scheduled every 12h';
exception when others then
  raise notice 'growth: pg_cron unavailable (%) — falling back to lazy refresh in admin_growth()', sqlerrm;
end;
$$;

notify pgrst, 'reload schema';
