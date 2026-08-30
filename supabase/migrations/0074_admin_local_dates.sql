-- The admin dashboard reports in the OPERATOR'S day, not the server's.
--
-- The bug this fixes: "New today" and "Active today" were counted against
-- `current_date`, which on this project resolves in UTC (the database's
-- TimeZone is UTC). An operator in the US reads "today" as their own calendar
-- day, so from UTC midnight until their own midnight — 5 to 8 hours every
-- single evening — the dashboard reported 0 new signups and 0 actives while
-- the day they were actually looking at had a full day's worth of both.
--
-- It was also a category error, not just an offset. `profiles.last_played_on`
-- is written from `p_drop_date`, which is the PLAYER's local date (the house
-- pattern in CLAUDE.md: the client sends todayLocalDate() and the server clamps
-- it ±1). Comparing a local-date column to a UTC `current_date` mixes two
-- different date systems, so "Active today" was never counting the thing its
-- label claimed even mid-day.
--
-- The fix is the same one the rest of the app already uses: the day comes from
-- the caller. Every admin metric that says "today" or "this week" now resolves
-- against an IANA zone the client passes in, validated server-side and falling
-- back to UTC. Nothing here trusts the client for anything but a zone NAME.

-- ————————————————————— resolve a zone, safely —————————————————————
-- AT TIME ZONE raises on an unknown zone, which would take the whole dashboard
-- down on a typo. Unknown or missing resolves to UTC, which is the behaviour
-- everything had before this migration.
create or replace function public.admin_report_tz(p_tz text)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select n.name from pg_timezone_names n where n.name = trim(coalesce(p_tz, '')) limit 1),
    'UTC'
  );
$$;

-- ————————————————————————— headline totals —————————————————————————
-- The zero-arg signature has to GO rather than stay alongside: with a defaulted
-- overload present, `admin_overview()` is ambiguous and every call errors.
drop function if exists public.admin_overview();

create or replace function public.admin_overview(p_tz text default 'UTC')
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_tz    text := public.admin_report_tz(p_tz);
  v_today date := (now() at time zone v_tz)::date;
  -- created_at is a timestamptz, so the boundary has to be an INSTANT (local
  -- midnight), not a bare date — comparing it to a date would silently coerce
  -- back to UTC midnight and reintroduce the bug.
  v_day_start  timestamptz := (v_today::timestamp) at time zone v_tz;
  v_week_start timestamptz := ((v_today - 6)::timestamp) at time zone v_tz;
begin
  perform public.require_admin();
  return jsonb_build_object(
    -- Echoed so the UI can say which day it is reporting, and so a wrong
    -- answer is visible rather than silent.
    'tz', v_tz,
    'today', v_today,
    'users', (select count(*) from public.profiles),
    'active_today', (select count(*) from public.profiles where last_played_on = v_today),
    'active_7d', (select count(*) from public.profiles where last_played_on >= v_today - 6),
    -- Was a rolling 168 hours, which never agreed with the growth tab's 7
    -- calendar-day chart. Now both mean the same seven local days.
    'new_7d', (select count(*) from public.profiles where created_at >= v_week_start),
    'new_today', (select count(*) from public.profiles where created_at >= v_day_start),
    'total_plays', (select coalesce(sum(total_plays), 0) from public.profiles),
    'battles_total', (select count(*) from public.battles),
    'battles_complete', (select count(*) from public.battles where status = 'complete'),
    'buddies_pairs', (select count(*) from public.buddies where status = 'accepted'),
    'buddy_requests_pending', (select count(*) from public.buddies where status = 'pending'),
    'skins_sold', (select coalesce(sum(coalesce(array_length(owned_skins, 1), 0)), 0) from public.profiles),
    'founders', (select count(*) from public.profiles where founder),
    'church_open', (select count(*) from public.church_inquiries where not handled),
    'church_total', (select count(*) from public.church_inquiries)
  );
end; $$;

grant execute on function public.admin_overview(text) to authenticated;

-- ————————————————————————— the growth snapshot —————————————————————————
-- The snapshot now remembers which zone it was bucketed in. A snapshot built in
-- a different zone is stale by definition, and pg_cron reuses the stored zone
-- so its every-12h precompute stays useful instead of being thrown away on the
-- first read.
alter table public.growth_snapshots add column if not exists tz text not null default 'UTC';

drop function if exists public.compute_growth_metrics();

