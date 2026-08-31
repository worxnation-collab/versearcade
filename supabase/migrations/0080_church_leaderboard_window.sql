-- Today / this week / all time on the church board.
--
-- The board has only ever been able to say one thing: lifetime points banked.
-- That is a ladder a church can climb but not one it can JOIN — a congregation
-- playing hard for a fortnight still sits below one that banked 18,000 points
-- two years ago and has been quiet since. A window fixes that without changing
-- what is being ranked: still churches, still points given, still no per-member
-- number anywhere in the payload.
--
-- Four things about the shape of this, all load-bearing:
--
--   THE WINDOWED SCORE IS DERIVED, NEVER STORED. Like the rivalry (0075), a
--   window's total is a sum over the three timestamped ledgers that can put a
--   point in a church's bank — church_contributions, church_offerings,
--   keep_offerings. No new counter, nothing to backfill, nothing to drift, and
--   no client ever sends a score.
--
--   "THIS WEEK" IS THE RIVALRY'S WEEK, not a second definition of one. It is
--   derived from church_rivalry_week_start(), so the number on the board and
--   the number on the rivalry card are the same number for the same church, and
--   they roll over together. Two weekly totals that disagreed by a few hours
--   would be indistinguishable from a bug.
--
--   SO THE WINDOWS ARE UTC, inheriting 0075's deliberate break with the house
--   "dates are the user's local date" rule rather than making a new one. The
--   board compares congregations that may span time zones; a per-viewer local
--   day means two members of the SAME church see different totals for it, and
--   two churches on one board scored over windows that don't line up. A person's
--   streak still rolls over at their own midnight — this is about an institution.
--
--   IT ADDS NO VISIBILITY. Every windowed row is a church total, exactly like
--   the lifetime one already on this board. There is deliberately no RPC here
--   that groups a window by user: "top giver this week" is the feature this app
--   must not have, and the way to guarantee that is to never build the query.
--
-- Idempotent throughout (create or replace, create index if not exists).

-- ── When a window starts ────────────────────────────────────────────────────
-- Null means "no window" — all time, which reads the church's lifetime counter
-- instead of the ledgers. Everything downstream treats a null start that way,
-- so 'all' costs no ledger scan at all.
create or replace function public.church_window_start(
  p_window text,
  p_at     timestamptz default now()
)
returns timestamptz
language sql
immutable
parallel safe
as $$
  select case lower(coalesce(p_window, 'all'))
    -- UTC midnight, matching the week below rather than the caller's clock.
    when 'day' then date_trunc('day', coalesce(p_at, now()) at time zone 'UTC') at time zone 'UTC'
    -- The rivalry's own week, not a parallel definition of one.
    when 'week' then public.church_rivalry_week_start(
      public.church_rivalry_week(coalesce(p_at, now()))
    )
    else null
  end;
$$;

-- ── Points banked since a moment, per church ────────────────────────────────
-- One pass over the three ledgers for EVERY church, rather than a correlated
-- sum per board row: the board ranks up to 50 rows out of every active church,
-- and church_week_points() called once per candidate is three index scans per
-- church.
--
-- Note what this returns: (church_id, points). It never groups by user, and no
-- argument could make it. A window is a fact about a congregation here, the
-- same way lifetime XP already is.
--
-- A null p_since yields no rows — `created_at >= null` is null for every row —
-- which is exactly what the 'all' scope wants.
create or replace function public.church_points_since(p_since timestamptz)
returns table (church_id uuid, points bigint)
language sql
stable
security definer set search_path = public
as $$
  select l.church_id, sum(l.points)::bigint
  from (
    select cc.church_id, cc.points
      from public.church_contributions cc where cc.created_at >= p_since
    union all
    select co.church_id, co.points
      from public.church_offerings co where co.created_at >= p_since
    union all
    -- keep_offerings.church_id is nullable (0062): a Grand piece given while
    -- the player had no church banks nothing for anybody.
    select ko.church_id, ko.points
      from public.keep_offerings ko
     where ko.created_at >= p_since and ko.church_id is not null
  ) l
  group by l.church_id;
$$;

-- The windowed scan is by time across ALL churches, so none of the existing
-- indexes help it: every one of the three ledgers is indexed by church_id
-- first, and a leading column that isn't being filtered leaves the planner with
-- a sequential scan. (church_offerings' (church_id, created_at desc) looks like
-- it should serve this and does not, for that reason — checked on a real
-- planner, not assumed.) One plain created_at index each, and all three become
-- bitmap index scans.
create index if not exists church_contributions_created_idx
  on public.church_contributions (created_at);
