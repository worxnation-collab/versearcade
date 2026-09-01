-- Two things 0089 got wrong. Both were found by running it against production
-- rather than by reading it, and both had already renamed a real congregation.
--
-- 1. "EXACTLY ONE CANDIDATE" STOPS AMBIGUITY, NOT ERROR.
--    Lighthouse Charlottesville (osm:way/464792842, 1,382 XP) linked cleanly:
--    one Overture row, at its own address, 0.012 miles away, no competition.
--    That row is named "Hyphen Lighthouse" — a name the congregation uses
--    nowhere (their own site, Yelp as of April 2026 and FaithStreet all say
--    Lighthouse Charlottesville), and it carries confidence 0.85 against the
--    0.92 of the actual church down the road.
--
--    0089's guard was built to refuse a CHOICE it couldn't make. It has
--    nothing to say about a single candidate that is simply wrong, and no
--    positional rule can — the building is right, the name is not. So the
--    answer is not a cleverer heuristic but an override a person can set and
--    a later refresh cannot undo: `name_locked`.
--
-- 2. A RENAME FIRED ON A DIFFERENT SPELLING.
--    "Saint Thomas Aquinas Catholic Church" became "St. Thomas Aquinas
--    Catholic Church". Not wrong — and not worth moving the app's largest
--    congregation for, either. A refresh should fire when the NAME changed,
--    which is what `church_name_key` decides.

alter table public.churches add column if not exists name_locked boolean not null default false;

comment on column public.churches.name_locked is
  'An operator has corrected this name by hand; refresh_church_names() and join_church() must never overwrite it. Set when the source is known to be wrong about a church.';

-- Cosmetic-equality for church names: case, punctuation, "St." vs "Saint",
-- "&" vs "and", a leading "The", and runs of whitespace all collapse. Two names
-- with the same key are one name spelled two ways, and moving between them is
-- churn rather than a correction. It is deliberately not fuzzy beyond that —
-- "Lifebridge Church" and "Quay Church" must still read as different, because
-- catching that rename is the entire point of the feature.
create or replace function public.church_name_key(p_name text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(
    btrim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(lower(btrim(coalesce(p_name, ''))), '^the\s+', '', 'g'),
              '\m(st|ste)\.?\M', 'saint', 'g'
            ),
            '&', ' and ', 'g'
          ),
          '[^a-z0-9]+', ' ', 'g'
        ),
        '\s+', ' ', 'g'
      )
    ),
  '');
$$;

-- As 0089, plus: never touch a locked name, and only rename when the normalised
-- key differs.
create or replace function public.refresh_church_names()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_renamed integer := 0;
  v_filled  integer := 0;
begin
  with matched as (
    select c.id, p.name
    from public.churches c
    join public.church_places p
      on p.place_key = c.place_key
      or p.place_key = c.place_ref
      or (c.place_key like 'osm:%' and p.osm_key = c.place_key)
    where not c.name_locked
  ),
  renamed as (
    update public.churches c
       set name = left(m.name, 120)
      from matched m
     where c.id = m.id
       and btrim(m.name) <> ''
       and public.church_name_key(c.name) is distinct from public.church_name_key(m.name)
    returning 1
  )
  select count(*) into v_renamed from renamed;

  -- A locked name does not block these: the lock says the source is wrong about
  -- what this church is CALLED, not about which building it is.
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

revoke all on function public.refresh_church_names() from public, anon, authenticated;

-- The override itself. Operator-only like the loader: a client that could set
-- this could pin a congregation's name against every future correction, which
-- is the same power in the other direction.
create or replace function public.set_church_name(p_church uuid, p_name text, p_locked boolean default true)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare v public.churches%rowtype;
begin
  update public.churches
     set name = coalesce(nullif(left(btrim(p_name), 120), ''), name),
         name_locked = coalesce(p_locked, true)
   where id = p_church
  returning * into v;
  if not found then raise exception 'church not found'; end if;
  return jsonb_build_object('id', v.id, 'name', v.name, 'name_locked', v.name_locked);
end;
$$;

revoke all on function public.set_church_name(uuid, text, boolean) from public, anon, authenticated;

-- join_church corrects a name on contact (0089), so it obeys both rules too, or
-- one player joining Lighthouse Charlottesville silently undoes the operator.
-- Identical to 0089's otherwise; reproduced whole because it is `create or
-- replace` and there is no partial form.
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

    select * into v_place from public.church_places
     where place_key = v_church.place_key
        or place_key = v_church.place_ref
        or (v_church.place_key like 'osm:%' and osm_key = v_church.place_key)
     limit 1;
    if found and not v_church.name_locked and btrim(v_place.name) <> ''
       and public.church_name_key(v_church.name) is distinct from public.church_name_key(v_place.name) then
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

  v_key := btrim(coalesce(p_place_key, ''));
  if v_key !~ '^(ovt:[A-Za-z0-9_-]{1,64}|osm:(node|way|relation)/[0-9]+)$' then
    v_key := 'geo:' || lower(v_name) || ':' || round(p_lat::numeric, 3) || ',' || round(p_lng::numeric, 3);
  else
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

      -- An existing church for this place wins outright, or one building
      -- becomes two churches with half the congregation each.
      select * into v_church from public.churches
       where place_key = v_place.place_key
          or place_ref = v_place.place_key
       limit 1;
      if found then
        if not v_church.name_locked and btrim(v_place.name) <> ''
           and public.church_name_key(v_church.name) is distinct from public.church_name_key(v_place.name) then
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
    case when v_key like 'ovt:%' then v_key else null end,
    v_name,
    nullif(left(btrim(coalesce(p_address, '')), 200), ''),
    nullif(left(btrim(coalesce(p_city, '')), 80), ''),
    nullif(left(btrim(coalesce(p_region, '')), 80), ''),
    p_lat, p_lng, uid
  )
  on conflict (place_key) do update set
    name    = case
                when public.churches.name_locked then public.churches.name
                when excluded.place_key like 'ovt:%'
                     and public.church_name_key(public.churches.name)
                         is distinct from public.church_name_key(excluded.name)
                  then excluded.name
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
