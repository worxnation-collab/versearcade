-- Church skins: what a claimed church page changes about the building.
--
-- The ladder in 0040 decides WHICH of the eight buildings a church has — that's
-- earned by playing and nothing here touches it. This adds the other axis: the
-- material the same building is made of. A skinned church is not a bigger
-- church, doesn't rank higher, and can't be told apart from an unskinned one by
-- any number on the board. That separation is the whole design: the thing a
-- church can pay for is the thing that can't beat anybody.
--
-- It follows 0050's rule exactly, and for the same reason: `church_profiles`
-- has no client write path, so a player cannot set a skin on somebody else's
-- congregation. The client-callable RPC only *asks*, and only leadership may
-- ask — a note from someone who merely attends carries no design choice, which
-- is enforced here rather than trusted from the form.
--
-- `custom` is a request, not a look. It means "draw our actual building", which
-- is a commission rather than a checkbox; it's stored so whoever reads the queue
-- knows to quote for it, and a church sitting on it keeps wearing the default
-- until real artwork lands as a new skin id. Nothing in this migration and
-- nothing on the client names a price or takes money — see the note in
-- lib/commerce.ts for where a real storefront decision would have to live.
--
-- NOTE on the two `drop function`s below: adding a defaulted argument to an
-- existing function creates a second overload rather than replacing it, and
-- PostgREST then can't disambiguate the two (the trap 0042 sidesteps by keeping
-- its signature). So each one is dropped and recreated. Already-deployed
-- clients that don't send the new argument still resolve, because it defaults.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table public.church_profiles
  add column if not exists skin text;

alter table public.church_info_requests
  add column if not exists skin text;

-- Both lists are the same today and are mirrored by CHURCH_SKIN_CHOICES in
-- src/features/church/skins.ts. Extend them together when a skin is added — the
-- client falls back to the default for anything it doesn't recognise, so a
-- newer server never breaks an older app, but an older *server* would reject a
-- newer app's choice outright.
alter table public.church_profiles drop constraint if exists church_profiles_skin;
alter table public.church_profiles add constraint church_profiles_skin
  check (skin is null or skin in ('classic', 'modern', 'glass', 'tile', 'custom'));

alter table public.church_info_requests drop constraint if exists church_info_requests_skin;
alter table public.church_info_requests add constraint church_info_requests_skin
  check (skin is null or skin in ('classic', 'modern', 'glass', 'tile', 'custom'));

-- ---------------------------------------------------------------------------
-- Every church carries its skin
-- ---------------------------------------------------------------------------
-- `church_json` is the single shape every church surface reads — the board, the
-- page, your own church tab, and search. Putting the skin here is what makes a
-- skinned church look skinned in a leaderboard row someone scrolls past, which
-- is the only place it's visible to a stranger and therefore the whole point of
-- buying one.
--
-- Unpublished profiles return null and the client draws the default, so a page
-- that's still being set up never leaks a half-finished look.
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
    'members', (select count(*) from public.profiles pr where pr.church_id = p_church.id),
    'skin', (
      select cp.skin from public.church_profiles cp
      where cp.church_id = p_church.id and cp.published
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Asking for a skin
-- ---------------------------------------------------------------------------
-- Identical to 0050 apart from `p_skin`, which is accepted only on the
-- `leadership` path. Someone who just attends can tell us the service times;
-- they don't get to redecorate the building.
drop function if exists public.submit_church_info_request(uuid, text, text, text, text);

create or replace function public.submit_church_info_request(
  p_church_id uuid,
  p_role      text,
  p_note      text,
  p_name      text default null,
  p_email     text default null,
  p_skin      text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_role text;
  v_note text;
  v_name text;
  v_email text;
  v_skin text;
  v_cap integer;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  if not exists (select 1 from public.churches where id = p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  v_role := lower(btrim(coalesce(p_role, '')));
  if v_role not in ('leadership', 'member') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_role');
  end if;

  v_cap := case when v_role = 'leadership' then 500 else 180 end;
  v_note := btrim(coalesce(p_note, ''));
  if length(v_note) < 10 then
    return jsonb_build_object('ok', false, 'reason', 'note_too_short');
  end if;
  -- Trim rather than reject: the client caps the field at the same number, so
  -- anything longer arriving here is a stale build, not a person to scold.
  v_note := left(v_note, v_cap);

  v_name := nullif(left(btrim(coalesce(p_name, '')), 80), '');
  v_email := nullif(lower(left(btrim(coalesce(p_email, '')), 120)), '');

  -- Dropped on the member path rather than refused: a stale or curious client
  -- sending one is not a reason to lose the note it came with.
  v_skin := nullif(lower(btrim(coalesce(p_skin, ''))), '');
  if v_role <> 'leadership' then
    v_skin := null;
  elsif v_skin is not null and v_skin not in ('classic', 'modern', 'glass', 'tile', 'custom') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_skin');
  end if;

  if v_role = 'leadership' then
    if v_name is null or length(v_name) < 2 then
      return jsonb_build_object('ok', false, 'reason', 'name_required');
    end if;
    if v_email is null or position('@' in v_email) = 0 or length(v_email) < 5 then
      return jsonb_build_object('ok', false, 'reason', 'email_required');
    end if;
  end if;

  -- One open ask per person per church. Not a punishment — a second identical
  -- note doesn't get the page filled in any faster, and the queue is read by a
  -- human.
  if exists (
    select 1 from public.church_info_requests r
    where r.church_id = p_church_id and r.user_id = uid and not r.handled
  ) then
    return jsonb_build_object('ok', false, 'reason', 'already_pending');
  end if;

  insert into public.church_info_requests (church_id, user_id, role, contact_name, email, note, skin)
  values (p_church_id, uid, v_role, v_name, v_email, v_note, v_skin);

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: see what was asked for, and publish it
-- ---------------------------------------------------------------------------
-- Same signature as 0050, so this is a plain replace. Without `skin` on the row
-- the whole feature is invisible to whoever works the queue — a church would
-- pick "Tile roof", and nobody would ever find out.
create or replace function public.admin_church_info_requests(p_limit integer default 50)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id,
      'church_id', r.church_id,
      'church_name', c.name,
      'city', c.city,
      'region', c.region,
      'role', r.role,
      'skin', r.skin,
      'username', pr.username,
      'contact_name', r.contact_name,
      'email', r.email,
      'note', r.note,
      'handled', r.handled,
      'created_at', r.created_at
    ) order by r.created_at desc)
    from (select * from public.church_info_requests order by created_at desc limit greatest(coalesce(p_limit, 50), 1)) r
    join public.churches c on c.id = r.church_id
    left join public.profiles pr on pr.id = r.user_id
  ), '[]'::jsonb);
