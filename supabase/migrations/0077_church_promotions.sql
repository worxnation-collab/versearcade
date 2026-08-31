-- Church promotion — the one slot on the suggestion list a church can pay for.
--
-- A player with no church sees "Suggested for you" at the top of the Church
-- tab. A promotion puts one church in that strip, labelled Sponsored. That is
-- the entire feature, and the three rails around it are load-bearing:
--
--   1. THE MONEY NEVER TOUCHES THE DEVICE. There is no client-callable way to
--      create, extend or pay for a promotion — only `admin_set_church_promotion`
--      below, and the money happens off-device (invoice by email), exactly like
--      the custom church skin in 0051. A slot sold *inside* the app would be a
--      storefront `commerce.ts` has to gate, and a "boost" bought by a user in
--      an App Store build is an in-app purchase by Apple's reckoning. Sold to
--      the church, off the device, it is ordinary advertising and neither
--      problem exists. So: no prices anywhere in the client, either mode.
--
--   2. IT CANNOT LIE ABOUT DISTANCE. A promotion has no position of its own —
--      it carries a radius, and the centre is the church's own lat/lng. A
--      congregation therefore cannot advertise into a town it isn't in, by
--      construction rather than by an operator remembering not to. The radius
--      is capped at 30 miles, which is the picker's own search radius: the slot
--      exists to raise a local church, never to import a distant one.
--
--   3. IT IS A BILLBOARD, NOT AN AUCTION. `sponsored_church` takes the
--      earliest-starting live promotion covering the player — first come, flat
--      rate, one slot. Ranking congregations by what they paid is exactly the
--      ladder this app refuses to build everywhere else, and the church-skins
--      rule ("the thing a church can pay for is the thing that can't beat
--      anybody") is what this is protecting. `admin_set_church_promotion`
--      returns the overlapping live promotions so the operator can't oversell
--      an area by accident — two churches paying for one slot is the failure
--      mode, and it's the panel's job to make it visible.
--
-- Nothing here records where a player was. `sponsored_church` takes the same
-- coordinates `search_churches` (0040) already takes and stores none of them:
-- the picker promises "your location is only used to search — we never save
-- it", and a promotion must not be the reason that stops being true.

-- ---------------------------------------------------------------------------
-- The promotion
-- ---------------------------------------------------------------------------
create table if not exists public.church_promotions (
  id           uuid primary key default gen_random_uuid(),
  church_id    uuid not null references public.churches(id) on delete cascade,
  -- How far from the church's own front door the slot is offered.
  radius_miles numeric not null default 25,
  starts_at    timestamptz not null default now(),
  ends_at      timestamptz not null,
  -- Operator's own note (who bought it, what they paid). Never shown to a player.
  note         text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint church_promotions_radius_range check (radius_miles >= 1 and radius_miles <= 30),
  constraint church_promotions_window check (ends_at > starts_at)
);

create index if not exists church_promotions_window_idx
  on public.church_promotions (starts_at, ends_at);
create index if not exists church_promotions_church_idx
  on public.church_promotions (church_id);

alter table public.church_promotions enable row level security;
-- No policy of any kind, deliberately — the same shape as `church_profiles`
-- (0050). Reads go through `sponsored_church()`, writes through the admin
-- function below, and there is no path a client can forge a slot with.

-- What the slot actually bought, so it can be sold again honestly. A count of
-- players who joined through it — no timestamps beyond the join, no location,
-- and nothing a church can see about who they are.
create table if not exists public.church_promotion_joins (
  promotion_id uuid not null references public.church_promotions(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  joined_at    timestamptz not null default now(),
  primary key (promotion_id, user_id)
);
alter table public.church_promotion_joins enable row level security;

-- ---------------------------------------------------------------------------
-- What the picker asks
-- ---------------------------------------------------------------------------
-- Null is the normal answer: most areas have no promotion, and the picker
-- renders exactly as it did before this migration existed.
create or replace function public.sponsored_church(
  p_lat double precision,
  p_lng double precision
)
returns jsonb
language sql
stable
security definer set search_path = public
as $$
  select public.church_json(c)
         || jsonb_build_object(
              'promotion_id', p.id,
              'sponsored', true,
              'miles', round(public.miles_between(p_lat, p_lng, c.lat, c.lng)::numeric, 1)
            )
  from public.church_promotions p
  join public.churches c on c.id = p.church_id
  where p_lat is not null and p_lng is not null
    and p_lat between -90 and 90 and p_lng between -180 and 180
    and now() >= p.starts_at and now() < p.ends_at
    and public.miles_between(p_lat, p_lng, c.lat, c.lng) <= p.radius_miles
  -- First come, never highest bid. See rail 3 in the header.
  order by p.starts_at, p.id
  limit 1;
$$;

-- Public data (the churches table is already world-readable) and the picker
-- runs before anyone has joined anything, so this matches `search_churches`.
grant execute on function public.sponsored_church(double precision, double precision)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- What the slot delivered
-- ---------------------------------------------------------------------------
-- Called after a successful join from the sponsored row. Verified, never
-- asserted: the client says "I joined through the slot" and the server checks
-- whether that is actually true before counting it, the house pattern for
-- every write here.
create or replace function public.note_promotion_join(p_promotion uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_church uuid;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select church_id into v_church from public.church_promotions where id = p_promotion;
  if v_church is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown');
  end if;

  if not exists (
    select 1 from public.profiles where id = uid and church_id = v_church
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not a member');
  end if;

  insert into public.church_promotion_joins (promotion_id, user_id)
  values (p_promotion, uid)
  on conflict do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.note_promotion_join(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Operator
-- ---------------------------------------------------------------------------
-- Find the church a promotion is being sold to. Name or city, admin only.
create or replace function public.admin_find_churches(
  p_search text default null,
  p_limit  integer default 20
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(row order by row->>'name')
    from (
      select jsonb_build_object(
               'id', c.id,
               'name', c.name,
               'city', c.city,
               'region', c.region,
               'xp', c.xp,
               'members', (select count(*) from public.profiles p where p.church_id = c.id)
             ) as row
      from public.churches c
      where coalesce(btrim(p_search), '') = ''
         or c.name ilike '%' || btrim(p_search) || '%'
         or coalesce(c.city, '') ilike '%' || btrim(p_search) || '%'
      order by c.name
      limit least(greatest(coalesce(p_limit, 20), 1), 50)
    ) q
  ), '[]'::jsonb);
end;
$$;

-- Start a promotion. Ends whatever that church already had running, so a
-- church never holds two overlapping slots, and reports back every OTHER live
-- promotion whose circle touches this one — see rail 3: only one is ever
-- shown, so an overlap is money taken for a slot that won't appear.
create or replace function public.admin_set_church_promotion(
  p_church_id    uuid,
  p_days         integer default 30,
  p_radius_miles numeric default 25,
  p_note         text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_days   integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_radius numeric := least(greatest(coalesce(p_radius_miles, 25), 1), 30);
  v_church public.churches%rowtype;
  v_id     uuid;
  v_overlaps jsonb;
begin
  perform public.require_admin();

  select * into v_church from public.churches where id = p_church_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'church not found');
  end if;

  update public.church_promotions
     set ends_at = now()
   where church_id = p_church_id and ends_at > now() and starts_at <= now();

  insert into public.church_promotions (church_id, radius_miles, ends_at, note, created_by)
  values (p_church_id, v_radius, now() + make_interval(days => v_days),
          nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning id into v_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'name', c.name, 'city', c.city, 'region', c.region,
           'miles', round(public.miles_between(v_church.lat, v_church.lng, c.lat, c.lng)::numeric, 1),
           'ends_at', p.ends_at
         )), '[]'::jsonb)
    into v_overlaps
    from public.church_promotions p
    join public.churches c on c.id = p.church_id
   where p.id <> v_id
     and now() >= p.starts_at and now() < p.ends_at
     and public.miles_between(v_church.lat, v_church.lng, c.lat, c.lng)
         <= (p.radius_miles + v_radius);

  return jsonb_build_object('ok', true, 'id', v_id, 'overlaps', v_overlaps);
end;
$$;

create or replace function public.admin_end_church_promotion(p_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.require_admin();
  update public.church_promotions set ends_at = now()
   where id = p_id and ends_at > now();
  return jsonb_build_object('ok', found);
end;
$$;

create or replace function public.admin_church_promotions(p_limit integer default 50)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(row order by (row->>'live') desc, (row->>'ends_at') desc)
    from (
      select jsonb_build_object(
               'id', p.id,
               'church_id', c.id,
               'church_name', c.name,
               'city', c.city,
               'region', c.region,
               'radius_miles', p.radius_miles,
               'starts_at', p.starts_at,
               'ends_at', p.ends_at,
               'live', (now() >= p.starts_at and now() < p.ends_at),
               'joins', (select count(*) from public.church_promotion_joins j where j.promotion_id = p.id),
               'note', p.note
             ) as row
      from public.church_promotions p
      join public.churches c on c.id = p.church_id
      order by p.ends_at desc
      limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) q
  ), '[]'::jsonb);
end;
$$;

-- The house pattern for an operator function: callable by `authenticated`,
-- guarded by `require_admin()` on the way in — the dashboard signs in as an
-- ordinary user, so revoking from `authenticated` would lock the operator out
-- of their own panel rather than lock anybody else out of it. (0052's scar is
-- about the functions that have NO require_admin of their own; these four all
-- call it first, and a non-admin gets an exception rather than a row.)
grant execute on function public.admin_find_churches(text, integer) to authenticated;
grant execute on function public.admin_set_church_promotion(uuid, integer, numeric, text) to authenticated;
grant execute on function public.admin_end_church_promotion(uuid) to authenticated;
grant execute on function public.admin_church_promotions(integer) to authenticated;

notify pgrst, 'reload schema';
