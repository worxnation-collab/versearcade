-- 0164: quiet hours. A push that would land overnight WAITS for morning.
--
-- Six things can push a player now (0156-0162), and every one of them is a
-- note from another person — which is exactly the kind that arrives at 11pm
-- because that is when somebody else was awake. So a player can set quiet
-- hours (say 9pm-7am) in their OWN time zone, and push-send honours them
-- server-side: inside the window a note is parked here, and a pg_cron job every
-- fifteen minutes sends what has come due. Nothing is dropped; it is late by
-- at most the length of the night, plus a quarter hour.
--
-- Off by default (null), so nothing changes for anybody who never opens it.
-- The zone is sent by the client when the setting is saved and validated here;
-- a player who moves re-saves it. The operator broadcast is not covered — it
-- is sent at a time a person chose.
--
-- The queue holds a note's words only until it is sent: the claim stamps
-- `sent_at` and empties `note` in the same statement, so a sent row carries no
-- name and nothing about anybody. RLS on with no rule: only service_role
-- (push-send) ever reads or writes it.

alter table public.profiles
  add column if not exists quiet_hours jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_quiet_hours_object') then
    alter table public.profiles
      add constraint profiles_quiet_hours_object
      check (quiet_hours is null or jsonb_typeof(quiet_hours) = 'object');
  end if;
end $$;

create table if not exists public.push_deferred (
  id bigserial primary key,
  recipient uuid not null,
  kind text not null,
  tag text not null,
  note jsonb not null,
  deliver_after timestamptz not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
alter table public.push_deferred enable row level security;
revoke all on table public.push_deferred from public, anon, authenticated;
grant all on table public.push_deferred to service_role;
grant usage, select on sequence public.push_deferred_id_seq to service_role;

-- One waiting note per (person, tag): two washings by the same friend in one
-- night are one push in the morning, the way a device collapses a tag anyway.
create unique index if not exists push_deferred_waiting
  on public.push_deferred (recipient, tag) where sent_at is null;
create index if not exists push_deferred_due
  on public.push_deferred (deliver_after) where sent_at is null;

-- The caller's setting. Times are local wall-clock 'HH:MM'.
create or replace function public.my_quiet_hours()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  q jsonb;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select quiet_hours into q from profiles where id = uid;
  if q is null then
    return jsonb_build_object('on', false, 'start', '21:00', 'end', '07:00', 'tz', null);
  end if;
  return jsonb_build_object('on', true, 'start', q->>'start', 'end', q->>'end', 'tz', q->>'tz');
end $$;

create or replace function public.set_quiet_hours(p_on boolean, p_start text, p_end text, p_tz text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  ok_tz boolean;
begin
  if uid is null then raise exception 'not signed in'; end if;
  if p_on is null then return jsonb_build_object('ok', false, 'reason', 'bad_value'); end if;
  if not p_on then
    update profiles set quiet_hours = null where id = uid;
    return jsonb_build_object('ok', true, 'quiet', public.my_quiet_hours());
  end if;
  if p_start is null or p_end is null
     or p_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     or p_end !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_time');
  end if;
  if p_start = p_end then return jsonb_build_object('ok', false, 'reason', 'empty_window'); end if;
  -- Taken into a variable once, never left in a predicate (the 0089 lesson).
  select exists (select 1 from pg_timezone_names where name = p_tz) into ok_tz;
  if p_tz is null or not ok_tz then return jsonb_build_object('ok', false, 'reason', 'bad_tz'); end if;
  update profiles
     set quiet_hours = jsonb_build_object('start', p_start, 'end', p_end, 'tz', p_tz)
   where id = uid;
  return jsonb_build_object('ok', true, 'quiet', public.my_quiet_hours());
end $$;

-- When this person's quiet hours END, if they are inside them right now; null
-- if they have none or it is daytime for them. push-send asks before sending.
create or replace function public.push_quiet_until(p_user uuid)
returns timestamptz language plpgsql stable security definer set search_path = public as $$
declare
  q jsonb;
  tz text;
  s time;
  e time;
  local_now timestamp;
  t time;
  inside boolean;
  end_day date;
begin
  select quiet_hours into q from profiles where id = p_user;
  if q is null then return null; end if;
  tz := q->>'tz';
  begin
    s := (q->>'start')::time;
    e := (q->>'end')::time;
    local_now := now() at time zone tz;
  exception when others then
    return null;  -- a setting that cannot be read never holds a note back
  end;
  t := local_now::time;
  if s < e then inside := t >= s and t < e;
  else inside := t >= s or t < e;
  end if;
  if not inside then return null; end if;
  end_day := local_now::date + case when t < e then 0 else 1 end;
  return (end_day + e) at time zone tz;
end $$;

create or replace function public.push_defer(p_user uuid, p_kind text, p_note jsonb, p_after timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if p_user is null or p_note is null or p_after is null then return false; end if;
  insert into push_deferred (recipient, kind, tag, note, deliver_after)
  values (p_user, coalesce(p_kind, ''), coalesce(p_note->>'tag', ''), p_note, p_after)
  on conflict (recipient, tag) where sent_at is null
  do update set note = excluded.note, kind = excluded.kind;
  return true;
end $$;

-- Hand out what has come due, once: stamped and emptied in one statement, and
-- SKIP LOCKED so two overlapping runs never send the same note twice.
create or replace function public.push_deferred_claim(p_limit int)
returns table (recipient uuid, kind text, note jsonb)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with due as (
    select d.id, d.recipient, d.kind, d.note from push_deferred d
     where d.sent_at is null and d.deliver_after <= now()
     order by d.deliver_after
     limit greatest(1, least(coalesce(p_limit, 200), 500))
     for update skip locked
  ), done as (
    update push_deferred p set sent_at = now(), note = '{}'::jsonb
      from due where p.id = due.id
    returning p.id
  )
  select due.recipient, due.kind, due.note from due join done on done.id = due.id;
end $$;

create or replace function public.push_cron_secret()
returns text language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'PUSH_CRON_TOKEN' limit 1;
$$;

revoke all on function public.push_quiet_until(uuid) from public, anon, authenticated;
revoke all on function public.push_defer(uuid, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.push_deferred_claim(int) from public, anon, authenticated;
revoke all on function public.push_cron_secret() from public, anon, authenticated;
grant execute on function public.push_quiet_until(uuid) to service_role;
grant execute on function public.push_defer(uuid, text, jsonb, timestamptz) to service_role;
grant execute on function public.push_deferred_claim(int) to service_role;
grant execute on function public.push_cron_secret() to service_role;
revoke all on function public.my_quiet_hours() from public, anon;
revoke all on function public.set_quiet_hours(boolean, text, text, text) from public, anon;
grant execute on function public.my_quiet_hours() to authenticated;
grant execute on function public.set_quiet_hours(boolean, text, text, text) to authenticated;
