-- 0154 — the Monday digest: an opt-in email to a verified church's leadership
-- carrying the "This week" lines Home already shows. docs/CHURCH-DIGEST.md.
--
-- What it adds:
--
--   • church_digest_optins — PER LEADER, per church: (church, leader) → on/off,
--     and the local Monday it was last sent for. Per leader because it is that
--     person's inbox: one pastor switching it on must not start emailing a
--     co-leader who never asked. A leader of two churches decides for each.
--
--   • church_digest_setting / set_church_digest — the toggle, for VERIFIED
--     leadership of that church only (`church_admin_can`). A free claim
--     (unverified) is refused, exactly like every named read.
--
--   • church_digest_build(church, leader, local_date) — service_role only. It
--     reads the SAME RPCs Home reads (church_auto_weeks, church_autopilot,
--     church_verses_range, church_join_inquiry_list, church_leader_insights)
--     AS THAT LEADER, so their own gates decide: a leader who was removed, or
--     a church that lost verification, gets `not_leadership` / `not_verified`
--     back and no email. It returns only what the email uses: the current
--     sermon-week job, whether Autopilot skipped, each draft's date and flag
--     count, how many inquiries are waiting (no names, no notes) and how many
--     members are quiet (no names). The row WORDING is the shared builder
--     (supabase/functions/church-digest/home.ts) that Home itself uses.
--
--   • church_digest_due() — service_role only: the opted-in leaders whose
--     church's local clock reads Monday 08:00 or later and who have not been
--     sent this Monday's digest, with the address from auth.users. A removed
--     leader or an unverified church never appears.
--
--   • church_digest_mark_sent(church, leader, week) — service_role only.
--
-- Nothing here emails a member, and nothing returns a per-person number.
-- No row is ever removed: switching off writes enabled = false.

create table if not exists public.church_digest_optins (
  church_id       uuid not null,
  user_id         uuid not null,
  enabled         boolean not null default true,
  last_sent_week  date,
  updated_at      timestamptz not null default now(),
  primary key (church_id, user_id)
);

alter table public.church_digest_optins enable row level security;
revoke all on table public.church_digest_optins from public, anon, authenticated;

-- The church's own clock: Autopilot's time zone when it has one (0152), the
-- app's default otherwise.
create or replace function public.church_digest_tz(p_church_id uuid)
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce((select tz from public.church_autopilot where church_id = p_church_id), 'America/New_York');
$$;
revoke all on function public.church_digest_tz(uuid) from public, anon, authenticated;
grant execute on function public.church_digest_tz(uuid) to service_role;

