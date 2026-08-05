-- Verse Arcade — server-side logic (scoring, streaks, XP, presence, groups)
-- All scoring is authoritative here so the client cannot mint points.
-- ---------------------------------------------------------------------------

-- Level curve: each level costs ~35% more XP than the last. Escalating but
-- always reachable — early levels come fast (dopamine), later ones feel earned.
create or replace function public.level_from_xp(p_xp integer)
returns integer
language plpgsql
immutable
as $$
declare
  lvl integer := 1;
  threshold integer := 100;
  remaining integer := greatest(p_xp, 0);
begin
  while remaining >= threshold loop
    remaining := remaining - threshold;
    lvl := lvl + 1;
    threshold := round(threshold * 1.35);
  end loop;
  return lvl;
end;
$$;

-- Auto-create a profile when a new auth user signs up. Username falls back to a
-- generated handle; the app lets the user pick a real one during onboarding.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  base_name text;
  final_name text;
  n integer := 0;
begin
  base_name := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username',
                split_part(new.email, '@', 1), 'player'), '[^a-z0-9_]', '', 'g'));
  if base_name = '' then base_name := 'player'; end if;
  final_name := base_name;
  while exists (select 1 from public.profiles where username = final_name) loop
    n := n + 1;
    final_name := base_name || n::text;
  end loop;

  insert into public.profiles (id, username, display_name, avatar_emoji)
  values (new.id, final_name, coalesce(new.raw_user_meta_data->>'display_name', final_name), '📖')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- The heart of the loop: record a play, compute XP, advance the streak (with
-- kind streak-freeze absorption), level up, and emit an ambient presence event.
create or replace function public.submit_play(
  p_drop_date date,
  p_score integer,
  p_time_ms integer,
  p_correct integer,
  p_total integer,
  p_combo_max integer
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prof public.profiles%rowtype;
  v_xp_earned integer;
  v_new_xp integer;
  v_new_level integer;
  v_leveled_up boolean := false;
  v_missed integer;
  v_new_streak integer;
  v_freezes integer;
  v_used_freeze boolean := false;
  v_play_id uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select * into prof from public.profiles where id = uid for update;

  -- Idempotent: if they already played this drop, just return current state.
  if exists (select 1 from public.plays where user_id = uid and drop_date = p_drop_date) then
    return json_build_object(
      'already_played', true,
      'xp', prof.xp, 'level', prof.level,
      'current_streak', prof.current_streak, 'leveled_up', false
    );
  end if;

  -- XP: score is speed+accuracy; convert to XP with a floor so every play pays.
  v_xp_earned := greatest(10, round(p_score / 8.0)::int) + (p_correct * 4);

  -- Streak advance -----------------------------------------------------------
  v_freezes := prof.streak_freezes;
  if prof.last_played_on is null then
    v_new_streak := 1;
  elsif prof.last_played_on = p_drop_date - 1 then
    v_new_streak := prof.current_streak + 1;         -- perfect continuation
  elsif prof.last_played_on >= p_drop_date then
    v_new_streak := prof.current_streak;             -- playing a back-day; no change
  else
    v_missed := (p_drop_date - prof.last_played_on) - 1;
    if v_freezes >= v_missed and v_missed > 0 then
      v_freezes := v_freezes - v_missed;             -- absorb the gap kindly
      v_new_streak := prof.current_streak + 1;
      v_used_freeze := true;
    else
      v_new_streak := 1;                             -- gentle reset, no shaming copy
    end if;
  end if;

  -- Streak milestone bonus XP (3/7/30/100).
  if v_new_streak in (3, 7, 30, 100) then
    v_xp_earned := v_xp_earned + (v_new_streak * 5);
  end if;

  v_new_xp := prof.xp + v_xp_earned;
  v_new_level := public.level_from_xp(v_new_xp);
  v_leveled_up := v_new_level > prof.level;

  insert into public.plays (user_id, drop_date, score, time_ms, correct_count,
                            total_questions, combo_max, xp_earned)
  values (uid, p_drop_date, p_score, p_time_ms, p_correct, p_total, p_combo_max, v_xp_earned)
  returning id into v_play_id;

  update public.profiles set
    xp = v_new_xp,
    level = v_new_level,
    current_streak = v_new_streak,
    longest_streak = greatest(longest_streak, v_new_streak),
    streak_freezes = v_freezes,
    last_played_on = greatest(coalesce(last_played_on, p_drop_date), p_drop_date),
    total_plays = total_plays + 1
  where id = uid;

  -- Ambient presence: warm, non-competitive signal that others are here too.
  insert into public.presence_events (drop_date, username, avatar_emoji, points, kind)
  values (p_drop_date, prof.username, prof.avatar_emoji, p_score, 'scored');
  if v_leveled_up then
    insert into public.presence_events (drop_date, username, avatar_emoji, points, kind)
    values (p_drop_date, prof.username, prof.avatar_emoji, v_new_level, 'levelup');
  end if;

  return json_build_object(
    'already_played', false,
    'play_id', v_play_id,
    'xp_earned', v_xp_earned,
    'xp', v_new_xp,
    'level', v_new_level,
    'leveled_up', v_leveled_up,
    'current_streak', v_new_streak,
    'used_freeze', v_used_freeze,
    'streak_freezes', v_freezes
  );
end;
$$;

-- Ambient pulse for the day: how many opened + a recent, gentle activity feed.
create or replace function public.get_daily_pulse(p_drop_date date)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_opened integer;
  v_feed json;
begin
  select count(*) into v_opened from public.plays where drop_date = p_drop_date;
  select coalesce(json_agg(row_to_json(t)), '[]'::json) into v_feed
  from (
    select username, avatar_emoji, points, kind, created_at
    from public.presence_events
    where drop_date = p_drop_date
    order by created_at desc
    limit 40
  ) t;
  return json_build_object('opened', v_opened, 'feed', v_feed);
end;
$$;

-- GROUPS --------------------------------------------------------------------
create or replace function public.create_group(p_name text, p_emoji text default '🔥')
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_code text;
  v_id uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  -- 6-char human-friendly code (no ambiguous chars).
  v_code := upper(substr(translate(encode(gen_random_bytes(6), 'base64'),
              '+/=OoIl01', 'ABCDEFGHJ'), 1, 6));
  insert into public.groups (name, emoji, join_code, owner_id)
  values (p_name, coalesce(p_emoji, '🔥'), v_code, uid)
  returning id into v_id;
  insert into public.group_members (group_id, user_id, role) values (v_id, uid, 'owner');
  return json_build_object('id', v_id, 'join_code', v_code);
end;
$$;

create or replace function public.join_group(p_code text)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_id uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select id into v_id from public.groups where join_code = upper(p_code);
  if v_id is null then raise exception 'no group with that code'; end if;
  insert into public.group_members (group_id, user_id, role)
  values (v_id, uid, 'member')
  on conflict do nothing;
  return json_build_object('id', v_id);
end;
$$;

-- A member contributes their day's score to the group's collective climb.
create or replace function public.submit_group_play(
  p_group_id uuid, p_drop_date date, p_score integer
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  g public.groups%rowtype;
  v_new_streak integer;
  v_group_xp integer;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.group_members where group_id = p_group_id and user_id = uid) then
    raise exception 'not a member of this group';
  end if;

  insert into public.group_plays (group_id, user_id, drop_date, contributed_score)
  values (p_group_id, uid, p_drop_date, p_score)
  on conflict (group_id, user_id, drop_date)
  do update set contributed_score = excluded.contributed_score;

  select * into g from public.groups where id = p_group_id for update;

  -- Group streak: advances the first time the group is active on a new day.
  if g.last_active_on is null then
    v_new_streak := 1;
  elsif g.last_active_on = p_drop_date then
    v_new_streak := g.current_streak;          -- already counted today
  elsif g.last_active_on = p_drop_date - 1 then
    v_new_streak := g.current_streak + 1;
  else
    v_new_streak := 1;
  end if;

  v_group_xp := g.xp + greatest(1, round(p_score / 20.0)::int);

  update public.groups set
    xp = v_group_xp,
    level = public.level_from_xp(v_group_xp),
    current_streak = v_new_streak,
    longest_streak = greatest(longest_streak, v_new_streak),
    last_active_on = greatest(coalesce(last_active_on, p_drop_date), p_drop_date)
  where id = p_group_id;

  return json_build_object('group_xp', v_group_xp, 'group_streak', v_new_streak);
end;
$$;

-- In-app account deletion (Apple requirement). Removes the auth user; cascades
-- wipe all rows above. Called from the client via RPC.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer set search_path = public, auth
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  delete from auth.users where id = uid;   -- cascades to profiles + all data
end;
$$;

grant execute on function public.submit_play(date,integer,integer,integer,integer,integer) to authenticated;
grant execute on function public.get_daily_pulse(date) to anon, authenticated;
grant execute on function public.create_group(text,text) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.submit_group_play(uuid,date,integer) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
