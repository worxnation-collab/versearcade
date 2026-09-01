-- Where churches come from.
--
-- 0040 built the picker on live OpenStreetMap (Overpass for "near me",
-- Nominatim for "by name"). Two things were wrong with that, and both were
-- found on one real congregation in Windermere, Florida:
--
--   • OSM is only as fresh as its last volunteer edit. That building was
--     renamed to "Quay Church" over a year ago; OSM still said "Lifebridge
--     Church" (way/553118418, last indexed 2026-04-28), so the picker kept
--     offering a name the congregation had stopped using. Overture's record of
--     the same address (12120 Chase Rd) was three weeks old and correct.
--   • A name is written into `churches.name` once, at join time, and never
--     looked at again — so even a correct source would have gone stale the day
--     after somebody joined.
--
-- So: churches now come from a table we own, loaded from the Overture Maps
-- places theme (`scripts/load-church-places.mjs`, monthly releases, Apache-2.0
-- / CDLA-Permissive-2.0). Overture merges Meta, Microsoft, Foursquare and OSM,
-- which is why it carried the rename OSM had missed.
--
-- Why a table we own rather than calling somebody's API per keystroke:
--
--   • Licence. Google and Foursquare both forbid storing anything but their
--     own opaque id — a `churches` row is permanent (a congregation banks XP
--     against it for years, it is drawn in scenes and named on boards), so
--     neither can legally back this table. Overture's licence permits it.
--   • Speed and reliability. `search_church_places` is a bounding-box query on
--     an indexed local table, so the picker no longer waits on Overpass, which
--     is the single slowest and least reliable call in the app.
--   • Cost. $0, and no key in a baked `dist`.
--
-- The refresh is deliberately NOT a cron (this project has none, by design —
-- see the rivalry). The operator runs the loader, applies the generated seed,
-- and calls `refresh_church_names()`; that call is what pushes new names onto
-- live churches.

-- ---------------------------------------------------------------------------
-- The index of real-world places
-- ---------------------------------------------------------------------------
-- This is a SOURCE, not a church. Nothing here has XP, members or a level —
-- a row becomes a church only when a player picks it and `join_church` copies
-- it into `public.churches`.
create table if not exists public.church_places (
  -- 'ovt:<gers id>' — Overture's GERS id, stable across releases.
  place_key   text primary key,
  -- The same place's OSM identity, IF Overture ever carries one ('osm:way/123').
  -- Today it does not: the places theme is sourced from Meta, Microsoft,
  -- Foursquare, BrightQuery and friends, with no OpenStreetMap record ids in
  -- `sources` at all (checked against the 2026-08-19 release). The column is
  -- kept because the loader fills it the moment that changes, and because an
  -- id bridge is strictly better than the positional one below — but nothing
  -- may DEPEND on it being populated. `churches.place_ref` is the real bridge.
  osm_key     text,
  name        text not null,
  address     text,
  city        text,
  region      text,
  lat         double precision not null,
  lng         double precision not null,
  -- Overture's own 0..1 confidence, kept so a low-confidence row can be
  -- ranked below a solid one rather than dropped outright.
  confidence  real not null default 0,
  -- Which monthly release this row came from, so a partial load is visible
  -- and `refresh_church_names` can be reasoned about after the fact.
  release     text not null,
  updated_at  timestamptz not null default now(),
  constraint church_places_lat_range check (lat >= -90 and lat <= 90),
  constraint church_places_lng_range check (lng >= -180 and lng <= 180),
  constraint church_places_confidence_range check (confidence >= 0 and confidence <= 1)
);

create index if not exists church_places_lat_lng_idx on public.church_places (lat, lng);
create index if not exists church_places_osm_key_idx on public.church_places (osm_key) where osm_key is not null;
-- Name search without a trigram extension: a lowercased prefix/substring index
-- is enough for `ilike '%…%'` to stay off a sequential scan on the hot path,
-- because every query is already bounded to a lat/lng box first.
create index if not exists church_places_name_idx on public.church_places (lower(name));

