-- Church packages: what a VERIFIED church can put in front of its own members.
--
-- Free discovery already exists and is untouched: `churches` (0040) is the
-- public index, `church_profiles` (0050) the published page, `church_admins`
-- (0079) the manually-granted claim. This adds the paid half on top of them:
--
--   • `churches.verified` + `churches.logo_url` — public, operator-set.
--   • `church_billing` — the Stripe subscription id. NOT a column on
--     `churches`, because `churches` is `select using (true)` to anon and a
--     billing id has no business in a public row. No policy at all: written by
--     the service role (a future Stripe webhook) and the operator RPC only.
--   • `church_verses` — a scheduled verse + optional pastor's note.
--   • `church_announcements` — a short line, optionally expiring.
--   • `church_members` — a VIEW, not a table. Membership already lives on
--     `profiles.church_id` (one church per player) and leadership in
--     `church_admins`; a second membership table would be a second source of
--     truth that drifts from the one every existing RPC reads.
--   • `church_participation_7d` — an AGGREGATE with a small-count floor.
--
-- Three rules, all enforced in the shape of the data:
--
--   1. Writing a verse or an announcement takes a claim (`is_church_admin`)
--      AND a verified church. A claim is free; the package is not.
--   2. Members read their own church's rows; nobody else does. Nothing here is
--      on a public page, so a pastor's note is not a billboard.
--   3. No per-member numbers for leadership (CLAUDE.md, 0079's header). The
--      roster view carries names and join dates — already public on
--      `get_church_page` — and NO play counts. Participation is a church total
--      that reads null below PARTICIPATION_FLOOR distinct players, so a pastor
--      of a four-person church cannot work out who skipped the week.
--
-- Online-only, inherited from every other church store.

-- ---------------------------------------------------------------------------
-- churches: verified + logo
-- ---------------------------------------------------------------------------
alter table public.churches add column if not exists verified boolean not null default false;
alter table public.churches add column if not exists logo_url text;

-- A logo lands in <img src>: https only, the catalog's "code is not content"
-- rule. No javascript:, data:, http: or //host.
alter table public.churches drop constraint if exists churches_logo_url_https;
alter table public.churches add constraint churches_logo_url_https
  check (logo_url is null or (logo_url ~ '^https://[^/\s]+/\S*$' and length(logo_url) <= 500));

-- ---------------------------------------------------------------------------
-- Billing (locked)
-- ---------------------------------------------------------------------------
create table if not exists public.church_billing (
  church_id              uuid primary key references public.churches(id) on delete cascade,
  stripe_subscription_id text unique,
  updated_at             timestamptz not null default now()
);
alter table public.church_billing enable row level security;
-- No policy: service_role and the operator RPC below are the only writers and
-- readers. A client that could write here could mark itself paid.

-- Operator: verify / un-verify a church, set its logo, record its subscription.
-- `verified` is the gate everything below reads; billing is bookkeeping.
-- A null logo or subscription leaves the stored one alone; '' clears the logo.
create or replace function public.admin_set_church_package(
  p_church_id uuid,
  p_verified boolean,
  p_logo_url text default null,
  p_stripe_subscription_id text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_logo text := nullif(btrim(coalesce(p_logo_url, '')), '');
begin
  perform public.require_admin();
  if not exists (select 1 from public.churches where id = p_church_id) then
    return jsonb_build_object('ok', false, 'reason', 'no_church');
  end if;
  if v_logo is not null and (v_logo !~ '^https://[^/\s]+/\S*$' or length(v_logo) > 500) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_logo');
  end if;

  update public.churches
     set verified = coalesce(p_verified, verified),
         logo_url = case when p_logo_url is null then logo_url else v_logo end
   where id = p_church_id;

  if nullif(btrim(coalesce(p_stripe_subscription_id, '')), '') is not null then
    insert into public.church_billing (church_id, stripe_subscription_id, updated_at)
    values (p_church_id, btrim(p_stripe_subscription_id), now())
    on conflict (church_id) do update
      set stripe_subscription_id = excluded.stripe_subscription_id,
          updated_at = now();
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.admin_set_church_package(uuid, boolean, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.church_is_verified(p_church_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce((select verified from public.churches where id = p_church_id), false);
$$;

-- Caller plays for this church (profiles.church_id) or leads it.
create or replace function public.is_church_member(p_church_id uuid)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and church_id = p_church_id)
      or public.is_church_admin(p_church_id);
$$;

grant execute on function public.church_is_verified(uuid) to authenticated;
grant execute on function public.is_church_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Scheduled verses
-- ---------------------------------------------------------------------------
create table if not exists public.church_verses (
  id              uuid primary key default gen_random_uuid(),
  church_id       uuid not null references public.churches(id) on delete cascade,
  verse_reference text not null,
  verse_text      text not null,
  pastor_note     text,
  starts_on       date not null,
  ends_on         date,
  created_by      uuid default auth.uid(),  -- no FK: forensics only, and an FK to profiles needs a lock on the hottest table
  created_at      timestamptz not null default now(),
  -- The citation shape the pool and 0098 use ("John 3:16", "Proverbs 3:5-6").
  -- Shape only: whether it is PLAYABLE is the client's question (VERSE_POOL).
  constraint church_verses_ref_shape
    check (length(verse_reference) <= 40
           and verse_reference ~ '^[1-3]? ?[A-Za-z][A-Za-z ]* [0-9]{1,3}:[0-9]{1,3}(-[0-9]{1,3})?$'),
  constraint church_verses_text_len check (length(btrim(verse_text)) between 1 and 1000),
  constraint church_verses_note_len check (pastor_note is null or length(pastor_note) <= 600),
  constraint church_verses_window check (ends_on is null or ends_on >= starts_on)
);

create index if not exists church_verses_church_start_idx
  on public.church_verses (church_id, starts_on desc);

alter table public.church_verses enable row level security;

drop policy if exists church_verses_member_read on public.church_verses;
create policy church_verses_member_read on public.church_verses
  for select to authenticated using (public.is_church_member(church_id));

drop policy if exists church_verses_admin_insert on public.church_verses;
create policy church_verses_admin_insert on public.church_verses
  for insert to authenticated
  with check (public.is_church_admin(church_id) and public.church_is_verified(church_id));

drop policy if exists church_verses_admin_update on public.church_verses;
create policy church_verses_admin_update on public.church_verses
  for update to authenticated
  using (public.is_church_admin(church_id))
  with check (public.is_church_admin(church_id) and public.church_is_verified(church_id));

drop policy if exists church_verses_admin_delete on public.church_verses;
create policy church_verses_admin_delete on public.church_verses
  for delete to authenticated using (public.is_church_admin(church_id));

-- ---------------------------------------------------------------------------
-- Announcements
-- ---------------------------------------------------------------------------
create table if not exists public.church_announcements (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches(id) on delete cascade,
  message    text not null,
  expires_at timestamptz,
  created_by uuid default auth.uid(),  -- no FK, as above
  created_at timestamptz not null default now(),
  constraint church_announcements_len check (length(btrim(message)) between 1 and 280)
);

create index if not exists church_announcements_church_idx
  on public.church_announcements (church_id, created_at desc);

alter table public.church_announcements enable row level security;

drop policy if exists church_announcements_member_read on public.church_announcements;
create policy church_announcements_member_read on public.church_announcements
  for select to authenticated using (public.is_church_member(church_id));

drop policy if exists church_announcements_admin_insert on public.church_announcements;
create policy church_announcements_admin_insert on public.church_announcements
  for insert to authenticated
  with check (public.is_church_admin(church_id) and public.church_is_verified(church_id));

drop policy if exists church_announcements_admin_update on public.church_announcements;
create policy church_announcements_admin_update on public.church_announcements
  for update to authenticated
  using (public.is_church_admin(church_id))
  with check (public.is_church_admin(church_id) and public.church_is_verified(church_id));

drop policy if exists church_announcements_admin_delete on public.church_announcements;
create policy church_announcements_admin_delete on public.church_announcements
  for delete to authenticated using (public.is_church_admin(church_id));

-- ---------------------------------------------------------------------------
-- What a member sees today
-- ---------------------------------------------------------------------------
-- One call for the daily loop: the caller's church, its active verse (latest
-- start wins when windows overlap — a short series inside a long one, the
-- season-road rule) and its live announcements. Null verse unless the church
-- is VERIFIED, so an un-renewed package goes quiet rather than half-working.
-- Local date clamped ±1, the house pattern.
create or replace function public.my_church_today(p_local_date date default null)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  v_day date := least(greatest(coalesce(p_local_date, current_date), current_date - 1), current_date + 1);
  v_church uuid;
  v_verified boolean;
  v_verse jsonb;
  v_news jsonb;
begin
  if uid is null then raise exception 'not authenticated'; end if;

  select p.church_id, c.verified into v_church, v_verified
    from public.profiles p join public.churches c on c.id = p.church_id
   where p.id = uid;

  if v_church is null then
    return jsonb_build_object('church_id', null, 'verified', false, 'verse', null, 'announcements', '[]'::jsonb);
  end if;

  if v_verified then
    select jsonb_build_object(
             'id', v.id, 'reference', v.verse_reference, 'text', v.verse_text,
             'pastor_note', v.pastor_note, 'starts_on', v.starts_on, 'ends_on', v.ends_on)
      into v_verse
      from public.church_verses v
     where v.church_id = v_church
       and v.starts_on <= v_day
       and (v.ends_on is null or v.ends_on >= v_day)
     order by v.starts_on desc, v.created_at desc
     limit 1;

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', a.id, 'message', a.message, 'expires_at', a.expires_at, 'created_at', a.created_at)
             order by a.created_at desc), '[]'::jsonb)
      into v_news
      from (select * from public.church_announcements
             where church_id = v_church and (expires_at is null or expires_at > now())
             order by created_at desc limit 5) a;
  end if;

  return jsonb_build_object(
    'church_id', v_church,
    'verified', coalesce(v_verified, false),
    'verse', v_verse,
    'announcements', coalesce(v_news, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.my_church_today(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Membership, as leadership sees it
-- ---------------------------------------------------------------------------
-- Derived from the two sources of truth. Rows only for churches the caller
-- leads. Names, role, join date — the roster `get_church_page` already shows
-- publicly — and deliberately NOTHING about play.
create or replace view public.church_members with (security_barrier = true) as
select coalesce(p.id, a.user_id)                    as user_id,
       coalesce(p.church_id, a.church_id)           as church_id,
       case when a.user_id is not null then 'admin' else 'member' end as role,
       coalesce(p.church_joined_at, a.granted_at)   as joined_at
  from (select id, church_id, church_joined_at
          from public.profiles where church_id is not null) p
  full join public.church_admins a
    on a.user_id = p.id and a.church_id = p.church_id
 where coalesce(p.church_id, a.church_id) in (
         select ca.church_id from public.church_admins ca where ca.user_id = auth.uid());

revoke all on public.church_members from public, anon;
grant select on public.church_members to authenticated;

-- ---------------------------------------------------------------------------
-- Participation: last 7 days, per church, floored
-- ---------------------------------------------------------------------------
-- Completions = daily drops played (`plays`, one row per player per local
-- date) by players whose church this is NOW. Counts only; never grouped by
-- user, never returned per day (seven daily numbers on a small church differ
-- one person at a time). Below the floor the counts are null and `floored`
-- says why, rather than showing a number that names somebody.
create or replace function public.church_participation_7d(p_church_id uuid, p_local_date date default null)
returns jsonb
language plpgsql
stable
security definer set search_path = public
as $$
declare
  floor_n constant int := 5;  -- PARTICIPATION_FLOOR in src/types/churchPackages.ts
  v_day date := least(greatest(coalesce(p_local_date, current_date), current_date - 1), current_date + 1);
  v_members int;
  v_active int;
  v_completions int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not (public.is_church_admin(p_church_id)
          or exists (select 1 from public.profiles where id = auth.uid() and is_admin)) then
    return jsonb_build_object('ok', false, 'reason', 'not_leadership');
  end if;

  select count(*) into v_members from public.profiles where church_id = p_church_id;

  select count(distinct pl.user_id), count(*)
    into v_active, v_completions
    from public.plays pl
    join public.profiles p on p.id = pl.user_id
   where p.church_id = p_church_id
     and pl.drop_date between v_day - 6 and v_day;

  if v_active < floor_n then
    return jsonb_build_object('ok', true, 'from', v_day - 6, 'to', v_day,
      'members', v_members, 'active_players', null, 'completions', null, 'floored', true);
  end if;

  return jsonb_build_object('ok', true, 'from', v_day - 6, 'to', v_day,
    'members', v_members, 'active_players', v_active, 'completions', v_completions, 'floored', false);
end;
$$;

grant execute on function public.church_participation_7d(uuid, date) to authenticated;