end;
$$;

-- The only write path to a church page, still admin-only for exactly the reason
-- 0050 gives: this is the surface a church pays for, and a client that can grant
-- it is a client that can forge it.
drop function if exists public.admin_upsert_church_profile(uuid, text, text, text, text, text, boolean);

create or replace function public.admin_upsert_church_profile(
  p_church_id     uuid,
  p_tagline       text default null,
  p_about         text default null,
  p_service_times text default null,
  p_website       text default null,
  p_contact       text default null,
  p_published     boolean default true,
  p_skin          text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_skin text;
begin
  perform public.require_admin();
  if not exists (select 1 from public.churches where id = p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  v_skin := nullif(lower(btrim(coalesce(p_skin, ''))), '');
  if v_skin is not null and v_skin not in ('classic', 'modern', 'glass', 'tile', 'custom') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_skin');
  end if;

  insert into public.church_profiles (
    church_id, tagline, about, service_times, website, contact, skin, published, updated_at, updated_by
  ) values (
    p_church_id,
    nullif(left(btrim(coalesce(p_tagline, '')), 120), ''),
    nullif(left(btrim(coalesce(p_about, '')), 600), ''),
    nullif(left(btrim(coalesce(p_service_times, '')), 200), ''),
    nullif(left(btrim(coalesce(p_website, '')), 200), ''),
    nullif(left(btrim(coalesce(p_contact, '')), 120), ''),
    v_skin,
    coalesce(p_published, true),
    now(),
    auth.uid()
  )
  on conflict (church_id) do update set
    tagline       = excluded.tagline,
    about         = excluded.about,
    service_times = excluded.service_times,
    website       = excluded.website,
    contact       = excluded.contact,
    skin          = excluded.skin,
    published     = excluded.published,
    updated_at    = now(),
    updated_by    = excluded.updated_by;

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Postgres hands EXECUTE to PUBLIC on every new function, and PUBLIC includes
-- anon — so revoke first, then re-assert. Same shape as 0041 and 0050. The two
-- recreated functions need this again because the drop took their ACLs with
-- them; church_json keeps 0040's.
revoke execute on function public.submit_church_info_request(uuid, text, text, text, text, text) from public, anon;
revoke execute on function public.admin_upsert_church_profile(uuid, text, text, text, text, text, boolean, text) from public, anon;

grant execute on function public.submit_church_info_request(uuid, text, text, text, text, text) to authenticated;
grant execute on function public.admin_upsert_church_profile(uuid, text, text, text, text, text, boolean, text) to authenticated;

notify pgrst, 'reload schema';
