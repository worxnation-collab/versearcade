-- Verse Arcade — Practice mode ("study the last five").
-- ---------------------------------------------------------------------------
-- Players can replay verses they've already done, purely to study — replaying
-- is always free and grants nothing on its own. The ONLY way practice pays XP
-- is by beating your best score on that verse, and that reward is rate-limited
-- to once per week per verse, so it rewards genuine improvement instead of
-- becoming an XP farm. When it does pay, the bonus scales with how much you
-- beat your previous best (capped), and it's real XP (counts toward level and
-- the worldwide leaderboard).
--
-- "Previous best" for a verse = the higher of your original daily score and any
-- better score you've since posted in practice. We track that here so the bar
-- you must clear keeps rising.
-- ---------------------------------------------------------------------------

create table if not exists public.practice_plays (
  user_id        uuid not null references public.profiles(id) on delete cascade,
  drop_date      date not null,
  best_score     integer not null default 0,   -- best PRACTICE score posted
  last_reward_on date,                          -- date a bonus was last granted
  updated_at     timestamptz not null default now(),
  primary key (user_id, drop_date)
);

alter table public.practice_plays enable row level security;
drop policy if exists "practice self-select" on public.practice_plays;
drop policy if exists "practice self-write"  on public.practice_plays;
-- Readable by the owner so the client can show your best + weekly-lock state.
create policy "practice self-select" on public.practice_plays
  for select using (auth.uid() = user_id);
-- Writes go through submit_practice (security definer); still scope any direct
-- write to the owner as defense in depth.
create policy "practice self-write" on public.practice_plays
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Bonus XP for beating your best by `p_delta` points: scales with the margin,
-- with a small floor so any genuine beat pays something, capped so a single big
-- run can't balloon. Mirrored in src/lib/practice.ts — keep the two in sync.
create or replace function public.practice_bonus_xp(p_delta integer)
returns integer
language sql
immutable
as $$
  select case when p_delta <= 0 then 0
              else least(60, greatest(5, round(p_delta / 6.0)::int))
         end;
$$;

-- Submit a practice run. Records a new best, and — if you beat your previous
-- best AND haven't been rewarded for this verse in the last 7 days — awards
-- scaled bonus XP. Never touches streak, last_played_on, or total_plays: a
-- practice run is study, not a daily play.
create or replace function public.submit_practice(p_drop_date date, p_score integer)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prof public.profiles%rowtype;
  v_daily_best integer;
  v_prev_best integer;
  v_score integer := greatest(0, coalesce(p_score, 0));
  pp public.practice_plays%rowtype;
  v_improved boolean;
  v_can_reward boolean;
  v_bonus integer := 0;
  v_new_best integer;
  v_new_xp integer;
  v_new_level integer;
  v_next_reward date := null;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  -- You can only practice a verse you've actually played. This also anchors the
  -- score-to-beat to a real daily result, so you can't farm an unplayed verse.
  select score into v_daily_best from public.plays where user_id = uid and drop_date = p_drop_date;
  if v_daily_best is null then
    return json_build_object('rewarded', false, 'improved', false, 'error', 'not_played');
  end if;

  select * into prof from public.profiles where id = uid for update;
  select * into pp from public.practice_plays where user_id = uid and drop_date = p_drop_date;

  v_prev_best := greatest(coalesce(pp.best_score, 0), coalesce(v_daily_best, 0));
  v_improved := v_score > v_prev_best;
  -- Weekly per-verse gate: rewardable only if never rewarded, or the last reward
  -- was more than 7 days ago.
  v_can_reward := v_improved and (pp.last_reward_on is null or pp.last_reward_on <= current_date - 7);
  v_new_best := greatest(v_prev_best, v_score);

  if v_can_reward then
    v_bonus := public.practice_bonus_xp(v_score - v_prev_best);
  end if;

  insert into public.practice_plays (user_id, drop_date, best_score, last_reward_on, updated_at)
  values (uid, p_drop_date, v_new_best, case when v_bonus > 0 then current_date else pp.last_reward_on end, now())
  on conflict (user_id, drop_date) do update set
    best_score     = greatest(public.practice_plays.best_score, excluded.best_score),
    last_reward_on = case when v_bonus > 0 then current_date else public.practice_plays.last_reward_on end,
    updated_at     = now();

  if v_bonus > 0 then
    v_new_xp := prof.xp + v_bonus;
    v_new_level := public.level_from_xp(v_new_xp);
    update public.profiles set xp = v_new_xp, level = v_new_level where id = uid;
    v_next_reward := current_date + 7;
  else
    v_new_xp := prof.xp;
    v_new_level := prof.level;
    if v_improved and pp.last_reward_on is not null then
      v_next_reward := pp.last_reward_on + 7; -- locked; when it opens again
    end if;
  end if;

  return json_build_object(
    'rewarded', v_bonus > 0,
    'improved', v_improved,
    'weekly_locked', (v_improved and not v_can_reward),
    'xp_earned', v_bonus,
    'score', v_score,
    'previous_best', v_prev_best,
    'new_best', v_new_best,
    'next_reward_on', v_next_reward,
    'xp', v_new_xp,
    'level', v_new_level
  );
end;
$$;

grant execute on function public.practice_bonus_xp(integer) to authenticated, anon;
grant execute on function public.submit_practice(date, integer) to authenticated;