alter table public.church_places enable row level security;
drop policy if exists "church places readable" on public.church_places;
-- Public read, like `churches`: the picker runs before a guest has an account,
-- and there is nothing private here — it is a map, not a player.
create policy "church places readable" on public.church_places for select using (true);

-- Loading is operator-only. There is deliberately no client-callable writer:
-- this table decides what every church in the app is CALLED, so a client that
-- could write it could rename somebody else's congregation.
revoke all on public.church_places from public, anon, authenticated;
grant select on public.church_places to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Bridging the churches that already exist
-- ---------------------------------------------------------------------------
-- Every church joined under 0040 is keyed 'osm:…' or 'geo:…', and Overture
-- places carries no OSM ids to match those against (see `osm_key` above). So
-- the link is stored explicitly instead of being re-derived on every read.
alter table public.churches add column if not exists place_ref text;
create index if not exists churches_place_ref_idx on public.churches (place_ref) where place_ref is not null;

-- Match existing churches to the index BY POSITION, because there is no id to
-- match on. This is the one place in this feature that guesses, so it is
-- deliberately timid:
--
--   • A tight radius. The default is 0.05 miles (~80m) — a building, not a
--     block. The Windermere case that prompted all this sits at 0.000 miles:
--     OSM's centroid and Overture's point are the same spot to five decimals.
--   • EXACTLY ONE candidate, or nothing. Two churches inside 80m of each other
--     (a chapel beside its parish hall, a shared campus) is precisely when a
--     guess would rename the wrong congregation, so ambiguity is left alone
--     for a human rather than resolved by picking the nearer one.
--   • Never a 'geo:' church. Somebody typed that name in themselves; it is not
--     ours to overwrite, and a hand-added church is pinned at the PLAYER's
--     position rather than the building's, so proximity means nothing for it.
--   • Idempotent, and it never re-points a link that already exists.
--
-- Operator-run, like the loader. Returns what it linked so a run can be read.
create or replace function public.link_church_places(p_max_miles numeric default 0.05)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_linked integer := 0;
  v_radius numeric := least(greatest(coalesce(p_max_miles, 0.05), 0.005), 0.5);
begin
  with candidates as (
    select c.id as church_id,
           (
             select array_agg(p.place_key)
             from public.church_places p
             where p.lat between c.lat - 0.01 and c.lat + 0.01
               and p.lng between c.lng - 0.01 and c.lng + 0.01
               and public.miles_between(c.lat, c.lng, p.lat, p.lng) <= v_radius
           ) as keys
    from public.churches c
    where c.place_ref is null
      and c.place_key not like 'geo:%'
      and c.place_key not like 'ovt:%'
  ),
  linked as (
    update public.churches c
       set place_ref = cand.keys[1]
      from candidates cand
     where c.id = cand.church_id
       -- One candidate exactly. Zero is "not in the index"; more than one is
       -- ambiguous, and both are left for a person to look at.
       and array_length(cand.keys, 1) = 1
    returning 1
  )
  select count(*) into v_linked from linked;

  return jsonb_build_object('linked', v_linked, 'radius_miles', v_radius);
end;
$$;

revoke all on function public.link_church_places(numeric) from public, anon, authenticated;

