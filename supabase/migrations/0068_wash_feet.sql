-- Wash their feet — the app's version of a poke, and the only social gesture
-- here that costs the SENDER something and pays the RECEIVER nothing but the
-- knowledge that somebody knelt down. John 13:14.
--
-- WHY THIS CAN EXIST NEXT TO THE RANK-FREE RULE. A poke ranks nobody, but the
-- 1 XP it pays touches profiles.xp, which IS the worldwide leaderboard (0006).
-- So the whole shape of this function is about bounding that:
--
--   • ONE XP. Not two. A daily drop pays 30-60 (submit_play), so twelve of
--     these are worth a quarter of one run.
--   • TWELVE A DAY, one for each disciple — the cap is the theme. Server-side,
--     counted from rows, never sent by the client.
--   • ONCE PER PERSON PER DAY, enforced by the primary key. Reaching the cap
--     means finding twelve different real accounts, which is the natural limit
--     on this and the reason the cap can be as high as twelve at all.
--   • NOTHING HERE IS EVER SHOWN AS A COMPARISON. `my_washings` returns the
--     received count to the recipient ONLY; get_player_card is untouched, no
--     board reads this table, and no RPC exposes one player's total to
--     another. A count of who likes you is the exact feature this app doesn't
--     have.
--
-- Dates are the player's LOCAL date, clamped to +/-1 day server-side — the
-- house pattern (submit_focus_practice, record_book_accuracy). A lying client
-- can reach three day-buckets, which is bounded and buys 36 XP.
--
-- KEEP IN SYNC with src/data/washing.ts (WASH_DAILY_CAP + the milestone
-- ladder) — the same client/server mirror every reward path here has.

create table if not exists public.feet_washings (
  washer_id uuid not null references public.profiles(id) on delete cascade,
  washed_id uuid not null references public.profiles(id) on delete cascade,
  washed_on date not null,
  created_at timestamptz not null default now(),
  primary key (washer_id, washed_id, washed_on),
  check (washer_id <> washed_id)
);

-- Both directions are read hot: "how many have I done today" and "who washed
-- mine lately".
create index if not exists feet_washings_washer_idx on public.feet_washings(washer_id, washed_on desc);
create index if not exists feet_washings_washed_idx on public.feet_washings(washed_id, created_at desc);

alter table public.feet_washings enable row level security;
-- No policies on purpose: every read and write goes through the SECURITY
-- DEFINER functions below, the same as buddies (0024).

-- Wash one player's feet. Returns what the client needs to redraw without a
-- second round trip: the new XP/level, today's tally, and the lifetime total
-- the milestone ladder is drawn from.
create or replace function public.wash_feet(p_username text, p_local_date date default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  uid uuid := auth.uid();
  cap constant int := 12;              -- one for each disciple; see header
  d date;
  target uuid;
  v_today int;
  v_new_xp int;
  v_new_level int;
  v_old_level int;
  v_lifetime int;
  v_inserted int := 0;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  -- Trust the client's local date, but only just.
  d := coalesce(p_local_date, current_date);
  if d < current_date - 1 then d := current_date - 1; end if;
  if d > current_date + 1 then d := current_date + 1; end if;

  select id into target from public.profiles where username = lower(trim(p_username));
  if target is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if target = uid then return jsonb_build_object('ok', false, 'reason', 'self'); end if;

  select count(*) into v_today from public.feet_washings
   where washer_id = uid and washed_on = d;

  if v_today >= cap then
    return jsonb_build_object('ok', false, 'reason', 'cap', 'today', v_today, 'cap', cap);
  end if;

  insert into public.feet_washings (washer_id, washed_id, washed_on)
  values (uid, target, d)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    -- Already washed this person today. Not an error and not a scolding: the
    -- client just redraws the button as done.
    return jsonb_build_object('ok', false, 'reason', 'already', 'today', v_today, 'cap', cap);
  end if;

  select level into v_old_level from public.profiles where id = uid;

  update public.profiles
     set xp = xp + 1,
         level = public.level_from_xp(xp + 1)
   where id = uid
   returning xp, level into v_new_xp, v_new_level;

  select count(*) into v_lifetime from public.feet_washings where washer_id = uid;

  return jsonb_build_object(
    'ok', true,
    'xp', v_new_xp,
    'level', v_new_level,
    'leveled_up', v_new_level > coalesce(v_old_level, v_new_level),
    'today', v_today + 1,
    'cap', cap,
    'lifetime', v_lifetime
  );
end; $$;

-- Everything the Basin section needs, in one call: what I've done, what's left
-- today, who I've already washed today (so their buttons draw as done), and
-- the handful of people who washed mine.
--
-- `received` is returned to the RECIPIENT ONLY. There is deliberately no way
-- to ask how many washings someone ELSE has received.
create or replace function public.my_washings(p_local_date date default null, p_limit int default 8)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  uid uuid := auth.uid();
  d date;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  d := coalesce(p_local_date, current_date);
  if d < current_date - 1 then d := current_date - 1; end if;
  if d > current_date + 1 then d := current_date + 1; end if;

  return jsonb_build_object(
    'cap', 12,
    'lifetime', (select count(*) from public.feet_washings where washer_id = uid),
    'today', (select count(*) from public.feet_washings where washer_id = uid and washed_on = d),
    'washed_today', (
      select coalesce(jsonb_agg(p.username), '[]'::jsonb)
      from public.feet_washings w join public.profiles p on p.id = w.washed_id
      where w.washer_id = uid and w.washed_on = d
    ),
    'received', (select count(*) from public.feet_washings where washed_id = uid),
    'recent', (
      -- desc twice on purpose: the inner order picks WHICH eight, the outer
      -- one decides how they're handed over — most recent first, as the
      -- section draws them.
      select coalesce(jsonb_agg(card order by ord desc), '[]'::jsonb)
      from (
        select public.buddy_card(p) as card, w.created_at as ord
        from public.feet_washings w join public.profiles p on p.id = w.washer_id
        where w.washed_id = uid
        order by w.created_at desc
        limit greatest(least(coalesce(p_limit, 8), 24), 1)
      ) s
    )
  );
end; $$;

grant execute on function public.wash_feet(text, date) to authenticated;
grant execute on function public.my_washings(date, int) to authenticated;

notify pgrst, 'reload schema';
