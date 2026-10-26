-- Test for 0141: a leader's tap toward a plan is counted, nobody else's is,
-- the client cannot read the table, and the operator read groups it.
--
-- Self-contained, for a THROWAWAY local Postgres 16, from the repo root:
--   createdb t0141 && psql -d t0141 -v ON_ERROR_STOP=1 -f supabase/tests/0141_church_plan_taps.sql

\set ON_ERROR_STOP on
\set QUIET on

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table if not exists public.profiles (id uuid primary key, is_admin boolean not null default false);
create table if not exists public.churches (id uuid primary key, verified boolean not null default false);
create table if not exists public.church_admins (church_id uuid, user_id uuid, primary key (church_id, user_id));
create or replace function public.require_admin() returns void language plpgsql as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'not admin';
  end if;
end $$;

\i supabase/migrations/0141_church_plan_taps.sql
\i supabase/migrations/0141_church_plan_taps_b.sql
\i supabase/migrations/0141_church_plan_taps.sql
\i supabase/migrations/0141_church_plan_taps_b.sql

do $$
declare
  ch uuid := gen_random_uuid(); other uuid := gen_random_uuid();
  leader uuid := gen_random_uuid(); member uuid := gen_random_uuid(); op uuid := gen_random_uuid();
  r jsonb; i int;
begin
  insert into public.profiles values (leader, false), (member, false), (op, true);
  insert into public.churches values (ch, false), (other, false);
  insert into public.church_admins values (ch, leader);

  perform set_config('test.uid', leader::text, true);
  assert (public.note_church_plan_tap(ch, 'apple', 'month'))->>'ok' = 'true', 'apple monthly counted';
  assert (public.note_church_plan_tap(ch, 'apple', 'year'))->>'ok' = 'true', 'apple yearly counted';
  assert (public.note_church_plan_tap(ch, 'web', 'month'))->>'ok' = 'true', 'web counted';
  assert (select plan_interval from public.church_plan_taps where path = 'web') is null, 'web interval is not recorded';
  assert (public.note_church_plan_tap(ch, 'stripe', null))->>'reason' = 'bad_path', 'unknown path refused';
  assert (public.note_church_plan_tap(other, 'apple', 'month'))->>'reason' = 'not_leadership', 'another church refused';

  perform set_config('test.uid', member::text, true);
  assert (public.note_church_plan_tap(ch, 'apple', 'month'))->>'reason' = 'not_leadership', 'non-leader refused';

  perform set_config('test.uid', leader::text, true);
  for i in 1..40 loop perform public.note_church_plan_tap(ch, 'apple', 'month'); end loop;
  assert (select count(*) from public.church_plan_taps where user_id = leader) = 30, 'capped at 30 a day';

  begin
    r := public.admin_church_plan_taps(30);
    raise exception 'leader read the operator totals';
  exception when others then
    if sqlerrm = 'leader read the operator totals' then raise; end if;
  end;

  perform set_config('test.uid', op::text, true);
  r := public.admin_church_plan_taps(30);
  assert jsonb_array_length(r) = 3, 'three groups: apple month, apple year, web';
  assert (select sum((x->>'taps')::int) from jsonb_array_elements(r) x) = 30, 'totals add up';

  assert not has_table_privilege('authenticated', 'public.church_plan_taps', 'select'), 'clients cannot read the table';
  assert not has_function_privilege('anon', 'public.note_church_plan_tap(uuid, text, text)', 'execute'), 'anon cannot tap';

  raise notice '0141: all assertions passed';
end $$;
