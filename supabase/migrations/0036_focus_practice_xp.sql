-- Focus practice XP. A focus-practice session (drill verses from a chosen book,
-- racing a study companion) pays a small flat XP reward, capped per day so it
-- can't be farmed: 5 XP per completed session, up to 20 XP/day. After the cap
-- you can keep practicing freely — you just stop earning until the next day.
-- Replaces the old "study the last five" reward path for casual repetition.

create table if not exists public.focus_practice_days (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  day        date not null,
  xp_earned  integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.focus_practice_days enable row level security;
drop policy if exists "focus self-select" on public.focus_practice_days;
drop policy if exists "focus self-write"  on public.focus_practice_days;
create policy "focus self-select" on public.focus_practice_days
  for select using (auth.uid() = user_id);
-- Writes go through submit_focus_practice (security definer); still scope any
-- direct write to the owner as defense in depth.
create policy "focus self-write" on public.focus_practice_days
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Award XP for one completed focus-practice session. Grants 5 XP if the player
-- is under the 20/day cap, otherwise 0. p_day is the client's LOCAL date (so the
-- cap resets at the player's midnight, like the rest of the app); it's clamped to
-- within a day of the server date so it can't be used to reset the cap at will.
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
  v_cap integer := 20;
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

  v_award := least(v_per, greatest(0, v_cap - v_prior));

  if v_award > 0 then
    insert into public.focus_practice_days (user_id, day, xp_earned)
    values (uid, v_day, v_award)
    on conflict (user_id, day) do update set
      xp_earned  = public.focus_practice_days.xp_earned + excluded.xp_earned,
      updated_at = now();
    v_new_xp := prof.xp + v_award;
    v_new_level := public.level_from_xp(v_new_xp);
    update public.profiles set xp = v_new_xp, level = v_new_level where id = uid;
  else
    v_new_xp := prof.xp;
    v_new_level := prof.level;
  end if;

  return json_build_object(
    'xp_earned', v_award,
    'day_total', v_prior + v_award,
    'cap', v_cap,
    'capped', (v_prior + v_award) >= v_cap,
    'xp', v_new_xp,
    'level', v_new_level
  );
end;
$$;

grant execute on function public.submit_focus_practice(date) to authenticated;

notify pgrst, 'reload schema';
