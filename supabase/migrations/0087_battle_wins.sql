-- Battle wins, counted on the profile, and the crusades-era looks they unlock.
--
-- THIS NARROWS A RULE THIS REPO STATES ABSOLUTELY, so the argument is written
-- down here rather than left for a future session to re-derive and "fix".
--
-- CLAUDE.md's mission constraint says a feature that needs a person to lose is
-- the wrong feature, and 0086 leaned on exactly that: Jonathan and Deborah count
-- battles PLAYED so that losing one costs nothing. This migration adds a ladder
-- of five cosmetics earned by WINNING, at the app owner's direction. What makes
-- it defensible rather than a hole in the rule:
--
--   * A BATTLE ALREADY HAS A WINNER, and this app already ranks people by wins.
--     `battle_leaderboard` (0020) and `battle_denomination_board` (0032) both
--     order by wins desc and have since the feature shipped. This adds a look to
--     a number that has been public and ranked for eighty migrations; it does not
--     introduce ranking to a surface that was free of it.
--   * NOTHING IS TAKEN FROM THE LOSER. There is no rating to fall, no streak to
--     break, no rung to slip down. `battle_wins` only ever goes up, so a bad run
--     is worth nothing rather than worth less than nothing, and a player who
--     never wins is exactly where they started.
--   * THE XP IS UNTOUCHED AND STAYS BLIND TO THE RESULT. `award_battle_xp`
--     (0086) still never reads a score: the winner and the loser are paid the
--     same 10 XP. The thing that ranks people — `xp`, the worldwide leaderboard
--     (0006) — cannot be moved by beating anybody, and that is the line that
--     must not move. A cosmetic is not standing.
--   * THE LADDER IS NOT SHOWN. The wardrobe draws a padlock and crossed swords
--     on a locked one and nothing else — no "3/10 wins" progress bar to grind
--     against. The number only ever appears once, in the notification that says
--     you have earned it. What is deliberately absent is a screen where you can
--     watch yourself being behind.
--
-- WHAT IS DELIBERATELY NOT ADDED: a losses column, anywhere. There is still no
-- such number in this schema and there must not be one.

alter table public.profiles add column if not exists battle_wins int not null default 0;

-- Backfill from the battles that already happened, so nobody who has been
-- playing since launch starts at zero. Written as a recompute rather than an
-- increment so re-running this migration is a no-op, the house rule.
update public.profiles p
   set battle_wins = (
     select count(*) from public.battles b
      where b.status = 'complete'
        and ((b.winner = 'challenger' and b.challenger_id = p.id)
          or (b.winner = 'opponent'   and b.opponent_id   = p.id))
   );

-- submit_battle is where a battle is DECIDED, so it is where the winner's
-- counter moves — the same choke-point argument 0086 makes for the XP. Both
-- sides are handled here even though only one of them is the caller: the
-- challenger is not present when their own battle completes, and a counter that
-- only moved for whoever happened to submit would credit half the wins in the
-- app to the wrong people.
--
-- Everything else in this function is 0086's version, unchanged.
drop function if exists public.submit_battle(uuid, int, int);
create or replace function public.submit_battle(
  p_id uuid,
  p_score int,
  p_time_ms int,
  p_local_date date default null
)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare b public.battles; r public.battles; v_winner text; v_paid int := 0;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into b from public.battles where id = p_id for update;
  if not found then raise exception 'battle not found'; end if;
  if b.challenger_id = auth.uid() then raise exception 'cannot battle yourself'; end if;

  v_winner := case
    when p_score > b.challenger_score then 'opponent'
    when p_score < b.challenger_score then 'challenger'
    when p_time_ms < b.challenger_time_ms then 'opponent'
    when p_time_ms > b.challenger_time_ms then 'challenger'
    else 'tie' end;

  if b.broadcast then
    -- one result per opener; spawn a fresh 1v1 from the template
    select * into r from public.battles where source_id = b.id and opponent_id = auth.uid() limit 1;
    if found then return public.battle_json(r) || jsonb_build_object('xp_awarded', 0); end if;
    begin
      insert into public.battles(challenger_id, opponent_id, seed, challenger_score, challenger_time_ms,
        opponent_score, opponent_time_ms, status, winner, completed_at, source_id, live)
      values (b.challenger_id, auth.uid(), b.seed, b.challenger_score, b.challenger_time_ms,
        p_score, p_time_ms, 'complete', v_winner, now(), b.id, b.live)
      returning * into r;
      -- Counted on the INSERT only, which the unique index makes once-ever: a
      -- second opener spawns their own row, a returning one is caught above.
      if v_winner = 'challenger' then
        update public.profiles set battle_wins = battle_wins + 1 where id = b.challenger_id;
      elsif v_winner = 'opponent' then
        update public.profiles set battle_wins = battle_wins + 1 where id = auth.uid();
      end if;
    exception when unique_violation then
      select * into r from public.battles where source_id = b.id and opponent_id = auth.uid() limit 1;
    end;
    v_paid := public.award_battle_xp(r.id, p_local_date);
    return public.battle_json(r) || jsonb_build_object('xp_awarded', v_paid);
  end if;

  -- normal targeted/open battle
  if b.invited_id is not null and b.invited_id <> auth.uid() then raise exception 'this challenge is for someone else'; end if;
  -- Already complete: the win was counted when it completed. Paying is still
  -- attempted because the primary key, not this branch, decides that.
  if b.status = 'complete' then
    v_paid := public.award_battle_xp(b.id, p_local_date);
    return public.battle_json(b) || jsonb_build_object('xp_awarded', v_paid);
  end if;
  update public.battles
  set opponent_id = auth.uid(), opponent_score = p_score, opponent_time_ms = p_time_ms,
      status = 'complete', winner = v_winner, completed_at = now()
  where id = p_id returning * into b;
  -- The row was pending a statement ago and is locked FOR UPDATE, so this runs
  -- exactly once per battle. A tie moves nothing, for either player.
  if v_winner = 'challenger' then
    update public.profiles set battle_wins = battle_wins + 1 where id = b.challenger_id;
  elsif v_winner = 'opponent' then
    update public.profiles set battle_wins = battle_wins + 1 where id = auth.uid();
  end if;
  v_paid := public.award_battle_xp(b.id, p_local_date);
  return public.battle_json(b) || jsonb_build_object('xp_awarded', v_paid);
end; $$;

grant execute on function public.submit_battle(uuid, int, int, date) to authenticated;

notify pgrst, 'reload schema';
