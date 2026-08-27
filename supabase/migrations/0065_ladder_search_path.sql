-- Pin the search_path on the five ladder lookups.
--
-- 0061-0064 added five pure `language sql immutable` lookups — the reward and
-- unlock ladders, each a CASE over a text argument. They reference no table and
-- no other function, so a mutable search_path cannot actually reach anything in
-- them; the Supabase linter flags them by rule rather than by analysis
-- (`function_search_path_mutable`).
--
-- Pinning it anyway, for two reasons: it is the house pattern every other
-- function here follows (see CLAUDE.md), and leaving five new warnings behind
-- makes the next person read all six to find out which ones matter. The
-- warnings that remain on this work after this are the `anon`/`authenticated`
-- SECURITY DEFINER ones, which are the deliberate app-wide pattern — every one
-- of those functions guards itself with `if uid is null then raise`, and
-- CLAUDE.md is explicit that they get fixed all together or not at all.
--
-- The one cost: a function with a SET clause can't be inlined by the planner.
-- These are called once per placement, per offer or per play, so that is
-- nothing. Don't copy the pattern onto something called per row in a big query.
--
-- Behaviour is unchanged — same bodies, same values. Idempotent.

create or replace function public.keep_decor_offer_value(p_decor text)
returns integer
language sql
immutable
set search_path = public
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

create or replace function public.church_flora_min_given(p_flora text)
returns bigint
language sql
immutable
set search_path = public
as $$
  select case p_flora
    when 'yard_planters'   then 250
    when 'yard_marigolds'  then 1000
    when 'yard_lilies'     then 3000
    when 'yard_rosebush'   then 7500
    when 'yard_hedge'      then 15000
    when 'yard_lamp'       then 30000
    when 'yard_sunflowers' then 60000
    when 'yard_dogwood'    then 120000
    else null
  end::bigint;
$$;

create or replace function public.pet_min_level(p_pet text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case p_pet
    when 'pet_lamb'     then 10
    when 'pet_dove'     then 15
    when 'pet_raven'    then 20
    when 'pet_lion_cub' then 26
    when 'pet_donkey'   then 33
    when 'pet_camel'    then 40
    else null
  end::integer;
$$;

create or replace function public.pet_xp_bonus(p_pet text)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case p_pet
    when 'pet_donkey' then 0.03
    when 'pet_camel'  then 0.05
    else 0
  end::numeric;
$$;

create or replace function public.pet_drop_luck(p_pet text)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case p_pet
    when 'pet_raven' then 1.35
    else 1
  end::numeric;
$$;

notify pgrst, 'reload schema';
