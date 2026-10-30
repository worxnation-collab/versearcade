-- 0174: did the come-back email bring anybody back?
--
-- Every email push-send sends now carries its own random id in the link
-- (`/play/run?e=<id>`), recorded here once Resend accepts it. Tapping it lands
-- straight in today's run, and the app reports the tap through
-- `note_email_click` — anon-callable, keyed ONLY by that unguessable id, the
-- 0169 unsubscribe-token shape: it can stamp one click time on one send and
-- nothing else, and it answers the same whether or not the id matched.
--
-- What the operator sees (admin_email_status, restated from 0171 with one
-- more block) is counts: come-back sends in the last 30 days, how many were
-- tapped, and how many of those players played within three days (tapped or
-- not — a reminder can work without the tap). No address,
-- no name. The operator's test email carries no id, so it is never counted.

create table if not exists public.email_sends (
  id uuid primary key,
  user_id uuid not null,
  kind text not null check (kind in ('comeback', 'welcome')),
  sent_at timestamptz not null default now(),
  clicked_at timestamptz
);
create index if not exists email_sends_sent on public.email_sends (kind, sent_at desc);
alter table public.email_sends enable row level security;
revoke all on table public.email_sends from public, anon, authenticated;
grant all on table public.email_sends to service_role;

create or replace function public.email_send_note(p_id uuid, p_user uuid, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_id is null or p_user is null or p_kind is null or p_kind not in ('comeback', 'welcome') then
    raise exception 'bad input';
  end if;
  insert into email_sends (id, user_id, kind) values (p_id, p_user, p_kind)
  on conflict (id) do nothing;
end $$;
revoke all on function public.email_send_note(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.email_send_note(uuid, uuid, text) to service_role;

create or replace function public.note_email_click(p_send uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_send is not null then
    update email_sends set clicked_at = now() where id = p_send and clicked_at is null;
  end if;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.note_email_click(uuid) to anon, authenticated;

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

  -- Did the come-back emails bring anybody back? Sends of the last 30 days:
  -- how many tapped the link, and how many played within three days of the
  -- send — tapped or not, since a reminder can work without the tap.
  select jsonb_build_object(
    'sends_30d',    count(*),
    'clicked_30d',  count(*) filter (where e.clicked_at is not null),
    'returned_30d', count(*) filter (where exists (
        select 1 from plays pl where pl.user_id = e.user_id
           and pl.created_at > e.sent_at and pl.created_at <= e.sent_at + interval '3 days'))
  ) into sends from email_sends e where e.kind = 'comeback' and e.sent_at > now() - interval '30 days';

  select jsonb_build_object(
    'emailed_ever', count(*) filter (where p.comeback_emailed_for is not null),
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

revoke all on function public.admin_email_status() from public, anon;
grant execute on function public.admin_email_status() to authenticated;