create index if not exists church_offerings_created_idx
  on public.church_offerings (created_at);
create index if not exists keep_offerings_created_idx
  on public.keep_offerings (created_at);

-- ── The board ───────────────────────────────────────────────────────────────
-- 0042's function with a window argument. Rows now carry `points` — the number
-- for the chosen window, equal to lifetime `xp` on 'all' — and `xp` keeps
-- meaning lifetime, because the LEVEL is drawn from it and a church does not
-- shrink to a wooden chapel because it was quiet on Tuesday.
--
-- Ranking is `points desc, xp desc, created_at`. The lifetime tiebreak is
-- deliberate: on a daily board most churches are legitimately on 0, and
-- ordering that tail by signup date reads as random shuffling every time the
-- board reloads. It only ever breaks a tie — the window is always the primary
-- sort — so a church that gave anything at all this week outranks every quiet
-- one however big.
create or replace function public.church_leaderboard(
  p_radius_miles numeric,
  p_limit        integer,
  p_window       text
)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_mine public.churches%rowtype;
  v_has_mine boolean := false;
  v_radius numeric;
  v_limit integer;
  v_window text;
  v_since timestamptz;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  v_limit := least(greatest(coalesce(p_limit, 25), 1), 50);

  -- Fail closed to the lifetime board: an unknown window from a newer client is
  -- a scope this build doesn't have, not an error worth blanking the screen for.
  v_window := lower(coalesce(p_window, 'all'));
  if v_window not in ('day', 'week', 'all') then v_window := 'all'; end if;
  v_since := public.church_window_start(v_window);

  select c.* into v_mine
  from public.churches c
  join public.profiles p on p.church_id = c.id
  where p.id = uid;
  v_has_mine := found;

  -- ---------------------------------------------------------------------
  -- Worldwide
  -- ---------------------------------------------------------------------
  if p_radius_miles is null then
    return (
      with tally as (
        select t.church_id, t.points from public.church_points_since(v_since) t
      ),
      active as (
        select c,
               (select count(*) from public.profiles pr where pr.church_id = c.id) as members,
               case when v_since is null then c.xp::bigint
                    else coalesce((select t.points from tally t where t.church_id = c.id), 0)
               end as points
        from public.churches c
      ),
      kept as (
        -- Unchanged: "active" is still about the church existing as a going
        -- concern, never about the window. A congregation that gave nothing
        -- today still belongs on today's board, sitting on 0 — dropping it
        -- would make the board look like churches were vanishing at midnight.
        select a.c, a.members, a.points from active a where (a.c).xp > 0 or a.members > 0
      ),
      ranked as (
        select k.c as church,
               k.points,
               row_number() over (order by k.points desc, (k.c).xp desc, (k.c).created_at) as rank,
               -- Still show how far away each one is, when we know where the
               -- viewer's church is. Null for a viewer without one.
               case when v_has_mine
                    then round(public.miles_between(v_mine.lat, v_mine.lng, (k.c).lat, (k.c).lng)::numeric, 1)
               end as miles
        from kept k
      )
      select jsonb_build_object(
        'scope', 'all',
        'window', v_window,
        'since', v_since,
        'radius_miles', null,
        'total', (select count(*) from ranked),
        'rows', coalesce((
          select jsonb_agg(
            public.church_json(r.church) || jsonb_build_object(
              'rank', r.rank,
              'points', r.points,
              'miles', r.miles,
              'is_mine', v_has_mine and (r.church).id = v_mine.id
            ) order by r.rank
          )
          from (select * from ranked order by rank limit v_limit) r
        ), '[]'::jsonb),
        'me', (
          select public.church_json(r.church) || jsonb_build_object(
            'rank', r.rank, 'points', r.points, 'miles', 0, 'is_mine', true
          )
          from ranked r where v_has_mine and (r.church).id = v_mine.id
        )
      )
    );
  end if;

  -- ---------------------------------------------------------------------
  -- Within a radius of my church
  -- ---------------------------------------------------------------------
  if not v_has_mine then
    return jsonb_build_object(
      'scope', 'radius', 'window', v_window, 'since', v_since,
      'rows', '[]'::jsonb, 'me', null, 'total', 0, 'radius_miles', p_radius_miles
    );
  end if;

  v_radius := least(greatest(p_radius_miles, 1), 100);

  return (
    with tally as (
      select t.church_id, t.points from public.church_points_since(v_since) t
    ),
    near as (
      select c as church, public.miles_between(v_mine.lat, v_mine.lng, c.lat, c.lng) as miles
      from public.churches c
      -- Degrees-of-latitude prebox so the index does the coarse work; 1.5° is
      -- ~103 miles, comfortably wider than the 100-mile cap above.
      where c.lat between v_mine.lat - 1.5 and v_mine.lat + 1.5
        and c.lng between v_mine.lng - 1.5 and v_mine.lng + 1.5
    ),
    inside as (
      -- Same "active" rule as the worldwide scope, so a church that was picked
      -- once and then abandoned doesn't sit on the local board with nothing on it.
      select n.* from near n
      where n.miles <= v_radius
        and (
          (n.church).xp > 0
          or exists (select 1 from public.profiles pr where pr.church_id = (n.church).id)
        )
    ),
    scored as (
      select i.church, i.miles,
             case when v_since is null then (i.church).xp::bigint
                  else coalesce((select t.points from tally t where t.church_id = (i.church).id), 0)
             end as points
      from inside i
    ),
    ranked as (
      select s.church, s.miles, s.points,
             row_number() over (order by s.points desc, (s.church).xp desc, (s.church).created_at) as rank
      from scored s
    )
    select jsonb_build_object(
      'scope', 'radius',
      'window', v_window,
      'since', v_since,
      'radius_miles', v_radius,
      'total', (select count(*) from ranked),
      'rows', coalesce((
        select jsonb_agg(
          public.church_json(r.church) || jsonb_build_object(
            'rank', r.rank,
            'points', r.points,
            'miles', round(r.miles::numeric, 1),
            'is_mine', (r.church).id = v_mine.id
          ) order by r.rank
        )
        from (select * from ranked order by rank limit v_limit) r
      ), '[]'::jsonb),
      'me', (
        select public.church_json(r.church) || jsonb_build_object(
          'rank', r.rank, 'points', r.points, 'miles', 0, 'is_mine', true
        )
        from ranked r where (r.church).id = v_mine.id
      )
    )
  );
