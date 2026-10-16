-- The church admin dashboard: scheduling, participation, the care list.
--
-- Builds on 0116/0117. Every write here is a `security definer` function, the
-- house pattern — the admin screen never writes a table directly, so it works
-- whether or not 0116/0117's RLS policies have been pasted in yet.
--
-- WHO SEES WHAT, which is the whole of this file:
--
--   • Every function checks `is_church_admin(church)` server-side. Verse
--     scheduling, the overview and the care list ALSO require a verified
--     church (the package); the announcement does not (it is free-layer, 0117).
--   • The overview is AGGREGATES with the small-count floor CLAUDE.md asks for
--     ("anything more must be an aggregate with a small-count floor"): below
--     FIVE members every number but the member count reads null.
--   • The care list is the one PER-PERSON read leadership gets, and it is
--     OPT-IN by the member. CLAUDE.md is explicit that a pastor-facing "who
--     played and who lapsed" is the ranking-a-person problem with authority
--     attached, and the owner's call (2026-10-13) was to build the care list
--     only for members who chose it: `profiles.church_care_optin`, default
--     FALSE, set by the member alone through `set_church_care_optin`. A member
--     who never said yes is never on it, and nothing anywhere tells leadership
--     who did not say yes. It returns a name and a last-active date and nothing
--     else — no score, no streak, no count — and only for members who have
--     been away three or more days, so it is a list of people to check on,
--     never a ranking of who played most.
--   • Nothing here is visible to a member, and no number is about one member
--     except the care list's last-active date, which that member agreed to.

-- ---------------------------------------------------------------------------
-- The member's own switch
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists church_care_optin boolean not null default false;

create or replace function public.set_church_care_optin(p_on boolean)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  update public.profiles set church_care_optin = coalesce(p_on, false) where id = uid;
  return jsonb_build_object('ok', true, 'on', coalesce(p_on, false));
end;
$$;

grant execute on function public.set_church_care_optin(boolean) to authenticated;

-- One guard for the paid half, so the three readers below can't drift.
create or replace function public.church_admin_can(p_church_id uuid)
returns text
language sql
stable
security definer set search_path = public
as $$
  select case
    when auth.uid() is null then 'not_authenticated'
    when not public.is_church_admin(p_church_id) then 'not_leadership'
    when not public.church_is_verified(p_church_id) then 'not_verified'
    else 'ok'
  end;
$$;

