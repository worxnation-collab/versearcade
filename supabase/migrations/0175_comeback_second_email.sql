-- 0175: a second come-back email, for players the first one did not bring back.
--
-- The first (0169) goes once per absence at day 7-60. This one goes once per
-- absence too, only if the first went for THIS absence (comeback_emailed_for
-- = last_played_on — playing again moves last_played_on, so anybody the first
-- email brought back is never sent the second), at least 14 days after the
-- first, and only while the player is 21-60 days away. Same switch (the
-- `comeback` pref and its unsubscribe link), same suppression list, same hour,
-- same no-push-device rule. Its own stamp, `comeback2_emailed_for`.
--
-- To know "14 days after the first" the first claim now stamps
-- `comeback_emailed_at` (restated from 0171, one more column set). No first
-- email had gone out when this shipped, so no backfill is needed; a stamp
-- with no time is simply never second-emailed.
--
-- Tracking: `email_sends.step` (1 or 2) — `email_send_note` (restated from
-- 0174, same signature) takes 'comeback2' and files it as kind 'comeback',
-- step 2, so the kind check constraint is untouched. admin_email_status
-- (restated from 0174) returns the second email's 30-day sends / taps /
-- returns under `second`, beside the first's.

alter table public.profiles add column if not exists comeback_emailed_at timestamptz;
alter table public.profiles add column if not exists comeback2_emailed_for date;
alter table public.email_sends add column if not exists step smallint not null default 1 check (step in (1, 2));

create or replace function public.comeback_email_claim(p_limit int)
returns table (recipient uuid, email text, local_day date, token uuid)
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
  cap int := greatest(1, least(coalesce(p_limit, 200), 500));
begin
  for r in
    select p.id, p.last_played_on, u.email as addr, p.email_token,
           (now() at time zone coalesce(p.week_push->>'tz', 'America/New_York'))::date as today
      from profiles p join auth.users u on u.id = p.id
     where p.last_played_on is not null
       and p.last_played_on <= (now() at time zone coalesce(p.week_push->>'tz', 'America/New_York'))::date - 7
       and p.last_played_on >= (now() at time zone coalesce(p.week_push->>'tz', 'America/New_York'))::date - 60
       and p.comeback_emailed_for is distinct from p.last_played_on
       and coalesce((p.email_prefs->>'comeback')::boolean, true)
       and extract(hour from now() at time zone coalesce(p.week_push->>'tz', 'America/New_York'))
           = coalesce((p.week_push->>'hour')::int, 10)
       and coalesce(u.email, '') <> '' and u.deleted_at is null
       and not exists (select 1 from push_subscriptions s where s.profile_id = p.id)
       and not exists (select 1 from device_tokens d where d.profile_id = p.id and d.platform = 'ios')
       and not exists (select 1 from email_suppressions x where x.email_hash = public.email_hash(u.email))
     for update of p skip locked
  loop
    exit when n >= cap;
    update profiles set comeback_emailed_for = r.last_played_on, comeback_emailed_at = now() where id = r.id;
    recipient := r.id; email := r.addr; local_day := r.today; token := r.email_token;
    n := n + 1;
    return next;
  end loop;
end $$;

create or replace function public.comeback2_email_claim(p_limit int)
returns table (recipient uuid, email text, local_day date, token uuid)
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
  cap int := greatest(1, least(coalesce(p_limit, 200), 500));
begin
  for r in
    select p.id, p.last_played_on, u.email as addr, p.email_token,
           (now() at time zone coalesce(p.week_push->>'tz', 'America/New_York'))::date as today
      from profiles p join auth.users u on u.id = p.id
     where p.last_played_on is not null
       and p.last_played_on <= (now() at time zone coalesce(p.week_push->>'tz', 'America/New_York'))::date - 21
       and p.last_played_on >= (now() at time zone coalesce(p.week_push->>'tz', 'America/New_York'))::date - 60
       and p.comeback_emailed_for = p.last_played_on
       and p.comeback_emailed_at <= now() - interval '14 days'
       and p.comeback2_emailed_for is distinct from p.last_played_on
       and coalesce((p.email_prefs->>'comeback')::boolean, true)
       and extract(hour from now() at time zone coalesce(p.week_push->>'tz', 'America/New_York'))
           = coalesce((p.week_push->>'hour')::int, 10)
       and coalesce(u.email, '') <> '' and u.deleted_at is null
       and not exists (select 1 from push_subscriptions s where s.profile_id = p.id)
       and not exists (select 1 from device_tokens d where d.profile_id = p.id and d.platform = 'ios')
       and not exists (select 1 from email_suppressions x where x.email_hash = public.email_hash(u.email))
     for update of p skip locked
  loop
    exit when n >= cap;
    update profiles set comeback2_emailed_for = r.last_played_on where id = r.id;
    recipient := r.id; email := r.addr; local_day := r.today; token := r.email_token;
    n := n + 1;
    return next;
  end loop;
