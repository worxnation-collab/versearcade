-- 0106: where a sign-up came from.
--
-- Every link the social engine posts carries `?src=<network>` (social.ts
-- `siteLink`), the client parks the first one it sees in localStorage
-- (lib/attribution.ts) and hands it to `set_signup_source` once an account
-- exists. That is the one number goal one needs and did not have: which
-- network sends people who SIGN UP, not just people who watch.
--
-- Three rules keep it honest:
--   - First touch wins, server-side: the column is written only while null.
--   - Only a NEW account can be attributed (created inside the last 7 days),
--     so a long-time player opening a ?src= link is never re-filed under it.
--   - It is a fixed vocabulary (lowercase slug, 32 chars) and it counts
--     accounts by network for the operator alone. No player sees it, no board
--     reads it, nothing ranks a person by where they came from.
--
-- `admin_signup_sources` groups the last N days for the hub's weekly table.
-- The window is rolling (now() minus N days) rather than local calendar
-- days on purpose: it sits beside per-network view counts that are rolling
-- too, and a 7x24h window has no "today" for the operator's zone to move.

alter table public.profiles add column if not exists signup_source text;

create or replace function public.set_signup_source(p_src text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); src text := lower(trim(coalesce(p_src, '')));
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if src !~ '^[a-z0-9][a-z0-9_-]{0,31}$' then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;
  if exists (select 1 from public.profiles where id = uid and signup_source is not null) then
    return jsonb_build_object('ok', true, 'already', true);
  end if;
  update public.profiles set signup_source = src
    where id = uid and signup_source is null and created_at > now() - interval '7 days';
  if not found then return jsonb_build_object('ok', true, 'already', true, 'reason', 'not_new'); end if;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.set_signup_source(text) to authenticated;

create or replace function public.admin_signup_sources(p_days int default 7)
returns jsonb language plpgsql security definer set search_path = public as $$
declare days int := greatest(1, least(coalesce(p_days, 7), 90));
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object('src', src, 'n', n) order by n desc)
    from (
      select coalesce(signup_source, '') as src, count(*)::int as n
      from public.profiles
      where created_at > now() - make_interval(days => days)
      group by coalesce(signup_source, '')
    ) t
  ), '[]'::jsonb);
end $$;

grant execute on function public.admin_signup_sources(int) to authenticated;
