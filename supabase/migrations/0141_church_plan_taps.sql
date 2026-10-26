-- 0141 — Which door a church leader took toward a plan: Apple or the web.
--
-- The App Store build offers the Verified Church plan two ways on the
-- leadership screen (0139): "Subscribe with Apple" and, on the US storefront,
-- "View plans and billing" on the web. Which one leaders actually choose is
-- the number that decides whether either is worth keeping, and nothing
-- recorded it. This app has no analytics pipeline and no third-party SDK, on
-- purpose, so this is the shape `note_promotion_join` (0077) already uses: a
-- server-checked RPC writes one row per tap, and the operator counts rows.
--
-- What is stored, and what deliberately is not:
--   • church, user, path ('apple' | 'web'), interval ('month' | 'year' for an
--     Apple tap; NULL for the web, where the interval is chosen on the page),
--     and when. A TAP, never a purchase: what was bought is already in
--     church_apple_subscriptions / church_billing, and a tap followed by a
--     cancelled sheet is exactly the signal worth having.
--   • Nothing a player sees. No client can read the table (RLS on, no rule,
--     no grant); the operator reads totals through `admin_church_plan_taps`.
--   • Only leadership of THAT church is counted, the 0077 rule: the client
--     says "I tapped", the server checks that is plausible before counting.
--   • Capped at 30 rows per user per day, so a stuck button or a script cannot
--     fill the table. Over the cap the call still answers ok — it is a
--     non-critical write and the client never waits on it.

create table if not exists public.church_plan_taps (
  id            bigint generated always as identity primary key,
  church_id     uuid not null,
  user_id       uuid not null,
  path          text not null check (path in ('apple', 'web')),
  plan_interval text check (plan_interval in ('month', 'year')),
  created_at    timestamptz not null default now()
);

create index if not exists church_plan_taps_user_day on public.church_plan_taps (user_id, created_at);
create index if not exists church_plan_taps_created on public.church_plan_taps (created_at);

alter table public.church_plan_taps enable row level security;
revoke all on table public.church_plan_taps from anon, authenticated;

create or replace function public.note_church_plan_tap(
  p_church_id uuid,
  p_path text,
  p_interval text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_path not in ('apple', 'web') then
    return jsonb_build_object('ok', false, 'reason', 'bad_path');
  end if;
  if not exists (select 1 from public.church_admins where church_id = p_church_id and user_id = uid) then
    return jsonb_build_object('ok', false, 'reason', 'not_leadership');
  end if;
  if (select count(*) from public.church_plan_taps
       where user_id = uid and created_at > now() - interval '1 day') >= 30 then
    return jsonb_build_object('ok', true, 'capped', true);
  end if;
  insert into public.church_plan_taps (church_id, user_id, path, plan_interval)
  values (p_church_id, uid, p_path,
          case when p_path = 'apple' and p_interval in ('month', 'year') then p_interval end);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.note_church_plan_tap(uuid, text, text) from public, anon;
grant execute on function public.note_church_plan_tap(uuid, text, text) to authenticated;

-- Operator: taps per path and interval over the last N days, with how many
-- distinct churches and leaders they came from.
create or replace function public.admin_church_plan_taps(p_days integer default 30)
returns jsonb
language plpgsql
stable security definer set search_path = public
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 365));
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'path', path, 'interval', plan_interval,
             'taps', taps, 'churches', churches, 'leaders', leaders) order by path, plan_interval)
    from (
      select path, plan_interval, count(*) as taps,
             count(distinct church_id) as churches, count(distinct user_id) as leaders
        from public.church_plan_taps
       where created_at > now() - make_interval(days => v_days)
       group by path, plan_interval
    ) t
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_church_plan_taps(integer) from public, anon;
grant execute on function public.admin_church_plan_taps(integer) to authenticated;