end $$;

create or replace function public.email_send_note(p_id uuid, p_user uuid, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_id is null or p_user is null or p_kind is null or p_kind not in ('comeback', 'comeback2', 'welcome') then
    raise exception 'bad input';
  end if;
  insert into email_sends (id, user_id, kind, step)
  values (p_id, p_user, case when p_kind = 'comeback2' then 'comeback' else p_kind end,
          case when p_kind = 'comeback2' then 2 else 1 end)
  on conflict (id) do nothing;
end $$;

create or replace function public.admin_email_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  runs jsonb;
  last_run jsonb;
  people jsonb;
  events jsonb;
  sends jsonb;
begin
  perform public.require_admin();

  select jsonb_build_object(
    'runs_24h',   count(*),
    'sent_24h',   coalesce(sum(sent), 0),
    'failed_24h', coalesce(sum(failed), 0),
    'last_sent',  (select max(ran_at) from email_runs where kind = 'comeback' and sent > 0)
  ) into runs from email_runs where kind = 'comeback' and ran_at > now() - interval '24 hours';

  select jsonb_build_object('at', ran_at, 'due', due, 'sent', sent, 'failed', failed, 'reason', reason)
    into last_run from email_runs where kind = 'comeback' order by ran_at desc limit 1;

  select jsonb_build_object(
    'bounced_7d',    count(*) filter (where kind = 'bounce_permanent' and at > now() - interval '7 days'),
    'soft_7d',       count(*) filter (where kind = 'bounce_transient' and at > now() - interval '7 days'),
    'complained_7d', count(*) filter (where kind = 'complaint' and at > now() - interval '7 days'),
    'last_event',    max(at),
    'suppressed',    (select count(*) from email_suppressions)
  ) into events from email_events;

  -- Did the come-back emails bring anybody back? Sends of the last 30 days,
  -- the first email (day 7) and the second (day 21) side by side: how many
  -- tapped the link, and how many played within three days of the send —
  -- tapped or not, since a reminder can work without the tap. The flat
  -- sends_30d / clicked_30d / returned_30d keys stay the FIRST email's.
  with s as (
    select e.step, e.clicked_at, exists (
             select 1 from plays pl where pl.user_id = e.user_id
                and pl.created_at > e.sent_at and pl.created_at <= e.sent_at + interval '3 days') as returned
      from email_sends e where e.kind = 'comeback' and e.sent_at > now() - interval '30 days')
  select jsonb_build_object(
    'sends_30d',    count(*) filter (where step = 1),
    'clicked_30d',  count(*) filter (where step = 1 and clicked_at is not null),
    'returned_30d', count(*) filter (where step = 1 and returned),
    'second', jsonb_build_object(
      'sends_30d',    count(*) filter (where step = 2),
      'clicked_30d',  count(*) filter (where step = 2 and clicked_at is not null),
      'returned_30d', count(*) filter (where step = 2 and returned))
  ) into sends from s;

  select jsonb_build_object(
    'emailed_ever', count(*) filter (where p.comeback_emailed_for is not null),
    'emailed_second_ever', count(*) filter (where p.comeback2_emailed_for is not null),
    'switched_off', count(*) filter (where p.email_prefs->>'comeback' = 'false'),
    'in_range', count(*) filter (where
        p.last_played_on is not null
        and p.last_played_on between (now() at time zone coalesce(p.week_push->>'tz', 'America/New_York'))::date - 60
                                 and (now() at time zone coalesce(p.week_push->>'tz', 'America/New_York'))::date - 7
        and p.comeback_emailed_for is distinct from p.last_played_on
        and coalesce(p.email_prefs->>'comeback', 'true') <> 'false'
        and exists (select 1 from auth.users u where u.id = p.id and nullif(btrim(u.email), '') is not null and u.deleted_at is null
                      and not exists (select 1 from email_suppressions x where x.email_hash = public.email_hash(u.email)))
        and not exists (select 1 from push_subscriptions s where s.profile_id = p.id)
        and not exists (select 1 from device_tokens d where d.profile_id = p.id and d.platform = 'ios'))
  ) into people from profiles p;

  return runs || people || events || sends || jsonb_build_object('last_run', last_run);
end $$;

revoke all on function public.comeback_email_claim(int) from public, anon, authenticated;
grant execute on function public.comeback_email_claim(int) to service_role;
revoke all on function public.comeback2_email_claim(int) from public, anon, authenticated;
grant execute on function public.comeback2_email_claim(int) to service_role;
revoke all on function public.email_send_note(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.email_send_note(uuid, uuid, text) to service_role;
revoke all on function public.admin_email_status() from public, anon;
grant execute on function public.admin_email_status() to authenticated;
