-- 0156 — five small leadership tools, one migration.
--
--   A. A check-in can reach the member's phone. `church_check_ins.pushed_at`
--      and `church_check_in_push_claim(sender, church, username)`, service
--      role only: the `push-send` function calls it with the CALLER's id (from
--      their JWT), and it hands back the newest note THAT caller sent THAT
--      member in the last fifteen minutes that has not been pushed — and
--      stamps it, so one note is one push however often the client retries.
--      The note was written through `send_church_check_in` /
--      `send_group_check_in`, whose gates already ran; the claim adds no way
--      to push anything that was not sent in the app.
--
--   B. `church_quiet_series(church)` — VERIFIED leadership (church_admin_can).
--      The church's current series (or the one that finished in the last two
--      weeks) and the CURRENT members who have not played a single live day
--      of it — the same plays and the same definitions `church_series_landing`
--      (0150) uses, so "hasn't touched" is that function's "not engaged". The
--      client shows it only inside the folded "Not active this week" section.
--
--   C. `my_church_group_quiet()` — a GROUP LEADER's own members (role
--      'member') with no play in seven days: names and faces, no streak, no
--      score, no count of anything. The rule is the leadership fold's
--      (`last_on` = the later of the last daily play and the last church-verse play;
--      quiet = none, or older than today - 6). Null for anybody who leads no
--      group, and for an unverified church.
--
--   D. `send_group_check_in(username, message, attach_verse, local_date)` —
--      the check-in note, for a group leader, to a member of THEIR group only
--      (`not_in_group` otherwise). The same table, the same one-note-a-day
--      per member (whoever sends it), the same verse copy; 10 a day per group
--      leader. It lands in the member's mailbox exactly like a leader's.
--
--   E. A private "Followed up" on the pastoral prayer list (0153):
--      `church_prayer_marks.followed_up` and `follow_up_church_prayer`, and
--      `church_prayer_list` restated (same signature) with the flag. Like
--      "I've prayed", it is the leader's own, returned to nobody else, never
--      drawn on the wall, the lantern or the postcard.
--
-- No row is removed anywhere; comments avoid the words the MCP stalls on.

-- ---------------------------------------------------------------------------
-- A. Push claim
-- ---------------------------------------------------------------------------
alter table public.church_check_ins add column if not exists pushed_at timestamptz;

create or replace function public.church_check_in_push_claim(p_sender uuid, p_church_id uuid, p_username text)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_to  uuid;
  v_row public.church_check_ins;
begin
  if p_sender is null or p_church_id is null then return jsonb_build_object('ok', false, 'reason', 'bad_input'); end if;
  select id into v_to from public.profiles
   where lower(username) = lower(btrim(coalesce(p_username, ''))) and church_id = p_church_id;
  if v_to is null then return jsonb_build_object('ok', false, 'reason', 'not_member'); end if;

  update public.church_check_ins n set pushed_at = now()
   where n.id = (
     select c.id from public.church_check_ins c
      where c.church_id = p_church_id and c.sender_id = p_sender and c.recipient_id = v_to
        and c.pushed_at is null and c.reported_at is null and not c.hidden
        and c.created_at > now() - interval '15 minutes'
      order by c.created_at desc limit 1
      for update skip locked)
  returning n.* into v_row;
  if v_row.id is null then return jsonb_build_object('ok', false, 'reason', 'nothing'); end if;

  return jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'recipient_id', v_row.recipient_id,
    'church_id', v_row.church_id,
    'church_name', (select name from public.churches where id = v_row.church_id),
    'from_username', (select username from public.profiles where id = v_row.sender_id),
    'message', v_row.message,
    'verse_ref', v_row.verse_ref);
