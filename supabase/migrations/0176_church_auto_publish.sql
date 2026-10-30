-- 0176: auto-publish — "if I haven't approved it by 8pm, publish tomorrow's
-- draft". The owner's call (2026-10-30), and a NARROW exception to "a
-- generated day is a draft until a leader approves it" (CLAUDE.md, 0127).
--
-- What keeps it narrow, in the shape of the data:
--   * OFF by default, per church, and only a verified church holding Content
--     Generation can switch it on (church_gen_can) — the leader who flips it
--     is recorded as `set_by`, and is who the day is approved AS.
--   * It only ever turns a DRAFT into an approved day. It never writes a
--     verse, never replaces an approved one, and never fills an empty day:
--     the words are still the ones church-draft wrote for this church from its
--     own sermon, topic or passage.
--   * A draft carrying a flagged question (0143's `check`) is never published —
--     the same rule Approve all follows.
--   * It stands down by itself: a church no longer verified, an add-on that
--     lapsed, or a `set_by` who is no longer leadership publishes nothing.
--   * Every day it publishes is logged in `church_auto_publishes`, which Home
--     reads back as "Published automatically" so the leader always hears.
--
-- When: tomorrow's draft at 20:00 church time (church_digest_tz, Autopilot's
-- clock), and a draft for TODAY that is still waiting (a missed hour, or the
-- switch turned on mid-day) — past its night-before cutoff by definition.
-- pg_cron runs `church_auto_publish_run()` hourly at :02; no Edge Function.
-- Idempotent; no foreign keys (the runner joins `churches` itself).

create table if not exists public.church_auto_publish (
  church_id  uuid primary key,
  enabled    boolean not null default false,
  hour       int not null default 20 check (hour between 0 and 23),
  set_by     uuid,
  updated_at timestamptz not null default now()
);
alter table public.church_auto_publish enable row level security;
revoke all on table public.church_auto_publish from anon, authenticated;

create table if not exists public.church_auto_publishes (
  church_id    uuid not null,
  drop_date    date not null,
  reference    text not null,
  published_at timestamptz not null default now(),
  primary key (church_id, drop_date)
);
alter table public.church_auto_publishes enable row level security;
revoke all on table public.church_auto_publishes from anon, authenticated;

-- The switch and the last fortnight of what it did, for this church's
-- leadership with Content Generation.
create or replace function public.church_auto_publish(p_church_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_gate text;
  v_row  public.church_auto_publish;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  v_gate := public.church_gen_can(p_church_id);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  select * into v_row from public.church_auto_publish where church_id = p_church_id;
  return jsonb_build_object(
    'ok', true,
    'enabled', coalesce(v_row.enabled, false),
    'hour', coalesce(v_row.hour, 20),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object('date', drop_date, 'reference', reference, 'published_at', published_at)
                       order by drop_date desc)
        from public.church_auto_publishes
       where church_id = p_church_id and published_at > now() - interval '14 days'), '[]'::jsonb));
end; $$;
revoke all on function public.church_auto_publish(uuid) from public, anon;
grant execute on function public.church_auto_publish(uuid) to authenticated;

create or replace function public.set_church_auto_publish(p_church_id uuid, p_on boolean)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  v_gate text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_on is null then return jsonb_build_object('ok', false, 'reason', 'bad_input'); end if;
  v_gate := public.church_gen_can(p_church_id);
  if v_gate <> 'ok' then return jsonb_build_object('ok', false, 'reason', v_gate); end if;
  insert into public.church_auto_publish (church_id, enabled, set_by, updated_at)
  values (p_church_id, p_on, auth.uid(), now())
  on conflict (church_id) do update
    set enabled = excluded.enabled, set_by = excluded.set_by, updated_at = now();
  return public.church_auto_publish(p_church_id);
end; $$;
revoke all on function public.set_church_auto_publish(uuid, boolean) from public, anon;
grant execute on function public.set_church_auto_publish(uuid, boolean) to authenticated;

-- The publisher. Service role / pg_cron only. Returns how many days went live.
create or replace function public.church_auto_publish_run()
returns int
language plpgsql volatile security definer set search_path = public
as $$
declare
  r       record;
  v_local timestamp;
  v_today date;
  v_n     int := 0;
  v_k     int;
begin
  for r in
    select a.church_id, a.hour, a.set_by
      from public.church_auto_publish a
     where a.enabled
       and a.set_by is not null
       and public.church_is_verified(a.church_id)
       and public.church_has_content_generation(a.church_id)
       and exists (select 1 from public.church_admins ca
                    where ca.church_id = a.church_id and ca.user_id = a.set_by)
  loop
    v_local := now() at time zone public.church_digest_tz(r.church_id);
    v_today := v_local::date;
    with done as (
      update public.church_verses v
         set status = 'approved', approved_by = r.set_by, approved_at = now(), updated_at = now()
       where v.church_id = r.church_id
         and v.status = 'draft' and v.discarded_at is null
         and (v.drop_date = v_today
              or (v.drop_date = v_today + 1 and extract(hour from v_local) >= r.hour))
         and not (jsonb_typeof(v.questions) = 'array'
                  and exists (select 1 from jsonb_array_elements(v.questions) q
                               where q -> 'check' = 'true'::jsonb))
      returning v.church_id, v.drop_date, v.reference
    )
    insert into public.church_auto_publishes (church_id, drop_date, reference)
    select church_id, drop_date, reference from done
    on conflict (church_id, drop_date) do update
      set reference = excluded.reference, published_at = now();
    get diagnostics v_k = row_count;
    v_n := v_n + v_k;
  end loop;
  return v_n;
end; $$;
revoke all on function public.church_auto_publish_run() from public, anon, authenticated;
grant execute on function public.church_auto_publish_run() to service_role;

-- Hourly at :02, so an 8pm cutoff publishes at about 8:02. Skipped where
-- pg_cron is absent (a local test database).
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('church-auto-publish-hourly', '2 * * * *',
                          'select public.church_auto_publish_run()');
  end if;
end $$;
