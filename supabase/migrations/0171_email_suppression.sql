-- 0171: Resend bounces and complaints, and the addresses we stop mailing.
--
-- Resend posts delivery events to the `resend-webhook` Edge Function (signed
-- with Svix; the function checks the signature against RESEND_WEBHOOK_SECRET
-- before it reads a word). Two kinds matter here:
--
--   • email.bounced with bounce.type 'Permanent' — the address does not
--     exist. Mailing it again is the fastest way for a new sending domain to
--     be marked as spam for everybody.
--   • email.complained — the recipient pressed "this is spam". That is a
--     no, louder than an unsubscribe, and it is final.
--
-- Either one SUPPRESSES the address for every email this app sends: the
-- come-back email (0169) and the leaders' Tuesday digest (0154/0157). A
-- transient bounce (mailbox full, greylisted) is recorded and counted but does
-- not suppress — the next send may well land.
--
-- The address is never stored. `email_suppressions` keys on
-- sha256(lower(trim(address))) — enough to recognise the address the next time
-- a claim reads auth.users, and nothing anybody can read an address back out
-- of. `email_events` keeps one row per Svix message id (so a retried webhook is
-- a no-op) with its type and time: counts for Admin -> Email, no recipient.

create table if not exists public.email_suppressions (
  email_hash text primary key check (email_hash ~ '^[0-9a-f]{64}$'),
  reason text not null check (reason in ('bounce', 'complaint')),
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now()
);
alter table public.email_suppressions enable row level security;
revoke all on table public.email_suppressions from public, anon, authenticated;
grant all on table public.email_suppressions to service_role;

create table if not exists public.email_events (
  event_id text primary key check (length(event_id) between 1 and 120),
  kind text not null check (kind in ('bounce_permanent', 'bounce_transient', 'complaint')),
  at timestamptz not null default now()
);
create index if not exists email_events_at on public.email_events (at desc);
alter table public.email_events enable row level security;
revoke all on table public.email_events from public, anon, authenticated;
grant all on table public.email_events to service_role;

create or replace function public.email_hash(p_email text)
returns text language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(lower(btrim(coalesce(p_email, ''))), 'UTF8')), 'hex')
$$;

create or replace function public.email_suppressed(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from email_suppressions where email_hash = public.email_hash(p_email))
$$;

-- The webhook's one writer. p_kind is what the function decoded; the address
-- arrives here, is hashed, and is not kept. Idempotent per event id.
create or replace function public.email_event_note(p_event_id text, p_kind text, p_email text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_hash text;
  v_reason text;
begin
  if p_event_id is null or length(p_event_id) not between 1 and 120 then raise exception 'bad event'; end if;
  if p_kind is null or p_kind not in ('bounce_permanent', 'bounce_transient', 'complaint') then raise exception 'bad kind'; end if;

  insert into email_events (event_id, kind) values (p_event_id, p_kind)
  on conflict (event_id) do nothing;
  if not found then return jsonb_build_object('ok', true, 'duplicate', true); end if;

  if p_kind = 'bounce_transient' or nullif(btrim(coalesce(p_email, '')), '') is null then
    return jsonb_build_object('ok', true, 'suppressed', false);
  end if;

  v_hash := public.email_hash(p_email);
  v_reason := case p_kind when 'complaint' then 'complaint' else 'bounce' end;
  insert into email_suppressions (email_hash, reason) values (v_hash, v_reason)
  on conflict (email_hash) do update
    set last_at = now(),
        -- a complaint outranks a bounce; nothing downgrades one
        reason = case when email_suppressions.reason = 'complaint' then 'complaint' else excluded.reason end;
  return jsonb_build_object('ok', true, 'suppressed', true);
end $$;

-- 0169's claim, restated with ONE more condition: a suppressed address is
-- never handed out (and so never stamped either).
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
    update profiles set comeback_emailed_for = r.last_played_on where id = r.id;
    recipient := r.id; email := r.addr; local_day := r.today; token := r.email_token;
    n := n + 1;
    return next;
  end loop;
end $$;

-- 0157's digest due list, restated with the same one condition.
create or replace function public.church_digest_due(p_now timestamptz default now())
returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'church_id', x.church_id, 'user_id', x.user_id, 'email', x.email,
           'week', x.week, 'today', x.today)), '[]'::jsonb)
  from (
    select o.church_id, o.user_id, u.email,
           (lt::date - ((extract(isodow from lt)::int) - 1)) as week,
           lt::date as today,
           o.last_sent_week, lt
      from public.church_digest_optins o
      join public.church_admins a on a.church_id = o.church_id and a.user_id = o.user_id
      join public.churches c on c.id = o.church_id
      join auth.users u on u.id = o.user_id
      cross join lateral (select p_now at time zone public.church_digest_tz(o.church_id) as lt) t
     where o.enabled
       and public.church_is_verified(o.church_id)
       and coalesce(u.email, '') <> ''
       and not exists (select 1 from public.email_suppressions s where s.email_hash = public.email_hash(u.email))
  ) x
  where extract(isodow from x.lt) = 2
    and extract(hour from x.lt) >= 8
    and x.last_sent_week is distinct from x.week;
$$;

-- 0170's admin read, restated: the webhook's counts, and in-range excludes
-- the suppressed.
create or replace function public.admin_email_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  runs jsonb;
  last_run jsonb;
  people jsonb;
  events jsonb;
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

  return runs || people || events || jsonb_build_object('last_run', last_run);
end $$;

-- The webhook's signing secret, out of Vault (the 0154 helper's allowlist,
-- restated with one more name).
create or replace function public.church_digest_secret(p_name text)
returns text
language sql stable security definer set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets
   where name = p_name and p_name in ('RESEND_API_KEY', 'DIGEST_CRON_TOKEN', 'RESEND_WEBHOOK_SECRET')
   limit 1;
$$;

revoke all on function public.email_hash(text) from public, anon, authenticated;
revoke all on function public.email_suppressed(text) from public, anon, authenticated;
revoke all on function public.email_event_note(text, text, text) from public, anon, authenticated;
revoke all on function public.comeback_email_claim(int) from public, anon, authenticated;
revoke all on function public.church_digest_due(timestamptz) from public, anon, authenticated;
revoke all on function public.church_digest_secret(text) from public, anon, authenticated;
grant execute on function public.email_hash(text) to service_role;
grant execute on function public.email_suppressed(text) to service_role;
grant execute on function public.email_event_note(text, text, text) to service_role;
grant execute on function public.comeback_email_claim(int) to service_role;
grant execute on function public.church_digest_due(timestamptz) to service_role;
grant execute on function public.church_digest_secret(text) to service_role;
revoke all on function public.admin_email_status() from public, anon;
grant execute on function public.admin_email_status() to authenticated;
