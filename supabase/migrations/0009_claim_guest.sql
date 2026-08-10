-- Verse Arcade — claim guest progress on account creation.
-- ---------------------------------------------------------------------------
-- New users play as a guest first (username, emoji, XP, streak and today's play
-- all live on the device in localStorage). When they later create an account
-- via Apple / Google / email, handle_new_user() mints a FRESH profile — and,
-- for OAuth, there's no username in the provider metadata, so the trigger falls
-- back to the email local-part (Apple private-relay / Google → a random
-- letters+numbers handle). The result the user sees: their chosen username is
-- gone, and because the account has no `plays` row yet they're pushed to replay
-- the verse they just finished.
--
-- This RPC lets the client hand the guest snapshot to the server exactly once,
-- right after the first sign-in, and fold it into the newly created profile.
-- It is guarded to only ever touch a fresh, never-played, un-onboarded profile,
-- so an existing account signing in on a device that happens to hold leftover
-- guest data is never clobbered, and a repeat call is a no-op.
-- ---------------------------------------------------------------------------

create or replace function public.claim_guest_progress(
  p_username       text,
  p_emoji          text,
  p_display_name   text,
  p_xp             integer,
  p_level          integer,
  p_current_streak integer,
  p_longest_streak integer,
  p_streak_freezes integer,
  p_last_played_on date,
  p_total_plays    integer,
  p_cards          text[],
  p_plays          jsonb
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prof public.profiles%rowtype;
  base_name text;
  final_name text;
  n integer := 0;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select * into prof from public.profiles where id = uid for update;
  if not found then
    -- The auth trigger normally creates the row; nothing to claim into if it
    -- somehow hasn't landed yet.
    return json_build_object('claimed', false, 'reason', 'no_profile');
  end if;

  -- Only migrate into a pristine account. A profile that has already played or
  -- been onboarded is a real, established account — leave it untouched. This is
  -- what makes the call safe to fire on every first sign-in and idempotent on
  -- repeats.
  if prof.total_plays > 0 or prof.onboarded then
    return json_build_object('claimed', false, 'reason', 'not_fresh');
  end if;

  -- Resolve the guest's chosen handle, keeping it unique (mirrors the fallback
  -- logic in handle_new_user, but prefers the name the user actually picked).
  base_name := lower(regexp_replace(coalesce(nullif(p_username, ''), 'player'), '[^a-z0-9_]', '', 'g'));
  if base_name = '' then base_name := 'player'; end if;
  final_name := base_name;
  while exists (select 1 from public.profiles where username = final_name and id <> uid) loop
    n := n + 1;
    final_name := base_name || n::text;
  end loop;

  -- Fold in the guest identity + progress. greatest() ignores NULLs, so the
  -- date/number merges are null-safe and never regress an already-higher value.
  update public.profiles set
    username       = final_name,
    display_name   = coalesce(nullif(p_display_name, ''), final_name),
    avatar_emoji   = coalesce(nullif(p_emoji, ''), avatar_emoji),
    xp             = greatest(xp, coalesce(p_xp, 0)),
    level          = greatest(level, coalesce(p_level, 1)),
    current_streak = greatest(current_streak, coalesce(p_current_streak, 0)),
    longest_streak = greatest(longest_streak, coalesce(p_longest_streak, 0)),
    streak_freezes = coalesce(p_streak_freezes, streak_freezes),
    last_played_on = greatest(last_played_on, p_last_played_on),
    total_plays    = greatest(total_plays, coalesce(p_total_plays, 0)),
    onboarded      = true
  where id = uid;

  -- Carry over collectible unlocks (verse cards + chest relics).
  if p_cards is not null and array_length(p_cards, 1) is not null then
    insert into public.user_unlocks (user_id, collectible_key, source)
    select uid, k, 'play' from unnest(p_cards) as k
    on conflict (user_id, collectible_key) do nothing;
  end if;

  -- Carry over the guest's plays so days already completed aren't re-served
  -- (this is what stops the "replay the verse you just finished" bug). The FK
  -- to daily_verses means we can only insert a play for a day whose shared verse
  -- row exists; the client seeds those via ensure_daily_verse before calling, so
  -- the exists() guard just skips any that didn't make it rather than erroring.
  if p_plays is not null then
    insert into public.plays (user_id, drop_date, score, time_ms, correct_count,
                              total_questions, combo_max, xp_earned)
    select
      uid,
      (e->>'drop_date')::date,
      coalesce((e->>'score')::int, 0),
      coalesce((e->>'time_ms')::int, 0),
      coalesce((e->>'correct_count')::int, 0),
      coalesce((e->>'total_questions')::int, 0),
      coalesce((e->>'combo_max')::int, 0),
      coalesce((e->>'xp_earned')::int, 0)
    from jsonb_array_elements(p_plays) as e
    where (e->>'drop_date') is not null
      and exists (select 1 from public.daily_verses dv where dv.drop_date = (e->>'drop_date')::date)
    on conflict (user_id, drop_date) do nothing;
  end if;

  return json_build_object('claimed', true, 'username', final_name);
end;
$$;

grant execute on function public.claim_guest_progress(
  text, text, text, integer, integer, integer, integer, integer, date, integer, text[], jsonb
) to authenticated;
