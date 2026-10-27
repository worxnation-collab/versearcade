-- 0151 — small groups, and discussion questions for them.
--
-- A church's verified leadership can sort its members into small groups and
-- mark one or more people in each as the group's leader. Content Generation
-- can also write two or three OPEN discussion questions for a day, which the
-- group leaders read beside the day's verse. docs/CHURCH-GROUPS.md.
--
--   * `church_groups` — a church's groups: name, optional description.
--     Retired with `archived_at`, never removed, so nothing here needs a
--     destructive statement.
--   * `church_group_members` — ONE row per (church, member): which group they
--     are in (null = none) and their role in it ('member' | 'leader'). The
--     primary key IS the "one group per member" rule. A member who leaves the
--     church keeps the row and every reader ignores it (it reads
--     `profiles.church_id`); rejoining puts them back where they were.
--   * `church_verse_discussions` — per (church, day): 2-3 questions and the
--     reference they were written against. A reader shows them only while
--     that still IS the day's reference and the day is APPROVED, so a day
--     redrafted over never carries the old day's questions.
--
-- Who sees what:
--   * Verified leadership (`church_admin_can`) creates, renames, retires and
--     staffs groups and writes discussion questions — the same gate that
--     already sees every member by name (0128), and nobody else.
--   * A GROUP LEADER (`my_church_group`) sees their own group: its name,
--     description, and its members' names and faces — and the discussion
--     questions for approved days from today through the next six. Not a
--     score, not a last-played date, not a streak: nothing countable about a
--     person, so a group leader learns less about their people than the
--     church's leadership already sees, never more.
--   * A regular member gets null from `my_church_group`; groups are not shown
--     to members in this pass.
--
-- RLS is on with no rule and no client grant on all three tables: every read
-- and write goes through the gated functions below, the house pattern.

create table if not exists public.church_groups (
  id          uuid primary key default gen_random_uuid(),
  church_id   uuid not null,
  name        text not null check (char_length(name) between 1 and 60),
  description text check (description is null or char_length(description) <= 240),
  created_by  uuid,
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists church_groups_church_idx on public.church_groups (church_id) where archived_at is null;
alter table public.church_groups enable row level security;
revoke all on table public.church_groups from anon, authenticated;

create table if not exists public.church_group_members (
  church_id  uuid not null,
  user_id    uuid not null,
  group_id   uuid,
  role       text not null default 'member' check (role in ('member', 'leader')),
  updated_at timestamptz not null default now(),
  primary key (church_id, user_id)
);
create index if not exists church_group_members_group_idx on public.church_group_members (group_id);
alter table public.church_group_members enable row level security;
revoke all on table public.church_group_members from anon, authenticated;

create table if not exists public.church_verse_discussions (
  church_id  uuid not null,
  drop_date  date not null,
  reference  text not null,
  questions  jsonb not null default '[]'::jsonb check (jsonb_typeof(questions) = 'array' and jsonb_array_length(questions) <= 3),
  generated  boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (church_id, drop_date)
);
alter table public.church_verse_discussions enable row level security;
revoke all on table public.church_verse_discussions from anon, authenticated;

-- 0-3 cleaned lines, each 8-240 characters. Anything else is dropped.
create or replace function public.church_clean_discussion(p jsonb)
returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(q) order by n), '[]'::jsonb)
    from (
      select public.church_clean_line(regexp_replace(e.value #>> '{}', '\s+', ' ', 'g'), 240) as q, e.n
        from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) with ordinality e(value, n)
       where jsonb_typeof(e.value) = 'string'
       limit 3
    ) x
   where q is not null and char_length(q) >= 8;
$$;
revoke all on function public.church_clean_discussion(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Leadership: the groups and who is in them.
-- ---------------------------------------------------------------------------
create or replace function public.church_groups_list(p_church_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_gate text := public.church_admin_can(p_church_id);
begin
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  return jsonb_build_object('ok', true, 'groups', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', g.id,
             'name', g.name,
             'description', g.description,
             'members', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'username', p.username,
                        'avatar_emoji', p.avatar_emoji,
                        'avatar_character', p.avatar_character,
                        'role', m.role
                      ) order by (m.role = 'leader') desc, lower(p.username))
                 from public.church_group_members m
                 join public.profiles p on p.id = m.user_id and p.church_id = p_church_id
                where m.church_id = p_church_id and m.group_id = g.id
             ), '[]'::jsonb)
           ) order by g.created_at)
      from public.church_groups g
     where g.church_id = p_church_id and g.archived_at is null
  ), '[]'::jsonb));
