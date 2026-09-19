-- How a player's Upper Room ARRANGES itself.
--
-- 0110 gave the room a second axis — what it is MADE of — beside the tier
-- ladder it already had. This is the third and last: how the things in it are
-- laid out. It exists because free dragging came OUT of the two rooms (see
-- src/data/layouts.ts for the whole argument): every scene in this app that
-- reads as a place is a composed painting, the rooms were the one place
-- composition was handed to the player, and they were the one place the app
-- looked least like its own art.
--
-- **It is stored server-side for the same reason the skin is**, and that is the
-- whole reason this is a migration rather than a localStorage key: a room is
-- VISITABLE, and a visitor has to see the owner's room as the owner arranged
-- it. A device-local arrangement would show somebody else's furniture in the
-- visitor's own taste, which is nonsense — and it is the same argument 0110
-- makes about the material.
--
-- **Nothing is stored but an id**, checked against a literal list of three here
-- and by a check constraint on the column — 0069's "no player-authored text",
-- which is what keeps a room safe to let a stranger walk into.
--
-- **It is not rankable and it grants nothing.** An arrangement is a taste, like
-- the material and like the character builder's six tones: free from the first
-- minute, no gate, no unlock, nothing countable. `settled` is the room exactly
-- as it has always been laid out and is the default, so this migration changes
-- what every existing player sees by exactly nothing until they pick.
--
-- **There is no placement migration and there could not be one.** The wire
-- format in room_placements is untouched: an `~x412y188s120` suffix on an old
-- value still parses, it simply stops being read. So nothing here rewrites a
-- single placement row.
--
-- `my_room` and `room_json` are restated WHOLESALE from 0110 plus the one new
-- key; a future migration editing either copies forward from HERE.

alter table public.profiles
  add column if not exists room_layout text not null default 'settled';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_room_layout_check'
  ) then
    alter table public.profiles
      add constraint profiles_room_layout_check
      check (room_layout in ('settled', 'gathered', 'spread'));
  end if;
end $$;

create or replace function public.set_room_layout(p_layout text)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  -- A literal list, never a string the client sends through. Same shape as
  -- set_room_skin, set_card_background and set_card_about.
  if p_layout is null or p_layout not in ('settled', 'gathered', 'spread') then
    return json_build_object('ok', false, 'reason', 'unknown_layout');
  end if;
  update public.profiles set room_layout = p_layout where id = uid;
  return json_build_object('ok', true, 'layout', p_layout);
end;
$$;

grant execute on function public.set_room_layout(text) to authenticated;

-- Restated wholesale from 0110, plus 'layout'.
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
    'layout', coalesce((select room_layout from public.profiles where id = uid), 'settled'),
    'placements', coalesce((
      select json_object_agg(anchor, item_id) from public.room_placements where user_id = uid
    ), '{}'::json)
  );
end;
$$;

-- Restated wholesale from 0110, plus 'layout'. NOTE the keys 0072 and 0110
-- added before it — pet, skin — which have to survive this restate; that is the
-- trap CLAUDE.md keeps warning about and it is checked after applying, not
-- hoped for.
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
    'layout', coalesce(v_owner.room_layout, 'settled'),
    'placements', coalesce((
      select json_object_agg(anchor, item_id) from public.room_placements where user_id = v_owner.id
    ), '{}'::json)
  );
end;
$$;
