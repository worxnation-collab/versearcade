-- Church pages: tapping a church on the leaderboard opens it.
--
-- Two halves, deliberately separate:
--
--  1. `church_profiles` — the extra detail a church displays on its page
--     (service times, a line about who they are, a website). This is the piece
--     that is meant to be *sold* to churches later, so it follows the same rule
--     the IAP entitlements do: there is no client-callable write path at all.
--     A client can only ever ask; granting is `admin_upsert_church_profile`,
--     which is admin-gated. Nothing a player can call can publish text onto a
--     church's public page — that would be an open billboard on someone else's
--     congregation, and moderating it after the fact is not a plan.
--
--  2. `church_info_requests` — the inquiry funnel behind the "Add info" pill.
--     Two kinds of sender, because most congregations' leadership isn't in the
--     app yet: `leadership` (a real contact who can claim the page — name and
--     email required, room to write) and `member` (someone who just goes there
--     and knows the service times — a short note, no contact details needed).
--     Both land in the same review queue; neither is published by submitting.
--
-- NOTE: `church_inquiries` (0025) is the older, church-agnostic "For Churches"
-- funnel on the marketing route and is untouched. This one is always attached
-- to a specific `churches` row, which is the whole point of it.

-- ---------------------------------------------------------------------------
-- The displayed profile
-- ---------------------------------------------------------------------------
create table if not exists public.church_profiles (
  church_id     uuid primary key references public.churches(id) on delete cascade,
  tagline       text,
  about         text,
  service_times text,
  website       text,
  contact       text,
  published     boolean not null default false,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.profiles(id) on delete set null
);

alter table public.church_profiles enable row level security;

drop policy if exists "church profiles readable when published" on public.church_profiles;
-- Same reasoning as `churches` itself: a church page is a shareable public
-- thing. Unpublished drafts stay invisible, and there is deliberately no
-- insert/update/delete policy — see the admin RPC at the bottom.
create policy "church profiles readable when published" on public.church_profiles
  for select using (published);

-- ---------------------------------------------------------------------------
-- The inquiry queue
-- ---------------------------------------------------------------------------
create table if not exists public.church_info_requests (
  id           uuid primary key default gen_random_uuid(),
  church_id    uuid not null references public.churches(id) on delete cascade,
  user_id      uuid references public.profiles(id) on delete set null,
  role         text not null,
  contact_name text,
  email        text,
  note         text not null,
  handled      boolean not null default false,
  created_at   timestamptz not null default now(),
  constraint church_info_requests_role check (role in ('leadership', 'member'))
);

create index if not exists church_info_requests_church_idx
  on public.church_info_requests (church_id, created_at desc);
create index if not exists church_info_requests_open_idx
  on public.church_info_requests (created_at desc) where not handled;

alter table public.church_info_requests enable row level security;
drop policy if exists "info requests self-select" on public.church_info_requests;
-- You can see that your own ask is in the queue; you cannot read anyone else's,
-- and nobody reads them but the admin RPC below.
create policy "info requests self-select" on public.church_info_requests
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Read a church's page
-- ---------------------------------------------------------------------------
-- Everything the detail sheet draws: the church itself, its published profile
-- (or null), and enough of the congregation to stand them outside the building.
--
-- The roster is deliberately *unordered by contribution* — it is a crowd, not a
-- ladder. Who gave the most is only ever shown for your own church, where it's
-- a thank-you rather than a comparison between strangers.
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

-- ---------------------------------------------------------------------------
-- Ask for a church's page to be filled in
-- ---------------------------------------------------------------------------
-- `member` is the low-friction path: no contact details, and a hard 180-char
-- note, because someone who just attends is passing on a fact ("Sundays 9 and
-- 11, they run a Wednesday youth night"), not writing the page. `leadership`
-- is the path that can actually claim it, so it asks for a name and a real
-- email and gives room to explain.
--
-- Nothing here publishes anything. Returning ok only means it reached the queue.
create or replace function public.submit_church_info_request(
  p_church_id uuid,
  p_role      text,
  p_note      text,
  p_name      text default null,
  p_email     text default null
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

  insert into public.church_info_requests (church_id, user_id, role, contact_name, email, note)
  values (p_church_id, uid, v_role, v_name, v_email, v_note);

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: read the queue, publish a page
-- ---------------------------------------------------------------------------
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

-- The only write path to a church page. Deliberately admin-only: this is the
-- surface a church pays for, and a client that can grant it is a client that
-- can forge it (same reasoning as `fulfill_skin` in 0047).
create or replace function public.admin_upsert_church_profile(
  p_church_id     uuid,
  p_tagline       text default null,
  p_about         text default null,
  p_service_times text default null,
  p_website       text default null,
  p_contact       text default null,
  p_published     boolean default true
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.require_admin();
  if not exists (select 1 from public.churches where id = p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  insert into public.church_profiles (
    church_id, tagline, about, service_times, website, contact, published, updated_at, updated_by
  ) values (
    p_church_id,
    nullif(left(btrim(coalesce(p_tagline, '')), 120), ''),
    nullif(left(btrim(coalesce(p_about, '')), 600), ''),
    nullif(left(btrim(coalesce(p_service_times, '')), 200), ''),
    nullif(left(btrim(coalesce(p_website, '')), 200), ''),
    nullif(left(btrim(coalesce(p_contact, '')), 120), ''),
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
    published     = excluded.published,
    updated_at    = now(),
    updated_by    = excluded.updated_by;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_handle_church_info_request(p_id uuid, p_handled boolean default true)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.require_admin();
  update public.church_info_requests set handled = coalesce(p_handled, true) where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Postgres hands EXECUTE to PUBLIC on every new function, and PUBLIC includes
-- anon — so revoke first, then re-assert. Same shape as 0041.
revoke execute on function public.get_church_page(uuid, integer) from public, anon;
revoke execute on function public.submit_church_info_request(uuid, text, text, text, text) from public, anon;
revoke execute on function public.admin_church_info_requests(integer) from public, anon;
revoke execute on function public.admin_upsert_church_profile(uuid, text, text, text, text, text, boolean) from public, anon;
revoke execute on function public.admin_handle_church_info_request(uuid, boolean) from public, anon;

grant execute on function public.get_church_page(uuid, integer) to authenticated;
grant execute on function public.submit_church_info_request(uuid, text, text, text, text) to authenticated;
grant execute on function public.admin_church_info_requests(integer) to authenticated;
grant execute on function public.admin_upsert_church_profile(uuid, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.admin_handle_church_info_request(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