end; $$;
revoke all on function public.church_check_in_push_claim(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.church_check_in_push_claim(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- B. Which series a quiet member hasn't touched
-- ---------------------------------------------------------------------------
create or replace function public.church_quiet_series(p_church_id uuid, p_local_date date default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_gate  text := public.church_admin_can(p_church_id);
  v_today date := least(greatest(coalesce(p_local_date, current_date), current_date - 1), current_date + 1);
  v_s     record;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;

  -- 0150's series: approved, not discarded, named, in the last year, by name
  -- case-insensitively. The one in focus: the running one that started last,
  -- else the most recent that finished in the last fourteen days.
  with days as (
    select v.drop_date, btrim(v.series) as series_name, lower(btrim(v.series)) as series_key
      from public.church_verses v
     where v.church_id = p_church_id and v.status = 'approved' and v.discarded_at is null
       and nullif(btrim(coalesce(v.series, '')), '') is not null
       and v.drop_date > v_today - 365
  ), s as (
    select series_key, min(series_name) as name, min(drop_date) as start_date, max(drop_date) as end_date,
           count(*) filter (where drop_date <= v_today) as live_days
      from days group by series_key
  )
  select * into v_s from s
   where live_days > 0 and end_date >= v_today - 14
   order by (end_date >= v_today) desc, start_date desc
   limit 1;

  if v_s.series_key is null then
    return jsonb_build_object('ok', true, 'series', null, 'not_engaged', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'ok', true,
    'series', jsonb_build_object(
      'name', v_s.name, 'start_date', v_s.start_date, 'end_date', v_s.end_date,
      'status', case when v_s.end_date <= v_today then 'finished' else 'running' end),
    'not_engaged', coalesce((
      select jsonb_agg(p.username order by lower(p.username))
        from public.profiles p
       where p.church_id = p_church_id
         and not exists (
           select 1 from public.church_verse_plays pl
             join public.church_verses v on v.church_id = pl.church_id and v.drop_date = pl.drop_date
            where pl.church_id = p_church_id and pl.user_id = p.id
              and pl.drop_date <= v_today
              and v.status = 'approved' and v.discarded_at is null
              and lower(btrim(coalesce(v.series, ''))) = v_s.series_key)
    ), '[]'::jsonb));
end; $$;
revoke all on function public.church_quiet_series(uuid, date) from public, anon;
grant execute on function public.church_quiet_series(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- C. A group leader's quiet members
-- ---------------------------------------------------------------------------
create or replace function public.my_church_group_quiet(p_local_date date default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  v_today  date := least(greatest(coalesce(p_local_date, current_date), current_date - 1), current_date + 1);
  v_church uuid;
  v_group  uuid;
begin
  if uid is null then return null; end if;
  select church_id into v_church from public.profiles where id = uid;
  if v_church is null or not public.church_is_verified(v_church) then return null; end if;
  select g.id into v_group
    from public.church_group_members m
    join public.church_groups g on g.id = m.group_id and g.archived_at is null and g.church_id = v_church
   where m.church_id = v_church and m.user_id = uid and m.role = 'leader';
  if v_group is null then return null; end if;

  return jsonb_build_object(
    'group_id', v_group,
    'quiet', coalesce((
      select jsonb_agg(jsonb_build_object(
               'username', x.username, 'avatar_emoji', x.avatar_emoji, 'avatar_character', x.avatar_character)
             order by lower(x.username))
        from (
          select p.username, p.avatar_emoji, p.avatar_character,
                 greatest(p.last_played_on,
                          (select max(c.drop_date) from public.church_verse_plays c where c.user_id = p.id)) as last_on
            from public.church_group_members m
            join public.profiles p on p.id = m.user_id and p.church_id = v_church
           where m.church_id = v_church and m.group_id = v_group and m.role = 'member' and p.id <> uid
        ) x
       where x.last_on is null or x.last_on < v_today - 6
    ), '[]'::jsonb));
end; $$;
revoke all on function public.my_church_group_quiet(date) from public, anon;
grant execute on function public.my_church_group_quiet(date) to authenticated;

-- ---------------------------------------------------------------------------
-- D. A group leader's check-in, to their own group only
-- ---------------------------------------------------------------------------
create or replace function public.send_group_check_in(
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
  uid      uuid := auth.uid();
  v_church uuid;
  v_group  uuid;
  v_to     uuid;
  v_msg    text := public.church_clean_line(p_message, 280);
  v_sent   int;
  v_day    date;
  v_ref    text;
  v_text   text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select church_id into v_church from public.profiles where id = uid;
  if v_church is null then return jsonb_build_object('ok', false, 'reason', 'not_leadership'); end if;
  if not public.church_is_verified(v_church) then return jsonb_build_object('ok', false, 'reason', 'not_verified'); end if;
  select g.id into v_group
    from public.church_group_members m
    join public.church_groups g on g.id = m.group_id and g.archived_at is null and g.church_id = v_church
   where m.church_id = v_church and m.user_id = uid and m.role = 'leader';
  if v_group is null then return jsonb_build_object('ok', false, 'reason', 'not_leadership'); end if;

  select p.id into v_to
    from public.profiles p
    join public.church_group_members m on m.user_id = p.id and m.church_id = v_church and m.group_id = v_group
   where lower(p.username) = lower(btrim(coalesce(p_username, ''))) and p.church_id = v_church;
  if v_to is null then return jsonb_build_object('ok', false, 'reason', 'not_in_group'); end if;
  if v_to = uid then return jsonb_build_object('ok', false, 'reason', 'self'); end if;

  if coalesce(p_attach_verse, false) then
    v_day := coalesce(p_local_date, current_date);
    if v_day < current_date - 1 then v_day := current_date - 1; end if;
    if v_day > current_date + 1 then v_day := current_date + 1; end if;
    select cv.reference, cv.text into v_ref, v_text
      from public.church_verses cv
     where cv.church_id = v_church and cv.drop_date = v_day
       and cv.status <> 'draft' and cv.visibility = 'congregation' and cv.discarded_at is null;
    if v_ref is null then return jsonb_build_object('ok', false, 'reason', 'no_verse'); end if;
  end if;
  if v_msg is null and v_ref is null then return jsonb_build_object('ok', false, 'reason', 'empty'); end if;

  perform 1 from public.profiles where id = uid for update;
  select count(*) into v_sent from public.church_check_ins where sender_id = uid and sent_on = current_date;
  if v_sent >= 10 then return jsonb_build_object('ok', false, 'reason', 'daily_cap'); end if;

  insert into public.church_check_ins (church_id, sender_id, recipient_id, message, verse_ref, verse_text)
  values (v_church, uid, v_to, v_msg, v_ref, v_text)
  on conflict (church_id, recipient_id, sent_on) do nothing;
  if not found then return jsonb_build_object('ok', false, 'reason', 'already_today'); end if;

  return jsonb_build_object('ok', true, 'church_id', v_church);
end;
$$;
revoke all on function public.send_group_check_in(text, text, boolean, date) from public, anon;
grant execute on function public.send_group_check_in(text, text, boolean, date) to authenticated;

-- ---------------------------------------------------------------------------
-- E. "Followed up" on the pastoral prayer list
-- ---------------------------------------------------------------------------
alter table public.church_prayer_marks add column if not exists followed_up boolean not null default false;

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
      'prayed', coalesce(mk.prayed, false),
      'followed_up', coalesce(mk.followed_up, false)
    ) as j
    from public.prayer_requests r
    join public.profiles p on p.id = r.user_id
    left join public.church_prayer_marks mk on mk.leader_id = v_uid and mk.request_id = r.id
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

create or replace function public.follow_up_church_prayer(p_church_id uuid, p_request_id uuid, p_followed boolean default true)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_gate text := public.church_admin_can(p_church_id);
  v_uid  uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  if not exists (
    select 1 from public.prayer_requests r join public.profiles p on p.id = r.user_id
    where r.id = p_request_id and p.church_id = p_church_id and r.signed
      and r.withdrawn_at is null and r.reported_at is null and not r.hidden
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  insert into public.church_prayer_marks (leader_id, request_id, church_id, prayed, followed_up, updated_at)
  values (v_uid, p_request_id, p_church_id, false, coalesce(p_followed, true), now())
  on conflict (leader_id, request_id)
  do update set followed_up = excluded.followed_up, church_id = excluded.church_id, updated_at = now();

  return jsonb_build_object('ok', true, 'followed_up', coalesce(p_followed, true));
end; $$;

revoke all on function public.church_prayer_list(uuid) from public, anon;
grant execute on function public.church_prayer_list(uuid) to authenticated;
revoke all on function public.follow_up_church_prayer(uuid, uuid, boolean) from public, anon;
grant execute on function public.follow_up_church_prayer(uuid, uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
