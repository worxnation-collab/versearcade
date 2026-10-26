-- 0147 — a verified church's leadership adds its own co-leaders.
--
-- Until now a row in `church_admins` had exactly two writers: the operator
-- (`admin_grant_church_admin`, 0079) and a one-time claim code (0121). A real
-- church has a staff team — a senior pastor, an associate, a youth pastor, an
-- office manager — and every one of them was a message to the operator. This
-- lets verified leadership of a church add (and, in part b, remove) leadership
-- of THAT church and nothing else.
--
-- What it grants is exactly one row in `church_admins`, and that is the whole
-- of the power. Everything a leader can do is already gated on that row plus
-- `church_is_verified`, so a co-leader gets the dashboard, and only the
-- dashboard:
--   • never the skin (only `admin_upsert_church_profile` writes it);
--   • never billing — `church_billing`, Stripe, Apple and the add-ons have
--     their own writers, and none of them reads who granted a leader;
--   • never operator powers — `is_admin` is on `profiles` and nothing here
--     touches `profiles`;
--   • never another church — every call re-checks `church_admin_can` for the
--     church it names.
--
-- Free claim vs verified is preserved: `church_admin_can` answers
-- 'not_verified' for an unverified church, so a free-claim leader (0137) can
-- see the list of leaders of nothing and add nobody.
--
-- Audit: `church_admins.granted_by` (0079) already records who granted whom.
-- `church_leader_events` adds the other half — who REMOVED whom, and when —
-- because the one dispute this feature can create is a leader taken off by
-- another leader, and a row that has been removed cannot carry its own story.
-- No client reads it; it is for the operator.
--
-- Part b carries the cascading foreign keys and the removal function, kept
-- apart for the MCP (see CLAUDE.md, "Why some Supabase MCP applies hang").

create table if not exists public.church_leader_events (
  id         bigserial primary key,
  church_id  uuid not null,
  actor_id   uuid,
  target_id  uuid,
  action     text not null check (action in ('grant', 'remove')),
  at         timestamptz not null default now()
);
create index if not exists church_leader_events_church_idx on public.church_leader_events (church_id, at);
alter table public.church_leader_events enable row level security;
revoke all on table public.church_leader_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The leaders of a church, as its own verified leadership sees them.
-- Join order (oldest grant first) — a list of colleagues, not a ranking.
-- `member` says whether the account plays for this church (staff often have
-- not joined it in the app). `apple_payer` marks the leader whose Apple ID
-- pays for the church (0139), because removing them ends that subscription's
-- hold on the church (0140) — the screen has to say so before anyone tries.
-- ---------------------------------------------------------------------------
create or replace function public.church_leaders(p_church_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_gate text := public.church_admin_can(p_church_id);
begin
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  return jsonb_build_object(
    'ok', true,
    'leaders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'username', p.username,
        'avatar_emoji', p.avatar_emoji,
        'avatar_character', p.avatar_character,
        'granted_at', a.granted_at,
        'granted_by', g.username,
        'is_me', a.user_id = auth.uid(),
        'member', p.church_id is not distinct from p_church_id,
        'apple_payer', exists (
          select 1 from public.church_apple_subscriptions s
           where s.church_id = p_church_id and s.user_id = a.user_id and s.status = 'active')
      ) order by a.granted_at, p.username)
      from public.church_admins a
      join public.profiles p on p.id = a.user_id
      left join public.profiles g on g.id = a.granted_by
      where a.church_id = p_church_id
    ), '[]'::jsonb));
end;
$$;
revoke all on function public.church_leaders(uuid) from public, anon;
grant execute on function public.church_leaders(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Add a co-leader by username. Verified leadership of THIS church only.
-- Twelve leaders a church at most, and ten grants a church a day — a staff
-- team fits easily, a compromised account cannot hand the roster to hundreds.
-- ---------------------------------------------------------------------------
create or replace function public.grant_church_co_leader(p_church_id uuid, p_username text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  v_gate text := public.church_admin_can(p_church_id);
  v_user uuid;
  v_name text;
  v_member boolean;
begin
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;

  select id, username, church_id is not distinct from p_church_id
    into v_user, v_name, v_member
    from public.profiles
   where lower(username) = lower(btrim(coalesce(p_username, '')))
   limit 1;
  if v_user is null then return jsonb_build_object('ok', false, 'reason', 'user_not_found'); end if;

  -- One church's leadership at a time, so two grants racing can't both pass
  -- the caps below.
  perform pg_advisory_xact_lock(hashtext('church_leaders:' || p_church_id::text));

  if exists (select 1 from public.church_admins where church_id = p_church_id and user_id = v_user) then
    return jsonb_build_object('ok', false, 'reason', 'already', 'username', v_name);
  end if;
  if (select count(*) from public.church_admins where church_id = p_church_id) >= 12 then
    return jsonb_build_object('ok', false, 'reason', 'too_many');
  end if;
  if (select count(*) from public.church_leader_events
       where church_id = p_church_id and action = 'grant' and at > now() - interval '1 day') >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'daily_cap');
  end if;

  insert into public.church_admins (church_id, user_id, granted_by)
  values (p_church_id, v_user, uid);
  insert into public.church_leader_events (church_id, actor_id, target_id, action)
  values (p_church_id, uid, v_user, 'grant');

  return jsonb_build_object('ok', true, 'username', v_name, 'member', v_member);
end;
$$;
revoke all on function public.grant_church_co_leader(uuid, text) from public, anon;
grant execute on function public.grant_church_co_leader(uuid, text) to authenticated;

notify pgrst, 'reload schema';
