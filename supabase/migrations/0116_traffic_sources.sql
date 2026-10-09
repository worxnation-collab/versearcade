-- 0116: count the OPEN, not only the account.
--
-- APPLIED to production on 2026-10-09, and verified: exactly ONE signature
-- each, `admin_traffic_sources` ACL reads {postgres,authenticated,service_role}
-- (no anon, no `=X` — the 0052 shape), `note_guest_arrival` carries anon
-- because a guest has no session, and — the part worth checking rather than
-- reasoning about — first touch was confirmed against the live database: a
-- second arrival under a different slug does NOT overwrite the first, and the
-- play row picked the slug up from the arrival row with the client asserting
-- nothing. Run end to end against a local Postgres 16 first, seven cases.
--
-- 0106 files a NEW ACCOUNT under the network whose tracked link sent it
-- (`?src=`), and that is the number goal one is judged by. What it cannot do
-- is tell a zero apart from a miss: when the week's table printed "neither
-- sign-up has a signup_source", nothing anywhere said whether the links were
-- unreachable, the capture was broken, or two people genuinely arrived by
-- some other road. 811 Facebook views against 0 attributed sign-ups is the
-- same shape whichever of those is true.
--
-- So the OPEN is recorded too. A stranger who taps /play?src=youtube and
-- never registers is now a row, which makes the funnel measurable at the top
-- rather than only at the bottom.
--
-- Three rules, the same three 0106 holds itself to:
--   - First touch wins, server-side. The slug is written only while null.
--   - Fixed vocabulary, validated here: a lowercase slug, 32 chars. The
--     client sends a hint; this decides whether it is a source.
--   - It counts NOBODY. `guest_arrivals` carries a device id, a date and a
--     slug — no name, no score, no XP, nothing countable about a person, and
--     nothing ranks a player by where they came from.
--
-- **Arrivals are their own table, deliberately NOT a row in `guest_opens`,
-- and that is the one judgement call in here.** `guest_opens` is named for an
-- open and means A FINISHED RUN: it is written on submit, it carries score,
-- xp and level, `get_leaderboard` unions it (0012/0036), and the Play tab's
-- "N played today" is plays + guest_opens (0093). Writing an arrival there
-- would have told every player that more people had played than had — the
-- count on the one screen everybody lands on. A separate table has no reader
-- but the admin function below, so the pulse, the leaderboard and the growth
-- metrics are untouched by construction.
--
-- **`record_guest_open`'s SIGNATURE IS UNCHANGED, and that was a reversal.**
-- The first cut added a `p_src` parameter the 0012 way (drop the old overload,
-- recreate with a default). Two reasons it is not that:
--   1. The client would then ASSERT the source on a play, where the arrival
--      row is one the server has already validated. Looking it up is the same
--      "server verifies, client never asserts" rule, done properly.
--   2. `drop function` and `alter table ... drop column` on `guest_opens`
--      could not get a lock inside sixty seconds against live guest traffic
--      and rolled back every time. The no-signature-change path needs no lock
--      on the hot table at all. Worth knowing before planning DDL here.
-- So the body does a `select ... from guest_arrivals` and stamps the slug
-- itself. Every approved iOS build ships a baked `dist` calling the 7-arg
-- form; it keeps working untouched and starts carrying a source the day a
-- device has an arrival row.

-- 1) Where a guest arrived from, before they have played anything.
create table if not exists public.guest_arrivals (
  drop_date  date not null,
  guest_id   uuid not null,
  src        text,
  created_at timestamptz not null default now(),
  primary key (drop_date, guest_id)
);
alter table public.guest_arrivals enable row level security;
-- No policies, on purpose: only the SECURITY DEFINER functions below touch it.

-- A null `src` is a real answer and the point of the row — it is the
-- "unattributed" the admin table prints rather than omits.
create index if not exists guest_arrivals_date_src_idx on public.guest_arrivals (drop_date, src);

