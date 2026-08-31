-- 0084 — the churchyard's plants and monuments stand where you put them.
--
-- 0083 did this for the keep's hall and the Upper Room. This is the same change
-- for the third and last world that can be arranged: a planting or a statue may
-- now carry a position, so a plant can be dragged anywhere on the lawn instead
-- of sitting on one of six fixed plots.
--
--   THE SAME GRAMMAR, IN PERCENT. The value is `yard_ivy` or
--   `yard_ivy~x412y188`, written by the same packDecor/unpackDecor the rooms
--   use (src/data/placement.ts) — but the churchyard is HTML positioned in
--   percent rather than a viewBox, so the integers are TENTHS OF A PERCENT:
--   x412 is 41.2% across, y188 is 18.8% UP FROM THE BOTTOM, the axis every
--   churchyard coordinate already uses. 0..999 is the whole of both ranges, so
--   nothing about the format forks.
--
--   THE PLOT AND THE PLINTH STAY ROW KEYS, and stay validated against their
--   fixed sets. That is what bounds rows per player and per church, keeps free
--   text out of both tables, and keeps every row written before today reading
--   exactly as it always has: no suffix means "on its plot, where it has always
--   stood".
--
--   THE ENTITLEMENTS DO NOT MOVE. A planting is still allowed iff the caller's
--   LIFETIME given clears the plant's threshold, and a statue iff the church
--   has won enough weeks for the number of plinths that would be filled. Both
--   checks now read the id out of the value rather than trusting the whole
--   string — which is the only way this could have gone wrong, and is why the
--   id is split off before either is asked.
--
-- Same doctrine as 0083 on trust: the client decides where things stand and the
-- server's job is to keep the value well-formed, bounded, and earned. A forged
-- position is worth a hedge drawn somewhere odd in a yard, which is cosmetic
-- and ranks nobody — the churchyard has never counted anything.
--
-- KEEP THE GRAMMAR IN SYNC with packPercent/unpackPercent in
-- src/data/placement.ts, and the plant/statue id lists with FLORA in
-- src/features/church/yard.ts and STATUES in src/features/church/rivalry.ts.
--
-- Apply BEFORE merging the client: a client that writes position suffixes
-- against the 0061/0075 validators has every drag rejected as 'bad flora' /
-- 'bad statue'.
--
-- Idempotent: create or replace only.

-- ── The id inside a value ───────────────────────────────────────────────────
-- One place that knows the format on this side of the wire, so the two RPCs
-- below cannot come to disagree about what `yard_ivy~x412y188` names.
create or replace function public.yard_placement_id(p_value text)
returns text
language sql
immutable
as $$
  select case
    when p_value is null then null
    when p_value !~ '^[a-z_]{1,40}(~(x\d{1,3}y\d{1,3}s\d{2,3}|x\d{1,3}y\d{1,3}|s\d{2,3}))?$' then null
    else split_part(p_value, '~', 1)
  end;
$$;

-- ── Plant something, anywhere on the lawn ───────────────────────────────────
create or replace function public.set_church_yard_placement(p_plot text, p_flora text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_church_id uuid;
  v_flora text;
  v_need bigint;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select church_id into v_church_id from public.profiles where id = uid;
  if v_church_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_church');
  end if;

  -- The plot set is fixed (PLOTS in src/features/church/yard.ts). It is the row
  -- key rather than a location now, and it is still validated for the reasons
  -- in the header.
  if p_plot !~ '^(bed_[lr]|lawn_[lr]|path_[lr])$' then raise exception 'bad plot'; end if;

  if p_flora is null then
    delete from public.church_yard_placements
     where user_id = uid and church_id = v_church_id and plot = p_plot;
    return jsonb_build_object('ok', true);
  end if;

  -- The plant, with any `~x..y..` position split off: the ladder is asked about
  -- the plant, never about the string.
  v_flora := public.yard_placement_id(p_flora);
  if v_flora is null then raise exception 'bad flora'; end if;

  v_need := public.church_flora_min_given(v_flora);
  if v_need is null then raise exception 'bad flora'; end if;

  -- Unlike the keep's counters, this one is VERIFIED rather than clamped: the
  -- number it's checked against is a real sum of real rows the server wrote
  -- itself, so there's nothing to trust the client about and no reason not to.
  if public.church_lifetime_given(uid) < v_need then
    return jsonb_build_object('ok', false, 'reason', 'locked');
  end if;

  insert into public.church_yard_placements (user_id, church_id, plot, flora_id)
  values (uid, v_church_id, p_plot, p_flora)
  on conflict (user_id, church_id, plot) do update set flora_id = excluded.flora_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- ── Raise a monument, and move it ───────────────────────────────────────────
-- Any member of the church may set, change, move or clear a plinth — where a
-- statue stands is shared exactly the way which statue stands there already is,
-- and `set_by` stays forensics that never leaves the server. What is VERIFIED
-- is unchanged: the church has won enough weeks for the number of plinths that
-- would be filled afterwards.
create or replace function public.set_church_statue(p_plinth text, p_statue text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_church_id uuid;
  v_statue text;
  v_wins integer;
  v_after integer;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select church_id into v_church_id from public.profiles where id = uid;
  if v_church_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_church');
  end if;

  -- The plinth set is fixed (PLINTHS in rivalry.ts) and stays the row key.
  if p_plinth !~ '^(plinth_l|plinth_r|plinth_gate)$' then raise exception 'bad plinth'; end if;

  if p_statue is null then
    delete from public.church_statues where church_id = v_church_id and plinth = p_plinth;
    return jsonb_build_object('ok', true);
  end if;

  v_statue := public.yard_placement_id(p_statue);
  if v_statue is null or not public.church_statue_exists(v_statue) then
    raise exception 'bad statue';
  end if;

  select count(*)::integer into v_wins from public.church_rivalry_wins where church_id = v_church_id;
  select count(*)::integer into v_after from public.church_statues
   where church_id = v_church_id and plinth <> p_plinth;
  -- Filling this plinth makes it v_after + 1 statues standing. Moving one that
  -- is already up does not change the count, which is why this stays exactly
  -- as 0075 wrote it.
  if v_after + 1 > least(v_wins, 3) then
    return jsonb_build_object('ok', false, 'reason', 'locked', 'wins', v_wins);
  end if;

  insert into public.church_statues (church_id, plinth, statue_id, set_by, set_at)
  values (v_church_id, p_plinth, p_statue, uid, now())
  on conflict (church_id, plinth) do update set
    statue_id = excluded.statue_id, set_by = excluded.set_by, set_at = excluded.set_at;

  return jsonb_build_object('ok', true, 'wins', v_wins);
end;
$$;

grant execute on function public.yard_placement_id(text) to anon, authenticated;
grant execute on function public.set_church_yard_placement(text, text) to authenticated;
grant execute on function public.set_church_statue(text, text) to authenticated;

notify pgrst, 'reload schema';
