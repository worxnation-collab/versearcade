-- The weekly rivalry — church against church, and the statues a win buys.
--
-- See src/features/church/rivalry.ts for the design of record and the reason
-- this feature is allowed to have a loser in it at all (short version: a CHURCH
-- may lose a week; a PERSON still never loses anything, anywhere). The rules
-- that have to hold on this side of the wire:
--
--   TWO NUMBERS AND A NAME, AND NOTHING ELSE CROSSES THE WIRE. `church_rivalry`
--   returns the caller's church total, the opponent's church total, and the
--   opponent's name. It does NOT return the opponent's members, their per-member
--   giving, or any breakdown of its own church's week. A "top contributor this
--   week" board is the exact feature this app must not have, so the data to
--   build one is never sent — that is a stronger guarantee than a UI decision,
--   and it is the point of shaping the RPC this way.
--
--   LOSING WRITES NOTHING. There is no loss column, no streak, no rating. A
--   settled week that was lost leaves behind exactly one row in
--   church_rivalry_matchups with its final scores, and nothing else changes
--   anywhere in the database. There is deliberately no index or RPC that could
--   answer "which churches lose the most".
--
--   THE SCORE IS DERIVED, NEVER STORED WHILE LIVE. A week's total is a sum over
--   the three existing timestamped ledgers (church_contributions,
--   church_offerings, keep_offerings). No new counter, nothing to drift, and no
--   client ever sends a score — the same reason wash_feet and record_prayer
--   count rows server-side instead of trusting an amount.
--
--   NO CRON, EVER. Nothing in this project runs on a schedule (migrations are
--   applied by hand; there is no edge scheduler). So pairing and settling are
--   LAZY and IDEMPOTENT: the first member of a church to open the tab in a new
--   week creates that week's matchup, and the first to open it after a week
--   ends banks the result. Both are guarded by unique keys, so twenty members
--   opening the tab at once produce one matchup and one win row.
--
-- Idempotent throughout: create ... if not exists, drop policy if exists,
-- create or replace function.

-- ── The week ────────────────────────────────────────────────────────────────
-- UTC, deliberately, and the only place in this schema that does not take the
-- caller's local date. A rivalry spans two congregations that may span several
-- time zones, and every member of both has to agree about whether a gift landed
-- inside the week. Two clocks means a point that counts for one member and not
-- another. 2024-01-01 was a Monday. Mirrors weekIndex() in rivalry.ts.
create or replace function public.church_rivalry_week(p_at timestamptz default now())
returns integer
language sql
immutable
parallel safe
as $$
  select floor(
    extract(epoch from (coalesce(p_at, now()) - timestamptz '2024-01-01 00:00:00+00')) / 604800
  )::integer;
$$;

create or replace function public.church_rivalry_week_start(p_week integer)
returns timestamptz
language sql
immutable
parallel safe
as $$
  select timestamptz '2024-01-01 00:00:00+00' + (p_week * interval '7 days');
$$;

-- ── Size bands ──────────────────────────────────────────────────────────────
-- Why banded rather than uniformly random: a four-person congregation drawn
-- against a two-hundred-person one loses every week forever, which teaches the
-- churches this feature exists for that showing up was pointless. Banding makes
-- the week winnable by out-recruiting somebody your own size, which is the
-- behaviour the whole thing is trying to produce.
--
-- KEEP IN SYNC with BANDS in src/features/church/rivalry.ts.
create or replace function public.church_rivalry_band(p_members integer)
returns integer
language sql
immutable
parallel safe
as $$
  select case
    when coalesce(p_members, 0) <= 2  then 0
    when p_members <= 5  then 1
    when p_members <= 12 then 2
    when p_members <= 30 then 3
    when p_members <= 75 then 4
    else 5
  end;
$$;

