-- Churches — the congregation you play for. A player finds their church by
-- name near their current location (the client searches OpenStreetMap and
-- hands us the place), picks it, and from then on can pour points into it.
-- A church banks XP of its own, levels on its own curve, and is ranked against
-- other churches inside a radius of *your* church — so a small congregation
-- competes with its actual neighbours, not the whole world.
--
-- NOTE: this is the player-facing feature. `church_inquiries` (0025) is the
-- separate B2B "For Churches" contact funnel and is untouched here.

-- ---------------------------------------------------------------------------
-- Churches
-- ---------------------------------------------------------------------------
-- `place_key` is the dedupe identity, so two players who pick the same building
-- land on the same row: 'osm:node/123' for a place found in OpenStreetMap, or
-- 'geo:<name>:<lat>,<lng>' (rounded to ~110m) for one typed in by hand.
create table if not exists public.churches (
  id          uuid primary key default gen_random_uuid(),
  place_key   text not null unique,
  name        text not null,
  address     text,
  city        text,
  region      text,
  lat         double precision not null,
  lng         double precision not null,
  xp          bigint not null default 0,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  constraint churches_lat_range check (lat >= -90 and lat <= 90),
  constraint churches_lng_range check (lng >= -180 and lng <= 180),
  constraint churches_xp_positive check (xp >= 0)
);

create index if not exists churches_lat_lng_idx on public.churches (lat, lng);
create index if not exists churches_xp_idx on public.churches (xp desc);

alter table public.churches enable row level security;
drop policy if exists "churches readable" on public.churches;
-- Public read: a church's page/level is shareable, and the local board needs
-- to name neighbouring churches. Every write goes through a definer RPC below,
-- so there is deliberately no insert/update/delete policy.
create policy "churches readable" on public.churches for select using (true);

-- Which church a player plays for.
alter table public.profiles add column if not exists church_id uuid
  references public.churches(id) on delete set null;
alter table public.profiles add column if not exists church_joined_at timestamptz;
create index if not exists profiles_church_idx on public.profiles (church_id);

-- ---------------------------------------------------------------------------
-- Contributions
-- ---------------------------------------------------------------------------
-- Giving points to a church does NOT spend your own XP — your rank is yours.
-- Instead, lifetime XP is the budget: you can give up to what you have earned,
-- once. So the pool grows only by actually playing, which is the whole point.
create table if not exists public.church_contributions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  church_id  uuid not null references public.churches(id) on delete cascade,
  points     integer not null,
  created_at timestamptz not null default now(),
  constraint church_contributions_points_positive check (points > 0)
);

create index if not exists church_contributions_user_idx on public.church_contributions (user_id);
create index if not exists church_contributions_church_idx on public.church_contributions (church_id, user_id);

alter table public.church_contributions enable row level security;
drop policy if exists "contributions self-select" on public.church_contributions;
create policy "contributions self-select" on public.church_contributions
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Great-circle distance in miles. Plain trig rather than PostGIS so this
-- migration works on a stock Supabase project with no extensions enabled.
create or replace function public.miles_between(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
)
returns double precision
language sql
immutable
parallel safe
as $$
  select 7917.5227 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- A church's level from its banked XP. Mirrors churchLevelInfo() on the client
-- (src/features/church/levels.ts) — change one, change the other. Slower and
-- fatter than the player curve: a church is meant to be a long climb that a
-- whole congregation pushes together.
create or replace function public.church_level_from_xp(p_xp bigint)
returns integer
language plpgsql
immutable
parallel safe
as $$
declare
  v_level integer := 1;
  v_need bigint := 1000;
  v_left bigint := greatest(coalesce(p_xp, 0), 0);
begin
  while v_left >= v_need and v_level < 200 loop
    v_left := v_left - v_need;
    v_level := v_level + 1;
    v_need := round(v_need * 1.32);
  end loop;
  return v_level;
end;
$$;

-- Points this player still has left to give (lifetime XP minus everything
-- already given, to any church).
create or replace function public.church_points_available(p_user uuid)
returns bigint
language sql
stable
security definer set search_path = public
as $$
  select greatest(
    0,
    coalesce((select xp from public.profiles where id = p_user), 0)
      - coalesce((select sum(points) from public.church_contributions where user_id = p_user), 0)
  );
$$;

