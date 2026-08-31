-- 0081 — tiers as their own unlocks; a placement carries where it stands and
-- how big it is.
--
-- Two client changes land together and this is their schema half:
--
--   MERGING IS GONE. Fine and Grand are no longer made by stacking duplicates;
--   they are their own rungs on the same challenge ladders (2.5x and 5x the
--   goal — data/keep.ts, data/room.ts), so a finer piece is still earned by
--   playing and ownership stays a pure function of counters the server either
--   wrote or clamps. The tier STILL rides on the value as `.2` / `.3`, written
--   exactly as 0060 defined it — only the way a player reaches a tier changed,
--   which is why the church offering (0062) needs no change at all: its gate
--   has always been "placed at Grand", read off that same suffix, and its
--   ladder, values and once-ever cap did not move.
--
--   PLACEMENT IS FREE, INSIDE A MOUNT'S BAND. A value may now carry a position
--   and/or size: `keep_woven_rug.2~x412y188s120`, `~x412y188`, `~s120` — the
--   two halves are independent, written only when they carry information (scene units; s is scale x100,
--   bounded 70..140 by the client planner and by this regex's shape). The
--   ANCHOR stays one of the fixed slots and stays validated — it is the row
--   key, which is what bounds rows per player, keeps free text out of the
--   table, and keeps every existing row reading exactly as it always has: no
--   suffix means "on its anchor, natural size".
--
-- Same doctrine as 0059/0060 on trust: the client decides where things stand
-- and the server's job is only to keep the value well-formed and bounded. A
-- forged suffix is worth a rug drawn somewhere odd in your own hall — bounded,
-- cosmetic, nothing rankable to protect.
--
-- KEEP THE GRAMMAR IN SYNC with packDecor/unpackDecor in src/data/placement.ts.
--
-- Apply BEFORE merging the client: a client that writes position suffixes
-- against the 0060/0069 regexes has every reposition rejected as 'bad decor'.
--
-- Idempotent: create or replace only.

create or replace function public.set_keep_placement(p_anchor text, p_decor text)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  -- The anchor set is fixed (src/data/keep.ts ANCHORS). Validating against it
  -- bounds rows per player and keeps free text out of the table entirely.
  if p_anchor !~ '^(banner_[lr]|wall_[123]|rafters_[12]|table_[12]|floor_[12]|stable_1)$' then
    raise exception 'bad anchor';
  end if;

  if p_decor is null then
    delete from public.keep_placements where user_id = uid and anchor = p_anchor;
    return json_build_object('ok', true);
  end if;

  -- `.2` / `.3` is the tier (its own unlock since 0081), and `~x..y..s..` is
  -- where the piece stands and how big it is — see the header.
  if p_decor !~ '^keep_[a-z_]{1,40}(\.[23])?(~(x\d{1,3}y\d{1,3}s\d{2,3}|x\d{1,3}y\d{1,3}|s\d{2,3}))?$' then
    raise exception 'bad decor';
  end if;

  insert into public.keep_placements (user_id, anchor, decor_id)
  values (uid, p_anchor, p_decor)
  on conflict (user_id, anchor) do update set decor_id = excluded.decor_id;
  return json_build_object('ok', true);
end;
$$;

grant execute on function public.set_keep_placement(text, text) to authenticated;

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

  -- Same grammar as the keep's, deliberately: one placement format, two worlds.
  if p_item !~ '^room_[a-z_]{1,40}(\.[23])?(~(x\d{1,3}y\d{1,3}s\d{2,3}|x\d{1,3}y\d{1,3}|s\d{2,3}))?$' then
    raise exception 'bad item';
  end if;

  insert into public.room_placements (user_id, anchor, item_id, updated_at)
  values (uid, p_anchor, p_item, now())
  on conflict (user_id, anchor) do update set item_id = excluded.item_id, updated_at = now();
  return json_build_object('ok', true);
end;
$$;

grant execute on function public.set_room_placement(text, text) to authenticated;

notify pgrst, 'reload schema';
