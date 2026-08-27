-- Remove the weekly per-verse reward cooldown from practice replay.
--
-- 0014 paid scaled bonus XP for beating your best on a verse, but only once per
-- 7 days per verse. Same reasoning as 0056 removing the focus-practice daily
-- cap: the Study tab should reward studying more, not stop rewarding it. Beating
-- your best now pays every time you manage it.
--
-- This stays self-limiting without the gate, which is why the improvement rule
-- is the thing worth keeping and the cooldown isn't: the bar is your own record
-- and `new_best` only ever rises, so earning again means beating the score you
-- just set. A run that ties or loses to your best still pays nothing.
--
-- practice_plays.last_reward_on is deliberately left in place and still written.
-- It no longer gates anything — it's a record of when a verse last paid out, and
-- keeping the column means no destructive migration and a trivial re-add if the
-- cooldown ever comes back.
--
-- Mirrored in src/lib/practice.ts + src/store/practice.ts — keep in sync.

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
  v_bonus integer := 0;
  v_new_best integer;
  v_new_xp integer;
  v_new_level integer;
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
  v_new_best := greatest(v_prev_best, v_score);

  -- Beating your best is the whole gate now; no weekly cooldown.
  if v_improved then
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
  else
    v_new_xp := prof.xp;
    v_new_level := prof.level;
  end if;

  return json_build_object(
    'rewarded', v_bonus > 0,
    'improved', v_improved,
    -- Kept for clients built against 0014, which read these to render the recap.
    -- There is no cooldown any more, so the lock never trips.
    'weekly_locked', false,
    'next_reward_on', null,
    'xp_earned', v_bonus,
    'score', v_score,
    'previous_best', v_prev_best,
    'new_best', v_new_best,
    'xp', v_new_xp,
    'level', v_new_level
  );
end;
$$;

grant execute on function public.submit_practice(date, integer) to authenticated;

notify pgrst, 'reload schema';