-- What `link_church_places` refused to guess, so it is visible rather than
-- silently skipped. This is not a corner case: a church campus routinely has
-- several Overture entries at one address — the congregation, its men's or
-- women's ministry, its preschool, its coffee bar — and they share a category
-- and a doorstep. The Windermere church that prompted this migration is
-- exactly that shape: 'Quay Church' (confidence 0.97) sits beside a stale
-- 'Lifebridge Men' (0.99) at 12120 Chase Rd.
--
-- Note what that pair rules out. Nearest cannot separate them (same point to
-- three decimals), and highest-confidence picks the WRONG one — so there is no
-- automatic rule here that is not sometimes a wrong rename. A person reading
-- two names is better than any of them, which is why this returns a list
-- rather than resolving it.
create or replace function public.church_link_candidates(p_max_miles numeric default 0.05)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  with unlinked as (
    select c.id, c.place_key, c.name, c.lat, c.lng
    from public.churches c
    where c.place_ref is null
      and c.place_key not like 'geo:%'
      and c.place_key not like 'ovt:%'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'church_id',  u.id,
           'place_key',  u.place_key,
           'name',       u.name,
           'candidates', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'place_key',  p.place_key,
                      'name',       p.name,
                      'address',    p.address,
                      'confidence', p.confidence,
                      'miles',      round(public.miles_between(u.lat, u.lng, p.lat, p.lng)::numeric, 4)
                    ) order by public.miles_between(u.lat, u.lng, p.lat, p.lng))
             from public.church_places p
             where p.lat between u.lat - 0.01 and u.lat + 0.01
               and p.lng between u.lng - 0.01 and u.lng + 0.01
               and public.miles_between(u.lat, u.lng, p.lat, p.lng)
                     <= least(greatest(coalesce(p_max_miles, 0.05), 0.005), 0.5)
           ), '[]'::jsonb)
         )), '[]'::jsonb)
  from unlinked u;
$$;

revoke all on function public.church_link_candidates(numeric) from public, anon, authenticated;

-- Resolving one by hand, once a person has read the two names:
--   update public.churches set place_ref = 'ovt:<the right one>' where id = '<church id>';
--   select public.refresh_church_names();

-- ---------------------------------------------------------------------------
-- Searching it
-- ---------------------------------------------------------------------------
-- "Every church within N miles of here", optionally name-filtered. Same shape
-- and same envelope as `search_churches` (0040) so the picker can merge the
-- two lists without knowing which came from where.
create or replace function public.search_church_places(
  p_lat          double precision,
  p_lng          double precision,
  p_q            text default null,
  p_radius_miles numeric default 30,
  p_limit        integer default 60
)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  with near as (
    select p.*, public.miles_between(p_lat, p_lng, p.lat, p.lng) as miles
    from public.church_places p
    -- A degree of latitude is ~69 miles, so 1.5 degrees comfortably covers the
    -- 100-mile ceiling below and lets the (lat,lng) index do the work.
    where p.lat between p_lat - 1.5 and p_lat + 1.5
      and p.lng between p_lng - 1.5 and p_lng + 1.5
  )
  select coalesce(jsonb_agg(row_json order by miles), '[]'::jsonb) from (
    select n.miles,
           jsonb_build_object(
             'place_key', n.place_key,
             'osm_key',   n.osm_key,
             'name',      n.name,
             'address',   n.address,
             'city',      n.city,
             'region',    n.region,
             'lat',       n.lat,
             'lng',       n.lng,
             'confidence', n.confidence,
             'miles',     round(n.miles::numeric, 1)
           ) as row_json
    from near n
    where n.miles <= least(greatest(coalesce(p_radius_miles, 30), 1), 100)
      and (
        coalesce(btrim(p_q), '') = ''
        or n.name ilike '%' || btrim(p_q) || '%'
        or coalesce(n.city, '') ilike '%' || btrim(p_q) || '%'
      )
    order by n.miles
    limit least(greatest(coalesce(p_limit, 60), 1), 100)
  ) matches;
$$;

grant execute on function public.search_church_places(double precision, double precision, text, numeric, integer)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Keeping a joined church's name current
-- ---------------------------------------------------------------------------
-- The half of the Windermere bug that switching sources does NOT fix: a church
-- keeps whatever name it was created with, forever. This is what makes a
-- rename actually reach a congregation that joined months ago.
--
-- Matching is by a link that already exists, never by a fresh guess: the
-- church's own key, or the `place_ref` that `link_church_places` resolved once
-- and a human can inspect. A hand-added 'geo:' church with no `place_ref` is
-- deliberately NEVER touched — somebody typed that name in themselves, and it
-- is not ours to overwrite.
create or replace function public.refresh_church_names()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_renamed integer := 0;
  v_filled  integer := 0;
