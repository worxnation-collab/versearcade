-- 0153 — a pastoral prayer list: verified leadership sees the Prayer Wall
-- notes its own members SIGNED. docs/PRAYER-WALL.md → "Your church's leaders".
--
-- What it adds and what it does not:
--
--   • READ: `church_prayer_list(church)` — the last thirty days of notes left by
--     CURRENT members of that church (profiles.church_id), newest first: the
--     line, the category, the member's name and face, when it was left, and
--     whether it is still open / answered. `church_admin_can` gates it, so a
--     free claim (unverified) and any non-leader are refused, exactly like the
--     named roster in 0128.
--
--   • SIGNED NOTES ONLY. The wall is anonymous by default, and an unsigned
--     note never carries a name for anybody — church-mates see its line but not
--     whose it is. Putting a name on it for a pastor would be a new way to be
--     identified that the requester never chose, so unsigned notes are not in
--     this list at all. Reported or hidden notes are left out too (the wall's
--     moderation decides), and so are withdrawn ones.
--
--   • NO COUNT ABOUT ANYBODY. Nothing here reads prayer_intercessions: no
--     "prayed for N times", no ordering by kneelings, no total per member. The
--     order is the clock.
--
--   • A PRIVATE MARK. `mark_church_prayer(church, request, prayed)` lets a
--     leader tick "I've prayed" on a note. It lives in its own table, keyed to
--     that leader, and is returned only to that leader inside the list. It is
--     NOT a kneeling: it pays no XP, lights no lantern, adds nothing to the
--     requester's tally and is visible to nobody else — not the member, not
--     another leader, not a card, not the postcard. Un-ticking writes
--     prayed = false rather than removing the row.
--
-- The foreign keys (erasure cascades) are 0153_church_prayer_list_b.sql, kept
-- apart for the MCP.

create table if not exists public.church_prayer_marks (
  leader_id  uuid not null,
  request_id uuid not null,
  church_id  uuid not null,
  prayed     boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (leader_id, request_id)
);

alter table public.church_prayer_marks enable row level security;
revoke all on table public.church_prayer_marks from public, anon, authenticated;

create or replace function public.church_prayer_list(p_church_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_gate text := public.church_admin_can(p_church_id);
  v_uid  uuid := auth.uid();
  v_rows jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;

  select coalesce(jsonb_agg(x.j order by x.created_at desc), '[]'::jsonb) into v_rows
  from (
    select r.created_at, jsonb_build_object(
      'id', r.id,
      'category', r.category,
      'line', r.line,
      'created_at', r.created_at,
      'state', case
        when r.answered_at is not null then 'answered'
        when public.prayer_request_open(r) then 'open'
        else 'ended' end,
      'answered_at', r.answered_at,
      'username', p.username,
      'avatar_emoji', p.avatar_emoji,
      'avatar_character', p.avatar_character,
      'prayed', coalesce((
        select m.prayed from public.church_prayer_marks m
        where m.leader_id = v_uid and m.request_id = r.id), false)
    ) as j
    from public.prayer_requests r
    join public.profiles p on p.id = r.user_id
    where p.church_id = p_church_id
      and r.signed
      and r.withdrawn_at is null
      and r.reported_at is null
      and not r.hidden
      and r.created_at > now() - interval '30 days'
    order by r.created_at desc
    limit 60
  ) x;

  return jsonb_build_object('ok', true, 'notes', v_rows);
end; $$;

create or replace function public.mark_church_prayer(p_church_id uuid, p_request_id uuid, p_prayed boolean default true)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_gate text := public.church_admin_can(p_church_id);
  v_uid  uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  -- Only a note this list would show: a signed one, by a current member.
  if not exists (
    select 1 from public.prayer_requests r join public.profiles p on p.id = r.user_id
    where r.id = p_request_id and p.church_id = p_church_id and r.signed
      and r.withdrawn_at is null and r.reported_at is null and not r.hidden
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  insert into public.church_prayer_marks (leader_id, request_id, church_id, prayed, updated_at)
  values (v_uid, p_request_id, p_church_id, coalesce(p_prayed, true), now())
  on conflict (leader_id, request_id)
  do update set prayed = excluded.prayed, church_id = excluded.church_id, updated_at = now();

  return jsonb_build_object('ok', true, 'prayed', coalesce(p_prayed, true));
end; $$;

revoke all on function public.church_prayer_list(uuid) from public, anon;
grant execute on function public.church_prayer_list(uuid) to authenticated;
revoke all on function public.mark_church_prayer(uuid, uuid, boolean) from public, anon;
grant execute on function public.mark_church_prayer(uuid, uuid, boolean) to authenticated;
