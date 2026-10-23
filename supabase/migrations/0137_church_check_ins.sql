-- 0137 — a leader's check-in note to one member.
--
-- The leadership dashboard's People tab folds members with no play in seven
-- days into "Not active this week", and each row there offers "Check in": a
-- short note the leader writes (prefilled "Missed you this week", editable)
-- and sends by hand. This is the channel it travels on. It lands in the
-- member's mailbox as "From <church>", signed by the leader.
--
-- What is load-bearing:
--
--   * THE SERVER KNOWS NOTHING ABOUT WHY. The function takes a church, a
--     username and the words — any member of that church may receive one,
--     active or not, and no column records which list the leader was looking
--     at. So nothing the member receives can say they were picked off an
--     inactivity list; only the leader's own words reach them.
--   * Verified leadership of THAT church only (`church_admin_can`), to a player
--     whose `profiles.church_id` is that church at the moment of sending.
--   * Never automatic. There is no scheduler and no bulk path: one call, one
--     recipient, one note the leader typed or accepted.
--   * Bounded: 280 characters, cleaned by `church_clean_line`; once per
--     recipient per church per day (the unique index); 25 a day per leader.
--   * Private both ways: the recipient reads their own notes; nothing counts
--     them on a card, a board or the church page.
--
-- RLS is on with no read or write rule at all, so the table is reachable only
-- through these functions. The cascading foreign keys are in 0137b, kept
-- apart for the MCP exactly as 0134b is.

create table if not exists public.church_check_ins (
  id           bigserial primary key,
  church_id    uuid not null,
  sender_id    uuid not null,
  recipient_id uuid not null,
  message      text not null check (char_length(message) between 1 and 280),
  sent_on      date not null default current_date,
  created_at   timestamptz not null default now(),
  seen         boolean not null default false
);

create unique index if not exists church_check_ins_once_a_day
  on public.church_check_ins (church_id, recipient_id, sent_on);
create index if not exists church_check_ins_recipient
  on public.church_check_ins (recipient_id, created_at desc);
create index if not exists church_check_ins_sender_day
  on public.church_check_ins (sender_id, sent_on);

alter table public.church_check_ins enable row level security;
revoke all on table public.church_check_ins from anon, authenticated;

-- ---------------------------------------------------------------------------
-- send_church_check_in — verified leadership, one member, one note.
-- KEEP IN SYNC: CHECK_IN_MAX (280) and CHECK_IN_DAILY_CAP (25) in
-- src/store/churchCheckIns.ts.
-- ---------------------------------------------------------------------------
create or replace function public.send_church_check_in(
  p_church_id uuid,
  p_username  text,
  p_message   text
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  v_gate  text;
  v_to    uuid;
  v_msg   text := public.church_clean_line(p_message, 280);
  v_sent  int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  v_gate := public.church_admin_can(p_church_id);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  if v_msg is null then return jsonb_build_object('ok', false, 'reason', 'empty'); end if;

  select id into v_to from public.profiles
   where lower(username) = lower(btrim(coalesce(p_username, ''))) and church_id = p_church_id;
  if v_to is null then return jsonb_build_object('ok', false, 'reason', 'not_member'); end if;
  if v_to = uid then return jsonb_build_object('ok', false, 'reason', 'self'); end if;

  -- Serialise this leader's sends so two taps can't both spend the last slot.
  perform 1 from public.profiles where id = uid for update;
  select count(*) into v_sent from public.church_check_ins
   where sender_id = uid and sent_on = current_date;
  if v_sent >= 25 then return jsonb_build_object('ok', false, 'reason', 'daily_cap'); end if;

  insert into public.church_check_ins (church_id, sender_id, recipient_id, message)
  values (p_church_id, uid, v_to, v_msg)
  on conflict (church_id, recipient_id, sent_on) do nothing;
  if not found then return jsonb_build_object('ok', false, 'reason', 'already_today'); end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.send_church_check_in(uuid, text, text) from public, anon;
grant execute on function public.send_church_check_in(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- my_church_check_ins — the caller's own notes, last 30 days, newest first.
-- ---------------------------------------------------------------------------
create or replace function public.my_church_check_ins()
returns jsonb
language plpgsql
stable security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  return jsonb_build_object(
    'unseen', (select count(*) from public.church_check_ins
                where recipient_id = uid and not seen and created_at > now() - interval '30 days'),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', n.id, 'message', n.message, 'created_at', n.created_at, 'seen', n.seen,
               'church_id', n.church_id, 'church_name', c.name,
               'from_username', s.username, 'from_avatar', s.avatar_emoji,
               'from_character', s.avatar_character)
             order by n.created_at desc)
        from (select * from public.church_check_ins
               where recipient_id = uid and created_at > now() - interval '30 days'
               order by created_at desc limit 30) n
        join public.churches c on c.id = n.church_id
        join public.profiles s on s.id = n.sender_id
    ), '[]'::jsonb));
end;
$$;

revoke all on function public.my_church_check_ins() from public, anon;
grant execute on function public.my_church_check_ins() to authenticated;

create or replace function public.mark_church_check_ins_seen()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.church_check_ins set seen = true where recipient_id = auth.uid() and not seen;
end;
$$;

revoke all on function public.mark_church_check_ins_seen() from public, anon;
grant execute on function public.mark_church_check_ins_seen() to authenticated;