-- ── Matchups ────────────────────────────────────────────────────────────────
-- One row per church per week. Two churches paired together get two rows that
-- point at each other, rather than one row with an a/b side: it makes "the
-- caller's church's matchup for this week" a primary-key lookup, and it makes a
-- bye (opponent_id null) the same shape as a real pairing instead of a special
-- case that every query has to remember.
--
-- `settled_at` + the two frozen scores are what a finished week leaves behind.
-- While a week is live both scores are null and the real numbers are summed
-- from the ledgers on read.
create table if not exists public.church_rivalry_matchups (
  church_id    uuid not null references public.churches(id) on delete cascade,
  week         integer not null,
  opponent_id  uuid references public.churches(id) on delete set null,
  band         integer not null,
  created_at   timestamptz not null default now(),
  settled_at   timestamptz,
  -- Frozen at settle time so a finished week can never be re-scored by a late
  -- gift, a church being deleted, or a member leaving.
  final_mine   bigint,
  final_theirs bigint,
  outcome      text check (outcome in ('won', 'drew', 'lost', 'quiet', 'bye')),
  primary key (church_id, week)
);

create index if not exists church_rivalry_week_idx
  on public.church_rivalry_matchups (week, band) where opponent_id is null;

alter table public.church_rivalry_matchups enable row level security;
drop policy if exists "rivalry readable" on public.church_rivalry_matchups;
-- Public read: a church's page shows its own record, and that page is public
-- (0074). Every write goes through the definer functions below, so there is
-- deliberately no insert/update/delete policy.
create policy "rivalry readable" on public.church_rivalry_matchups for select using (true);

-- ── Wins ────────────────────────────────────────────────────────────────────
-- One row per statue a church has earned the right to raise. Separate from the
-- matchup row because this is the LADDER — it only ever goes up, it survives a
-- matchup row being cascaded away by a deleted opponent, and it is the single
-- number the statue path checks. There is no matching losses table on purpose.
create table if not exists public.church_rivalry_wins (
  church_id uuid not null references public.churches(id) on delete cascade,
  week      integer not null,
  earned_at timestamptz not null default now(),
  primary key (church_id, week)
);

alter table public.church_rivalry_wins enable row level security;
drop policy if exists "rivalry wins readable" on public.church_rivalry_wins;
create policy "rivalry wins readable" on public.church_rivalry_wins for select using (true);

-- ── Statues ─────────────────────────────────────────────────────────────────
-- What is standing in the yard. Per CHURCH, not per player — this is the one
-- thing in the churchyard that is the congregation's rather than the giver's,
-- which is exactly what makes it a trophy. Any member may raise or change one;
-- there is no church admin in this app and inventing one for a garden ornament
-- would be a permissions system nobody asked for.
--
-- `set_by` is stored for support/abuse forensics only. It is never returned by
-- any RPC and never rendered: a statue that carried a name would turn the
-- congregation's trophy into one member's, and "who put that there" is the
-- first step to "who didn't".
create table if not exists public.church_statues (
  church_id uuid not null references public.churches(id) on delete cascade,
  plinth    text not null,
  statue_id text not null,
  set_by    uuid references public.profiles(id) on delete set null,
  set_at    timestamptz not null default now(),
  primary key (church_id, plinth)
);

alter table public.church_statues enable row level security;
drop policy if exists "church statues readable" on public.church_statues;
create policy "church statues readable" on public.church_statues for select using (true);
-- No write policy: set_church_statue is the only way a row moves.

-- KEEP IN SYNC with STATUES in src/features/church/rivalry.ts. An unknown id is
-- rejected, so a statue from a newer build is inert rather than half-working.
create or replace function public.church_statue_exists(p_statue text)
returns boolean
language sql
immutable
parallel safe
as $$
  select p_statue in (
    'statue_shepherd', 'statue_mary', 'statue_moses', 'statue_angel',
    'statue_david', 'statue_dove', 'statue_tomb', 'statue_lion_lamb'
  );
$$;

-- ── A church's week, scored ─────────────────────────────────────────────────
-- Every point that landed in a church's bank inside the window, from all three
-- ledgers that can put one there. Summing the ledgers rather than keeping a
-- counter means there is nothing to drift and nothing to backfill, and it means
-- a relic given to the church counts for the week exactly like a direct gift —
-- which it should, since both are somebody choosing their congregation.
--
-- Note what this does NOT do: it never groups by user. The function returns one
-- integer for a whole congregation, and no caller can ask it for a breakdown.
create or replace function public.church_week_points(p_church_id uuid, p_week integer)
returns bigint
language sql
stable
security definer set search_path = public
as $$
  with w as (
    select public.church_rivalry_week_start(p_week) as s,
           public.church_rivalry_week_start(p_week + 1) as e
  )
  select coalesce((
    select coalesce(sum(cc.points), 0) from public.church_contributions cc, w
     where cc.church_id = p_church_id and cc.created_at >= w.s and cc.created_at < w.e
  ), 0)::bigint
  + coalesce((
    select coalesce(sum(co.points), 0) from public.church_offerings co, w
     where co.church_id = p_church_id and co.created_at >= w.s and co.created_at < w.e
  ), 0)::bigint
  + coalesce((
    select coalesce(sum(ko.points), 0) from public.keep_offerings ko, w
     where ko.church_id = p_church_id and ko.created_at >= w.s and ko.created_at < w.e
  ), 0)::bigint;
