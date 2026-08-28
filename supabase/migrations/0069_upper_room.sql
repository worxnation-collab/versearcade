-- The Upper Room — a small chamber that belongs to ONE person.
--
-- See docs/UPPER-ROOM.md and src/data/room.ts. The load-bearing rules, stated
-- where the data could otherwise leak:
--
--   PRESENCE, NOT QUANTITY. room_json returns which furnishings fill which
--   anchors and nothing else countable. No totals, no completion, no "12
--   pieces". A room that reports a number is a scoreboard with furniture on it.
--
--   A VISITOR CAN ONLY LOOK. There is no RPC that writes another player's room,
--   no visitor log, and no count of who has looked. A tally of who likes your
--   room is the exact feature this app does not have (same argument as
--   my_washings being recipient-only).
--
--   OWNERSHIP IS DERIVED, and is NOT checked here. Eighteen furnishings against
--   six lifetime numbers the client already holds (src/data/room.ts). This
--   follows set_keep_placement's doctrine exactly: the server validates the
--   SHAPE and clamps the row count, and does not audit the earning, because the
--   ladder is cosmetic and bounded — a forged placement is worth a picture of a
--   stool, and nothing here touches xp, points or standing.
--
--   NO PLAYER-AUTHORED TEXT. (anchor id, furnishing id) against fixed catalogs.
--   There is deliberately nowhere to write a string, which is what makes a room
--   safe to let a stranger walk into.

-- ── Placements ──────────────────────────────────────────────────────────────
create table if not exists public.room_placements (
  user_id   uuid not null references public.profiles(id) on delete cascade,
  anchor    text not null,
  item_id   text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, anchor)
);

alter table public.room_placements enable row level security;

-- Readable by anyone signed in: a room is visitable, and the read goes through
-- room_json rather than the table, but leaving select closed would make the
-- function the only path by accident rather than by design.
drop policy if exists "room placements self-select" on public.room_placements;
create policy "room placements self-select" on public.room_placements
  for select using (auth.uid() = user_id);
-- No write policy: set_room_placement is the only way a row moves.

-- ── Place / clear one anchor ────────────────────────────────────────────────
create or replace function public.set_room_placement(p_anchor text, p_item text)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;

  -- The anchor set is fixed (src/data/room.ts ROOM_ANCHORS). Validating against
  -- it bounds rows per player and keeps free text out of the table entirely.
  if p_anchor !~ '^(shelf_[12]|wall_[123]|sill_1|table_[12]|floor_[123]|nook_1)$' then
    raise exception 'bad anchor';
  end if;

  if p_item is null then
    delete from public.room_placements where user_id = uid and anchor = p_anchor;
    return json_build_object('ok', true);
  end if;

  -- `room_reed_mat` or `room_reed_mat.2` — the merge tier rides on the value as
  -- a suffix, the same wire format the keep uses (0060). Keeping the two
  -- regexes identical in shape is deliberate: one placement format, two worlds.
  if p_item !~ '^room_[a-z_]{1,40}(\.[23])?$' then raise exception 'bad item'; end if;

  insert into public.room_placements (user_id, anchor, item_id, updated_at)
  values (uid, p_anchor, p_item, now())
  on conflict (user_id, anchor) do update set item_id = excluded.item_id, updated_at = now();
  return json_build_object('ok', true);
end;
$$;

grant execute on function public.set_room_placement(text, text) to authenticated;

-- ── My room ─────────────────────────────────────────────────────────────────
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
    'placements', coalesce((
      select json_object_agg(anchor, item_id) from public.room_placements where user_id = uid
    ), '{}'::json)
  );
end;
$$;

grant execute on function public.my_room() to authenticated;

-- ── Somebody else's room ────────────────────────────────────────────────────
-- Everything a visitor is allowed to know: what is in the room, what the room
-- is made of, and who lives there.
--
-- `tier` is the room's ARCHITECTURE (0-4, src/data/room.ts roomTier), derived
-- from the owner's level and returned INSTEAD of the level — a visitor sees a
-- nicer room, not a bigger number. The username and avatar are already public
-- through get_player_card, so the figure standing in the room reveals nothing
-- new. There is deliberately no streak, no xp, no count of furnishings, and no
-- record that the visit happened.
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
    'is_me', v_owner.id = uid,
    'tier', v_tier,
    'placements', coalesce((
      select json_object_agg(anchor, item_id) from public.room_placements where user_id = v_owner.id
    ), '{}'::json)
  );
end;
$$;

grant execute on function public.room_json(text) to authenticated;

notify pgrst, 'reload schema';
