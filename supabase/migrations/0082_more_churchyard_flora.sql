-- 0082 — six more things to plant in the churchyard.
--
-- The yard shipped with eight plants on a ladder from 250 to 120,000 lifetime
-- given. This adds six more, and the whole change is that the ladder has more
-- rungs — no new plot, no new mechanic, nothing that counts and nothing that
-- ranks. Same rules as everything else in that yard: plantings stay per-player
-- against a shared building, nothing is ever tallied, and there is nowhere to
-- write a string.
--
-- KEEP IN SYNC with FLORA in src/features/church/yard.ts. The client copy draws
-- the ladder and greys out the locked rows; this one is what actually decides,
-- and set_church_yard_placement raises 'bad flora' on any id missing here.
--
-- The new thresholds are slotted BETWEEN the original eight and every original
-- threshold is restated unchanged. That is deliberate in both directions:
-- lowering one would hand out a plant somebody had not earned, and raising one
-- would lock a plant already standing in somebody's yard. The function is
-- restated wholesale on every edit, so the danger here is an omission rather
-- than a bad value — all fourteen ids are listed below, and dropping one would
-- start refusing a planting that used to work.
create or replace function public.church_flora_min_given(p_flora text)
returns bigint
language sql
immutable
as $$
  select case p_flora
    when 'yard_planters'   then 250
    when 'yard_ivy'        then 500
    when 'yard_marigolds'  then 1000
    when 'yard_lavender'   then 2000
    when 'yard_lilies'     then 3000
    when 'yard_olive'      then 5000
    when 'yard_rosebush'   then 7500
    when 'yard_bench'      then 10000
    when 'yard_hedge'      then 15000
    when 'yard_birdbath'   then 22000
    when 'yard_lamp'       then 30000
    when 'yard_wisteria'   then 45000
    when 'yard_sunflowers' then 60000
    when 'yard_dogwood'    then 120000
    else null
  end::bigint;
$$;
