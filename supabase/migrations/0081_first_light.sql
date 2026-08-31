-- First light — the day's lantern, and the one XP each player who follows
-- somebody in is worth to them.
--
-- The first person to open a day's verse holds that day's lantern. Every
-- account that opens the same verse after them pays them ONE XP — paid by the
-- server out of thin air, never taken from the follower, because there is no
-- subtraction anywhere in this app and there isn't going to be one here.
--
-- WHY THIS CAN EXIST NEXT TO THE RANK-FREE RULE. The rule is that no feature
-- may need a person to lose. Nothing here does:
--
--   • ONE person is named per day, and NOBODY has a position. There is no
--     second, no "you were 400th", no ordering of the day's openers and no RPC
--     that could build one — `daily_opens` is read as a COUNT and as a primary
--     key, never as a sorted list. Being late is invisible, which is the whole
--     difference between this and a leaderboard.
--   • The lantern is a DAY, not a ladder. It resets at midnight and nothing
--     accumulates: there is deliberately no lifetime "dawns held" column, no
--     Journal rung and no board — the same argument record_prayer makes for
--     having no streak. A rung you climb by getting up earlier is a rung
--     people would get up earlier to climb.
--   • A follower loses nothing. Their own XP, streak, score and standing are
--     byte-identical to what they would have been; the point the holder gets
--     is minted, not moved.
--
-- HOW THE XP IS BOUNDED, which is the part that matters, because profiles.xp
-- IS the worldwide leaderboard (0006) — the same argument wash_feet (0068) and
-- record_prayer (0073) are built on:
--
--   • ONE XP per follower, and only from a REAL ACCOUNT's first open of the
--     day (the primary key). Guests are counted in the day's pulse exactly as
--     they always were but pay nothing: `record_guest_open` takes a
--     client-generated device id, so paying for those would let the holder
--     mint the whole cap out of invented uuids.
--   • A DAILY CEILING of 60 XP — about one daily drop (submit_play pays
--     30-60). So holding the lantern in front of ten thousand people is worth
--     one extra run, not a rank. `xp_awarded` is the counter that enforces it
--     and it is incremented in the same statement that pays, so the ceiling
--     cannot be raced past by two followers landing together.
--   • NEVER TO YOURSELF: the holder's own open doesn't pay, by the
--     `user_id <> p_user` guard rather than by the client not asking.
--   • The client sends `todayLocalDate()` and the server clamps it to +/-1 day
--     — the house pattern. A lying client can reach three day-buckets, which
--     buys at most three lanterns' worth of a bounded number and no standing.
--
-- THE TIMEZONE CAVEAT, written down rather than glossed. A drop_date is the
-- player's LOCAL date (lib/date.ts), so a given date begins in Kiritimati some
-- 26 hours before it begins in Honolulu, and the far east reaches each new
-- verse first. This deliberately does NOT follow the church rivalry's break to
-- UTC (0075): the rivalry is two institutions needing one clock, while the
-- daily verse is one person's own ritual and every table around it — plays,
-- guest_opens, presence_events — is keyed on that local date. Introducing a
-- second date system into the daily tables is the exact mistake 0074 had to
-- undo. What keeps the caveat small is the ceiling above: the advantage is
-- worth one drop's XP a day and buys no title, no badge and no rung. If it
-- ever needs fixing the answer is a lantern per region, which needs a location
-- this app deliberately does not store.
--
-- KEEP IN SYNC with src/data/firstLight.ts (FIRST_LIGHT_XP_CAP).

-- Who opened which day's verse. One row per account per day; the whole table
-- is read as a count and a primary key, never as an ordered list — see above.
create table if not exists public.daily_opens (
  drop_date date not null,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  opened_at timestamptz not null default now(),
  primary key (drop_date, user_id)
);

-- The day's holder, plus what the day has paid them so far. `followers` is the
-- honest count of accounts that came after; `xp_awarded` is what actually
-- landed, which stops at the cap — the two diverge on a busy day on purpose,
-- so the copy can say "1,400 followed you in" while the XP stays bounded.
create table if not exists public.daily_first_open (
  drop_date  date primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  followers  integer not null default 0,
  xp_awarded integer not null default 0
);

alter table public.daily_opens enable row level security;
alter table public.daily_first_open enable row level security;
-- No policies on purpose: every read and write goes through the SECURITY
-- DEFINER functions below, the same as guest_opens (0007) and feet_washings.