begin
  -- Names, only where the source actually disagrees.
  with matched as (
    select c.id, p.name, p.address, p.city, p.region
    from public.churches c
    join public.church_places p
      on p.place_key = c.place_key
      or p.place_key = c.place_ref
      or (c.place_key like 'osm:%' and p.osm_key = c.place_key)
  ),
  renamed as (
    update public.churches c
       set name = left(m.name, 120)
      from matched m
     where c.id = m.id
       and btrim(m.name) <> ''
       and c.name is distinct from left(m.name, 120)
    returning 1
  )
  select count(*) into v_renamed from renamed;

  -- Address/city/region are filled in but never overwritten — same rule
  -- `join_church`'s upsert already follows.
  with matched as (
    select c.id, p.address, p.city, p.region
    from public.churches c
    join public.church_places p
      on p.place_key = c.place_key
      or p.place_key = c.place_ref
      or (c.place_key like 'osm:%' and p.osm_key = c.place_key)
  ),
  filled as (
    update public.churches c
       set address = coalesce(c.address, left(m.address, 200)),
           city    = coalesce(c.city, left(m.city, 80)),
           region  = coalesce(c.region, left(m.region, 80))
      from matched m
     where c.id = m.id
       and (c.address is null or c.city is null or c.region is null)
       and (m.address is not null or m.city is not null or m.region is not null)
    returning 1
  )
  select count(*) into v_filled from filled;

  return jsonb_build_object('renamed', v_renamed, 'filled', v_filled);
end;
$$;

