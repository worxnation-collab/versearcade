-- Pets that do something, and that are harder to get.
--
-- Replaces 0063's level-only gate. See src/data/pets.ts for the design of
-- record. What has to hold on this side:
--
--   TWO TIERS. The common pets are company and nothing else. The rarer ones
--   each do one small thing, and what a pet does is tied to how hard it was to
--   get.
--
--   WHERE AN EFFECT IS ALLOWED TO REACH. This is the load-bearing rule:
--
--     * `xp` touches the one number in this app that ranks people, so every XP
--       pet is gated on a column THE SERVER WROTE ITSELF — level, longest
--       streak and total_plays are all written by submit_play — and the bonus
--       is applied inside submit_play, never sent by a client. 3-5% of one
--       daily drop: a pet is worth less than a slightly better run.
--     * `glow` is decoration, so it can be gated on anything, including
--       keep_progress. 0059 clamps those counters rather than verifying them,
--       and a forged counter is worth a halo, not standing.
--     * `luck` only moves study-drop ODDS, never the daily cap, and a study
--       drop pays no XP, no points and no standing (0055) — its one use is
--       giving a relic to a church. So it can't be farmed into anything
--       rankable either.
--
--   The honest caveat, written down rather than glossed: an XP pet compounds a
--   little — you need level 33 to get the thing that levels you slightly
--   faster. It is bounded at 5% of one play a day, which is why it is
--   tolerable. If these numbers ever grow, that argument stops holding and the
--   effect needs rethinking, not raising.
--
-- KEEP IN SYNC with src/data/pets.ts (PETS, petXpBonus, petDropLuck).
--
-- Idempotent: create or replace throughout.

-- ── What each pet asks for, beyond a level ──────────────────────────────────
create or replace function public.pet_min_level(p_pet text)
returns integer
language sql
immutable
as $$
  select case p_pet
    when 'pet_lamb'     then 10
    when 'pet_dove'     then 15
    when 'pet_raven'    then 20
    when 'pet_lion_cub' then 26
    when 'pet_donkey'   then 33
    when 'pet_camel'    then 40
    else null
  end::integer;
$$;

-- Every requirement is a lifetime number that only goes up, so a pet can never
-- be taken back by a bad week. `longest_streak`, not `current_streak`, for
-- exactly that reason.
create or replace function public.pet_requirements_met(p_user uuid, p_pet text)
returns boolean
language plpgsql
stable
security definer set search_path = public
as $$
declare
  prof public.profiles%rowtype;
  v_need integer := public.pet_min_level(p_pet);
begin
  if v_need is null then return false; end if;
  select * into prof from public.profiles where id = p_user;
  if not found then return false; end if;
  if coalesce(prof.level, 1) < v_need then return false; end if;

  -- The coalesce around the whole case is not decoration. A player with no
  -- keep_progress row makes that subquery NULL, the case NULL, and `if not
  -- NULL` is not true — so set_pet would fall straight past its "locked"
  -- return and equip the pet. Anything that can be NULL here has to become
  -- false before it leaves this function.
  return coalesce(
    case p_pet
      when 'pet_lamb' then true
      when 'pet_dove' then coalesce(prof.longest_streak, 0) >= 7
      when 'pet_raven' then (
        select count(*) from public.bible_marks
        where user_id = p_user and kind = 'studied'
      ) >= 250
      when 'pet_lion_cub' then
        coalesce((select cpu_won from public.keep_progress where user_id = p_user), 0) >= 25
      when 'pet_donkey' then coalesce(prof.total_plays, 0) >= 150
      when 'pet_camel' then coalesce(prof.longest_streak, 0) >= 30
      else false
    end,
    false
  );
end;
$$;

-- ── What each pet does ──────────────────────────────────────────────────────
/** Fraction added to a daily drop's XP. Zero for everything but the two. */
create or replace function public.pet_xp_bonus(p_pet text)
returns numeric
language sql
immutable
as $$
  select case p_pet
    when 'pet_donkey' then 0.03
    when 'pet_camel'  then 0.05
    else 0
  end::numeric;
$$;

/** Multiplier on the study-drop chance. One for everything but the raven. */
create or replace function public.pet_drop_luck(p_pet text)
returns numeric
language sql
immutable
as $$
  select case p_pet
    when 'pet_raven' then 1.35
    else 1
  end::numeric;
$$;

-- ── Equip one ───────────────────────────────────────────────────────────────
create or replace function public.set_pet(p_pet text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;

  -- null clears it. Taking a pet off is always allowed: nothing about this is
  -- a commitment.
  if p_pet is null then
    update public.profiles set pet = null where id = uid;
    return jsonb_build_object('ok', true, 'pet', null);
  end if;

  if public.pet_min_level(p_pet) is null then raise exception 'bad pet'; end if;

  -- `is not true` rather than `not (...)`: belt and braces against a NULL ever
  -- coming back from the gate, which would otherwise read as "allowed".
  if public.pet_requirements_met(uid, p_pet) is not true then
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;

  update public.profiles set pet = p_pet where id = uid;
  return jsonb_build_object('ok', true, 'pet', p_pet);
end;
$$;

-- ── The daily drop, with the pet's slice ────────────────────────────────────
-- Re-declared whole from 0015 with ONE addition (marked NEW below), because
-- that is the current definition and a partial patch would silently drop the
-- chest and boost work it added. The rest of this body is byte-identical to
-- 0015's — hand-retyping it once already lost the presence_events writes that
-- feed the ambient "others are playing" signal, so it was rebuilt from that
-- file rather than from memory. Diff it against 0015 before changing anything.
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

grant execute on function public.pet_min_level(text) to anon, authenticated;
grant execute on function public.pet_requirements_met(uuid, text) to authenticated;
grant execute on function public.pet_xp_bonus(text) to anon, authenticated;
grant execute on function public.pet_drop_luck(text) to anon, authenticated;
grant execute on function public.set_pet(text) to authenticated;
grant execute on function public.submit_play(date, integer, integer, integer, integer, integer, boolean) to authenticated;

notify pgrst, 'reload schema';
