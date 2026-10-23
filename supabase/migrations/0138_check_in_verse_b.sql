-- 0138b — the functions for 0138a: send with today's verse, report, review.
--
-- Unchanged from 0137 and load-bearing: verified leadership of THAT church
-- only, one recipient who is a member at the moment of sending, 280
-- characters, once per recipient per church per day, 25 a day per leader, and
-- no column saying WHY a note was sent.
--
-- send_church_check_in gains two arguments, so the three-argument 0137 version
-- is RENAMED to send_church_check_in_0137 and revoked rather than left beside
-- it: two overloads PostgREST cannot resolve for a named call (the 0120
-- pattern). Nothing shipped ever called it; 0137's client was never merged.
-- KEEP IN SYNC: CHECK_IN_MAX (280) and CHECK_IN_DAILY_CAP (25) in
-- src/store/churchCheckIns.ts.

do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'send_church_check_in'
                and p.oid::regprocedure::text = 'send_church_check_in(uuid,text,text)') then
    alter function public.send_church_check_in(uuid, text, text) rename to send_church_check_in_0137;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_proc where proname = 'send_church_check_in_0137') then
    revoke all on function public.send_church_check_in_0137(uuid, text, text) from public, anon, authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- send_church_check_in — p_attach_verse copies the church's approved verse for
-- the leader's local day (clamped ±1, the house pattern) onto the note. With a
-- verse the line is optional; without one it is required, as before.
-- ---------------------------------------------------------------------------
create or replace function public.send_church_check_in(
  p_church_id    uuid,
  p_username     text,
  p_message      text,
  p_attach_verse boolean default false,
  p_local_date   date default null
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
  v_day   date;
  v_ref   text;
  v_text  text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  v_gate := public.church_admin_can(p_church_id);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;

  if coalesce(p_attach_verse, false) then
    v_day := coalesce(p_local_date, current_date);
    if v_day < current_date - 1 then v_day := current_date - 1; end if;
    if v_day > current_date + 1 then v_day := current_date + 1; end if;
    select cv.reference, cv.text into v_ref, v_text
      from public.church_verses cv
     where cv.church_id = p_church_id and cv.drop_date = v_day
       and cv.status <> 'draft' and cv.visibility = 'congregation' and cv.discarded_at is null;
    if v_ref is null then return jsonb_build_object('ok', false, 'reason', 'no_verse'); end if;
  end if;

  if v_msg is null and v_ref is null then return jsonb_build_object('ok', false, 'reason', 'empty'); end if;

  select id into v_to from public.profiles
   where lower(username) = lower(btrim(coalesce(p_username, ''))) and church_id = p_church_id;
  if v_to is null then return jsonb_build_object('ok', false, 'reason', 'not_member'); end if;
  if v_to = uid then return jsonb_build_object('ok', false, 'reason', 'self'); end if;

  -- Serialise this leader's sends so two taps can't both spend the last slot.
  perform 1 from public.profiles where id = uid for update;
  select count(*) into v_sent from public.church_check_ins
   where sender_id = uid and sent_on = current_date;
  if v_sent >= 25 then return jsonb_build_object('ok', false, 'reason', 'daily_cap'); end if;

  insert into public.church_check_ins (church_id, sender_id, recipient_id, message, verse_ref, verse_text)
  values (p_church_id, uid, v_to, v_msg, v_ref, v_text)
  on conflict (church_id, recipient_id, sent_on) do nothing;
  if not found then return jsonb_build_object('ok', false, 'reason', 'already_today'); end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.send_church_check_in(uuid, text, text, boolean, date) from public, anon;
grant execute on function public.send_church_check_in(uuid, text, text, boolean, date) to authenticated;

-- ---------------------------------------------------------------------------
-- my_church_check_ins — 0137 plus the verse, and without anything reported or
-- taken down: a note the recipient reported leaves their mailbox at once.
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
                where recipient_id = uid and not seen and reported_at is null and not hidden
                  and created_at > now() - interval '30 days'),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', n.id, 'message', n.message, 'created_at', n.created_at, 'seen', n.seen,
               'verse_ref', n.verse_ref, 'verse_text', n.verse_text,
               'church_id', n.church_id, 'church_name', c.name,
               'from_username', s.username, 'from_avatar', s.avatar_emoji,
               'from_character', s.avatar_character)
             order by n.created_at desc)
        from (select * from public.church_check_ins
               where recipient_id = uid and reported_at is null and not hidden
                 and created_at > now() - interval '30 days'
               order by created_at desc limit 30) n
        join public.churches c on c.id = n.church_id
        join public.profiles s on s.id = n.sender_id
    ), '[]'::jsonb));
end;
$$;

revoke all on function public.my_church_check_ins() from public, anon;
grant execute on function public.my_church_check_ins() to authenticated;

-- ---------------------------------------------------------------------------
-- report_church_check_in — the recipient, about their own note. Takes it out
-- of their mailbox pending an operator's look. Grants nothing, stores no
-- reason, tells the sender nothing, and blocks nobody.
-- ---------------------------------------------------------------------------
create or replace function public.report_church_check_in(p_id bigint)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  n int;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  update public.church_check_ins
     set reported_at = now()
   where id = p_id and recipient_id = uid and reported_at is null and not hidden;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n > 0);
end;
$$;

revoke all on function public.report_church_check_in(bigint) from public, anon;
grant execute on function public.report_church_check_in(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- Operator queue — Admin → Check-ins. Same two outcomes as the Prayer Wall:
-- Keep clears the report (the note goes back in the member's mailbox), Take
-- down hides it for good.
-- ---------------------------------------------------------------------------
create or replace function public.admin_church_check_in_reports()
returns jsonb
language plpgsql
stable security definer set search_path = public
as $$
begin
  perform public.require_admin();
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', n.id,
      'message', n.message,
      'verse_ref', n.verse_ref,
      'church_name', c.name,
      'sender', s.username,
      'recipient', r.username,
      'reported_at', n.reported_at,
      'created_at', n.created_at
    ) order by n.reported_at desc), '[]'::jsonb)
    from public.church_check_ins n
    join public.churches c on c.id = n.church_id
    join public.profiles s on s.id = n.sender_id
    join public.profiles r on r.id = n.recipient_id
    where n.reported_at is not null and not n.hidden
  );
end;
$$;

create or replace function public.admin_resolve_church_check_in_report(p_id bigint, p_hide boolean)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.require_admin();
  if p_hide then
    update public.church_check_ins set hidden = true where id = p_id;
  else
    update public.church_check_ins set reported_at = null where id = p_id;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_church_check_in_reports() from public, anon;
grant execute on function public.admin_church_check_in_reports() to authenticated;
revoke all on function public.admin_resolve_church_check_in_report(bigint, boolean) from public, anon;
grant execute on function public.admin_resolve_church_check_in_report(bigint, boolean) to authenticated;

notify pgrst, 'reload schema';
