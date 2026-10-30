-- 0170: are the come-back emails (0169) actually going out?
--
-- One read for Admin -> Email, built like 0165's push receipt: push-send
-- stamps `email_runs` after EVERY hourly pass — a run that found nobody due,
-- a run with no Resend key, a run where Resend refused some — so "last run"
-- means the function ran, not that pg_cron queued a request. A row is counts
-- and a reason: no recipient, no address, no verse. One row an hour, kept.
--
-- admin_email_status() (require_admin) adds what the profiles say: how many
-- players have been emailed for an absence, how many switched the email off,
-- and how many are in range right now (7-60 days away, no push device, an
-- address, not switched off, not yet emailed for this absence) — the people
-- the next runs will reach at their hour. Counts only.

create table if not exists public.email_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  kind text not null check (kind in ('comeback')),
  due int not null default 0,
  sent int not null default 0,
  failed int not null default 0,
  reason text check (reason is null or length(reason) <= 40)
);
create index if not exists email_runs_ran_at on public.email_runs (ran_at desc);
alter table public.email_runs enable row level security;
revoke all on table public.email_runs from public, anon, authenticated;
grant all on table public.email_runs to service_role;

create or replace function public.email_run_note(p_kind text, p_due int, p_sent int, p_failed int, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_kind is null or p_kind not in ('comeback') then raise exception 'bad kind'; end if;
  insert into email_runs (kind, due, sent, failed, reason)
  values (p_kind, greatest(coalesce(p_due, 0), 0), greatest(coalesce(p_sent, 0), 0),
          greatest(coalesce(p_failed, 0), 0), left(nullif(btrim(p_reason), ''), 40));
end $$;
revoke all on function public.email_run_note(text, int, int, int, text) from public, anon, authenticated;
grant execute on function public.email_run_note(text, int, int, int, text) to service_role;

create or replace function public.admin_email_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  runs jsonb;
  last_run jsonb;
  people jsonb;
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
    'emailed_ever', count(*) filter (where p.comeback_emailed_for is not null),
    'switched_off', count(*) filter (where p.email_prefs->>'comeback' = 'false'),
    'in_range', count(*) filter (where
        p.last_played_on is not null
        and p.last_played_on between (now() at time zone coalesce(p.week_push->>'tz', 'America/New_York'))::date - 60
                                 and (now() at time zone coalesce(p.week_push->>'tz', 'America/New_York'))::date - 7
        and p.comeback_emailed_for is distinct from p.last_played_on
        and coalesce(p.email_prefs->>'comeback', 'true') <> 'false'
        and exists (select 1 from auth.users u where u.id = p.id and nullif(btrim(u.email), '') is not null and u.deleted_at is null)
        and not exists (select 1 from push_subscriptions s where s.profile_id = p.id)
        and not exists (select 1 from device_tokens d where d.profile_id = p.id and d.platform = 'ios'))
  ) into people from profiles p;

  return runs || people || jsonb_build_object('last_run', last_run);
end $$;
revoke all on function public.admin_email_status() from public, anon;
grant execute on function public.admin_email_status() to authenticated;
