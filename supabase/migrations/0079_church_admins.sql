-- Church leadership: a claimed page its own staff can keep up to date.
--
-- Until now `church_profiles` (0050) had exactly one writer,
-- `admin_upsert_church_profile`, because the alternative was an open text
-- field on somebody else's congregation. That rule was right and it doesn't
-- scale: every corrected service time went through the operator.
--
-- `church_admins` is the seam. Verification is MANUAL and stays manual — an
-- operator reads the request in the queue (name, email, role, note) and grants
-- the claim by hand. There is deliberately no self-serve claim: no domain-email
-- check, no mailed code, nothing a stranger can drive. That means the grant IS
-- the moderation, and it is revocable in one call.
--
-- What a claimed church may change is narrower than what the operator may:
--
--   • Words about themselves — tagline, about, service times, website,
--     contact. Their own page, their own facts.
--   • NOT the skin. That's the paid axis (0051, docs/CHURCH-SKINS.md), and the
--     rule that the thing a church pays for can't be forged is exactly why
--     `update_my_church_profile` doesn't take one: it writes the five text
--     columns and leaves `skin` standing.
--   • NOT anything about a person. No RPC here reads a member, and there is no
--     per-member anything for leadership to see — see the header note below.
--
-- ON PER-MEMBER DATA, because this is the file where somebody will want to add
-- it: a congregation's roster deliberately carries no per-person numbers ("a
-- crowd, not a ladder", `get_church_page`), and a pastor-facing view of who
-- played and who lapsed is that shape with authority attached — the person who
-- played less becomes visible to their minister as having played less. A
-- leader already sees the two aggregates that exist and are public anyway:
-- how many people are in the congregation, and what the church has banked.
-- Anything more must be an aggregate with a small-count floor, and adding one
-- is a deliberate decision, not a convenience.

