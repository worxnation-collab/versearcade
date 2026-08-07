-- Guest (unauthenticated) daily activity, so the ambient "opened today" pulse
-- reflects EVERYONE who plays, not only signed-in users. Without this, guests
-- play entirely on-device and never appear, making a used app look dead.
-- Deduped per (day, guest device id) so one guest counts once per day.
create table if not exists public.guest_opens (
  drop_date    date not null,
  guest_id     uuid not null,
  username     text not null default 'guest',
  avatar_emoji text not null default '📖',
  score        integer not null default 0,
  created_at   timestamptz not null default now(),
  primary key (drop_date, guest_id)
);
alter table public.guest_opens enable row level security;
-- No RLS policies on purpose: only the SECURITY DEFINER RPC below may touch it.

-- Record a guest's play for the day. Callable by anon (guests have no session).
-- Sanitizes input, dedupes by device, and adds a single feed entry on first play.
create or replace function public.record_guest_open(
  p_drop_date date,
  p_guest_id uuid,
  p_username text,
  p_emoji text,
  p_score integer
) returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_name  text := left(coalesce(nullif(trim(p_username), ''), 'guest'), 24);
  v_emoji text := coalesce(nullif(p_emoji, ''), '📖');
  v_score integer := greatest(0, least(coalesce(p_score, 0), 100000));
  v_is_new boolean;
begin
  if p_guest_id is null then return; end if;
  insert into public.guest_opens (drop_date, guest_id, username, avatar_emoji, score)
  values (p_drop_date, p_guest_id, v_name, v_emoji, v_score)
  on conflict (drop_date, guest_id)
  do update set score = greatest(public.guest_opens.score, excluded.score),
                username = excluded.username,
                avatar_emoji = excluded.avatar_emoji
  returning (xmax = 0) into v_is_new; -- xmax = 0 means a fresh insert
  if v_is_new then
    insert into public.presence_events (drop_date, username, avatar_emoji, points, kind)
    values (p_drop_date, v_name, v_emoji, v_score, 'scored');
  end if;
end;
$$;
grant execute on function public.record_guest_open(date, uuid, text, text, integer) to anon, authenticated;

-- Pulse now counts signed-in plays + guest plays for the day.
create or replace function public.get_daily_pulse(p_drop_date date)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_opened integer;
  v_feed json;
begin
  select (select count(*) from public.plays where drop_date = p_drop_date)
       + (select count(*) from public.guest_opens where drop_date = p_drop_date)
    into v_opened;
  select coalesce(json_agg(row_to_json(t)), '[]'::json) into v_feed
  from (
    select username, avatar_emoji, points, kind, created_at
    from public.presence_events
    where drop_date = p_drop_date
    order by created_at desc
    limit 40
  ) t;
  return json_build_object('opened', v_opened, 'feed', v_feed);
end;
$$;
grant execute on function public.get_daily_pulse(date) to anon, authenticated;
