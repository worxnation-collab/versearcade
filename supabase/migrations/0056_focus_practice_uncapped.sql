-- Remove the daily XP cap from focus practice.
--
-- 0038 (originally 0036) paid 5 XP per completed focus session up to 20 XP/day,
-- after which studying paid nothing until the next local midnight. The Study tab
-- is meant to reward studying more, not to stop rewarding it, so the ceiling is
-- gone: every completed session pays the same flat 5 XP, forever.
--
-- focus_practice_days stays exactly as it is — the per-day row is now a running
-- total the recap can show ("35 XP from focus today") rather than a budget the
-- server spends down. Keeping the table means no data migration and no loss of
-- the daily history.
--
-- Mirrored in src/store/focus.ts (FOCUS_XP_PER_SESSION) — keep the two in sync.
--
-- p_day is still the client's LOCAL date, still clamped to within a day of the
-- server date. It no longer gates anything (there's nothing to reset), but it
-- keeps the per-day totals landing on the player's own day like the rest of the
-- app, and keeps the signature stable for clients that haven't shipped yet.

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
  v_award integer := 5;
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

  insert into public.focus_practice_days (user_id, day, xp_earned)
  values (uid, v_day, v_award)
  on conflict (user_id, day) do update set
    xp_earned  = public.focus_practice_days.xp_earned + excluded.xp_earned,
    updated_at = now();

  v_new_xp := prof.xp + v_award;
  v_new_level := public.level_from_xp(v_new_xp);
  update public.profiles set xp = v_new_xp, level = v_new_level where id = uid;

  return json_build_object(
    'xp_earned', v_award,
    'day_total', v_prior + v_award,
    -- Kept for clients built against 0038, which read these to render the recap.
    -- There is no cap any more, so it never trips.
    'cap', null,
    'capped', false,
    'xp', v_new_xp,
    'level', v_new_level
  );
end;
$$;

grant execute on function public.submit_focus_practice(date) to authenticated;

notify pgrst, 'reload schema';
