-- Verse Arcade — security hardening pass (audit remediation, 2026-08).
-- ---------------------------------------------------------------------------
-- This migration is defensive and NON-BREAKING for legitimate clients. Every
-- statement is idempotent (revoke / grant / create-or-replace / alter) and safe
-- to run against the current production schema. See docs/SECURITY-AUDIT.md for
-- the full write-up and rationale behind each change.
--
-- What it does:
--   1. Least privilege on RPCs — PostgREST grants EXECUTE to PUBLIC by default,
--      so every function was reachable by the ANONYMOUS role. We pull that back
--      and re-grant only the intended surface per role.
--   2. ensure_daily_verse — now requires authentication and refuses to seed
--      far-future dates, so the shared daily drop can't be pre-poisoned.
--   3. record_guest_open — hardens the untrusted, anon-supplied inputs that flow
--      into the world-readable presence feed and the public leaderboard.
--   4. submit_play — clamps client-supplied score/counts to plausible maxima
--      (defense-in-depth until scoring is fully server-authoritative).
--   5. Pins search_path on the two remaining mutable-search_path functions.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. LEAST PRIVILEGE ON RPCs
-- Revoke the blanket PUBLIC/anon EXECUTE that CREATE FUNCTION grants by default,
-- then re-grant ONLY to the roles that should call each function. The uid guards
-- inside these functions already reject anonymous callers, but least privilege
-- keeps them off the anonymous API surface entirely (defense in depth).
-- ===========================================================================

revoke execute on function public.submit_play(date,integer,integer,integer,integer,integer,boolean) from public, anon;
revoke execute on function public.submit_group_play(uuid,date,integer) from public, anon;
revoke execute on function public.submit_practice(date,integer) from public, anon;
revoke execute on function public.open_daily_chest(date) from public, anon;
revoke execute on function public.grant_unlocks(text[]) from public, anon;
revoke execute on function public.create_group(text,text) from public, anon;
revoke execute on function public.join_group(text) from public, anon;
revoke execute on function public.set_username(text) from public, anon;
revoke execute on function public.set_cosmetics(text,text) from public, anon;
revoke execute on function public.claim_guest_progress(
  text,text,text,integer,integer,integer,integer,integer,date,integer,text[],jsonb,uuid
) from public, anon;
revoke execute on function public.delete_my_account() from public, anon;
revoke execute on function public.ensure_daily_verse(
  date,text,text,text,integer,integer,integer,text,text,jsonb,jsonb
) from public, anon;

-- Re-grant the authenticated-only surface (idempotent with existing grants).
grant execute on function public.submit_play(date,integer,integer,integer,integer,integer,boolean) to authenticated;
grant execute on function public.submit_group_play(uuid,date,integer) to authenticated;
grant execute on function public.submit_practice(date,integer) to authenticated;
grant execute on function public.open_daily_chest(date) to authenticated;
grant execute on function public.grant_unlocks(text[]) to authenticated;
grant execute on function public.create_group(text,text) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.set_username(text) to authenticated;
grant execute on function public.set_cosmetics(text,text) to authenticated;
grant execute on function public.claim_guest_progress(
  text,text,text,integer,integer,integer,integer,integer,date,integer,text[],jsonb,uuid
) to authenticated;
grant execute on function public.delete_my_account() to authenticated;

-- Trigger + helper functions have no business on the public RPC surface.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Intentionally public endpoints (guests are unauthenticated). Re-stated for
-- clarity; these are the ONLY functions anon may call.
grant execute on function public.get_leaderboard(int)   to anon, authenticated;
grant execute on function public.get_daily_pulse(date)  to anon, authenticated;
grant execute on function public.record_guest_open(date,uuid,text,text,integer,integer,integer) to anon, authenticated;
grant execute on function public.practice_bonus_xp(integer) to anon, authenticated;

