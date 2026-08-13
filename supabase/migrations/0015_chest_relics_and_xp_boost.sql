-- Verse Arcade — more chest relics + a rare "XP Boost" consumable.
-- ---------------------------------------------------------------------------
-- 1. Adds a batch of new collectible relics to the Daily Chest pool.
-- 2. Adds an XP Boost consumable: the chest very rarely (~4%) drops one instead
--    of a relic. It's stored as a counter on the profile (like streak_freezes),
--    and can be applied to a single daily play for +50% XP, then it's consumed.
-- ---------------------------------------------------------------------------

-- Consumable counter (mirrors the streak_freezes pattern).
alter table public.profiles add column if not exists xp_boosts integer not null default 0;

-- New relics (keys/rarities mirror src/data/collectibles.ts). Weights match the
-- existing tiers: common 20, uncommon 8, rare 2.
insert into public.chest_relics (key, rarity, weight) values
  ('widows_mite','common',20),
  ('manna','common',20),
  ('loaves_fish','common',20),
  ('shepherds_crook','common',20),
  ('descending_dove','common',20),
  ('jubilee_trumpet','uncommon',8),
  ('davids_harp','uncommon',8),
  ('jordan_water','uncommon',8),
  ('apostles_letter','uncommon',8),
  ('covenant_rainbow','rare',2),
  ('tablets_law','rare',2),
  ('kingdom_keys','rare',2),
  ('pearl_price','rare',2)
on conflict (key) do nothing;

-- Chest open: once per day. Small chance of an XP Boost; otherwise a weighted
-- random relic (as before). Returns a `kind` so the client knows which it was.
create or replace function public.open_daily_chest(p_drop_date date)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_last date;
  v_key text;
  v_rarity text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select last_chest_on into v_last from public.profiles where id = uid;
  if v_last is not null and v_last >= p_drop_date then
    return json_build_object('already_opened', true);
  end if;

  -- ~4% of chests yield a rare XP Boost instead of a relic.
  if random() < 0.04 then
    update public.profiles
      set xp_boosts = coalesce(xp_boosts, 0) + 1, last_chest_on = p_drop_date
      where id = uid;
    return json_build_object('already_opened', false, 'kind', 'boost');
  end if;

  -- Weighted sampling (Efraimidis-Spirakis): highest key of random^(1/weight).
  select key, rarity into v_key, v_rarity
  from public.chest_relics
  order by power(random(), 1.0 / greatest(weight, 1)) desc
  limit 1;
  insert into public.user_unlocks (user_id, collectible_key, source)
  values (uid, v_key, 'chest')
  on conflict (user_id, collectible_key) do nothing;
  update public.profiles set last_chest_on = p_drop_date where id = uid;
  return json_build_object('already_opened', false, 'kind', 'relic', 'key', v_key, 'rarity', v_rarity);
end;
$$;
grant execute on function public.open_daily_chest(date) to authenticated;

-- submit_play, now with an optional XP Boost. Adding a parameter changes the
-- signature, so drop the old overload first; existing 6-arg named calls resolve
-- to the new one via the p_use_boost default.
drop function if exists public.submit_play(date, integer, integer, integer, integer, integer);

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

grant execute on function public.submit_play(date, integer, integer, integer, integer, integer, boolean) to authenticated;
