-- Uncap focus-practice XP.
--
-- 0038 paid 5 XP per completed focus session up to 20 XP/day, so a player hit
-- the ceiling after four sessions and everything past that earned nothing. The
-- cap existed to stop practice becoming an XP farm; we're deliberately dropping
-- it so players can grind small amounts toward something they care about —
-- giving to their church. A church's giving budget is lifetime XP minus what
-- you've already given (church_points_available), so uncapped practice XP is
-- uncapped giving, which is the point.
--
-- What this means, stated plainly because it's a real trade-off: focus XP is
-- ordinary XP. It counts toward level and the worldwide leaderboard as well as
-- the church budget, so time spent practicing now moves standing. That was the
-- explicit product call.
--
-- focus_practice_days stays, and still accumulates xp_earned per local day —
-- it's now a running tally for the recap ("N XP from focus today") rather than
-- a limit. No schema change; only the function's award rule moves.
--
-- Idempotent: create or replace only.

create or replace function public.submit_focus_practice(p_day date default null)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prof public.profiles%rowtype;
  v_day date;
  v_prior integer;
  v_per integer := 5;
  v_award integer;
  v_new_xp integer;
  v_new_level integer;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  v_day := coalesce(p_day, current_date);
  if v_day < current_date - 1 or v_day > current_date + 1 then
    v_day := current_date;
  end if;

  select * into prof from public.profiles where id = uid for update;
  select coalesce(xp_earned, 0) into v_prior
    from public.focus_practice_days where user_id = uid and day = v_day;
  v_prior := coalesce(v_prior, 0);

  -- Every completed session pays the flat reward. No daily ceiling.
  v_award := v_per;

  insert into public.focus_practice_days (user_id, day, xp_earned)
  values (uid, v_day, v_award)
  on conflict (user_id, day) do update set
    xp_earned  = public.focus_practice_days.xp_earned + excluded.xp_earned,
    updated_at = now();

  v_new_xp := prof.xp + v_award;
  v_new_level := public.level_from_xp(v_new_xp);
  update public.profiles set xp = v_new_xp, level = v_new_level where id = uid;

  -- `cap` is null and `capped` false forever now; both keys stay in the payload
  -- so a client cached from before this migration keeps parsing the response.
  return json_build_object(
    'xp_earned', v_award,
    'day_total', v_prior + v_award,
    'cap', null::integer,
    'capped', false,
    'uncapped', true,
    'xp', v_new_xp,
    'level', v_new_level
  );
end;
$$;

grant execute on function public.submit_focus_practice(date) to authenticated;

notify pgrst, 'reload schema';