-- 2) Note one. Callable by anon, because a guest has no session.
--
-- Idempotent per (date, device): the first arrival of the day wins, and a
-- reload, a second tab or a later visit cannot overwrite the slug it landed
-- under. That is first-touch enforced in SQL rather than trusted to the
-- client, which is what lets the client's localStorage be a hint.
create or replace function public.note_guest_arrival(
  p_drop_date date,
  p_guest_id uuid,
  p_src text default null
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_src text := nullif(lower(trim(coalesce(p_src, ''))), '');
begin
  if p_guest_id is null or p_drop_date is null then return; end if;
  -- An unreadable slug is recorded as an arrival with NO source rather than
  -- refused: the open still happened, and dropping it would under-count the
  -- top of the funnel to flatter the attribution.
  if v_src is not null and v_src !~ '^[a-z0-9][a-z0-9_-]{0,31}$' then v_src := null; end if;
  -- Clamp a date a lying client could send, the house ±1 pattern.
  if p_drop_date < current_date - 1 or p_drop_date > current_date + 1 then return; end if;
  insert into public.guest_arrivals (drop_date, guest_id, src)
  values (p_drop_date, p_guest_id, v_src)
  on conflict (drop_date, guest_id)
  do update set src = coalesce(public.guest_arrivals.src, excluded.src);
end;
$$;

revoke all on function public.note_guest_arrival(date, uuid, text) from public;
grant execute on function public.note_guest_arrival(date, uuid, text) to anon, authenticated;

-- 3) The same slug on a guest's PLAY row, looked up rather than passed.
--
-- The column is nullable and nothing but this writes it. The signature is
-- byte-identical to the pre-0116 one (see the header): this is a
-- `create or replace` of the SAME 7 arguments, restated WHOLESALE from what
-- production actually held — which was NOT the repo's 0012 body (it had since
-- grown `regexp_replace` username sanitising, `level_from_xp` and a 5,000,000
-- xp cap). A future migration editing it copies forward from HERE, and should
-- read the live definition first rather than trusting this file.
alter table public.guest_opens add column if not exists src text;

create or replace function public.record_guest_open(
  p_drop_date date,
  p_guest_id uuid,
  p_username text,
  p_emoji text,
  p_score integer,
  p_xp integer default 0,
  p_level integer default 1
) returns void
language plpgsql
security definer set search_path to 'public'
as $$
declare
  v_name  text := left(regexp_replace(lower(coalesce(p_username, 'guest')), '[^a-z0-9_]', '', 'g'), 16);
  v_emoji text := left(coalesce(nullif(p_emoji, ''), '📖'), 8);
  v_score integer := greatest(0, least(coalesce(p_score, 0), 100000));
  v_xp    integer := greatest(0, least(coalesce(p_xp, 0), 5000000));
  v_level integer;
  v_is_new boolean;
  -- Where this device arrived from, looked up rather than taken as an
  -- argument. See the header: the client must not be able to assert a source
  -- onto a play, and the arrival row is the one the server already validated.
  v_src text;
begin
  if p_guest_id is null then return; end if;
  if v_name = '' then v_name := 'guest'; end if;
  v_level := public.level_from_xp(v_xp);
  select a.src into v_src from public.guest_arrivals a
    where a.guest_id = p_guest_id and a.src is not null
    order by a.drop_date asc limit 1;
  insert into public.guest_opens (drop_date, guest_id, username, avatar_emoji, score, xp, level, src)
  values (p_drop_date, p_guest_id, v_name, v_emoji, v_score, v_xp, v_level, v_src)
  on conflict (drop_date, guest_id)
  do update set score = greatest(public.guest_opens.score, excluded.score),
                xp = greatest(public.guest_opens.xp, excluded.xp),
                level = greatest(public.guest_opens.level, excluded.level),
                username = excluded.username,
                avatar_emoji = excluded.avatar_emoji,
                -- First touch, as everywhere else here.
                src = coalesce(public.guest_opens.src, excluded.src)
  returning (xmax = 0) into v_is_new;
  if v_is_new then
    insert into public.presence_events (drop_date, username, avatar_emoji, points, kind)
    values (p_drop_date, v_name, v_emoji, v_score, 'scored');
  end if;
end;
$$;

-- 4) The operator's one table: opens beside plays beside sign-ups, by network.
--
-- A rolling window rather than local calendar days, for 0106's reason: it
-- sits beside per-network view counts that are rolling too. `src` comes back
-- as '' for a row with no source so the hub can label it "unattributed"
-- rather than leave it out — a funnel that hides its own misses is the thing
-- this migration exists to stop.
create or replace function public.admin_traffic_sources(p_days int default 7)
returns jsonb language plpgsql security definer set search_path = public as $$
declare days int := greatest(1, least(coalesce(p_days, 7), 90));
begin
  perform public.require_admin();
  return jsonb_build_object(
    'days', days,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('src', src, 'arrivals', arrivals, 'plays', plays, 'signups', signups)
                       order by (arrivals + plays + signups) desc, src)
      from (
        select coalesce(src, '') as src,
               sum(arrivals)::int as arrivals,
               sum(plays)::int    as plays,
               sum(signups)::int  as signups
        from (
          select src, count(*) as arrivals, 0 as plays, 0 as signups
            from public.guest_arrivals
            where created_at > now() - make_interval(days => days)
            group by src
          union all
          select src, 0, count(*), 0
            from public.guest_opens
            where created_at > now() - make_interval(days => days)
            group by src
          union all
          select signup_source, 0, 0, count(*)
            from public.profiles
            where created_at > now() - make_interval(days => days)
            group by signup_source
        ) u
        group by coalesce(src, '')
      ) t
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.admin_traffic_sources(int) from public, anon;
grant execute on function public.admin_traffic_sources(int) to authenticated;
