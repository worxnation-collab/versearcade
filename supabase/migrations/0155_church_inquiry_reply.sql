-- 0155 — a church's leadership can answer a join inquiry (0149).
-- docs/CHURCH-DISCOVERY.md → "Replying".
--
-- The inquiry already holds the player's note; the reply sits on the SAME row
-- (one per inquiry, by construction: it is a column, not a table). It is
-- written only by `reply_church_join_inquiry`, gated by `church_admin_can`
-- for THAT church — verified leadership; a free claim and every member are
-- refused — and read by exactly two people's paths: that church's leadership
-- (the restated `church_join_inquiry_list`) and the player who asked
-- (`my_church_join_replies`, `my_church_join_inquiry`). Nobody else, no board,
-- no count beyond the list that already existed.
--
-- The reply is the church's voice, not one leader's: no author is stored, so
-- nothing about who answered can outlive a leader's account.
--
-- A player who has since joined a church (this one or another) still receives
-- it; the leader's list already says so, and the reply's answer repeats it so
-- the screen can tell the leader where the note will land.

alter table public.church_join_inquiries add column if not exists reply text;
alter table public.church_join_inquiries add column if not exists replied_at timestamptz;
alter table public.church_join_inquiries add column if not exists reply_seen_at timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'church_join_inquiries_reply_len') then
    alter table public.church_join_inquiries add constraint church_join_inquiries_reply_len
      check (reply is null or char_length(reply) between 2 and 280);
  end if;
end $$;

create or replace function public.reply_church_join_inquiry(p_church_id uuid, p_username text, p_message text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_gate  text := public.church_admin_can(p_church_id);
  v_user  uuid;
  v_church uuid;
  v_msg   text := public.church_clean_line(regexp_replace(coalesce(p_message, ''), '\s+', ' ', 'g'), 280);
  v_row   public.church_join_inquiries;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'not_authenticated'); end if;
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  if v_msg is null or char_length(v_msg) < 2 then return jsonb_build_object('ok', false, 'reason', 'bad_note'); end if;
  select id, church_id into v_user, v_church from public.profiles
   where lower(username) = lower(btrim(coalesce(p_username, ''))) limit 1;
  select * into v_row from public.church_join_inquiries where church_id = p_church_id and user_id = v_user;
  if v_row.user_id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_row.replied_at is not null then return jsonb_build_object('ok', false, 'reason', 'already'); end if;
  update public.church_join_inquiries
     set reply = v_msg, replied_at = now(), reply_seen_at = null
   where church_id = p_church_id and user_id = v_user and replied_at is null;
  return jsonb_build_object('ok', true,
    'joined', case when v_church is null then null when v_church = p_church_id then 'here' else 'elsewhere' end);
end;
$$;
revoke all on function public.reply_church_join_inquiry(uuid, text, text) from public, anon;
grant execute on function public.reply_church_join_inquiry(uuid, text, text) to authenticated;

-- 0149's list, restated with the reply. Same signature, same gate, same rows.
create or replace function public.church_join_inquiry_list(p_church_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_gate text := public.church_admin_can(p_church_id);
begin
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  return jsonb_build_object('ok', true, 'inquiries', coalesce((
    select jsonb_agg(x.j order by x.at desc) from (
      select i.created_at as at, jsonb_build_object(
        'username', p.username,
        'avatar_emoji', p.avatar_emoji,
        'avatar_character', p.avatar_character,
        'note', i.note,
        'at', i.created_at,
        'joined_here', p.church_id is not distinct from p_church_id,
        'joined_elsewhere', p.church_id is not null and p.church_id <> p_church_id,
        'reply', i.reply,
        'replied_at', i.replied_at
      ) as j
      from public.church_join_inquiries i
      join public.profiles p on p.id = i.user_id
      where i.church_id = p_church_id and i.dismissed_at is null
      order by i.created_at desc
      limit 50
    ) x
  ), '[]'::jsonb));
end;
$$;
revoke all on function public.church_join_inquiry_list(uuid) from public, anon;
grant execute on function public.church_join_inquiry_list(uuid) to authenticated;

-- 0149's per-church read for the asker, restated with the reply.
create or replace function public.my_church_join_inquiry(p_church_id uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object('sent', i.created_at is not null, 'at', i.created_at,
                            'reply', i.reply, 'replied_at', i.replied_at)
  from (select 1) one
  left join public.church_join_inquiries i on i.church_id = p_church_id and i.user_id = auth.uid();
$$;
revoke all on function public.my_church_join_inquiry(uuid) from public, anon;
grant execute on function public.my_church_join_inquiry(uuid) to authenticated;

-- The asker's mailbox: every church that answered them, newest first.
create or replace function public.my_church_join_replies()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  return jsonb_build_object(
    'unseen', (select count(*) from public.church_join_inquiries
                where user_id = uid and replied_at is not null and reply_seen_at is null),
    'replies', coalesce((
      select jsonb_agg(x.j order by x.at desc) from (
        select i.replied_at as at, jsonb_build_object(
          'church_id', c.id,
          'church_name', c.name,
          'note', i.note,
          'reply', i.reply,
          'replied_at', i.replied_at,
          'seen', i.reply_seen_at is not null
        ) as j
        from public.church_join_inquiries i
        join public.churches c on c.id = i.church_id
        where i.user_id = uid and i.replied_at is not null
        order by i.replied_at desc
        limit 20
      ) x
    ), '[]'::jsonb));
end;
$$;
revoke all on function public.my_church_join_replies() from public, anon;
grant execute on function public.my_church_join_replies() to authenticated;

create or replace function public.mark_church_join_replies_seen()
returns void
language sql volatile security definer set search_path = public
as $$
  update public.church_join_inquiries set reply_seen_at = now()
   where user_id = auth.uid() and replied_at is not null and reply_seen_at is null;
$$;
revoke all on function public.mark_church_join_replies_seen() from public, anon;
grant execute on function public.mark_church_join_replies_seen() to authenticated;
