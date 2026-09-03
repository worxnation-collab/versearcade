-- Verse Arcade — the Cornerstone border: a founding-patron avatar ring.
-- ---------------------------------------------------------------------------
-- The patron pack is a skin (cephas) and a card background (patron_cornerstone,
-- 0095). This adds the third piece of the same look: an avatar BORDER, pale
-- stone with a gold vein, so the founder's ring matches the card everywhere
-- the two sit in a row. Client catalog: BORDERS in src/data/cosmetics.ts.
--
-- Borders have been gated on longest_streak since 0010, through the `cosmetics`
-- catalog and set_cosmetics(). This one is gated on the PACK instead — owning
-- EITHER founding-patron skin (the whale's buyers bought the same thing cephas
-- buyers are buying; 0095's set_card_background makes the same call) — so it
-- gets a catalog row (or set_cosmetics refuses it as unknown_border) with
-- req_streak 0, and set_cosmetics learns one pack-gated key checked BEFORE the
-- streak gate. The `founder` flag (0023) still bypasses, as it does for every
-- other border, and so does is_admin (the operator previews every paid
-- cosmetic — see skinOwned).
--
-- It is a LOOK. No number moves, nothing ranks, and a non-patron is behind on
-- nothing — the same line the skin and the card hold.
--
-- set_cosmetics is restated WHOLESALE from 0023 (the last migration to set
-- it), plus the one branch. Idempotent — re-running is a no-op.
-- ---------------------------------------------------------------------------

insert into public.cosmetics (key, kind, req_streak) values ('cornerstone', 'border', 0)
on conflict (kind, key) do nothing;

create or replace function public.set_cosmetics(p_border text, p_badge text)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_long integer;
  v_founder boolean;
  v_admin boolean;
  v_owned text[];
  v_border text := coalesce(nullif(p_border, ''), 'default');
  v_badge text := nullif(p_badge, '');
  req_b integer;
  req_bd integer;
  -- Pack-gated borders → the skins that unlock them. Keep in sync with
  -- BORDERS in src/data/cosmetics.ts and the packs in src/data/avatar.ts.
  patron_borders text[] := array['cornerstone'];
  patron_skins text[] := array['cephas','whale'];
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select longest_streak, founder, coalesce(is_admin, false), coalesce(owned_skins, '{}'::text[])
    into v_long, v_founder, v_admin, v_owned
    from public.profiles where id = uid;
  if v_long is null then return json_build_object('ok', false, 'reason', 'no_profile'); end if;

  select req_streak into req_b from public.cosmetics where kind = 'border' and key = v_border;
  if req_b is null then return json_build_object('ok', false, 'reason', 'unknown_border'); end if;
  -- The pack gate, before the streak gate: a patron border's req_streak is 0
  -- and must not be reachable by streak alone.
  if v_border = any(patron_borders)
     and not (v_owned && patron_skins or v_admin or v_founder) then
    return json_build_object('ok', false, 'reason', 'locked_border');
  end if;
  if not v_founder and v_long < req_b then return json_build_object('ok', false, 'reason', 'locked_border'); end if;

  if v_badge is not null and v_badge <> 'none' then
    select req_streak into req_bd from public.cosmetics where kind = 'badge' and key = v_badge;
    if req_bd is null then return json_build_object('ok', false, 'reason', 'unknown_badge'); end if;
    if not v_founder and v_long < req_bd then return json_build_object('ok', false, 'reason', 'locked_badge'); end if;
  else
    v_badge := null;
  end if;

  update public.profiles set avatar_border = v_border, avatar_badge = v_badge where id = uid;
  return json_build_object('ok', true, 'border', v_border, 'badge', v_badge);
end;
$$;

grant execute on function public.set_cosmetics(text, text) to authenticated;

notify pgrst, 'reload schema';