$$;

-- ── Pairing ─────────────────────────────────────────────────────────────────
-- Lazy: called for one church, for one week, and safe to call from twenty
-- devices at once. Finds the nearest-band church that has no matchup yet this
-- week, writes both sides, and returns the caller's row. A church with nobody
-- to play gets a bye row, which is not a loss and is re-tried on the next call
-- until an opponent turns up.
--
-- Fairness of the draw: candidates are ordered by band distance first, then by
-- md5(week || id) — deterministic, unguessable in advance, and NOT first-come,
-- so opening the app early or late cannot steer who you play.
create or replace function public.church_rivalry_pair(p_church_id uuid, p_week integer)
returns public.church_rivalry_matchups
language plpgsql
security definer set search_path = public
as $$
declare
  v_row public.church_rivalry_matchups%rowtype;
  v_members integer;
  v_band integer;
  v_opp uuid;
  v_opp_band integer;
begin
  select * into v_row from public.church_rivalry_matchups
   where church_id = p_church_id and week = p_week;
  -- A real pairing is final for the week. A bye falls through and re-tries, so
  -- a church that was alone on Monday can still get a game on Tuesday.
  if found and v_row.opponent_id is not null then return v_row; end if;

  select count(*) into v_members from public.profiles where church_id = p_church_id;
  if v_members < 1 then
    -- An empty church is not paired at all: it cannot give anything, so it
    -- would be a guaranteed free win for whoever drew it.
    return null;
  end if;
  v_band := public.church_rivalry_band(v_members);

  -- Serialise pairing so two churches can't claim each other simultaneously and
  -- write half a matchup. One lock for the whole week is coarse and correct;
  -- this runs once per church per week, not per read.
  perform pg_advisory_xact_lock(hashtext('church_rivalry_pair'), p_week);

  -- Re-check inside the lock: another device may have paired us while we waited.
  select * into v_row from public.church_rivalry_matchups
   where church_id = p_church_id and week = p_week;
  if found and v_row.opponent_id is not null then return v_row; end if;

  select c.id, public.church_rivalry_band(mc.n) into v_opp, v_opp_band
  from public.churches c
  join lateral (
    select count(*)::integer as n from public.profiles pr where pr.church_id = c.id
  ) mc on true
  left join public.church_rivalry_matchups m
    on m.church_id = c.id and m.week = p_week
  where c.id <> p_church_id
    and mc.n >= 1
    -- Free iff unpaired: no row at all, or a bye still looking for a game.
    and (m.church_id is null or m.opponent_id is null)
  order by abs(public.church_rivalry_band(mc.n) - v_band),
           md5(p_week::text || c.id::text)
  limit 1;

  if v_opp is null then
    -- Nobody to play. Record the bye so the card can say so plainly rather than
    -- showing an empty scoreboard, and so a later call knows to keep looking.
    insert into public.church_rivalry_matchups (church_id, week, opponent_id, band)
    values (p_church_id, p_week, null, v_band)
    on conflict (church_id, week) do update set band = excluded.band
    returning * into v_row;
    return v_row;
  end if;

  -- Both sides, in one statement, so a matchup is never half-written. The
  -- band recorded on each row is that church's own.
  insert into public.church_rivalry_matchups (church_id, week, opponent_id, band)
  values (p_church_id, p_week, v_opp, v_band),
         (v_opp, p_week, p_church_id, v_opp_band)
  on conflict (church_id, week) do update set
    opponent_id = excluded.opponent_id,
    band = excluded.band;

  select * into v_row from public.church_rivalry_matchups
   where church_id = p_church_id and week = p_week;
  return v_row;
