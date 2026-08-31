-- The arcade pays a small welcome: the first run of each machine, each day.
--
-- THIS NARROWS A DOCUMENTED RULE, so the argument is written here rather than
-- left to be re-derived. The arcade shipped paying NO XP at all, and that was
-- what let a game you can beat a friend at exist in an app with no losers: a
-- machine that pays standing is a machine you can be behind on. The rule that
-- survives is the one that was actually doing the work — NOTHING IN THE ARCADE
-- MAY RANK ANYBODY — and it is untouched:
--
--   * a run's SCORE still pays nothing. What is paid for is turning up at a
--     machine, not doing well at it, so the 5 XP is identical for somebody who
--     gathered forty flakes and somebody who gathered four;
--   * nothing here is a streak, a total or a position. This table stores a
--     user, a game id and a date, and there is deliberately no RPC asking how
--     many days anybody has played or what anybody ELSE has collected;
--   * no cabinet, result screen or share carries a number that can be set
--     beside somebody else's. That is still true and must stay true.
--
-- THE SAFETY ARGUMENT IS THE LIBRARY'S (0083), COPIED DELIBERATELY, because
-- `xp` IS the worldwide leaderboard (0006) and is the one number in this app
-- that ranks people:
--
--   THE SERVER COUNTS AND THE SERVER PAYS. The client says "I finished a run on
--   this machine"; this function decides whether that is worth anything. No
--   amount is ever sent by a client.
--
--   THE CAP IS IN SQL, NOT IN THE BUTTON, and it is held by the PRIMARY KEY
--   rather than by a count: (user_id, game_id, played_on) means the second run
--   of a machine today inserts nothing and pays nothing, and two runs finishing
--   at once settle themselves without this function counting first.
--
--   THE GAME ID IS VALIDATED AGAINST A FIXED LIST, and that list is what bounds
--   the whole feature. Without it a client could send a thousand invented ids
--   and mint 5 XP for each; with it the ceiling is arithmetic — one row per
--   machine per day, so THREE MACHINES x 5 XP = 15 XP A DAY, against a daily
--   drop's 30-60. KEEP IN SYNC with ARCADE_GAMES (features/arcade/games.ts):
--   a new machine that should pay needs its id added here, which is a migration
--   and is meant to be, because this list IS the ceiling.
--
--   THE CLIENT SENDS todayLocalDate() AND THE SERVER CLAMPS +-1, the house
--   pattern. A lying client can reach three buckets — 45 XP — which is bounded
--   and buys nothing that isn't already reachable by playing three days.
--
-- A FREE GO FROM A SHARED LINK PAYS NOTHING, and that is enforced on the client
-- by never calling this (there is no account behind an invite to pay into), and
-- here by auth.uid() being required. An invite is an invitation to play, and
-- paying for one would make a share farmable in a way nothing else here is.
--
-- WHAT IS DELIBERATELY NOT STORED: how many runs, how well any of them went,
-- how many days in a row. A run's numbers never reach this table, so no future
-- session can build a ladder out of it without adding a column and having to
-- argue for it.

create table if not exists public.arcade_plays (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  game_id   text not null,
  played_on date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, game_id, played_on)
);

alter table public.arcade_plays enable row level security;

-- Yours and only yours. No policy lets anyone read anybody else's, and there is
-- no aggregate RPC over this table.
drop policy if exists "arcade_plays self-select" on public.arcade_plays;
create policy "arcade_plays self-select" on public.arcade_plays
  for select using (auth.uid() = user_id);
-- No write policy: record_arcade_play is the only way a row appears.

create or replace function public.record_arcade_play(
  p_game text,
  p_local_date date default null
)
returns jsonb
language plpgsql
security definer set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  pay constant int := 5;  -- KEEP IN SYNC with ARCADE_XP in data/arcade.ts
  -- The machines whose first run of the day is worth something. This list is
  -- the ceiling (see the header): adding a machine is a migration.
  paid_games constant text[] := array['manna', 'word-catch', 'cross'];
  d date;
  v_rows int;
  v_old_level int;
  v_new_xp int;
  v_new_level int;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  -- An unknown machine is a success that pays nothing, not an error: a client
  -- built before this list grew must never see a game fail to finish because
  -- the reward didn't apply. The run happened either way.
  if p_game is null or not (p_game = any(paid_games)) then
    return jsonb_build_object('ok', true, 'awarded', 0, 'first_today', false);
  end if;

  -- Trust the client's local date, but only just.
  d := coalesce(p_local_date, current_date);
  if d < current_date - 1 then d := current_date - 1; end if;
  if d > current_date + 1 then d := current_date + 1; end if;

  -- The primary key IS the cap. A second run of this machine today — or two
  -- finishing together — inserts nothing and pays nothing.
  insert into public.arcade_plays (user_id, game_id, played_on)
  values (uid, p_game, d)
  on conflict (user_id, game_id, played_on) do nothing;

  get diagnostics v_rows = row_count;

  -- Already played this machine today. Still a success: the run counted, it
  -- just isn't worth anything the second time. Returned as ok:true with
  -- awarded 0 rather than as a refusal, so a result screen never draws an
  -- error at somebody for playing again.
  if v_rows = 0 then
    return jsonb_build_object('ok', true, 'awarded', 0, 'first_today', false);
  end if;

  select level into v_old_level from public.profiles where id = uid;

  update public.profiles
     set xp = xp + pay,
         level = public.level_from_xp(xp + pay)
   where id = uid
   returning xp, level into v_new_xp, v_new_level;

  return jsonb_build_object(
    'ok', true,
    'awarded', pay,
    'first_today', true,
    'xp', v_new_xp,
    'level', v_new_level,
    'leveled_up', v_new_level > coalesce(v_old_level, v_new_level)
  );
end;
$$;

grant execute on function public.record_arcade_play(text, date) to authenticated;

-- Which machines the caller has already been paid for today, so a result
-- screen knows whether there is still a welcome to give. Answers about the
-- caller and nobody else.
--
-- Deliberately NOT "how many times you have played": that is a tally this
-- feature must not have, and the table has nowhere to keep it anyway.
create or replace function public.my_arcade_card(p_local_date date default null)
returns jsonb
language plpgsql
stable security definer set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  d date;
  v_games text[];
begin
  if uid is null then raise exception 'not authenticated'; end if;
  d := coalesce(p_local_date, current_date);
  if d < current_date - 1 then d := current_date - 1; end if;
  if d > current_date + 1 then d := current_date + 1; end if;

  select coalesce(array_agg(game_id), array[]::text[])
    into v_games
    from public.arcade_plays
   where user_id = uid and played_on = d;

  return jsonb_build_object('paid_today', to_jsonb(v_games));
end;
$$;

grant execute on function public.my_arcade_card(date) to authenticated;

notify pgrst, 'reload schema';