-- One church as the client wants it: identity, location, banked XP + level,
-- and how many players call it home.
create or replace function public.church_json(p_church public.churches)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select jsonb_build_object(
    'id', p_church.id,
    'name', p_church.name,
    'address', p_church.address,
    'city', p_church.city,
    'region', p_church.region,
    'lat', p_church.lat,
    'lng', p_church.lng,
    'xp', p_church.xp,
    'level', public.church_level_from_xp(p_church.xp),
    'members', (select count(*) from public.profiles pr where pr.church_id = p_church.id)
  );
$$;

-- ---------------------------------------------------------------------------
-- Find / add a church
-- ---------------------------------------------------------------------------
-- Churches already known to us near a point, optionally name-filtered. The
-- client merges these with live OpenStreetMap results so a church someone else
-- added still shows up when the map lookup is slow, blocked or offline.
create or replace function public.search_churches(
  p_lat          double precision,
  p_lng          double precision,
  p_q            text default null,
  p_radius_miles numeric default 30,
  p_limit        integer default 25
)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  with near as (
    -- Keep the whole church row intact so church_json() can take it as-is.
    select c as church, public.miles_between(p_lat, p_lng, c.lat, c.lng) as miles
    from public.churches c
    where c.lat between p_lat - 1.5 and p_lat + 1.5
      and c.lng between p_lng - 1.5 and p_lng + 1.5
  )
  select coalesce(jsonb_agg(row_json order by miles), '[]'::jsonb) from (
    select n.miles,
           public.church_json(n.church) || jsonb_build_object('miles', round(n.miles::numeric, 1)) as row_json
    from near n
    where n.miles <= least(greatest(coalesce(p_radius_miles, 30), 1), 100)
      and (
        coalesce(btrim(p_q), '') = ''
        or (n.church).name ilike '%' || btrim(p_q) || '%'
        or coalesce((n.church).city, '') ilike '%' || btrim(p_q) || '%'
      )
    order by n.miles
    limit least(greatest(coalesce(p_limit, 25), 1), 50)
  ) matches;
$$;

