-- Praying pays, three a day.
--
-- The first version of this feature paid nothing, deliberately — a count of
-- prayers said is a number you start performing for. That call has been
-- reversed by the app's owner, so what matters now is that the reward is built
-- the way every XP grant in this app is built, because `xp` IS the worldwide
-- leaderboard (0006) and it is the one number here that ranks people.
--
-- THE SAFETY ARGUMENT IS THE WASH_FEET ONE (0068), and it is the whole design:
--
--   THE SERVER COUNTS AND THE SERVER PAYS. The client asks "I prayed", and
--   this function decides whether that is worth anything. No amount is ever
--   sent by a client, so no client can grant itself XP.
--
--   THE CAP IS IN SQL, NOT IN THE BUTTON. Three a day, enforced here. Reaching
--   it costs nothing and is not a scolding — the fourth prayer is still a
--   prayer, it just doesn't pay.
--
--   THE CLIENT SENDS todayLocalDate() AND THE SERVER CLAMPS +-1, the house
--   pattern. A lying client can reach three buckets — 90 XP — which is bounded
--   and buys nothing that isn't already reachable by playing.
--
-- WHAT IT IS WORTH, stated plainly so a future session can weigh it: 10 XP x 3
-- is 30 a day, against a daily drop's 30-60. That is a much bigger number than
-- the Basin's 12, and it is a deliberate choice rather than an oversight. If it
-- ever grows past this, the argument that keeps it honest is that it is capped
-- and server-granted, not that it is small.
--
-- NOTHING ELSE IS RECORDED. One row per prayer with a date on it, so the cap
-- can be counted. No occasion, no text, no streak, nothing another player can
-- ever see, and no RPC that asks how much somebody else has prayed.

create table if not exists public.prayers (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  prayed_on  date not null,
  created_at timestamptz not null default now()
);

create index if not exists prayers_user_day_idx on public.prayers (user_id, prayed_on);

alter table public.prayers enable row level security;

-- Yours and only yours. There is deliberately no policy letting anyone read
-- anybody else's, and no aggregate RPC over this table.
drop policy if exists "prayers self-select" on public.prayers;
create policy "prayers self-select" on public.prayers
  for select using (auth.uid() = user_id);
-- No write policy: record_prayer is the only way a row appears.

create or replace function public.record_prayer(p_local_date date default null)
returns jsonb
language plpgsql
security definer set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  cap constant int := 3;   -- KEEP IN SYNC with PRAYER_DAILY_CAP in data/prayers.ts
  pay constant int := 10;  -- KEEP IN SYNC with PRAYER_XP in data/prayers.ts
  d date;
  v_today int;
  v_old_level int;
  v_new_xp int;
  v_new_level int;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  -- Trust the client's local date, but only just.
  d := coalesce(p_local_date, current_date);
  if d < current_date - 1 then d := current_date - 1; end if;
  if d > current_date + 1 then d := current_date + 1; end if;

  select count(*) into v_today from public.prayers
   where user_id = uid and prayed_on = d;

  -- Over the cap: the prayer still happened, it just isn't paid for. Recorded
  -- as ok:true with awarded 0 rather than as a refusal, because a prayer is
  -- never an error and the sheet must not draw one.
  if v_today >= cap then
    return jsonb_build_object('ok', true, 'awarded', 0, 'today', v_today, 'cap', cap);
  end if;

  insert into public.prayers (user_id, prayed_on) values (uid, d);

  select level into v_old_level from public.profiles where id = uid;

  update public.profiles
     set xp = xp + pay,
         level = public.level_from_xp(xp + pay)
   where id = uid
   returning xp, level into v_new_xp, v_new_level;

  return jsonb_build_object(
    'ok', true,
    'awarded', pay,
    'xp', v_new_xp,
    'level', v_new_level,
    'leveled_up', v_new_level > coalesce(v_old_level, v_new_level),
    'today', v_today + 1,
    'cap', cap
  );
end;
$$;

grant execute on function public.record_prayer(date) to authenticated;

-- How many are left today. Recipient-only in the same sense everything else
-- here is: it answers about the caller and nobody else.
create or replace function public.my_prayers(p_local_date date default null)
returns jsonb
language plpgsql
stable security definer set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  cap constant int := 3;
  d date;
  v_today int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  d := coalesce(p_local_date, current_date);
  if d < current_date - 1 then d := current_date - 1; end if;
  if d > current_date + 1 then d := current_date + 1; end if;

  select count(*) into v_today from public.prayers
   where user_id = uid and prayed_on = d;

  return jsonb_build_object('today', v_today, 'cap', cap);
end;
$$;

grant execute on function public.my_prayers(date) to authenticated;

notify pgrst, 'reload schema';