end;
$$;

-- ── Settling ────────────────────────────────────────────────────────────────
-- Freeze every finished, unsettled week for one church and bank any statue it
-- earned. Idempotent by the unique keys, so it is safe to run on every read.
--
-- A draw pays BOTH churches: the rule is that a church has to out-give somebody
-- to win, and two congregations that gave exactly as much as each other both
-- did. A 0-0 pays nobody, so a dormant opponent is never a free statue.
create or replace function public.church_rivalry_settle(p_church_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  m record;
  v_mine bigint;
  v_theirs bigint;
  v_outcome text;
begin
  for m in
    select * from public.church_rivalry_matchups
     where church_id = p_church_id
       and settled_at is null
       and week < public.church_rivalry_week()
     order by week
  loop
    v_mine := public.church_week_points(p_church_id, m.week);
    v_theirs := case
      when m.opponent_id is null then 0
      else public.church_week_points(m.opponent_id, m.week)
    end;

    v_outcome := case
      when m.opponent_id is null then 'bye'
      when v_mine <= 0 and v_theirs <= 0 then 'quiet'
      when v_mine > v_theirs then 'won'
      when v_mine < v_theirs then 'lost'
      else 'drew'
    end;

    update public.church_rivalry_matchups
       set settled_at = now(), final_mine = v_mine, final_theirs = v_theirs, outcome = v_outcome
     where church_id = p_church_id and week = m.week;

    if v_outcome in ('won', 'drew') then
      insert into public.church_rivalry_wins (church_id, week)
      values (p_church_id, m.week)
      on conflict (church_id, week) do nothing;
    end if;
  end loop;
end;
$$;

-- ── Raise a statue ──────────────────────────────────────────────────────────
-- Any member of the church may set, change or clear a plinth. What is VERIFIED
-- is that the church has earned enough wins for the number of plinths that
-- would be filled afterwards — a real count of real rows the server wrote
-- itself, so like the churchyard's ladder (and unlike the keep's clamped
-- counters) there is nothing to trust the client about.
--
-- Changing a statue is always free and never costs a win: wins are lifetime and
-- only go up, exactly like lifetime-given. It was won, not deposited.
create or replace function public.set_church_statue(p_plinth text, p_statue text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_church_id uuid;
  v_wins integer;
  v_after integer;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select church_id into v_church_id from public.profiles where id = uid;
  if v_church_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_church');
  end if;

  -- The plinth set is fixed (PLINTHS in rivalry.ts). Validating against it
  -- bounds rows per church and keeps free text out of the table.
  if p_plinth !~ '^(plinth_l|plinth_r|plinth_gate)$' then raise exception 'bad plinth'; end if;

  if p_statue is null then
    delete from public.church_statues where church_id = v_church_id and plinth = p_plinth;
    return jsonb_build_object('ok', true);
  end if;

  if not public.church_statue_exists(p_statue) then raise exception 'bad statue'; end if;

  select count(*)::integer into v_wins from public.church_rivalry_wins where church_id = v_church_id;
  select count(*)::integer into v_after from public.church_statues
   where church_id = v_church_id and plinth <> p_plinth;
  -- Filling this plinth makes it v_after + 1 statues standing.
  if v_after + 1 > least(v_wins, 3) then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'wins', v_wins);
  end if;

  insert into public.church_statues (church_id, plinth, statue_id, set_by, set_at)
  values (v_church_id, p_plinth, p_statue, uid, now())
  on conflict (church_id, plinth) do update set
    statue_id = excluded.statue_id, set_by = excluded.set_by, set_at = excluded.set_at;

  return jsonb_build_object('ok', true, 'wins', v_wins);
end;
$$;

-- ── A church's statues, for any yard ────────────────────────────────────────
-- Plinth -> statue for the scene behind a leaderboard row, plus the win count.
-- Unlike church_yard_json this is NOT sampled per viewer: a statue is the
-- congregation's, so every visitor sees the same one standing there. Wins are
-- returned because they are the number the church earned, and it is the one
-- number in this feature that is safe to publish — it says a church showed up,
-- and it cannot say that anybody else didn't.
create or replace function public.church_statues_json(p_church_id uuid)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'wins', (select count(*) from public.church_rivalry_wins where church_id = p_church_id),
    'statues', coalesce((
      select jsonb_object_agg(plinth, statue_id)
      from public.church_statues where church_id = p_church_id
    ), '{}'::jsonb)
  );
