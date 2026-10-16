-- 0120 — "This week": one short line a claimed church publishes on its page.
--
-- A church's page carried five fields that change twice a year (tagline,
-- about, service times, website, contact) and nothing that changes on Sunday.
-- This is that one line — "This month we are in John" — written by the
-- church's verified leadership and shown inside the published profile, above
-- the about text, to anybody who opens the page, signed in or not.
--
-- What it is NOT, by construction:
--   * Not writable by anyone but leadership. The only writer is
--     `update_my_church_profile`, which already refuses anybody
--     `is_church_admin` says no to. `church_profiles` still has no client
--     write policy. The suggestion queue (`submit_church_info_request`) does
--     not take it.
--   * Not rich. Plain text, control characters collapsed to spaces, capped at
--     140 characters here and by a check constraint. The client renders it as
--     text, never HTML.
--   * Not timed. No expiry and no date: leadership changes it or clears it.
--     Empty is NULL, which the page shows as nothing at all.
--   * Not a number. No XP, nothing counted.
--
-- THE SIGNATURE. Adding a parameter to `update_my_church_profile` with
-- `create or replace` would leave TWO overloads, and PostgREST cannot resolve a
-- named-argument call that matches both — every save from an older client
-- would fail as ambiguous. Dropping the old one is a DROP, which the Supabase
-- MCP cannot apply from a cloud session (CLAUDE.md), so the six-argument
-- function is RENAMED aside and revoked from every client role, and the
-- seven-argument one takes its name. `p_this_week` defaults to NULL meaning
-- "leave it as it is" — so an app built before this, which never sends it,
-- saves the other five fields without wiping the line. An empty string clears.
--
-- `public_church_page` (0074) and `get_church_page` (0079) are restated with
-- `thisWeek` in `info`; nothing else in either changed. Copied forward from the
-- definitions live in production on 2026-10-16, not from older files.
--
-- Idempotent.

alter table public.church_profiles
  add column if not exists this_week text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'church_profiles_this_week_len'
  ) then
    alter table public.church_profiles
      add constraint church_profiles_this_week_len
      check (this_week is null or char_length(this_week) between 1 and 140);
  end if;
end $$;

-- Move the old six-argument writer aside (only if it is still there under the
-- live name), and lock it.
do $$
begin
  if to_regprocedure('public.update_my_church_profile(uuid,text,text,text,text,text)') is not null then
    alter function public.update_my_church_profile(uuid, text, text, text, text, text)
      rename to update_my_church_profile_0079;
  end if;
  if to_regprocedure('public.update_my_church_profile_0079(uuid,text,text,text,text,text)') is not null then
    revoke all on function public.update_my_church_profile_0079(uuid, text, text, text, text, text)
      from public, anon, authenticated;
  end if;
end $$;

create or replace function public.update_my_church_profile(
  p_church_id uuid,
  p_tagline text default null,
  p_about text default null,
  p_service_times text default null,
  p_website text default null,
  p_contact text default null,
  p_this_week text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_site text;
  -- NULL = not sent (an older client): keep what is there. '' = clear it.
  v_week text := nullif(left(btrim(regexp_replace(coalesce(p_this_week, ''), '[[:cntrl:]]+', ' ', 'g')), 140), '');
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
    church_id, tagline, about, service_times, website, contact, this_week, published, updated_at, updated_by
  ) values (
    p_church_id,
    nullif(left(btrim(coalesce(p_tagline, '')), 120), ''),
    nullif(left(btrim(coalesce(p_about, '')), 600), ''),
    nullif(left(btrim(coalesce(p_service_times, '')), 200), ''),
    v_site,
    nullif(left(btrim(coalesce(p_contact, '')), 120), ''),
    v_week,
    true, now(), uid
  )
  on conflict (church_id) do update set
    tagline       = excluded.tagline,
    about         = excluded.about,
    service_times = excluded.service_times,
    website       = excluded.website,
    contact       = excluded.contact,
    this_week     = case when p_this_week is null then church_profiles.this_week else excluded.this_week end,
    published     = true,
    updated_at    = now(),
    updated_by    = uid;
    -- `skin` is deliberately not in this list: an edit by leadership must not
    -- silently drop the look an operator granted.

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.update_my_church_profile(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.update_my_church_profile(uuid, text, text, text, text, text, text) to authenticated;

-- The anonymous read: + thisWeek.
create or replace function public.public_church_page(p_church_id uuid, p_members_limit integer default 12)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_church public.churches%rowtype;
  v_limit integer;
begin
  select * into v_church from public.churches where id = p_church_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  v_limit := least(greatest(coalesce(p_members_limit, 12), 1), 24);

  return jsonb_build_object(
    'ok', true,
    'church', public.church_json(v_church),
    'info', (
      select jsonb_build_object(
        'tagline', cp.tagline,
        'thisWeek', cp.this_week,
        'about', cp.about,
        'serviceTimes', cp.service_times,
        'website', cp.website,
        'contact', cp.contact
      )
      from public.church_profiles cp
      where cp.church_id = v_church.id and cp.published
    ),
    'members', coalesce((
      select jsonb_agg(roster.m order by roster.joined nulls last, roster.username)
      from (
        select pr.church_joined_at as joined,
               pr.username,
               jsonb_build_object(
                 'avatar_emoji', pr.avatar_emoji,
                 'avatar_character', pr.avatar_character,
                 'pet', pr.pet
               ) as m
        from public.profiles pr
        where pr.church_id = v_church.id
        order by pr.church_joined_at nulls last, pr.username
        limit v_limit
      ) roster
    ), '[]'::jsonb),
    'member_total', (select count(*) from public.profiles pr where pr.church_id = v_church.id)
  );
end;
$$;

-- The signed-in read: + thisWeek.
create or replace function public.get_church_page(p_church_id uuid, p_members_limit integer default 12)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
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
        'thisWeek', cp.this_week,
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
    'my_request_pending', exists (
      select 1 from public.church_info_requests r
      where r.church_id = v_church.id and r.user_id = uid and not r.handled
    )
  );
end;
$$;
