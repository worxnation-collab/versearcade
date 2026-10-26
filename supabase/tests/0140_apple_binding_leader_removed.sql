-- Test for 0140: removing a paying leader ends their Apple binding, and the
-- church loses `verified` only when Apple was the sole thing verifying it.
--
-- Self-contained: stubs the tables 0139/0140 touch, applies both migrations
-- (twice, to prove a re-run is a no-op), then asserts. Any failure raises and
-- psql exits non-zero. Run against a THROWAWAY local Postgres 16 from the repo
-- root, as a non-root user (see CLAUDE.md → Supabase):
--
--   createdb t0140 && psql -d t0140 -v ON_ERROR_STOP=1 -f supabase/tests/0140_apple_binding_leader_removed.sql
--
-- Never point this at the live project: it creates roles and tables.

\set ON_ERROR_STOP on
\set QUIET on

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql as $$ select null::uuid $$;
create table if not exists public.profiles (id uuid primary key);
create table if not exists public.churches (id uuid primary key, verified boolean not null default false);
create table if not exists public.church_admins (
  church_id uuid references public.churches(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  primary key (church_id, user_id));
create table if not exists public.church_billing (
  church_id uuid primary key references public.churches(id), stripe_subscription_id text unique,
  billing_token text, stripe_customer_id text, status text, plan_interval text,
  content_addon boolean not null default false, collection_method text,
  current_period_end timestamptz, updated_at timestamptz);
create table if not exists public.church_addons (church_id uuid primary key, content_generation boolean,
  updated_at timestamptz, updated_by uuid);

\i supabase/migrations/0139_church_apple_subscription.sql
\i supabase/migrations/0139_church_apple_subscription_b.sql
\i supabase/migrations/0140_apple_binding_leader_removed.sql
\i supabase/migrations/0140_apple_binding_leader_removed_b.sql
\i supabase/migrations/0140_apple_binding_leader_removed.sql
\i supabase/migrations/0140_apple_binding_leader_removed_b.sql

do $$
declare
  -- Churches: A Apple only · B Apple + Stripe · C operator-verified first ·
  -- D two leaders, the non-paying one removed · E paying leader's account erased.
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  d uuid := gen_random_uuid(); e uuid := gen_random_uuid();
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
  ud uuid := gen_random_uuid(); ud2 uuid := gen_random_uuid(); ue uuid := gen_random_uuid();
  r jsonb;
begin
  insert into public.profiles values (ua), (ub), (uc), (ud), (ud2), (ue);
  insert into public.churches values (a, false), (b, false), (c, true), (d, false), (e, false);
  insert into public.church_admins values (a, ua), (b, ub), (c, uc), (d, ud), (d, ud2), (e, ue);
  perform public.billing_apply_apple(x.ch, x.u, 'p', 'month', true, now() + interval '30 days')
    from (values (a, ua), (b, ub), (c, uc), (d, ud), (e, ue)) x(ch, u);
  insert into public.church_billing (church_id, stripe_subscription_id, status) values (b, 'sub_b', 'active');
  assert (select bool_and(verified) from public.churches), 'setup: every church verified';

  -- The headline case: paying leader removed → binding cleared → unverified,
  -- because Apple was the sole verifier.
  delete from public.church_admins where church_id = a and user_id = ua;
  assert (select status from public.church_apple_subscriptions where church_id = a) = 'expired', 'A: binding ended';
  assert not (select verified from public.churches where id = a), 'A: Apple was sole verifier, so unverified';

  delete from public.church_admins where church_id = b and user_id = ub;
  assert (select status from public.church_apple_subscriptions where church_id = b) = 'expired', 'B: binding ended';
  assert (select verified from public.churches where id = b), 'B: Stripe still live, stays verified';

  delete from public.church_admins where church_id = c and user_id = uc;
  assert (select status from public.church_apple_subscriptions where church_id = c) = 'expired', 'C: binding ended';
  assert (select verified from public.churches where id = c), 'C: operator-verified, stays verified';

  delete from public.church_admins where church_id = d and user_id = ud2;
  assert (select status from public.church_apple_subscriptions where church_id = d) = 'active', 'D: other leader removed, binding untouched';
  assert (select verified from public.churches where id = d), 'D: stays verified';

  delete from public.profiles where id = ue;
  assert not exists (select 1 from public.church_apple_subscriptions where church_id = e), 'E: binding gone with the account';
  assert not (select verified from public.churches where id = e), 'E: Apple was sole verifier, so unverified';

  r := public.billing_apply_apple(a, ua, 'p', 'month', true, now() + interval '30 days');
  assert r->>'reason' = 'not_leadership', 'A: removed leader cannot re-bind';
  assert not exists (select 1 from public.billing_apple_bindings(ua)), 'A: no active binding left to re-sync';

  raise notice '0140: all assertions passed';
end $$;