-- Record one account's open of a day's verse, claim the lantern if it is going
-- spare, and pay the holder their point if it isn't.
--
-- INTERNAL. Not granted to any client role (see the revoke below and the 0052
-- lesson about `revoke ... from public` not being enough on this project): it
-- takes a user id, so a client-callable version would let anybody record an
-- open for anybody. Clients go through open_daily_verse, which uses auth.uid().
--
-- Idempotent per (day, account): the primary key makes a second call a no-op,
-- and only a fresh row ever pays — which is what lets submit_play call it too
-- without any risk of paying twice for one person.
create or replace function public.record_daily_open(p_user uuid, p_date date)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  cap constant int := 60;          -- about one daily drop; see the header
  v_fresh int := 0;
  v_claimed int := 0;
  v_paid boolean := false;
  f public.daily_first_open%rowtype;
begin
  if p_user is null or p_date is null then
    return jsonb_build_object('ok', false);
  end if;

  insert into public.daily_opens (drop_date, user_id) values (p_date, p_user)
  on conflict do nothing;
  get diagnostics v_fresh = row_count;

  -- Already opened today: nothing to claim and nobody to pay. This is the
  -- guard that lets submit_play and open_daily_verse both call this.
  if v_fresh = 0 then
    return jsonb_build_object('ok', true, 'fresh', false, 'claimed', false, 'paid', false);
  end if;

  -- Claim the day. `on conflict do nothing` on a primary key IS the race:
  -- exactly one of any number of simultaneous first openers inserts, and
  -- everybody else falls through and pays that one.
  insert into public.daily_first_open (drop_date, user_id) values (p_date, p_user)
  on conflict do nothing;
  get diagnostics v_claimed = row_count;
  if v_claimed > 0 then
    return jsonb_build_object('ok', true, 'fresh', true, 'claimed', true, 'paid', false);
  end if;

  -- Somebody already holds it. Lock the day's row so two followers landing
  -- together can't both read the same xp_awarded and both pay past the cap.
  select * into f from public.daily_first_open where drop_date = p_date for update;
  if not found or f.user_id = p_user then
    return jsonb_build_object('ok', true, 'fresh', true, 'claimed', false, 'paid', false);
  end if;

  -- The follower is counted honestly whatever happens; the point only lands
  -- while the day is under its ceiling, so the copy can say "1,400 followed
  -- you in today" without 1,400 XP ever being paid.
  v_paid := f.xp_awarded < cap;
  update public.daily_first_open
     set followers  = followers + 1,
         xp_awarded = xp_awarded + (case when v_paid then 1 else 0 end)
   where drop_date = p_date;

  if v_paid then
    update public.profiles
       set xp = xp + 1,
           level = public.level_from_xp(xp + 1)
     where id = f.user_id;
  end if;

  return jsonb_build_object('ok', true, 'fresh', true, 'claimed', false, 'paid', v_paid);
end;
$$;

-- The client's way in: "I just opened today's verse."
--
-- Called when the daily run screen mounts — opening the verse is opening the
-- screen that shows it, which is the only place in the app the day's verse is
-- read. Returns the day's state so the caller can redraw without a second
-- round trip.
create or replace function public.open_daily_verse(p_local_date date default null)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  d date;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  -- Trust the client's local date, but only just. The house pattern.
  d := coalesce(p_local_date, current_date);
  if d < current_date - 1 then d := current_date - 1; end if;
  if d > current_date + 1 then d := current_date + 1; end if;

  perform public.record_daily_open(uid, d);
  return public.first_light(d);
end;
$$;

-- Who holds a day's lantern, for everyone to see. Readable by anon: a guest
-- watching somebody else hold it is the pitch for the account that would let
-- them hold it themselves.
--
-- WHAT IT DELIBERATELY CANNOT RETURN: a list, an order, or anybody's position.
-- One holder and two counts about the DAY. A hidden account (app review, and
-- the same accounts get_player_card refuses) holds the lantern silently — the
-- day reads as claimed with no name on it, rather than naming somebody the
-- card pop-up would then fail to open.
create or replace function public.first_light(p_local_date date default null)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cap constant int := 60;
  d date;
  f public.daily_first_open%rowtype;
  prof public.profiles%rowtype;