-- Operator-only, and locked down the way `grant_skins` is rather than with the
-- `revoke from public` that 0052 wrongly believed was enough: Supabase's
-- default privileges hand `anon` and `authenticated` a NAMED grant on every new
-- function, which revoking PUBLIC does not touch. Confirm with:
--   select proname, proacl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and proname = 'refresh_church_names';
-- It must read {postgres,service_role}.
revoke all on function public.refresh_church_names() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Picking one
-- ---------------------------------------------------------------------------
-- `join_church` gains one behaviour: when the place being joined is in our
-- index, the INDEX decides the name, not the client. Two reasons this is where
-- it belongs rather than in the picker:
--
--   • It is the choke point every join already goes through, so a stale name
--     sitting in an old app's memory (or in a baked `dist` that still queries
--     Overpass) can't create a church under a name we know is out of date.
--   • It makes the fix retroactive on contact: the first person to join an
--     existing church after this migration corrects its name, without waiting
--     for the next `refresh_church_names()`.
--
-- Everything else about the function is unchanged, including the `p_church_id`
-- fast path and the 'geo:' normalisation for hand-typed churches.
create or replace function public.join_church(
  p_place_key text default null,
  p_name      text default null,
  p_lat       double precision default null,
  p_lng       double precision default null,
  p_address   text default null,
  p_city      text default null,
  p_region    text default null,
  p_church_id uuid default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_key text;
  v_name text;
  v_place public.church_places%rowtype;
  v_church public.churches%rowtype;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  if p_church_id is not null then
    select * into v_church from public.churches where id = p_church_id;
    if not found then raise exception 'church not found'; end if;

    -- Joining a church we already know is also a chance to correct it, on the
    -- same identity rule `refresh_church_names` uses.
    select * into v_place from public.church_places
     where place_key = v_church.place_key
        or place_key = v_church.place_ref
        or (v_church.place_key like 'osm:%' and osm_key = v_church.place_key)
     limit 1;
    if found and btrim(v_place.name) <> '' and v_church.name is distinct from left(v_place.name, 120) then
      update public.churches
         set name = left(v_place.name, 120),
             address = coalesce(address, left(v_place.address, 200)),
             city    = coalesce(city, left(v_place.city, 80)),
             region  = coalesce(region, left(v_place.region, 80))
       where id = v_church.id
      returning * into v_church;
    end if;

    update public.profiles
       set church_id = v_church.id,
           church_joined_at = case when church_id is distinct from v_church.id then now() else church_joined_at end
     where id = uid;

    return public.church_json(v_church);
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if length(v_name) < 2 then raise exception 'church name is required'; end if;
  if length(v_name) > 120 then v_name := left(v_name, 120); end if;

  if p_lat is null or p_lng is null
     or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'a valid location is required';
  end if;

  -- Trust the client's key for a real Overture or OSM id; anything else is
  -- normalised to name+position so two hand-typed entries for one building
  -- still merge.
  v_key := btrim(coalesce(p_place_key, ''));
  if v_key !~ '^(ovt:[A-Za-z0-9_-]{1,64}|osm:(node|way|relation)/[0-9]+)$' then
    v_key := 'geo:' || lower(v_name) || ':' || round(p_lat::numeric, 3) || ',' || round(p_lng::numeric, 3);
  else
    -- A key we recognise: the index is authoritative for what this place is
    -- called and where it is. The client's name is only a fallback for a place
    -- we somehow don't hold.
    select * into v_place from public.church_places
     where place_key = v_key or (v_key like 'osm:%' and osm_key = v_key)
     limit 1;
    if found then
      if btrim(v_place.name) <> '' then v_name := left(v_place.name, 120); end if;
      p_address := coalesce(v_place.address, p_address);
      p_city    := coalesce(v_place.city, p_city);
      p_region  := coalesce(v_place.region, p_region);
      p_lat     := v_place.lat;
      p_lng     := v_place.lng;
      -- Collapse onto the Overture identity so one building is one church even
      -- when two players arrive by different routes (one from a fresh client,
      -- one from an already-approved build still sending an OSM id).
      --
      -- But collapsing the KEY is not enough on its own: the congregation may
      -- already exist under its old 'osm:' key, and inserting the Overture key
      -- beside it would split one church into two — the same building with two
      -- sets of XP and half the members each. So an existing church linked to
      -- this place wins outright, and the join takes the fast path.
      select * into v_church from public.churches
       where place_key = v_place.place_key
          or place_ref = v_place.place_key
       limit 1;
      if found then
        if btrim(v_place.name) <> '' and v_church.name is distinct from left(v_place.name, 120) then
          update public.churches
             set name = left(v_place.name, 120),
                 address = coalesce(address, left(v_place.address, 200)),
                 city    = coalesce(city, left(v_place.city, 80)),
                 region  = coalesce(region, left(v_place.region, 80))
           where id = v_church.id
          returning * into v_church;
        end if;

        update public.profiles
           set church_id = v_church.id,
               church_joined_at = case when church_id is distinct from v_church.id then now() else church_joined_at end
         where id = uid;

        return public.church_json(v_church);
      end if;

      v_key := v_place.place_key;
    end if;
  end if;

  insert into public.churches (place_key, place_ref, name, address, city, region, lat, lng, created_by)
  values (
    v_key,
    -- A church created from the index is linked to it from birth, so it never
    -- needs `link_church_places`' positional guess.
    case when v_key like 'ovt:%' then v_key else null end,
    v_name,
    nullif(left(btrim(coalesce(p_address, '')), 200), ''),
    nullif(left(btrim(coalesce(p_city, '')), 80), ''),
    nullif(left(btrim(coalesce(p_region, '')), 80), ''),
    p_lat, p_lng, uid
  )
  on conflict (place_key) do update set
    -- An indexed place also corrects the name on the way through; a hand-typed
    -- one still only fills in blanks, exactly as before.
    name    = case
                when excluded.place_key like 'ovt:%' then excluded.name
                else public.churches.name
              end,
    address = coalesce(public.churches.address, excluded.address),
    city    = coalesce(public.churches.city, excluded.city),
    region  = coalesce(public.churches.region, excluded.region)
  returning * into v_church;

  update public.profiles
     set church_id = v_church.id,
         church_joined_at = case when church_id is distinct from v_church.id then now() else church_joined_at end
   where id = uid;

  return public.church_json(v_church);
end;
$$;

grant execute on function public.join_church(text, text, double precision, double precision, text, text, text, uuid)
  to authenticated;
