-- 0166: "Your week in Verse Arcade" — one Sunday push that names ONE thing the
-- player did this week.
--
-- What it says is chosen here, on the server, from what the player did: a
-- friend's feet they washed, a verse they kept, a chapter they read, a note
-- they knelt at, a battle, a verse they studied, the daily verse. It names
-- one thing and NEVER a number — no "5 plays", no "more than last week", no
-- streak — and a week with nothing in it sends nothing at all, because a push
-- that says "you didn't" is the one this app must not send.
--
-- When: Sunday, at the hour this player usually plays, in their own zone. The
-- hour lives on the device (va.playHours), so the client reports it once a
-- day through note_play_rhythm; the zone is validated here. It goes through
-- push-send's deliver() as the kind 'week', so its own switch in Settings
-- (push_prefs.week) and quiet hours (0164) both apply.
--
-- Once a week by construction: the claim stamps profiles.week_pushed_on with
-- the player's local Sunday in the same statement that hands the row out, so
-- a second run in the same hour, or the next hour, finds nothing.

alter table public.profiles
  add column if not exists week_push jsonb,
  add column if not exists week_pushed_on date;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_week_push_object') then
    alter table public.profiles
      add constraint profiles_week_push_object
      check (week_push is null or jsonb_typeof(week_push) = 'object');
  end if;
end $$;

-- The fifth push kind becomes six. my_push_prefs / set_push_pref read this
-- list, so the switch exists the moment it does; a missing key is still ON.
create or replace function public.push_kinds()
returns text[] language sql immutable set search_path = public as $$
  select array['battle', 'buddy', 'gesture', 'answered', 'check_in', 'week']::text[]
$$;

-- The device says when this person usually plays, and where. Nothing else.
create or replace function public.note_play_rhythm(p_hour int, p_tz text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  ok_tz boolean;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_hour is null or p_hour < 0 or p_hour > 23 then
    return jsonb_build_object('ok', false, 'reason', 'bad_hour');
  end if;
  -- Taken into a variable once, never left in a predicate (the 0089 lesson).
  select exists (select 1 from pg_timezone_names where name = p_tz) into ok_tz;
  if p_tz is null or not ok_tz then return jsonb_build_object('ok', false, 'reason', 'bad_tz'); end if;
  update profiles set week_push = jsonb_build_object('hour', p_hour, 'tz', p_tz)
   where id = uid and week_push is distinct from jsonb_build_object('hour', p_hour, 'tz', p_tz);
  return jsonb_build_object('ok', true);
end $$;

-- The one thing, from the week that ends on p_sunday (Monday..Sunday, the
-- player's own dates). First match wins, most specific first; within a kind
-- the most recent. Returns {line, url} or null.
create or replace function public.week_push_line(p_user uuid, p_sunday date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  monday date := p_sunday - 6;
  t text;
begin
  select '@' || p.username into t
    from feet_washings w join profiles p on p.id = w.washed_id
   where w.washer_id = p_user and w.washed_on between monday and p_sunday and p.username is not null
   order by w.created_at desc limit 1;
  if t is not null then
    return jsonb_build_object('line', 'You washed ' || t || '''s feet this week.', 'url', '/you?people=basin');
  end if;

  select reference into t from favorite_verses
   where user_id = p_user and created_at >= (monday::timestamp - interval '1 day') and created_at < (p_sunday + 2)::timestamp
   order by created_at desc limit 1;
  if t is not null then
    return jsonb_build_object('line', 'You kept ' || t || ' this week.', 'url', '/bible/highlights');
  end if;

  select replace(key, '|', ' ') into t from bible_marks
   where user_id = p_user and kind = 'read' and key like '%|%'
     and created_at >= (monday::timestamp - interval '1 day') and created_at < (p_sunday + 2)::timestamp
   order by created_at desc limit 1;
  if t is not null then
    return jsonb_build_object('line', 'You read ' || t || ' this week.', 'url', '/bible');
  end if;

  if exists (select 1 from prayer_intercessions where user_id = p_user and prayed_on between monday and p_sunday) then
    return jsonb_build_object('line', 'You knelt for someone on the Prayer Wall this week.', 'url', '/pray');
  end if;

  if exists (select 1 from battle_plays where user_id = p_user and played_on between monday and p_sunday) then
    return jsonb_build_object('line', 'You played a battle this week.', 'url', '/battle');
  end if;

  select key into t from bible_marks
   where user_id = p_user and kind = 'studied'
     and created_at >= (monday::timestamp - interval '1 day') and created_at < (p_sunday + 2)::timestamp
   order by created_at desc limit 1;
  if t is not null then
    return jsonb_build_object('line', 'You studied ' || t || ' this week.', 'url', '/study');
  end if;

  if exists (select 1 from plays where user_id = p_user and drop_date between monday and p_sunday) then
    return jsonb_build_object('line', 'You played the daily verse this week.', 'url', '/play');
  end if;

  return null;
end $$;

-- Who is due right now: their local Sunday, their usual hour, not yet sent
-- this Sunday, somewhere to send it, and something to say. Stamped as it is
-- handed out (SKIP LOCKED), so overlapping runs cannot send it twice. A player
-- with nothing to say is stamped too, so the next hour does not ask again.
create or replace function public.week_push_claim(p_limit int)
returns table (recipient uuid, line text, url text, sunday date)
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
  cap int := greatest(1, least(coalesce(p_limit, 300), 1000));
  said jsonb;
begin
  for r in
    select p.id, (now() at time zone (p.week_push->>'tz'))::date as local_day
      from profiles p
     where p.week_push is not null
       and extract(isodow from now() at time zone (p.week_push->>'tz')) = 7
       and extract(hour from now() at time zone (p.week_push->>'tz')) = (p.week_push->>'hour')::int
       and p.week_pushed_on is distinct from (now() at time zone (p.week_push->>'tz'))::date
       and (exists (select 1 from push_subscriptions s where s.profile_id = p.id)
            or exists (select 1 from device_tokens d where d.profile_id = p.id and d.platform = 'ios'))
     for update of p skip locked
  loop
    exit when n >= cap;
    update profiles set week_pushed_on = r.local_day where id = r.id;
    said := public.week_push_line(r.id, r.local_day);
    if said is not null then
      recipient := r.id; line := said->>'line'; url := said->>'url'; sunday := r.local_day;
      n := n + 1;
      return next;
    end if;
  end loop;
end $$;

revoke all on function public.push_kinds() from public, anon, authenticated;
grant execute on function public.push_kinds() to service_role;
revoke all on function public.week_push_line(uuid, date) from public, anon, authenticated;
revoke all on function public.week_push_claim(int) from public, anon, authenticated;
grant execute on function public.week_push_line(uuid, date) to service_role;
grant execute on function public.week_push_claim(int) to service_role;
revoke all on function public.note_play_rhythm(int, text) from public, anon;
grant execute on function public.note_play_rhythm(int, text) to authenticated;
