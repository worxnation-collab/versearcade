-- Offering a finished keep decoration to your church.
--
-- A decoration merged all the way to Grand (0060) has nowhere left to go, so it
-- can be given: the Grand one leaves the hall, the church banks the points, and
-- the player keeps the plain decoration — they never stopped owning it, because
-- ownership is derived from the six battle counters and nothing here moves them.
--
-- WHY THE NUMBERS ARE SMALL, stated plainly because this is the one place the
-- keep touches something that ranks. 0059 clamps rather than verifies: a forged
-- counter buys wall furniture, not standing, so it was never worth defending.
-- Church XP is not wall furniture — it ranks congregations against each other on
-- the board. So this function does verify ownership against keep_progress, and
-- the exposure is bounded three ways on top of that:
--
--   1. ONCE EVER PER DECORATION. primary key (user_id, decor_id).
--   2. A FIXED LADDER. 15 decorations, 3,100 points for the complete sweep —
--      under three church levels at the very bottom of the curve.
--   3. THE PIECE MUST BE PLACED AT GRAND. A real player merged it; a forger has
--      to write placements too, for a ceiling they could not raise either way.
--
-- A determined client can still fake counters and collect the 3,100. That is
-- the accepted cost, it is the same order as a few evenings of honest play, and
-- it is written here so nobody has to re-derive it later. If the ladder ever
-- grows past this size, the counters have to become verifiable first.
--
-- Idempotent throughout.

create table if not exists public.keep_offerings (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  decor_id   text not null,
  church_id  uuid references public.churches(id) on delete set null,
  points     integer not null check (points >= 0),
  created_at timestamptz not null default now(),
  primary key (user_id, decor_id)
);

alter table public.keep_offerings enable row level security;
drop policy if exists "keep offerings self-select" on public.keep_offerings;
create policy "keep offerings self-select" on public.keep_offerings
  for select using (auth.uid() = user_id);
-- No write policy: offer_keep_decor is the only way a row appears.

-- ── The ladder ──────────────────────────────────────────────────────────────
-- KEEP IN SYNC with OFFER_VALUES in src/data/keep.ts. An unknown id returns
-- null, which the function rejects, so a new decoration is inert until both
-- sides know about it.
create or replace function public.keep_decor_offer_value(p_decor text)
returns integer
language sql
immutable
as $$
  select case p_decor
    when 'keep_woven_rug'      then 60
    when 'keep_oil_lamp'       then 60
    when 'keep_kite_shield'    then 90
    when 'keep_rosary'         then 90
    when 'keep_sheaf_banner'   then 120
    when 'keep_crossed_spears' then 120
    when 'keep_open_bible'     then 150
    when 'keep_lanterns'       then 150
    when 'keep_brazier'        then 200
    when 'keep_barrels'        then 200
    when 'keep_tapestry'       then 260
    when 'keep_chess'          then 260
    when 'keep_chandelier'     then 340
    when 'keep_armor_rack'     then 400
    when 'keep_destrier'       then 600
    else null
  end::integer;
$$;

-- ── Ownership, verified ─────────────────────────────────────────────────────
-- The challenge ladder lived only in TypeScript until now, because nothing on
-- this side needed it: a decoration was cosmetic and derived, so the client
-- deciding was harmless. Points that reach the church board are not harmless,
-- so the same ladder is mirrored here.
--
-- KEEP IN SYNC with CHALLENGES in src/data/keep.ts.
create or replace function public.keep_decor_owned(p_user uuid, p_decor text)
returns boolean
language plpgsql
stable
security definer set search_path = public
as $$
declare
  r public.keep_progress;
begin
  select * into r from public.keep_progress where user_id = p_user;
  if not found then return false; end if;

  return case p_decor
    when 'keep_woven_rug'      then r.cpu_played     >= 1
    when 'keep_oil_lamp'       then r.cpu_won        >= 1
    when 'keep_kite_shield'    then r.cpu_won        >= 3
    when 'keep_sheaf_banner'   then r.battle_played  >= 1
    when 'keep_rosary'         then r.cpu_played     >= 5
    when 'keep_crossed_spears' then r.cpu_won        >= 5
    when 'keep_open_bible'     then r.battle_perfect >= 1
    when 'keep_lanterns'       then r.battle_combo   >= 1
    when 'keep_brazier'        then r.cpu_won        >= 10
    when 'keep_barrels'        then r.battle_played  >= 5
    when 'keep_tapestry'       then r.battle_won     >= 3
    when 'keep_chess'          then r.battle_perfect >= 3
    when 'keep_chandelier'     then r.cpu_won        >= 25
    when 'keep_armor_rack'     then r.battle_won     >= 8
    when 'keep_destrier'       then r.battle_won     >= 15
    else false
  end;
end;
$$;

-- ── Give it ─────────────────────────────────────────────────────────────────
create or replace function public.offer_keep_decor(p_decor text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_church_id uuid;
  v_points integer;
  v_anchor text;
  v_before integer;
  v_church public.churches%rowtype;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  v_points := public.keep_decor_offer_value(p_decor);
  if v_points is null then raise exception 'bad decor'; end if;

  select church_id into v_church_id from public.profiles where id = uid;
  if v_church_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_church');
  end if;

  if exists (select 1 from public.keep_offerings where user_id = uid and decor_id = p_decor) then
    return jsonb_build_object('ok', false, 'reason', 'already_offered');
  end if;

  if not public.keep_decor_owned(uid, p_decor) then
    return jsonb_build_object('ok', false, 'reason', 'not_owned');
  end if;

  -- Grand only: `<id>.3` is the merged top tier (0060's wire format).
  select anchor into v_anchor
  from public.keep_placements
  where user_id = uid and decor_id = p_decor || '.3'
  limit 1;
  if v_anchor is null then
    return jsonb_build_object('ok', false, 'reason', 'not_maxed');
  end if;

  insert into public.keep_offerings (user_id, decor_id, church_id, points)
  values (uid, p_decor, v_church_id, v_points);

  -- The Grand one goes to the church, so it leaves the hall. The player keeps
  -- the decoration itself: ownership is derived and nothing here touched a
  -- counter, so they can stand a plain one back up whenever they like.
  delete from public.keep_placements where user_id = uid and anchor = v_anchor;

  select xp into v_before from public.churches where id = v_church_id for update;
  update public.churches set xp = xp + v_points where id = v_church_id
  returning * into v_church;

  return jsonb_build_object(
    'ok', true,
    'points', v_points,
    'anchor', v_anchor,
    'leveled_up', public.church_level_from_xp(v_church.xp) > public.church_level_from_xp(v_before),
    'church', public.church_json(v_church)
  );
end;
$$;

-- ── What I have already given ───────────────────────────────────────────────
-- So the sheet can grey out a decoration that has been offered before, instead
-- of offering a button that can only fail.
create or replace function public.my_keep_offerings()
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  return coalesce((
    select jsonb_agg(decor_id) from public.keep_offerings where user_id = uid
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.keep_decor_offer_value(text) to anon, authenticated;
grant execute on function public.keep_decor_owned(uuid, text) to authenticated;
grant execute on function public.offer_keep_decor(text) to authenticated;
grant execute on function public.my_keep_offerings() to authenticated;

notify pgrst, 'reload schema';