begin
  d := coalesce(p_local_date, current_date);
  if d < current_date - 1 then d := current_date - 1; end if;
  if d > current_date + 1 then d := current_date + 1; end if;

  select * into f from public.daily_first_open where drop_date = d;

  if not found then
    return jsonb_build_object(
      'date', d, 'claimed', false, 'holder', null, 'mine', false,
      'followers', 0, 'xp_awarded', 0, 'cap', cap,
      'opened', (select count(*) from public.daily_opens where drop_date = d),
      'i_opened', uid is not null and exists (
        select 1 from public.daily_opens where drop_date = d and user_id = uid
      )
    );
  end if;

  select * into prof from public.profiles where id = f.user_id;

  return jsonb_build_object(
    'date', d,
    'claimed', true,
    'mine', uid is not null and f.user_id = uid,
    'holder', case
      when prof.id is null or coalesce(prof.hidden, false) then null
      else jsonb_build_object(
        'username', prof.username,
        'avatar_emoji', prof.avatar_emoji,
        'avatar_character', prof.avatar_character,
        'avatar_border', coalesce(prof.avatar_border, 'default'),
        'avatar_badge', prof.avatar_badge,
        'denomination', prof.denomination
      )
    end,
    'claimed_at', f.claimed_at,
    'followers', f.followers,
    'xp_awarded', f.xp_awarded,
    'cap', cap,
    'opened', (select count(*) from public.daily_opens where drop_date = d),
    'i_opened', uid is not null and exists (
      select 1 from public.daily_opens where drop_date = d and user_id = uid
    )
  );
end;
$$;

-- The daily drop, recording the open it always was.
--
-- Re-declared WHOLE from 0064 (which re-declared it whole from 0015, for the
-- same reason) with ONE addition, marked NEW below. The body between here and
-- that line is copied byte-for-byte out of 0064 rather than retyped — that
-- file's header records what hand-retyping it cost last time.
--
-- Why submit_play records an open at all, when open_daily_verse already does:
-- ios/ ships a baked dist, so every already-approved build finishes a daily
-- drop without ever calling the new RPC. Recording it here keeps those players
-- counting toward the day's lantern. The primary key makes the second write a
-- no-op for anyone whose client called both, and only a FRESH row ever pays.
create or replace function public.submit_play(
  p_drop_date date,
  p_score integer,
  p_time_ms integer,
  p_correct integer,
  p_total integer,
  p_combo_max integer,
  p_use_boost boolean default false
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
  v_boost_used boolean := false;
  v_boosts_left integer;
  v_play_id uuid;
  v_pet_bonus numeric;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select * into prof from public.profiles where id = uid for update;
  v_boosts_left := coalesce(prof.xp_boosts, 0);

  -- Idempotent: if they already played this drop, just return current state.
  if exists (select 1 from public.plays where user_id = uid and drop_date = p_drop_date) then
    return json_build_object(
      'already_played', true,
      'xp', prof.xp, 'level', prof.level,
      'current_streak', prof.current_streak, 'leveled_up', false,
      'xp_boosts', v_boosts_left
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

  -- XP Boost: +50% on this play's total XP, then consume one.
  if p_use_boost and v_boosts_left > 0 then
    v_xp_earned := round(v_xp_earned * 1.5)::int;
    v_boost_used := true;
    v_boosts_left := v_boosts_left - 1;
  end if;

  -- NEW in 0064: the equipped pet's slice. Read from the profile rather than
  -- sent by the client, and applied AFTER the consumable so the two don't
  -- multiply into something surprising. Mirrored in src/lib/progress.ts —
  -- same order, same rounding.
  v_pet_bonus := public.pet_xp_bonus(prof.pet);
  if v_pet_bonus > 0 then
    v_xp_earned := round(v_xp_earned * (1 + v_pet_bonus))::int;
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
    xp_boosts = v_boosts_left,
    last_played_on = greatest(coalesce(last_played_on, p_drop_date), p_drop_date),
    total_plays = total_plays + 1
  where id = uid;

  -- NEW in 0081: finishing today's drop is also an OPEN of it. Idempotent per
  -- (day, account) and it never pays the player calling it — see
  -- record_daily_open.
  perform public.record_daily_open(uid, p_drop_date);

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
    'streak_freezes', v_freezes,
    'boost_used', v_boost_used,
    'xp_boosts', v_boosts_left
  );
end;
$$;

-- record_daily_open takes a user id, so no client role may call it. Revoked
-- from the NAMED roles as well as PUBLIC: Supabase's default privileges grant
-- execute to anon and authenticated on every new function, and revoking only
-- PUBLIC leaves those standing (the 0052 lesson). Confirm with:
--   select proname, proacl from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and proname = 'record_daily_open';
-- It should read {postgres,service_role}, the way grant_skins does.
revoke all on function public.record_daily_open(uuid, date) from public, anon, authenticated;

grant execute on function public.open_daily_verse(date) to authenticated;
grant execute on function public.first_light(date) to anon, authenticated;
grant execute on function public.submit_play(date, integer, integer, integer, integer, integer, boolean) to authenticated;

notify pgrst, 'reload schema';
