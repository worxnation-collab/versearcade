-- 0114 — Choose a city instead of standing in one.
--
-- 0113 made a church findable from anywhere by NAME. This is the other half,
-- and it is the one the app's owner asked for: the picker's front door should
-- not be "share your location" full stop. A player whose church is in their
-- hometown does not want to search by name and hope — they want to say which
-- town, and be shown its churches.
--
-- It also fixes the case 0113 cannot: somebody who does not remember the
-- church's exact name, only where it is. "Every church in Appleton" is a
-- question the index can answer and nothing here could ask.
--
-- And it removes a requirement rather than adding one. Location was mandatory
-- to get past the first screen: a refused prompt, a desktop browser, a device
-- with location off, or simply not wanting to share it left the player with a
-- name search and no distances. A city is now a complete answer on its own.
--
-- ---------------------------------------------------------------------------
-- Why a TABLE and not a view
-- ---------------------------------------------------------------------------
-- The obvious implementation is `select city, region, count(*) … group by`,
-- and it is a 493ms parallel seq scan over the 606,272 places (measured). That
-- is per keystroke on a typeahead, so it is not a slow query, it is an unusable
-- one. The aggregate collapses to 35,879 rows, which is small enough to hold
-- and instantly searchable — so the cities are an INDEX OF THE INDEX, built the
-- same way `church_places` itself is built: loaded, not computed live.
--
-- `refresh_church_cities()` rebuilds it, and `scripts/load-church-places.mjs`
-- calls it after loading a region. **It is the half that gets forgotten**, the
-- same way `refresh_church_names()` is — loading new places without calling it
-- leaves their towns missing from the picker with nothing failing anywhere.

-- ---------------------------------------------------------------------------
-- The key
-- ---------------------------------------------------------------------------
-- One town, one row, however its rows spell it. Built on 0113's normaliser so
-- "St. Louis" and "St Louis" are the same place rather than two entries a
-- player has to choose between — and so the client, which has the same
-- normaliser in TypeScript, can never disagree about which key a city has.
create or replace function public.church_city_key(p_city text, p_region text default null)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select nullif(btrim(public.church_place_haystack(p_city)), '')
         || '|' || btrim(coalesce(public.church_place_haystack(p_region), ''));
$$;

grant execute on function public.church_city_key(text, text) to anon, authenticated;

-- What makes "every church in this town" an index lookup rather than a scan.
create index if not exists church_places_city_key_idx
  on public.church_places (public.church_city_key(city, region));

create table if not exists public.church_cities (
  city_key text primary key,
  -- The display spelling, taken from the most common row. Overture is not
  -- consistent about case and the picker shows this verbatim.
  city     text not null,
  region   text,
  churches integer not null,
  -- The town's centre, averaged over its churches. Two jobs, both modest: it
  -- is what a church added BY HAND in city mode is pinned at (a town centre is
  -- not the building, but it is the right town — which is the whole complaint
  -- this fixes), and it is the point the sponsored slot is asked about.
  lat      double precision not null,
  lng      double precision not null
);

comment on table public.church_cities is
  'Derived from church_places by refresh_church_cities(). Rebuild it whenever places are loaded — nothing does it automatically.';

create index if not exists church_cities_search_trgm_idx
  on public.church_cities
  using gin (public.church_place_haystack(city, region) extensions.gin_trgm_ops);

create index if not exists church_cities_churches_idx
  on public.church_cities (churches desc);

-- ---------------------------------------------------------------------------
-- Building it
-- ---------------------------------------------------------------------------
create or replace function public.refresh_church_cities()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_rows integer;
begin
  -- Whole-table rebuild: the source is a bulk-loaded index that changes only
  -- when a region is loaded, so there is nothing to merge and a partial
  -- refresh would only be a way to leave it half true.
  --
  -- Two plain statements rather than a delete-in-a-CTE. Postgres runs a
  -- data-modifying CTE to completion whether or not the outer query reads it,
  -- so the one-statement version WORKS — but whether an INSERT may reuse a
  -- primary key the same statement just deleted is exactly the kind of subtle
  -- same-snapshot question nobody should have to answer while reading a
  -- refresh function. In plpgsql these are separate statements in one
  -- transaction, which is unambiguous and just as atomic.
  delete from public.church_cities;

  insert into public.church_cities (city_key, city, region, churches, lat, lng)
  select public.church_city_key(p.city, p.region),
         -- The display spelling is the one most of its rows use.
         mode() within group (order by btrim(p.city)),
         nullif(mode() within group (order by btrim(coalesce(p.region, ''))), ''),
         count(*)::integer,
         avg(p.lat),
         avg(p.lng)
    from public.church_places p
   where public.church_city_key(p.city, p.region) is not null
   group by 1;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.refresh_church_cities() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The typeahead
-- ---------------------------------------------------------------------------
-- 35,879 towns is not a `<select>`, so the "drop down" is a list you type into.
-- Ordered by how many churches a town has, because that is the best available
-- proxy for "the one they meant": a player typing "spring" wants Springfield
-- before Spring Hollow, and exact-name matches are lifted above both.
create or replace function public.church_cities_search(
  p_q     text,
  p_limit integer default 12
)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_q      text := btrim(coalesce(p_q, ''));
  v_words  text[];
  v_driver text;
  v_limit  integer := least(greatest(coalesce(p_limit, 12), 1), 30);
  v_norm   text;
  v_rows   jsonb;