end;
$$;
revoke all on function public.church_groups_list(uuid) from public, anon;
grant execute on function public.church_groups_list(uuid) to authenticated;

-- Create (p_group_id null) or rename / redescribe. ok | bad_name | too_many | not_found
create or replace function public.save_church_group(p_church_id uuid, p_group_id uuid, p_name text, p_description text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_gate text := public.church_admin_can(p_church_id);
  v_name text := public.church_clean_line(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'), 60);
  v_desc text := public.church_clean_line(regexp_replace(coalesce(p_description, ''), '\s+', ' ', 'g'), 240);
  v_id   uuid;
begin
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  if v_name is null then return jsonb_build_object('ok', false, 'reason', 'bad_name'); end if;
  if p_group_id is null then
    if (select count(*) from public.church_groups where church_id = p_church_id and archived_at is null) >= 40 then
      return jsonb_build_object('ok', false, 'reason', 'too_many');
    end if;
    insert into public.church_groups (church_id, name, description, created_by)
    values (p_church_id, v_name, v_desc, auth.uid()) returning id into v_id;
  else
    update public.church_groups set name = v_name, description = v_desc
     where id = p_group_id and church_id = p_church_id and archived_at is null
    returning id into v_id;
    if v_id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;
revoke all on function public.save_church_group(uuid, uuid, text, text) from public, anon;
grant execute on function public.save_church_group(uuid, uuid, text, text) to authenticated;

-- Retire a group; its members become unassigned.
create or replace function public.archive_church_group(p_church_id uuid, p_group_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_gate text := public.church_admin_can(p_church_id);
begin
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  update public.church_groups set archived_at = now()
   where id = p_group_id and church_id = p_church_id and archived_at is null;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  update public.church_group_members set group_id = null, role = 'member', updated_at = now()
   where church_id = p_church_id and group_id = p_group_id;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.archive_church_group(uuid, uuid) from public, anon;
grant execute on function public.archive_church_group(uuid, uuid) to authenticated;

-- Put a member in a group (moving them out of any other), set their role, or
-- (p_group_id null) take them out. ok | not_member | not_found | bad_role
create or replace function public.set_church_group_member(p_church_id uuid, p_username text, p_group_id uuid, p_role text default 'member')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_gate text := public.church_admin_can(p_church_id);
  v_user uuid;
begin
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  if coalesce(p_role, 'member') not in ('member', 'leader') then return jsonb_build_object('ok', false, 'reason', 'bad_role'); end if;
  select id into v_user from public.profiles
   where lower(username) = lower(btrim(coalesce(p_username, ''))) and church_id = p_church_id limit 1;
  if v_user is null then return jsonb_build_object('ok', false, 'reason', 'not_member'); end if;
  if p_group_id is not null and not exists (
    select 1 from public.church_groups where id = p_group_id and church_id = p_church_id and archived_at is null
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  insert into public.church_group_members (church_id, user_id, group_id, role, updated_at)
  values (p_church_id, v_user, p_group_id, case when p_group_id is null then 'member' else coalesce(p_role, 'member') end, now())
  on conflict (church_id, user_id) do update
     set group_id = excluded.group_id, role = excluded.role, updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.set_church_group_member(uuid, text, uuid, text) from public, anon;
grant execute on function public.set_church_group_member(uuid, text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Discussion questions for a day. Leadership writes them (by hand, or the
-- church-draft function as the caller); an empty list clears them.
-- ok | no_day | bad_date
-- ---------------------------------------------------------------------------
create or replace function public.set_church_discussion(p_church_id uuid, p_drop_date date, p_questions jsonb, p_generated boolean default false)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_gate text := public.church_admin_can(p_church_id);
  v_ref  text;
  v_q    jsonb := public.church_clean_discussion(p_questions);
begin
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  if p_drop_date is null or p_drop_date < current_date - 7 or p_drop_date > current_date + 120 then
    return jsonb_build_object('ok', false, 'reason', 'bad_date');
  end if;
  select reference into v_ref from public.church_verses
   where church_id = p_church_id and drop_date = p_drop_date and discarded_at is null;
  if v_ref is null then return jsonb_build_object('ok', false, 'reason', 'no_day'); end if;
  insert into public.church_verse_discussions (church_id, drop_date, reference, questions, generated, updated_at)
  values (p_church_id, p_drop_date, v_ref, v_q, coalesce(p_generated, false), now())
  on conflict (church_id, drop_date) do update
     set reference = excluded.reference, questions = excluded.questions,
         generated = excluded.generated, updated_at = now();
  return jsonb_build_object('ok', true, 'questions', v_q);
end;
$$;
revoke all on function public.set_church_discussion(uuid, date, jsonb, boolean) from public, anon;
grant execute on function public.set_church_discussion(uuid, date, jsonb, boolean) to authenticated;

-- Leadership's read for one day (draft or approved): the questions while they
-- still match the day's reference, else an empty list.
create or replace function public.church_discussion_for(p_church_id uuid, p_drop_date date)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_gate text := public.church_admin_can(p_church_id);
begin
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  return jsonb_build_object('ok', true, 'questions', coalesce((
    select d.questions
      from public.church_verse_discussions d
      join public.church_verses v on v.church_id = d.church_id and v.drop_date = d.drop_date
                                 and v.discarded_at is null and v.reference = d.reference
     where d.church_id = p_church_id and d.drop_date = p_drop_date
  ), '[]'::jsonb));
end;
$$;
revoke all on function public.church_discussion_for(uuid, date) from public, anon;
grant execute on function public.church_discussion_for(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- A group leader's view: their group, its people, and this week's questions.
-- Null for anybody who leads no group in their current church.
-- ---------------------------------------------------------------------------
create or replace function public.my_church_group(p_local_date date default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_today  date := least(greatest(coalesce(p_local_date, current_date), current_date - 1), current_date + 1);
  v_church uuid;
  v_group  public.church_groups;
begin
  if uid is null then return null; end if;
  select church_id into v_church from public.profiles where id = uid;
  if v_church is null or not public.church_is_verified(v_church) then return null; end if;
  select g.* into v_group
    from public.church_group_members m
    join public.church_groups g on g.id = m.group_id and g.archived_at is null and g.church_id = v_church
   where m.church_id = v_church and m.user_id = uid and m.role = 'leader';
  if v_group.id is null then return null; end if;

  return jsonb_build_object(
    'id', v_group.id,
    'name', v_group.name,
    'description', v_group.description,
    'today', v_today,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
               'username', p.username,
               'avatar_emoji', p.avatar_emoji,
               'avatar_character', p.avatar_character,
               'role', m.role,
               'is_me', p.id = uid
             ) order by (m.role = 'leader') desc, lower(p.username))
        from public.church_group_members m
        join public.profiles p on p.id = m.user_id and p.church_id = v_church
       where m.church_id = v_church and m.group_id = v_group.id
    ), '[]'::jsonb),
    'discussion', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', v.drop_date,
               'reference', v.reference,
               'series', v.series,
               'questions', d.questions
             ) order by v.drop_date)
        from public.church_verses v
        join public.church_verse_discussions d on d.church_id = v.church_id and d.drop_date = v.drop_date
                                              and d.reference = v.reference
       where v.church_id = v_church and v.status = 'approved' and v.discarded_at is null
         and v.drop_date between v_today and v_today + 6
         and jsonb_array_length(d.questions) > 0
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.my_church_group(date) from public, anon;
grant execute on function public.my_church_group(date) to authenticated;

notify pgrst, 'reload schema';
