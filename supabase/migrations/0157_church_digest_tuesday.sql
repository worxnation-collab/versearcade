-- 0157 — the digest moves from Monday 08:00 to TUESDAY 08:00, the church's
-- clock (the owner's call, 2026-10-28). docs/CHURCH-DIGEST.md.
--
-- Why: Autopilot's default cutoff is Monday 21:00 (0152), so a Monday-morning
-- digest went out before the week it was about had been drafted, and said
-- "no drafts" about a week Autopilot was about to fill that night. On Tuesday
-- morning the drafts are there to approve.
--
-- Two changes, nothing else:
--   • `church_digest_due` restated with isodow = 2. `week` is still that
--     week's MONDAY date, so `last_sent_week` keeps meaning "this week" and a
--     leader can never get two in one week across the switch.
--   • the cron job: the old 'church-digest-monday' is unscheduled and
--     'church-digest-tuesday' posts hourly Monday-Wednesday UTC, the span in
--     which every time zone's Tuesday 08:00 falls.

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
  ) x
  where extract(isodow from x.lt) = 2
    and extract(hour from x.lt) >= 8
    and x.last_sent_week is distinct from x.week;
$$;
revoke all on function public.church_digest_due(timestamptz) from public, anon, authenticated;
grant execute on function public.church_digest_due(timestamptz) to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'church-digest-monday') then
    perform cron.unschedule('church-digest-monday');
  end if;
end $$;

select cron.schedule(
  'church-digest-tuesday',
  '7 * * * 1,2,3',
  $cron$
    select net.http_post(
      url := 'https://visuppaucpzzigwtqmdd.supabase.co/functions/v1/church-digest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-digest-token', (select decrypted_secret from vault.decrypted_secrets where name = 'DIGEST_CRON_TOKEN')),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000);
  $cron$
);
