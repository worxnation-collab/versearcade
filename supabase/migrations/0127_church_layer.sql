-- 0127 — The church layer: the church's verse stops REPLACING the daily drop and
-- becomes its own lane, members get an activity feed, and leadership gets a
-- real dashboard (names included — the owner's call, 2026-10-21).
--
-- Three decisions this migration carries, each reversing something earlier:
--
-- 1. SEPARATION. 0119 made a verified church's verse stand in for the global
--    drop. It no longer does: everybody, members included, plays the same
--    global verse, and the church's verse is a SECOND thing with its own play
--    record (`church_verse_plays`). `get_effective_verse` is kept with its
--    signature and now answers NULL, because approved iOS builds ship a baked
--    `dist` that still calls it to swap the drop — null is exactly "play the
--    global verse" to that code, so every installed build separates too, with
--    no submission. New clients read `my_church_verse` instead.
--
-- 2. NAMES FOR LEADERSHIP. 0119 withheld every per-person number from a
--    church's leaders and floored totals at five. The owner reversed that for
--    this layer: "this is a tool for church leaders, names are important".
--    `church_leader_insights` returns the roster with each member's last play,
--    streak and plays this week, to verified leadership of THAT church only.
--    Nothing here reaches a member, a board or another church.
--
-- 3. SCORES IN THE MEMBER FEED. `church_feed` shows members what their own
--    congregation did — played the drop or the church verse (with the score),
--    gave, joined, posted — to members and leadership of that verified church.
--
-- What it does NOT do: no XP for a church verse (a second daily XP source needs
-- its own capped grant, see `store/dailyTrivia.ts`), no member-vs-member board
-- (competition stays church vs church), no change to `plays`, the streak or
-- first light.

-- ---------------------------------------------------------------------------
-- A play of the church's verse. One per person per day, like the drop.
-- ---------------------------------------------------------------------------
create table if not exists public.church_verse_plays (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  drop_date  date not null,
  church_id  uuid not null references public.churches(id) on delete cascade,
  score      integer not null check (score between 0 and 10000),
  correct    integer not null check (correct between 0 and 10),
  total      integer not null check (total between 1 and 10),
  time_ms    integer check (time_ms is null or time_ms between 0 and 3600000),
  created_at timestamptz not null default now(),
  primary key (user_id, drop_date)
);
create index if not exists church_verse_plays_church_idx
  on public.church_verse_plays (church_id, drop_date);
alter table public.church_verse_plays enable row level security;
-- No policies: read and written only through the functions below.

-- ---------------------------------------------------------------------------
-- Is the caller a member, or leadership, of this VERIFIED church?
-- ---------------------------------------------------------------------------
create or replace function public.church_insider(p_church_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null
     and public.church_is_verified(p_church_id)
     and (exists (select 1 from public.profiles where id = auth.uid() and church_id = p_church_id)
          or public.is_church_admin(p_church_id));
$$;
revoke all on function public.church_insider(uuid) from public, anon;
grant execute on function public.church_insider(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Old builds: never swap the drop again. Same signature, always null.
-- ---------------------------------------------------------------------------
create or replace function public.get_effective_verse(p_drop_date date)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select null::jsonb;
$$;

-- ---------------------------------------------------------------------------
-- The member's church verse for a day, their own result if they played it,
-- and how far through the day's series they are. Null when there is nothing.
-- ---------------------------------------------------------------------------
create or replace function public.my_church_verse(p_local_date date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_date date := least(greatest(coalesce(p_local_date, current_date), current_date - 1), current_date + 1);
  v_church public.churches%rowtype;
  v_verse  public.church_verses%rowtype;
  v_mine   public.church_verse_plays%rowtype;
  v_total  int;
  v_so_far int;
  v_played int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select c.* into v_church
    from public.profiles p join public.churches c on c.id = p.church_id and c.verified
   where p.id = uid;
  if not found then return null; end if;

  select * into v_verse from public.church_verses
   where church_id = v_church.id and drop_date = v_date;
  if not found then return null; end if;

  select * into v_mine from public.church_verse_plays where user_id = uid and drop_date = v_date;

  if v_verse.series is not null then
    select count(*), count(*) filter (where cv.drop_date <= v_date),
           count(cvp.user_id) filter (where cv.drop_date <= v_date)
      into v_total, v_so_far, v_played
      from public.church_verses cv
      left join public.church_verse_plays cvp
        on cvp.user_id = uid and cvp.drop_date = cv.drop_date and cvp.church_id = cv.church_id
     where cv.church_id = v_church.id and cv.series = v_verse.series;
  end if;

  return jsonb_build_object(
    'church_id',   v_church.id,
    'church_name', v_church.name,
    'drop_date',   v_verse.drop_date,
    'reference',   v_verse.reference,
    'text',        v_verse.text,
    'questions',   v_verse.questions,
    'series',      v_verse.series,
    'note',        v_verse.note,
    'played', case when v_mine.user_id is null then null else jsonb_build_object(
                 'score', v_mine.score, 'correct', v_mine.correct, 'total', v_mine.total) end,
    'series_progress', case when v_verse.series is null then null else jsonb_build_object(
                 'total', v_total, 'so_far', v_so_far, 'played', v_played) end);
end;
$$;
revoke all on function public.my_church_verse(date) from public, anon;
grant execute on function public.my_church_verse(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Record a play of the church verse. The church and the verse come from the
-- server; the client sends only its result. Once per day — a second submit is
-- `already` and changes nothing. Pays nothing.
-- ---------------------------------------------------------------------------
create or replace function public.submit_church_verse_play(
  p_local_date date, p_score integer, p_correct integer, p_total integer, p_time_ms integer default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_date date := least(greatest(coalesce(p_local_date, current_date), current_date - 1), current_date + 1);
  v_church uuid;
  v_n int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select c.id into v_church
    from public.profiles p join public.churches c on c.id = p.church_id and c.verified
   where p.id = uid;
  if v_church is null then return jsonb_build_object('ok', false, 'reason', 'no_church'); end if;
  if not exists (select 1 from public.church_verses where church_id = v_church and drop_date = v_date) then
    return jsonb_build_object('ok', false, 'reason', 'no_verse');
  end if;
  if p_total is null or p_total < 1 or p_total > 10
     or p_correct is null or p_correct < 0 or p_correct > p_total
     or p_score is null or p_score < 0 or p_score > 10000 then
    return jsonb_build_object('ok', false, 'reason', 'bad_result');
  end if;

  insert into public.church_verse_plays (user_id, drop_date, church_id, score, correct, total, time_ms)
  values (uid, v_date, v_church, p_score, p_correct, p_total,
          case when p_time_ms between 0 and 3600000 then p_time_ms end)
  on conflict (user_id, drop_date) do nothing;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'already', v_n = 0);
end;
$$;
revoke all on function public.submit_church_verse_play(date, integer, integer, integer, integer) from public, anon;
grant execute on function public.submit_church_verse_play(date, integer, integer, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- What the congregation has been doing: the last 14 days, newest first.
-- Members and leadership of that verified church only.
-- ---------------------------------------------------------------------------
create or replace function public.church_feed(p_church_id uuid, p_limit integer default 40)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 40), 1), 100);
  v_since timestamptz := now() - interval '14 days';
  v jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.church_insider(p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;

  with members as (
    select id, username, avatar_emoji, avatar_character, church_joined_at
      from public.profiles where church_id = p_church_id
  ), ev as (
    select 'church_verse'::text as kind, cvp.created_at as at, m.username, m.avatar_emoji, m.avatar_character,
           cvp.score, cvp.correct, cvp.total, cv.reference as detail, null::int as points
      from public.church_verse_plays cvp
      join members m on m.id = cvp.user_id
      left join public.church_verses cv on cv.church_id = cvp.church_id and cv.drop_date = cvp.drop_date
     where cvp.church_id = p_church_id and cvp.created_at >= v_since
    union all
    select 'drop', pl.created_at, m.username, m.avatar_emoji, m.avatar_character,
           pl.score, pl.correct_count, pl.total_questions, null, null
      from public.plays pl join members m on m.id = pl.user_id
     where pl.created_at >= v_since
    union all
    select 'gave', g.created_at, m.username, m.avatar_emoji, m.avatar_character,
           null, null, null, null, g.points
      from (select user_id, created_at, points from public.church_contributions where church_id = p_church_id
            union all select user_id, created_at, points from public.church_offerings where church_id = p_church_id
            union all select user_id, created_at, points from public.keep_offerings where church_id = p_church_id) g
      join members m on m.id = g.user_id
     where g.created_at >= v_since
    union all
    select 'joined', m.church_joined_at, m.username, m.avatar_emoji, m.avatar_character,
           null, null, null, null, null
      from members m where m.church_joined_at >= v_since
    union all
    select 'notice', a.created_at, p.username, p.avatar_emoji, p.avatar_character,
           null, null, null, a.message, null
      from public.church_announcements a left join public.profiles p on p.id = a.created_by
     where a.church_id = p_church_id and a.created_at >= v_since
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', kind, 'at', at, 'username', username, 'avatar_emoji', avatar_emoji,
           'avatar_character', avatar_character, 'score', score, 'correct', correct,
           'total', total, 'detail', detail, 'points', points) order by at desc), '[]'::jsonb)
    into v
    from (select * from ev order by at desc limit v_limit) x;

  return jsonb_build_object('ok', true, 'events', v);
end;
$$;
revoke all on function public.church_feed(uuid, integer) from public, anon;
grant execute on function public.church_feed(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- The leadership dashboard's numbers. Verified leadership of THIS church only
-- (`church_admin_can`). Names included, no floor — see the header.
-- ---------------------------------------------------------------------------
create or replace function public.church_leader_insights(p_church_id uuid, p_local_date date default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_gate  text := public.church_admin_can(p_church_id);
  v_today date := least(greatest(coalesce(p_local_date, current_date), current_date - 1), current_date + 1);
  v_week  date := v_today - 6;
  v_from  date := v_today - 13;
  v_members int;
  v_active  int;
  v_days    jsonb;
  v_series  jsonb;
  v_roster  jsonb;
  v_streaks jsonb;
  v_notice  jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;

  select count(*) into v_members from public.profiles where church_id = p_church_id;

  -- Per member: last day they played anything, and this week's plays.
  with m as (
    select p.id, p.username, p.avatar_emoji, p.avatar_character, p.church_joined_at,
           p.current_streak, p.last_played_on
      from public.profiles p where p.church_id = p_church_id
  ), r as (
    select m.*,
      (select count(*) from public.plays pl where pl.user_id = m.id and pl.drop_date between v_week and v_today) as drop_7d,
      (select count(*) from public.church_verse_plays c where c.user_id = m.id and c.church_id = p_church_id
          and c.drop_date between v_week and v_today) as church_7d,
      greatest(m.last_played_on,
               (select max(c.drop_date) from public.church_verse_plays c where c.user_id = m.id)) as last_on,
      (select round(avg(c.score)) from public.church_verse_plays c where c.user_id = m.id and c.church_id = p_church_id) as church_avg,
      public.is_church_admin_of(p_church_id, m.id) as leader
    from m
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'username', username, 'avatar_emoji', avatar_emoji, 'avatar_character', avatar_character,
           'joined_at', church_joined_at, 'streak', coalesce(current_streak, 0),
           'last_played_on', last_on, 'drop_7d', drop_7d, 'church_7d', church_7d,
           'church_avg', church_avg, 'leader', leader,
           'active', coalesce(last_on >= v_week, false))
           order by last_on desc nulls last, username), '[]'::jsonb),
         count(*) filter (where last_on >= v_week)
    into v_roster, v_active
    from r;

  -- Fourteen days: how many members played the drop, and the church verse.
  select jsonb_agg(jsonb_build_object(
           'date', d::date,
           'drop', (select count(distinct pl.user_id) from public.plays pl
                      join public.profiles p on p.id = pl.user_id and p.church_id = p_church_id
                     where pl.drop_date = d::date),
           'church', (select count(*) from public.church_verse_plays c
                       where c.church_id = p_church_id and c.drop_date = d::date),
           'scheduled', exists (select 1 from public.church_verses cv
                                 where cv.church_id = p_church_id and cv.drop_date = d::date))
           order by d)
    into v_days
    from generate_series(v_from, v_today, interval '1 day') d;

  -- Each series: days scheduled, days so far, and how much of it was played.
  select coalesce(jsonb_agg(s order by s->>'starts'), '[]'::jsonb) into v_series
    from (
      select jsonb_build_object(
               'series', cv.series,
               'starts', min(cv.drop_date),
               'ends', max(cv.drop_date),
               'days', count(*),
               'so_far', count(*) filter (where cv.drop_date <= v_today),
               'plays', count(c.user_id),
               'players', count(distinct c.user_id),
               'completion', case when v_members > 0 and count(*) filter (where cv.drop_date <= v_today) > 0
                 then round(100.0 * count(c.user_id)
                            / (v_members * count(*) filter (where cv.drop_date <= v_today))) end) as s
        from public.church_verses cv
        left join public.church_verse_plays c on c.church_id = cv.church_id and c.drop_date = cv.drop_date
       where cv.church_id = p_church_id and cv.series is not null
         and cv.drop_date >= v_today - 60
       group by cv.series
    ) x;

  select jsonb_build_object(
           's0',   count(*) filter (where coalesce(current_streak, 0) = 0 or last_played_on < v_today - 1),
           's1',   count(*) filter (where current_streak = 1 and last_played_on >= v_today - 1),
           's2_6', count(*) filter (where current_streak between 2 and 6 and last_played_on >= v_today - 1),
           's7',   count(*) filter (where current_streak >= 7 and last_played_on >= v_today - 1))
    into v_streaks
    from public.profiles where church_id = p_church_id;

  select jsonb_build_object('message', a.message, 'created_at', a.created_at, 'expires_at', a.expires_at)
    into v_notice
    from public.church_announcements a
   where a.church_id = p_church_id and (a.expires_at is null or a.expires_at > now())
   order by a.created_at desc limit 1;

  return jsonb_build_object(
    'ok', true,
    'today', v_today,
    'members', v_members,
    'active_7d', coalesce(v_active, 0),
    'quiet', v_members - coalesce(v_active, 0),
    'days', coalesce(v_days, '[]'::jsonb),
    'series', v_series,
    'streaks', v_streaks,
    'notice', v_notice,
    'roster', v_roster);
end;
$$;
revoke all on function public.church_leader_insights(uuid, date) from public, anon;
grant execute on function public.church_leader_insights(uuid, date) to authenticated;

-- Helper: is THIS user (not the caller) leadership of the church? For labelling
-- leaders inside the roster only.
create or replace function public.is_church_admin_of(p_church_id uuid, p_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.church_admins where church_id = p_church_id and user_id = p_user_id);
$$;
revoke all on function public.is_church_admin_of(uuid, uuid) from public, anon, authenticated;