begin
  if length(v_q) < 2 then return '[]'::jsonb; end if;

  v_norm := btrim(public.church_place_haystack(v_q));
  if v_norm = '' then return '[]'::jsonb; end if;

  -- Same shape as 0113's needle: per word, longest word driving the trigram
  -- index. Two letters is allowed here where the name search demands three,
  -- because a state code IS two letters and "wi" is a real query — with 35,879
  -- rows a scan is affordable when the driver is too short to index.
  --
  -- The LIKE-metacharacter escaping below is UNREACHABLE and kept anyway, so
  -- nobody has to rediscover why: `church_place_haystack` keeps only [a-z0-9]
  -- and spaces, so `%`, `_` and `\` are already gone by the time these
  -- patterns are built. It costs nothing and it is what stops a future change
  -- to the normaliser from quietly turning a search box into a pattern box.
  select array_agg('%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%')
    into v_words
    from unnest(regexp_split_to_array(v_norm, '\s+')) as w
   where w <> '';

  if v_words is null then return '[]'::jsonb; end if;

  select '%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    into v_driver
    from unnest(regexp_split_to_array(v_norm, '\s+')) as w
   where w <> ''
   order by length(w) desc, w
   limit 1;

  select coalesce(jsonb_agg(row_json order by exact desc, churches desc, city), '[]'::jsonb)
    into v_rows
    from (
      select (public.church_place_haystack(c.city) = v_norm) as exact,
             c.churches,
             c.city,
             jsonb_build_object(
               'city_key', c.city_key,
               'city',     c.city,
               'region',   c.region,
               'churches', c.churches,
               'lat',      c.lat,
               'lng',      c.lng
             ) as row_json
        from public.church_cities c
       where public.church_place_haystack(c.city, c.region) like v_driver
         and public.church_place_haystack(c.city, c.region) like all (v_words)
       order by (public.church_place_haystack(c.city) = v_norm) desc, c.churches desc, c.city
       limit v_limit
    ) top;

  return coalesce(v_rows, '[]'::jsonb);
end;
$$;

grant execute on function public.church_cities_search(text, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The churches in one town
-- ---------------------------------------------------------------------------
-- Same row envelope as `search_church_places` (0091) and
-- `search_church_places_named` (0113), so the picker renders all three lists
-- with one mapper and never has to know which it is looking at.
--
-- `miles` is NULL here and that is deliberate rather than missing: in city mode
-- there is no observer to be a distance FROM, and the client renders the
-- address instead. Inventing a distance from the town centre would be a number
-- about nothing.
create or replace function public.search_church_places_in_city(
  p_city_key text,
  p_q        text default null,
  p_limit    integer default 60
)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_key   text := btrim(coalesce(p_city_key, ''));
  v_q     text := btrim(coalesce(p_q, ''));
  v_words text[];
  v_limit integer := least(greatest(coalesce(p_limit, 60), 1), 100);
  v_rows  jsonb;
begin
  if v_key = '' then return '[]'::jsonb; end if;

  if v_q <> '' then
    select array_agg('%' || replace(replace(replace(w, '\', '\\'), '%', '\%'), '_', '\_') || '%')
      into v_words
      from unnest(regexp_split_to_array(btrim(public.church_place_haystack(v_q)), '\s+')) as w
     where w <> '';
  end if;

  select coalesce(jsonb_agg(row_json order by conf desc nulls last, nm), '[]'::jsonb)
    into v_rows
    from (
      select p.confidence as conf,
             p.name as nm,
             jsonb_build_object(
               'place_key',  p.place_key,
               'name',       p.name,
               'address',    p.address,
               'city',       p.city,
               'region',     p.region,
               'lat',        p.lat,
               'lng',        p.lng,
               'confidence', p.confidence,
               'miles',      null
             ) as row_json
        from public.church_places p
       where public.church_city_key(p.city, p.region) = v_key
         and (v_words is null
              or public.church_place_haystack(p.name, p.city, p.region) like all (v_words))
       -- Best-attested first: a town's list is read top-down and Overture's
       -- confidence is the only quality signal there is. Not by distance —
       -- see the note on `miles` above.
       order by p.confidence desc nulls last, p.name
       limit v_limit
    ) top;

  return coalesce(v_rows, '[]'::jsonb);
end;
$$;

grant execute on function public.search_church_places_in_city(text, text, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fill it on the way in
-- ---------------------------------------------------------------------------
-- The migration POPULATES the table rather than leaving it to a runbook step,
-- because the runbook is exactly what this file has already said gets
-- forgotten — and leaving it out fails in the quietest possible way: a fresh
-- deploy would create an empty `church_cities`, the city door would answer
-- every query with "no town by that name", and nothing anywhere would error.
--
-- Safe in both directions. On a project that already holds places (this one,
-- 606,272 of them) it builds the ~36k towns in about a second. On a brand new
-- project the source table is empty, so it inserts nothing and costs nothing —
-- and the loader's own final file rebuilds it when the data does arrive.
select public.refresh_church_cities();