create or replace function public.church_digest_setting(p_church_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_gate text := public.church_admin_can(p_church_id);
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  return jsonb_build_object(
    'ok', true,
    'enabled', coalesce((select o.enabled from public.church_digest_optins o
                         where o.church_id = p_church_id and o.user_id = auth.uid()), false),
    'has_email', exists (select 1 from auth.users u where u.id = auth.uid() and coalesce(u.email, '') <> ''));
end; $$;

create or replace function public.set_church_digest(p_church_id uuid, p_enabled boolean)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_gate text := public.church_admin_can(p_church_id);
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  insert into public.church_digest_optins (church_id, user_id, enabled, updated_at)
  values (p_church_id, auth.uid(), coalesce(p_enabled, false), now())
  on conflict (church_id, user_id) do update set enabled = excluded.enabled, updated_at = now();
  return jsonb_build_object('ok', true, 'enabled', coalesce(p_enabled, false));
end; $$;

revoke all on function public.church_digest_setting(uuid) from public, anon;
grant execute on function public.church_digest_setting(uuid) to authenticated;
revoke all on function public.set_church_digest(uuid, boolean) from public, anon;
grant execute on function public.set_church_digest(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- The digest's facts for one leader, read through Home's own RPCs as that
-- leader. Service role only: it is the one function here that acts as
-- somebody, and only the digest function (and the leader's own test send,
-- which the function has already matched to their JWT) calls it.
-- ---------------------------------------------------------------------------
create or replace function public.church_digest_build(p_church_id uuid, p_user_id uuid, p_local_date date default null)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_prev_sub    text := current_setting('request.jwt.claim.sub', true);
  v_prev_claims text := current_setting('request.jwt.claims', true);
  v_today date;
  v_gate  text;
  v_gen   boolean;
  v_jobs  jsonb := '[]'::jsonb;
  v_ap    jsonb;
  v_range jsonb;
  v_inq   jsonb;
  v_ins   jsonb;
  v_drafts jsonb := '[]'::jsonb;
  v_quiet int := 0;
  v_name  text;
  v_out   jsonb;
begin
  if p_church_id is null or p_user_id is null then return jsonb_build_object('ok', false, 'reason', 'bad_input'); end if;
  v_today := coalesce(p_local_date, (now() at time zone public.church_digest_tz(p_church_id))::date);
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);

  v_gate := public.church_admin_can(p_church_id);
  if v_gate <> 'ok' then
    v_out := jsonb_build_object('ok', false, 'reason', v_gate);
  else
    select name into v_name from public.churches where id = p_church_id;
    -- Home reads the sermon weeks and Autopilot only with Content Generation.
    v_gen := public.church_gen_can(p_church_id) = 'ok';
    if v_gen then
      v_jobs := coalesce(public.church_auto_weeks(p_church_id) -> 'jobs', '[]'::jsonb);
      v_ap := public.church_autopilot(p_church_id);
    end if;
    -- The planner's window: three weeks from today (Home's `fetchDays`).
    v_range := public.church_verses_range(p_church_id, v_today, 21);
    select coalesce(jsonb_agg(jsonb_build_object(
             'date', d ->> 'drop_date',
             'flagged', (select count(*) from jsonb_array_elements(coalesce(d -> 'questions', '[]'::jsonb)) q
                          where q ->> 'check' = 'true'))
             order by d ->> 'drop_date'), '[]'::jsonb)
      into v_drafts
      from jsonb_array_elements(coalesce(v_range -> 'days', '[]'::jsonb)) d
     where d ->> 'status' = 'draft';
    v_inq := public.church_join_inquiry_list(p_church_id);
    v_ins := public.church_leader_insights(p_church_id, v_today);
    -- Home's quiet row: members (never leaders) whose last play is over six days back.
    select count(*) into v_quiet
      from jsonb_array_elements(coalesce(v_ins -> 'roster', '[]'::jsonb)) m
     where coalesce((m ->> 'leader')::boolean, false) = false
       and (m ->> 'last_played_on' is null or (m ->> 'last_played_on')::date < v_today - 6);

    v_out := jsonb_build_object(
      'ok', true,
      'church_name', v_name,
      'today', v_today,
      -- The jobs as church_auto_weeks returns them; the function picks the current one.
      'jobs', v_jobs,
      'autopilot_skipped', coalesce((v_ap ->> 'ok')::boolean, false)
                           and coalesce((v_ap ->> 'enabled')::boolean, false)
                           and v_ap ->> 'state' = 'no_source',
      'drafts', v_drafts,
      'inquiries', jsonb_array_length(coalesce(v_inq -> 'inquiries', '[]'::jsonb)),
      'quiet', v_quiet);
  end if;

  perform set_config('request.jwt.claim.sub', coalesce(v_prev_sub, ''), true);
  perform set_config('request.jwt.claims', coalesce(v_prev_claims, ''), true);
  return v_out;
end; $$;

revoke all on function public.church_digest_build(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.church_digest_build(uuid, uuid, date) to service_role;

-- Who is owed this Monday's digest: opted in, still leadership of a VERIFIED
-- church, an address on file, the church's clock past Monday 08:00, and not
-- sent for this Monday yet. `week` is that local Monday. `p_now` exists for
-- tests; the function never passes it.
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
  where extract(isodow from x.lt) = 1
    and extract(hour from x.lt) >= 8
    and x.last_sent_week is distinct from x.week;
$$;
revoke all on function public.church_digest_due(timestamptz) from public, anon, authenticated;
grant execute on function public.church_digest_due(timestamptz) to service_role;

create or replace function public.church_digest_mark_sent(p_church_id uuid, p_user_id uuid, p_week date)
returns void
language sql volatile security definer set search_path = public
as $$
  update public.church_digest_optins set last_sent_week = p_week
   where church_id = p_church_id and user_id = p_user_id;
$$;
revoke all on function public.church_digest_mark_sent(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.church_digest_mark_sent(uuid, uuid, date) to service_role;

-- The digest function's two secrets, out of Vault (the 0097 pattern): the
-- email provider's key and the token the weekly cron sends. Named, never a
-- general reader. Service role only.
create or replace function public.church_digest_secret(p_name text)
returns text
language sql stable security definer set search_path = public, vault
as $$
  select decrypted_secret from vault.decrypted_secrets
   where name = p_name and p_name in ('RESEND_API_KEY', 'DIGEST_CRON_TOKEN')
   limit 1;
$$;
revoke all on function public.church_digest_secret(text) from public, anon, authenticated;
grant execute on function public.church_digest_secret(text) to service_role;