-- Add (or find) a church and make it the caller's. One call, because from the
-- player's side "pick this one" is a single tap: the place they chose may or
-- may not already exist for us, and they should never have to care.
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
  v_church public.churches%rowtype;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  -- Picking a church we already know is the common case (and the only one that
  -- can't be re-derived from name + position, since its key may be an OSM id).
  if p_church_id is not null then
    select * into v_church from public.churches where id = p_church_id;
    if not found then raise exception 'church not found'; end if;

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

  -- Trust the client's key only for real OSM ids; anything else is normalised
  -- to name+position so two hand-typed entries for one building still merge.
  v_key := btrim(coalesce(p_place_key, ''));
  if v_key !~ '^osm:(node|way|relation)/[0-9]+$' then
    v_key := 'geo:' || lower(v_name) || ':' || round(p_lat::numeric, 3) || ',' || round(p_lng::numeric, 3);
  end if;

  insert into public.churches (place_key, name, address, city, region, lat, lng, created_by)
  values (
    v_key, v_name,
    nullif(left(btrim(coalesce(p_address, '')), 200), ''),
    nullif(left(btrim(coalesce(p_city, '')), 80), ''),
    nullif(left(btrim(coalesce(p_region, '')), 80), ''),
    p_lat, p_lng, uid
  )
  on conflict (place_key) do update set
    -- Fill in details a later, better-sourced pick knows and we didn't.
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

-- Leave your church. Points already given stay with the church — they were a
-- gift, not a deposit — and they stay spent against your lifetime budget.
create or replace function public.leave_church()
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  update public.profiles set church_id = null, church_joined_at = null where id = uid;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Give points
-- ---------------------------------------------------------------------------
create or replace function public.contribute_to_church(p_points integer)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_church_id uuid;
  v_available bigint;
  v_points integer;
  v_before integer;
  v_church public.churches%rowtype;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select church_id into v_church_id from public.profiles where id = uid;
  if v_church_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_church');
  end if;

  v_available := public.church_points_available(uid);
  -- Give at most what's left in the budget, so "give all" is always safe to
  -- tap even if another device gave a moment ago.
  v_points := least(greatest(coalesce(p_points, 0), 0), least(v_available, 2147483647))::integer;
  if v_points <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'nothing_to_give', 'available', v_available);
  end if;

  insert into public.church_contributions (user_id, church_id, points)
  values (uid, v_church_id, v_points);

  select xp into v_before from public.churches where id = v_church_id for update;

  update public.churches
     set xp = xp + v_points
   where id = v_church_id
  returning * into v_church;

  return jsonb_build_object(
    'ok', true,
    'given', v_points,
    'available', public.church_points_available(uid),
    'leveled_up', public.church_level_from_xp(v_church.xp) > public.church_level_from_xp(v_before),
    'church', public.church_json(v_church)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- My church + the people in it
-- ---------------------------------------------------------------------------
create or replace function public.get_my_church(p_givers_limit integer default 10)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_church public.churches%rowtype;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select c.* into v_church
  from public.churches c
  join public.profiles p on p.church_id = c.id
  where p.id = uid;

  if not found then
    return jsonb_build_object('church', null, 'available', public.church_points_available(uid));
  end if;

  return jsonb_build_object(
    'church', public.church_json(v_church),
    'available', public.church_points_available(uid),
    'my_given', coalesce((
      select sum(points) from public.church_contributions
      where user_id = uid and church_id = v_church.id
    ), 0),
    'givers', coalesce((
      select jsonb_agg(g order by (g->>'points')::bigint desc)
      from (
        select jsonb_build_object(
                 'username', pr.username,
                 'avatar_emoji', pr.avatar_emoji,
                 'avatar_character', pr.avatar_character,
                 'points', sum(cc.points),
                 'is_me', pr.id = uid
               ) as g
        from public.church_contributions cc
        join public.profiles pr on pr.id = cc.user_id
        where cc.church_id = v_church.id
        group by pr.id, pr.username, pr.avatar_emoji, pr.avatar_character
        order by sum(cc.points) desc
        limit least(greatest(coalesce(p_givers_limit, 10), 1), 50)
      ) top
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- The local board
-- ---------------------------------------------------------------------------
-- Churches within p_radius_miles of the caller's church, ranked by banked XP.
-- Always includes the caller's own church and its rank, even when it sits below
-- the cut — the point of a local board is knowing exactly where you stand.
create or replace function public.church_leaderboard(
  p_radius_miles numeric default 25,
  p_limit        integer default 25
)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_mine public.churches%rowtype;
  v_radius numeric;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select c.* into v_mine
  from public.churches c
  join public.profiles p on p.church_id = c.id
  where p.id = uid;

  if not found then
    return jsonb_build_object('rows', '[]'::jsonb, 'me', null, 'total', 0, 'radius_miles', p_radius_miles);
  end if;

  v_radius := least(greatest(coalesce(p_radius_miles, 25), 1), 100);

  return (
    with near as (
      select c as church, public.miles_between(v_mine.lat, v_mine.lng, c.lat, c.lng) as miles
      from public.churches c
      -- Degrees-of-latitude prebox so the index does the coarse work; 1.5° is
      -- ~103 miles, comfortably wider than the 100-mile cap above.
      where c.lat between v_mine.lat - 1.5 and v_mine.lat + 1.5
        and c.lng between v_mine.lng - 1.5 and v_mine.lng + 1.5
    ),
    inside as (
      select * from near where miles <= v_radius
    ),
    ranked as (
      select i.church, i.miles,
             row_number() over (order by (i.church).xp desc, (i.church).created_at) as rank
      from inside i
    )
    select jsonb_build_object(
      'radius_miles', v_radius,
      'total', (select count(*) from ranked),
      'rows', coalesce((
        select jsonb_agg(
          public.church_json(r.church) || jsonb_build_object(
            'rank', r.rank,
            'miles', round(r.miles::numeric, 1),
            'is_mine', (r.church).id = v_mine.id
          ) order by r.rank
        )
        from (select * from ranked order by rank limit least(greatest(coalesce(p_limit, 25), 1), 50)) r
      ), '[]'::jsonb),
      'me', (
        select public.church_json(r.church) || jsonb_build_object(
          'rank', r.rank, 'miles', 0, 'is_mine', true
        )
        from ranked r where (r.church).id = v_mine.id
      )
    )
  );
end;
$$;

grant execute on function public.miles_between(double precision, double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.church_level_from_xp(bigint) to anon, authenticated;
grant execute on function public.church_json(public.churches) to anon, authenticated;
grant execute on function public.church_points_available(uuid) to authenticated;
grant execute on function public.search_churches(double precision, double precision, text, numeric, integer) to anon, authenticated;
grant execute on function public.join_church(text, text, double precision, double precision, text, text, text, uuid) to authenticated;
grant execute on function public.leave_church() to authenticated;
grant execute on function public.contribute_to_church(integer) to authenticated;
grant execute on function public.get_my_church(integer) to authenticated;
grant execute on function public.church_leaderboard(numeric, integer) to authenticated;

notify pgrst, 'reload schema';