revoke all on function public.church_admin_can(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Scheduling the shared verse
-- ---------------------------------------------------------------------------
create or replace function public.schedule_church_verse(
  p_church_id uuid,
  p_reference text,
  p_text text,
  p_note text default null,
  p_starts_on date default null,
  p_ends_on date default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_gate text := public.church_admin_can(p_church_id);
  v_ref text := btrim(coalesce(p_reference, ''));
  v_text text := btrim(coalesce(p_text, ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_start date := coalesce(p_starts_on, current_date);
  v_id uuid;
begin
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  if length(v_ref) > 40
     or v_ref !~ '^[1-3]? ?[A-Za-z][A-Za-z ]* [0-9]{1,3}:[0-9]{1,3}(-[0-9]{1,3})?$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_reference');
  end if;
  if length(v_text) < 1 or length(v_text) > 1000 then
    return jsonb_build_object('ok', false, 'reason', 'bad_text');
  end if;
  if v_note is not null and length(v_note) > 600 then
    return jsonb_build_object('ok', false, 'reason', 'note_too_long');
  end if;
  if p_ends_on is not null and p_ends_on < v_start then
    return jsonb_build_object('ok', false, 'reason', 'bad_window');
  end if;
  insert into public.church_verses (church_id, verse_reference, verse_text, pastor_note, starts_on, ends_on, created_by)
  values (p_church_id, v_ref, v_text, v_note, v_start, p_ends_on, auth.uid())
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.delete_church_verse(p_verse_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_church uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select church_id into v_church from public.church_verses where id = p_verse_id;
  if v_church is null then return jsonb_build_object('ok', true); end if;
  -- Deleting is allowed even after a package lapses: leadership can always
  -- take its own words down.
  if not public.is_church_admin(v_church) then
    return jsonb_build_object('ok', false, 'reason', 'not_leadership');
  end if;
  delete from public.church_verses where id = p_verse_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- What is current and coming up, for the admin's own list. Past windows drop off.
create or replace function public.list_church_verses(p_church_id uuid, p_local_date date default null)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_day date := least(greatest(coalesce(p_local_date, current_date), current_date - 1), current_date + 1);
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.is_church_admin(p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_leadership');
  end if;
  return jsonb_build_object('ok', true, 'verses', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', v.id, 'reference', v.verse_reference, 'text', v.verse_text,
             'pastor_note', v.pastor_note, 'starts_on', v.starts_on, 'ends_on', v.ends_on)
           order by v.starts_on, v.created_at)
      from public.church_verses v
     where v.church_id = p_church_id
       and (v.ends_on is null or v.ends_on >= v_day)
  ), '[]'::jsonb));
end;
$$;

grant execute on function public.schedule_church_verse(uuid, text, text, text, date, date) to authenticated;
grant execute on function public.delete_church_verse(uuid) to authenticated;
grant execute on function public.list_church_verses(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- The announcement (free-layer) — ONE live line, replaced rather than stacked
-- ---------------------------------------------------------------------------
-- Setting a new one expires the old ones, so members never see a pile; ''
-- (or null) takes the current one down. Any claimed church's admin, verified
-- or not, as 0117 decided.
create or replace function public.set_church_announcement(
  p_church_id uuid,
  p_message text,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_msg text := nullif(btrim(coalesce(p_message, '')), '');
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.is_church_admin(p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_leadership');
  end if;
  if v_msg is not null and length(v_msg) > 280 then
    return jsonb_build_object('ok', false, 'reason', 'too_long');
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expires_in_past');
  end if;

  update public.church_announcements
     set expires_at = now()
   where church_id = p_church_id and (expires_at is null or expires_at > now());

  if v_msg is not null then
    insert into public.church_announcements (church_id, message, expires_at, created_by)
    values (p_church_id, v_msg, p_expires_at, auth.uid())
    returning id into v_id;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

grant execute on function public.set_church_announcement(uuid, text, timestamptz) to authenticated;

-- What the admin form starts from: the live announcement and the giving link.
create or replace function public.church_admin_settings(p_church_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  c record;
  v_news jsonb;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not public.is_church_admin(p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_leadership');
  end if;
  select id, name, verified, giving_url into c from public.churches where id = p_church_id;
  select jsonb_build_object('id', a.id, 'message', a.message, 'expires_at', a.expires_at)
    into v_news
    from public.church_announcements a
   where a.church_id = p_church_id and (a.expires_at is null or a.expires_at > now())
   order by a.created_at desc limit 1;
  return jsonb_build_object('ok', true, 'name', c.name, 'verified', c.verified,
    'giving_url', c.giving_url, 'announcement', v_news);
end;
$$;

grant execute on function public.church_admin_settings(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Participation: aggregates, floored
-- ---------------------------------------------------------------------------
-- A streak counts as LIVE only if its owner played today or yesterday (local,
-- clamped) — `current_streak` is only rewritten on the next play, so a stale
-- 40 belongs to somebody who has already stopped. Buckets do not overlap and
-- sum, with "not on a streak", to the member count.
create or replace function public.church_admin_overview(p_church_id uuid, p_local_date date default null)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  floor_n constant int := 5;  -- PARTICIPATION_FLOOR in src/types/churchPackages.ts
  v_gate text := public.church_admin_can(p_church_id);
  v_day date := least(greatest(coalesce(p_local_date, current_date), current_date - 1), current_date + 1);
  v_members int;
  v_played int;
  r record;
begin
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;

  select count(*) into v_members from public.profiles where church_id = p_church_id;

  if v_members < floor_n then
    return jsonb_build_object('ok', true, 'from', v_day - 6, 'to', v_day, 'members', v_members,
      'played_7d', null, 'streaks', null, 'floored', true);
  end if;

  select count(distinct pl.user_id) into v_played
    from public.plays pl join public.profiles p on p.id = pl.user_id
   where p.church_id = p_church_id and pl.drop_date between v_day - 6 and v_day;

  select
    count(*) filter (where live between 1 and 3)  as s1_3,
    count(*) filter (where live between 4 and 6)  as s4_6,
    count(*) filter (where live between 7 and 29) as s7_29,
    count(*) filter (where live >= 30)            as s30,
    count(*) filter (where live = 0)              as s0
    into r
    from (
      select case when p.last_played_on >= v_day - 1 then greatest(coalesce(p.current_streak, 0), 0) else 0 end as live
        from public.profiles p where p.church_id = p_church_id
    ) s;

  return jsonb_build_object('ok', true, 'from', v_day - 6, 'to', v_day, 'members', v_members,
    'played_7d', v_played,
    'streaks', jsonb_build_object('s1_3', r.s1_3, 's4_6', r.s4_6, 's7_29', r.s7_29, 's30', r.s30, 'none', r.s0),
    'floored', false);
end;
$$;

grant execute on function public.church_admin_overview(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- The care list: OPT-IN members away three or more days
-- ---------------------------------------------------------------------------
create or replace function public.church_care_list(p_church_id uuid, p_local_date date default null)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_gate text := public.church_admin_can(p_church_id);
  v_day date := least(greatest(coalesce(p_local_date, current_date), current_date - 1), current_date + 1);
begin
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  return jsonb_build_object('ok', true, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object('username', p.username, 'last_active', p.last_played_on)
           order by p.last_played_on nulls first, p.username)
      from public.profiles p
     where p.church_id = p_church_id
       and p.church_care_optin
       and p.id <> auth.uid()
       and (p.last_played_on is null or p.last_played_on <= v_day - 3)
  ), '[]'::jsonb));
end;
$$;

grant execute on function public.church_care_list(uuid, date) to authenticated;