$$;

-- ── The one read the tab makes ──────────────────────────────────────────────
-- Settles anything outstanding, pairs the current week, and returns the card:
-- this week live, last week's result, the win ladder and what is standing in
-- the yard. One round trip, because all four change together.
--
-- Look at what is in this payload and what is not. Two totals and a name. No
-- opponent roster, no per-member anything, no history beyond the single most
-- recent result. A losing streak cannot be computed from this, which is
-- deliberate: the shape of the payload is the guarantee.
create or replace function public.church_rivalry()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_church_id uuid;
  v_week integer := public.church_rivalry_week();
  v_row public.church_rivalry_matchups%rowtype;
  v_last public.church_rivalry_matchups%rowtype;
  v_opp public.churches%rowtype;
  v_last_opp public.churches%rowtype;
  v_wins integer;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select church_id into v_church_id from public.profiles where id = uid;
  if v_church_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_church');
  end if;

  perform public.church_rivalry_settle(v_church_id);
  v_row := public.church_rivalry_pair(v_church_id, v_week);

  select * into v_last from public.church_rivalry_matchups
   where church_id = v_church_id and settled_at is not null
   order by week desc limit 1;

  if v_row.opponent_id is not null then
    select * into v_opp from public.churches where id = v_row.opponent_id;
  end if;
  if v_last.opponent_id is not null then
    select * into v_last_opp from public.churches where id = v_last.opponent_id;
  end if;

  select count(*)::integer into v_wins from public.church_rivalry_wins where church_id = v_church_id;

  return jsonb_build_object(
    'ok', true,
    'week', v_week,
    'week_ends_at', public.church_rivalry_week_start(v_week + 1),
    'band', coalesce(v_row.band, public.church_rivalry_band(
      (select count(*)::integer from public.profiles where church_id = v_church_id))),
    'mine', public.church_week_points(v_church_id, v_week),
    'theirs', case when v_row.opponent_id is null then 0
                   else public.church_week_points(v_row.opponent_id, v_week) end,
    -- The opponent, through the shared church_json so the card draws the same
    -- building the board does — including its skin (0051). Note that church_json
    -- carries a member count and banked XP, which is exactly what a leaderboard
    -- row already shows about any church to anybody: this adds no visibility.
    -- What is NOT here is the opponent's roster or any per-member number.
    'opponent', case when v_opp.id is null then null else public.church_json(v_opp) end,
    'last', case when v_last.church_id is null then null else jsonb_build_object(
      'week', v_last.week,
      'outcome', v_last.outcome,
      'mine', coalesce(v_last.final_mine, 0),
      'theirs', coalesce(v_last.final_theirs, 0),
      'opponent_name', v_last_opp.name
    ) end,
    'wins', v_wins,
    'statues', coalesce((
      select jsonb_object_agg(plinth, statue_id)
      from public.church_statues where church_id = v_church_id
    ), '{}'::jsonb)
  );
end;
$$;

-- Note the pattern from CLAUDE.md: Postgres grants EXECUTE to PUBLIC by default
-- and Supabase additionally grants anon/authenticated, so these are effectively
-- anon-callable. Every one of them either guards itself with an auth.uid() null
-- check (the two that write) or returns only what the public church page
-- already publishes. Nothing here is tightened in isolation.
grant execute on function public.church_rivalry_week(timestamptz) to anon, authenticated;
grant execute on function public.church_rivalry_week_start(integer) to anon, authenticated;
grant execute on function public.church_rivalry_band(integer) to anon, authenticated;
grant execute on function public.church_statue_exists(text) to anon, authenticated;
grant execute on function public.church_week_points(uuid, integer) to authenticated;
grant execute on function public.church_rivalry_pair(uuid, integer) to authenticated;
grant execute on function public.church_rivalry_settle(uuid) to authenticated;
grant execute on function public.set_church_statue(text, text) to authenticated;
grant execute on function public.church_statues_json(uuid) to anon, authenticated;
grant execute on function public.church_rivalry() to authenticated;

notify pgrst, 'reload schema';