create or replace function public.compute_growth_metrics(p_tz text default 'UTC')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz      text := public.admin_report_tz(p_tz);
  v_today   date := (now() at time zone v_tz)::date;
  v_day_start  timestamptz := (v_today::timestamp) at time zone v_tz;
  v_week_start timestamptz := ((v_today - 6)::timestamp) at time zone v_tz;
  v_prev_start timestamptz := ((v_today - 13)::timestamp) at time zone v_tz;
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
      'tz',           v_tz,
      'first_signup', (select (min(created_at) at time zone v_tz)::date from public.profiles),
      'first_play',   (select min(drop_date) from public.plays),
      'today',        v_today,
      -- The current day is always partial. The client must not trend on it.
      'partial_day',  v_today
    ),

    -- ——— headline ———
    -- new_7d / new_prev_7d are seven LOCAL CALENDAR days (today back six), not a
    -- rolling 168 hours, so the number agrees with the last seven bars of the
    -- chart below. They disagreed before, by three accounts on the day this was
    -- written, which is exactly the kind of drift that makes a dashboard
    -- untrustworthy.
    'headline', jsonb_build_object(
      'accounts',        (select count(*) from public.profiles),
      'players',         v_players,
      'zero_play_accts', (select count(*) from public.profiles p
                            where not exists (select 1 from public.plays pl where pl.user_id = p.id)),
      'guests',          (select count(distinct guest_id) from public.guest_opens),
      'plays',           v_total_plays,
      'active_7d',       (select count(distinct user_id) from public.plays
                            where drop_date >= v_today - 6),
      'active_28d',      (select count(distinct user_id) from public.plays
                            where drop_date >= v_today - 27),
      'new_today',       (select count(*) from public.profiles where created_at >= v_day_start),
      'new_7d',          (select count(*) from public.profiles where created_at >= v_week_start),
      'new_prev_7d',     (select count(*) from public.profiles
                            where created_at >= v_prev_start and created_at < v_week_start)
    ),

    -- ——— daily series, last 30 days (includes today; today is partial) ———
    -- plays.drop_date and guest_opens.drop_date are ALREADY the player's local
    -- date, so they bucket against v_today directly. Only profiles.created_at
    -- is an instant and has to be converted.
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day',          d::text,
        'new_accounts', (select count(*) from public.profiles p
                           where (p.created_at at time zone v_tz)::date = d),
        'players',      (select count(distinct pl.user_id) from public.plays pl where pl.drop_date = d),
        'guests',       (select count(distinct g.guest_id) from public.guest_opens g where g.drop_date = d)
      ) order by d)
      from (select generate_series(v_today - 29, v_today, '1 day'::interval)::date as d) s
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
        'partial',       weeks.w = date_trunc('week', v_today)::date
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
                            and max(drop_date) >= v_today - 6
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

-- ————————————————————————— today, always live —————————————————————————
-- The cached snapshot is up to twelve hours old. That is right for a 30-day
-- trend and wrong for the one number an operator refreshes the page to see: a
-- signup at 9am was invisible until the noon rebuild. So today's row is
-- recomputed on every read and stitched over the cached one. It is three
-- counts against one day, not the funnel scan that made the snapshot necessary.
create or replace function public.growth_today(p_tz text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'day',          d.today::text,
    'new_accounts', (select count(*) from public.profiles
                       where created_at >= (d.today::timestamp) at time zone d.tz),
    'players',      (select count(distinct user_id) from public.plays where drop_date = d.today),
    'guests',       (select count(distinct guest_id) from public.guest_opens where drop_date = d.today)
  )
  from (select t.tz, (now() at time zone t.tz)::date as today
        from (select public.admin_report_tz(p_tz) as tz) t) d;
$$;

-- ——————————————————————————— write the snapshot ———————————————————————————
-- Not granted to authenticated. Callers are pg_cron (as postgres) and
-- admin_growth(), which is definer and has already checked require_admin().
-- p_tz null means "the zone this snapshot was last built in", which is how the
-- cron job (`select public.refresh_growth_snapshot()`, unchanged) keeps
-- producing a snapshot the operator can actually use.
drop function if exists public.refresh_growth_snapshot();

create or replace function public.refresh_growth_snapshot(p_tz text default null)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz := clock_timestamp();
  v_tz text := public.admin_report_tz(
                 coalesce(p_tz, (select tz from public.growth_snapshots where id = 1)));
  v_payload jsonb;
  v_at timestamptz;