-- ===========================================================================
-- 2. ensure_daily_verse — require auth + block future-date poisoning.
-- Previously anonymous-callable (via the PUBLIC default) and had NO auth check,
-- so anyone on the internet could seed the shared daily_verses row for any date
-- that didn't exist yet — the content shown to EVERY player that day. We now
-- require a signed-in caller and refuse dates beyond tomorrow (UTC+today+1
-- covers every real timezone's "today"). First-writer-wins for the current day
-- remains; server-side curation is the durable fix (see the audit doc).
-- ===========================================================================
create or replace function public.ensure_daily_verse(
  p_drop_date date,
  p_translation text,
  p_reference text,
  p_book text,
  p_chapter integer,
  p_verse_start integer,
  p_verse_end integer,
  p_text text,
  p_theme text,
  p_questions jsonb,
  p_facts jsonb
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_drop_date > (current_date + 1) then
    raise exception 'cannot seed a future daily verse';
  end if;
  insert into public.daily_verses (drop_date, translation, reference, book, chapter,
    verse_start, verse_end, verse_text, theme, questions, facts)
  values (p_drop_date, p_translation, p_reference, p_book, p_chapter,
    p_verse_start, p_verse_end, p_text, p_theme, p_questions, p_facts)
  on conflict (drop_date) do nothing;
end;
$$;
grant execute on function public.ensure_daily_verse(
  date,text,text,text,integer,integer,integer,text,text,jsonb,jsonb
) to authenticated;

-- ===========================================================================
-- 3. record_guest_open — sanitize untrusted anon input.
-- This RPC is (intentionally) callable without signing in, and it writes into
-- the world-readable presence feed AND the public leaderboard. Harden the two
-- attacker-controlled fields:
--   * username: restrict to the same safe charset/length as real handles so an
--     anonymous caller can't inject arbitrary/offensive text or spoof another
--     player into everyone's feed.
--   * xp: cap to a sane ceiling so a guest can't claim billions of XP and
--     permanently top the board; level is DERIVED, never trusted from input.
-- Legitimate clients send small, clean values, so this is non-breaking.
-- ===========================================================================
create or replace function public.record_guest_open(
  p_drop_date date,
  p_guest_id uuid,
  p_username text,
  p_emoji text,
  p_score integer,
  p_xp integer default 0,
  p_level integer default 1
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_name  text := left(regexp_replace(lower(coalesce(p_username, 'guest')), '[^a-z0-9_]', '', 'g'), 16);
  v_emoji text := left(coalesce(nullif(p_emoji, ''), '📖'), 8);
  v_score integer := greatest(0, least(coalesce(p_score, 0), 100000));
  v_xp    integer := greatest(0, least(coalesce(p_xp, 0), 5000000));
  v_level integer;
  v_is_new boolean;
begin
  if p_guest_id is null then return; end if;
  if v_name = '' then v_name := 'guest'; end if;
  v_level := public.level_from_xp(v_xp);   -- authoritative; ignore p_level

  insert into public.guest_opens (drop_date, guest_id, username, avatar_emoji, score, xp, level)
  values (p_drop_date, p_guest_id, v_name, v_emoji, v_score, v_xp, v_level)
  on conflict (drop_date, guest_id)
  do update set score    = greatest(public.guest_opens.score, excluded.score),
                xp       = greatest(public.guest_opens.xp, excluded.xp),
                level    = greatest(public.guest_opens.level, excluded.level),
                username = excluded.username,
                avatar_emoji = excluded.avatar_emoji
  returning (xmax = 0) into v_is_new;   -- xmax = 0 means a fresh insert

  if v_is_new then
    insert into public.presence_events (drop_date, username, avatar_emoji, points, kind)
    values (p_drop_date, v_name, v_emoji, v_score, 'scored');
  end if;
end;
$$;
grant execute on function public.record_guest_open(date,uuid,text,text,integer,integer,integer) to anon, authenticated;

-- ===========================================================================
-- 4. submit_play — clamp client-supplied score/counts (defense in depth).
-- The score and correct-count are still computed on the client and trusted here
-- (the durable fix is to recompute them server-side from the answer keys stored
-- in daily_verses.questions — see the audit doc). Until then, bound the inputs
-- to what the scoring rules can actually produce, so a tampered client can't
-- mint unbounded XP or post an impossible leaderboard score.
--   max per question = (base 100 + speed 100) * comboMax 2.5 = 500; cap uses a
--   little slack (520) to never clip a legitimate perfect run.
-- ===========================================================================
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

  -- Bound untrusted client inputs to plausible maxima before they touch state.
  p_total     := greatest(0, least(coalesce(p_total, 0), 50));
  p_correct   := greatest(0, least(coalesce(p_correct, 0), p_total));
  p_combo_max := greatest(0, least(coalesce(p_combo_max, 0), p_total));
  p_time_ms   := greatest(0, coalesce(p_time_ms, 0));
  p_score     := greatest(0, least(coalesce(p_score, 0), 520 * greatest(p_total, 1)));

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
grant execute on function public.submit_play(date,integer,integer,integer,integer,integer,boolean) to authenticated;

-- ===========================================================================
-- 5. Pin search_path on the remaining mutable-search_path functions.
-- Both are pure/immutable math, but a fixed search_path is best practice and
-- clears the linter warning.
-- ===========================================================================
alter function public.level_from_xp(integer)   set search_path = public;
alter function public.practice_bonus_xp(integer) set search_path = public;
