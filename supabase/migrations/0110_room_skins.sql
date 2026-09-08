-- Verse Arcade — room skins: what the Upper Room is MADE of.
-- ---------------------------------------------------------------------------
-- The five rooms (0069, `roomTier`) are the ladder — level 1, 5, 12, 25, 40 —
-- and each is a real change of silhouette: plaster over brick, a window, beams,
-- gilt. That is earned by playing and nothing chooses it.
--
-- This is the OTHER axis, and it is the split `levels.ts` and `skins.ts` have
-- made for churches since 0051: the material the same room is made of, never
-- its size, its tier, or anything anybody could rank. The church has had four
-- material languages for its building for months; the one space in this app
-- that belongs to the player alone had exactly one.
--
-- Three things, and they are the whole design:
--
--   * EVERY SKIN IS FREE, from the first minute. There is no gate here and
--     there is deliberately nothing for a gate to protect — every skin is the
--     same room. This follows the CHARACTER BUILDER's rule (figure, six tones,
--     six hairs, all free, none of them a number) rather than the church's,
--     because a material is a taste and tastes do not rank.
--   * IT IS A LOOK. No XP, no points, no standing, nothing countable, and no
--     board reads it. A skinned room is not a bigger room — the same sentence
--     the church skins hold.
--   * THE SERVER VALIDATES THE ID AND NOTHING ELSE. Four fixed values, checked
--     against a literal list, so there is nowhere here to write a string. That
--     is what keeps a room safe to let a stranger walk into (0069's "no
--     player-authored text"), and it is why this is a text column with a check
--     rather than free jsonb.
--
-- KEEP IN SYNC with ROOM_SKINS in src/features/room/skins.ts — the four ids are
-- stated twice, the usual house pair.
--
-- `my_room` and `room_json` are restated WHOLESALE: `my_room` from 0069 and
-- `room_json` from 0072 (the last migration to set each). A future migration
-- editing either copies forward from HERE.
--
-- The client fails closed either way: an unapplied 0110 leaves `skin` absent
-- from both payloads and every room reads as clay, which is exactly what every
-- room has always looked like.
--
-- Idempotent — re-running is a no-op.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists room_skin text not null default 'clay';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_room_skin_check'
  ) then
    alter table public.profiles
      add constraint profiles_room_skin_check
      check (room_skin in ('clay', 'limestone', 'cedar', 'dusk'));
  end if;
end $$;

-- ── Choose one ──────────────────────────────────────────────────────────────
create or replace function public.set_room_skin(p_skin text)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  -- The fixed catalog. Anything else is refused rather than stored, so the
  -- column can never hold a value the client has no drawing for.
  if p_skin is null or p_skin not in ('clay', 'limestone', 'cedar', 'dusk') then
    return json_build_object('ok', false, 'reason', 'unknown_skin');
  end if;
  update public.profiles set room_skin = p_skin where id = uid;
  return json_build_object('ok', true, 'skin', p_skin);
end;
$$;

grant execute on function public.set_room_skin(text) to authenticated;

-- ── Your own room ───────────────────────────────────────────────────────────
-- Restated wholesale from 0069, plus `skin`.
create or replace function public.my_room()
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  return json_build_object(
    'skin', coalesce((select room_skin from public.profiles where id = uid), 'clay'),
    'placements', coalesce((
      select json_object_agg(anchor, item_id) from public.room_placements where user_id = uid
    ), '{}'::json)
  );
end;
$$;

grant execute on function public.my_room() to authenticated;

-- ── A room you are visiting ─────────────────────────────────────────────────
-- Restated wholesale from 0072, plus `skin`. Still PRESENCE, NOT QUANTITY: no
-- total, no completion, no number at all — the material is a look, exactly like
-- the owner's character and pet already on this payload, and there is no more
-- to rank in it than there is in their robe.
create or replace function public.room_json(p_username text)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_owner public.profiles;
  v_tier integer;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_username is null or length(p_username) > 40 then raise exception 'bad username'; end if;

  select * into v_owner from public.profiles
  where lower(username) = lower(regexp_replace(p_username, '^@', ''));
  if v_owner.id is null then return null; end if;

  -- KEEP IN SYNC with roomTier() in src/data/room.ts — thresholds 1/5/12/25/40.
  v_tier := case
    when v_owner.level >= 40 then 4
    when v_owner.level >= 25 then 3
    when v_owner.level >= 12 then 2
    when v_owner.level >= 5  then 1
    else 0 end;

  return json_build_object(
    'username', v_owner.username,
    'avatar_emoji', v_owner.avatar_emoji,
    'avatar_character', v_owner.avatar_character,
    'pet', v_owner.pet,
    'is_me', v_owner.id = uid,
    'tier', v_tier,
    'skin', coalesce(v_owner.room_skin, 'clay'),
    'placements', coalesce((
      select json_object_agg(anchor, item_id) from public.room_placements where user_id = v_owner.id
    ), '{}'::json)
  );
end;
$$;

grant execute on function public.room_json(text) to authenticated;

notify pgrst, 'reload schema';