begin
  v_payload := public.compute_growth_metrics(v_tz);
  insert into public.growth_snapshots (id, payload, computed_at, compute_ms, tz)
  values (1, v_payload, now(),
          round(extract(milliseconds from clock_timestamp() - v_start))::int, v_tz)
  on conflict (id) do update
    set payload = excluded.payload,
        computed_at = excluded.computed_at,
        compute_ms = excluded.compute_ms,
        tz = excluded.tz
  returning computed_at into v_at;
  return v_at;
end;
$$;

-- These three are the ONLY functions in the growth path with no
-- require_admin() of their own — compute and growth_today return the entire
-- operator funnel (revenue, health, every business metric) and refresh writes.
-- They are safe only because nothing but pg_cron and admin_growth() can reach
-- them, so the revoke below is load-bearing rather than tidy.
--
-- `revoke ... from public` IS NOT ENOUGH, and 0052 shipped believing it was.
-- Supabase sets ALTER DEFAULT PRIVILEGES granting EXECUTE on new functions to
-- anon and authenticated EXPLICITLY; revoking the PUBLIC grant leaves both
-- named grants standing, so the pre-0074 versions of these were callable by
-- any signed-in user and by the anon key. Verified on the live project: their
-- ACLs read anon=X,authenticated=X while grant_skins — locked properly by 0047
-- — reads {postgres,service_role} only.
--
-- This is NOT the tolerated anon-executable pattern CLAUDE.md describes. That
-- one covers functions that guard themselves with `if uid is null then raise`.
-- These deliberately do not, which is exactly why they have to be unreachable.
-- Revoke from the named roles as well as PUBLIC.
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.refresh_growth_snapshot(text)',
    'public.compute_growth_metrics(text)',
    'public.growth_today(text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
  end loop;
end;
$$;

-- ——————————————————————————— read it (dashboard) ———————————————————————————
drop function if exists public.admin_growth(boolean);

create or replace function public.admin_growth(p_force boolean default false, p_tz text default 'UTC')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.growth_snapshots%rowtype;
  v_tz text := public.admin_report_tz(p_tz);
  v_stale boolean;
  v_today jsonb;
  v_daily jsonb;
  v_payload jsonb;
begin
  perform public.require_admin();

  select * into v_row from public.growth_snapshots where id = 1;
  v_stale := v_row.computed_at is null
          or v_row.computed_at < now() - interval '12 hours'
          -- A snapshot bucketed in another zone answers a different question.
          or v_row.tz is distinct from v_tz;

  if p_force or v_stale then
    perform public.refresh_growth_snapshot(v_tz);
    select * into v_row from public.growth_snapshots where id = 1;
  end if;

  -- Overlay today. Keep every cached row STRICTLY BEFORE today and append the
  -- live one, rather than replacing the last element: the cached series can end
  -- on yesterday (the operator's midnight passed since the rebuild) or, if the
  -- snapshot was built in another zone, on a day that is still in the future
  -- here. Replacing-or-appending got the second case wrong and produced a
  -- series that ran ...08-30, 08-29, which draws the chart backwards.
  -- Day keys are ISO, so a text sort is a date sort.
  v_payload := v_row.payload;
  v_today := public.growth_today(v_tz);
  select coalesce(jsonb_agg(e order by e->>'day'), '[]'::jsonb)
    into v_daily
    from jsonb_array_elements(coalesce(v_payload->'daily', '[]'::jsonb)) e
   where e->>'day' < (v_today->>'day');
  v_daily := v_daily || jsonb_build_array(v_today);
  v_payload := jsonb_set(v_payload, '{daily}', v_daily);
  v_payload := jsonb_set(v_payload, '{headline,new_today}', v_today->'new_accounts');
  v_payload := jsonb_set(v_payload, '{window,today}', to_jsonb(v_today->>'day'));
  v_payload := jsonb_set(v_payload, '{window,partial_day}', to_jsonb(v_today->>'day'));

  return jsonb_build_object(
    'metrics',     v_payload,
    'tz',          v_tz,
    'computed_at', v_row.computed_at,
    'compute_ms',  v_row.compute_ms,
    'stale',       v_row.computed_at < now() - interval '12 hours',
    'next_refresh_due', v_row.computed_at + interval '12 hours'
  );
end;
$$;

grant execute on function public.admin_growth(boolean, text) to authenticated;

notify pgrst, 'reload schema';