end;
$$;

-- ── The old two-argument signature, kept as a wrapper ───────────────────────
-- NOT a duplicate implementation, and it must not become one. `ios/` ships a
-- baked copy of `dist` (CLAUDE.md, "Content is data"), so an installed 1.2.0
-- build calls church_leaderboard(p_radius_miles, p_limit) with no window and
-- will keep doing so until every phone updates. Dropping this signature the way
-- 0074 dropped admin_overview() would blank the church board in every already
-- approved build — that one was an operator screen, this one is a player's.
--
-- PostgREST resolves overloads by the exact set of named arguments in the body,
-- so a two-argument call lands here and a three-argument call lands above. The
-- three-argument function takes no defaults, which keeps a direct SQL call with
-- two arguments unambiguous too.
create or replace function public.church_leaderboard(
  p_radius_miles numeric default 25,
  p_limit        integer default 25
)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select public.church_leaderboard(p_radius_miles, p_limit, 'all');
$$;

-- Grants. church_window_start and church_points_since take the house pattern —
-- effectively anon-callable via Supabase's default privileges, matching their
-- sibling church_week_points (0075) exactly, and returning per-church totals no
-- wider than what a board row already publishes. Not tightened in isolation.
grant execute on function public.church_window_start(text, timestamptz) to anon, authenticated;
grant execute on function public.church_points_since(timestamptz) to authenticated;
grant execute on function public.church_leaderboard(numeric, integer) to authenticated;

-- The three-argument overload is the exception, and it is not a new opinion
-- about the pattern: the two-argument church_leaderboard already carries
-- {postgres, authenticated, service_role} with no PUBLIC and no anon — the same
-- shape as get_church_page — because `create or replace` preserves an existing
-- ACL and somebody tightened that one deliberately. A NEW function does not
-- inherit it: Supabase's `alter default privileges ... grant all on functions to
-- anon, authenticated` hands the overload the anon grant, so the new front door
-- to this RPC lands wider than the old one unless it is closed here.
--
-- And per the 0052 lesson in CLAUDE.md, `revoke ... from public` alone does NOT
-- close it — that strips only the `=X/postgres` entry and leaves the NAMED anon
-- grant standing. anon has to be revoked by name. Confirmed against pg_proc.proacl
-- on the live project rather than assumed: both overloads now read
-- `postgres=X/postgres authenticated=X/postgres service_role=X/postgres`.
revoke all on function public.church_leaderboard(numeric, integer, text) from public, anon;
grant execute on function public.church_leaderboard(numeric, integer, text) to authenticated, service_role;

notify pgrst, 'reload schema';