create table if not exists public.church_admins (
  church_id  uuid not null references public.churches(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  note       text,
  primary key (church_id, user_id)
);

create index if not exists church_admins_user_idx on public.church_admins (user_id);

alter table public.church_admins enable row level security;
-- No policy, the house shape: granted only by the admin functions below, read
-- only through `is_church_admin()`. A client that could insert here could claim
-- any congregation in the country.

create or replace function public.is_church_admin(p_church_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.church_admins
    where church_id = p_church_id and user_id = auth.uid()
  );
$$;

grant execute on function public.is_church_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- A claimed church edits its own page
-- ---------------------------------------------------------------------------
-- The five text columns and nothing else. `skin` and `published` are absent on
-- purpose: the first is the paid axis, and the second would let a church
-- unpublish itself into a state only an operator could undo.
--
-- The website is validated HERE rather than trusted, because this is the first
-- writer of these columns that isn't us. `Detail` in ChurchPageBody already
-- coerces a bare domain to https:// and therefore neutralises a `javascript:`
-- string, but a second reader of the same column shouldn't have to remember
-- that — so anything that isn't https, http or a bare host is refused.
create or replace function public.update_my_church_profile(
  p_church_id     uuid,
  p_tagline       text default null,
  p_about         text default null,
  p_service_times text default null,
  p_website       text default null,
  p_contact       text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_site text;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  if not public.is_church_admin(p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_leadership');
  end if;

  v_site := nullif(left(btrim(coalesce(p_website, '')), 200), '');
  if v_site is not null then
    -- https, http, or a bare host we can prefix. Anything with a different
    -- scheme (javascript:, data:) is refused rather than mangled.
    if v_site ~* '^[a-z][a-z0-9+.-]*:' and v_site !~* '^https?://' then
      return jsonb_build_object('ok', false, 'reason', 'invalid_website');
    end if;
    if v_site !~* '^https?://' then
      v_site := 'https://' || v_site;
    end if;
  end if;

  insert into public.church_profiles (
    church_id, tagline, about, service_times, website, contact, published, updated_at, updated_by
  ) values (
    p_church_id,
    nullif(left(btrim(coalesce(p_tagline, '')), 120), ''),
    nullif(left(btrim(coalesce(p_about, '')), 600), ''),
    nullif(left(btrim(coalesce(p_service_times, '')), 200), ''),
    v_site,
    nullif(left(btrim(coalesce(p_contact, '')), 120), ''),
    true, now(), uid
  )
  on conflict (church_id) do update set
    tagline       = excluded.tagline,
    about         = excluded.about,
    service_times = excluded.service_times,
    website       = excluded.website,
    contact       = excluded.contact,
    published     = true,
    updated_at    = now(),
    updated_by    = uid;
    -- `skin` is deliberately not in this list: an edit by leadership must not
    -- silently drop the look an operator granted.

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function
  public.update_my_church_profile(uuid, text, text, text, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- The page tells the client whether this viewer may edit it
-- ---------------------------------------------------------------------------
-- Same signature as 0050, so this is a plain replace. `can_edit` is the only
-- addition; everything else is byte-for-byte what that migration returned.
create or replace function public.get_church_page(
  p_church_id     uuid,
  p_members_limit integer default 12
)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_church public.churches%rowtype;
  v_mine public.churches%rowtype;
  v_has_mine boolean := false;
  v_limit integer;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select * into v_church from public.churches where id = p_church_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  v_limit := least(greatest(coalesce(p_members_limit, 12), 1), 24);

  select c.* into v_mine
  from public.churches c
  join public.profiles p on p.church_id = c.id
  where p.id = uid;
  v_has_mine := found;

  return jsonb_build_object(
    'ok', true,
    'church', public.church_json(v_church) || jsonb_build_object(
      'is_mine', v_has_mine and v_mine.id = v_church.id,
      'miles', case when v_has_mine
                    then round(public.miles_between(v_mine.lat, v_mine.lng, v_church.lat, v_church.lng)::numeric, 1)
               end
    ),
    'info', (
      select jsonb_build_object(
        'tagline', cp.tagline,
        'about', cp.about,
        'serviceTimes', cp.service_times,
        'website', cp.website,
        'contact', cp.contact
      )
      from public.church_profiles cp
      where cp.church_id = v_church.id and cp.published
    ),
    -- This viewer is verified leadership of THIS church, so the page offers an
    -- editor instead of the "Add info" queue.
    'can_edit', public.is_church_admin(v_church.id),
    'members', coalesce((
      -- Order the aggregate itself, not just the subquery: jsonb_agg over an
      -- ordered subselect happens to come out in order today but isn't promised
      -- to, and the crowd outside the church would silently reshuffle.
      select jsonb_agg(roster.m order by roster.joined nulls last, roster.username)
      from (
        select pr.church_joined_at as joined,
               pr.username,
               jsonb_build_object(
                 'username', pr.username,
                 'avatar_emoji', pr.avatar_emoji,
                 'avatar_character', pr.avatar_character,
                 'pet', pr.pet,
                 'is_me', pr.id = uid
               ) as m
        from public.profiles pr
        where pr.church_id = v_church.id
        order by pr.church_joined_at nulls last, pr.username
        limit v_limit
      ) roster
    ), '[]'::jsonb),
    'member_total', (select count(*) from public.profiles pr where pr.church_id = v_church.id),
    -- So the pill can say "we've got your note" instead of inviting a duplicate.
    'my_request_pending', exists (
      select 1 from public.church_info_requests r
      where r.church_id = v_church.id and r.user_id = uid and not r.handled
    )
  );
end;
$$;

grant execute on function public.get_church_page(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Operator: granting and taking back a claim
-- ---------------------------------------------------------------------------
create or replace function public.admin_grant_church_admin(
  p_church_id uuid,
  p_username  text,
  p_note      text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid;
begin
  perform public.require_admin();

  if not exists (select 1 from public.churches where id = p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'church_not_found');
  end if;

  select id into v_user from public.profiles
   where lower(username) = lower(btrim(coalesce(p_username, '')));
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'user_not_found');
  end if;

  insert into public.church_admins (church_id, user_id, granted_by, note)
  values (p_church_id, v_user, auth.uid(), nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (church_id, user_id) do update set
    note = coalesce(excluded.note, public.church_admins.note);

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_revoke_church_admin(
  p_church_id uuid,
  p_username  text
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid;
begin
  perform public.require_admin();
  select id into v_user from public.profiles
   where lower(username) = lower(btrim(coalesce(p_username, '')));
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'user_not_found');
  end if;
  delete from public.church_admins where church_id = p_church_id and user_id = v_user;
  return jsonb_build_object('ok', found);
end;
$$;

create or replace function public.admin_church_admins(p_limit integer default 100)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'church_id', c.id,
             'church_name', c.name,
             'city', c.city,
             'region', c.region,
             'username', pr.username,
             'granted_at', a.granted_at,
             'note', a.note
           ) order by a.granted_at desc)
    from public.church_admins a
    join public.churches c on c.id = a.church_id
    join public.profiles pr on pr.id = a.user_id
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
  ), '[]'::jsonb);
end;
$$;

grant execute on function public.admin_grant_church_admin(uuid, text, text) to authenticated;
grant execute on function public.admin_revoke_church_admin(uuid, text) to authenticated;
grant execute on function public.admin_church_admins(integer) to authenticated;

notify pgrst, 'reload schema';
