-- Admin — a private operator surface for the founder account only. Access is
-- server-authoritative: an `is_admin` flag (set here for exactly one account),
-- and every admin RPC re-checks it. The client route is unlinked + PIN-gated,
-- but this is the real gate — no other account can read or do any of this.

alter table public.profiles add column if not exists is_admin boolean not null default false;

-- Grant admin to the operator account only.
update public.profiles set is_admin = true where username = 'sharkbait';

-- Guard: raise unless the caller is the/an admin. Used by every admin RPC.
create or replace function public.require_admin()
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_admin) then
    raise exception 'forbidden';
  end if;
end; $$;

-- Headline metrics for the dashboard.
create or replace function public.admin_overview()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.require_admin();
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'active_today', (select count(*) from public.profiles where last_played_on = current_date),
    'active_7d', (select count(*) from public.profiles where last_played_on >= current_date - 6),
    'new_7d', (select count(*) from public.profiles where created_at >= now() - interval '7 days'),
    'new_today', (select count(*) from public.profiles where created_at >= current_date),
    'total_plays', (select coalesce(sum(total_plays), 0) from public.profiles),
    'battles_total', (select count(*) from public.battles),
    'battles_complete', (select count(*) from public.battles where status = 'complete'),
    'buddies_pairs', (select count(*) from public.buddies where status = 'accepted'),
    'buddy_requests_pending', (select count(*) from public.buddies where status = 'pending'),
    'skins_sold', (select coalesce(sum(coalesce(array_length(owned_skins, 1), 0)), 0) from public.profiles),
    'founders', (select count(*) from public.profiles where founder),
    'church_open', (select count(*) from public.church_inquiries where not handled),
    'church_total', (select count(*) from public.church_inquiries)
  );
end; $$;

-- Look up users (by @username prefix, or the most recent signups when blank).
create or replace function public.admin_find_users(p_search text default null, p_limit int default 25)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare q text := lower(trim(coalesce(p_search, '')));
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(row order by (row->>'created_at') desc) from (
      select jsonb_build_object(
        'username', p.username, 'level', p.level, 'xp', p.xp,
        'current_streak', p.current_streak, 'longest_streak', p.longest_streak,
        'last_played_on', p.last_played_on, 'created_at', p.created_at,
        'owned_skins', coalesce(p.owned_skins, array[]::text[]),
        'founder', p.founder, 'is_admin', p.is_admin
      ) as row
      from public.profiles p
      where q = '' or p.username like q || '%'
      order by p.created_at desc
      limit greatest(p_limit, 1)
    ) s
  ), '[]'::jsonb);
end; $$;

-- Grant / revoke a skin entitlement (manual delivery after an off-app purchase).
create or replace function public.admin_grant_skin(p_username text, p_skin text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  perform public.require_admin();
  select id into v_id from public.profiles where username = lower(trim(p_username));
  if v_id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  update public.profiles
     set owned_skins = (select array(select distinct unnest(coalesce(owned_skins, array[]::text[]) || p_skin)))
   where id = v_id;
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.admin_revoke_skin(p_username text, p_skin text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  perform public.require_admin();
  select id into v_id from public.profiles where username = lower(trim(p_username));
  if v_id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  update public.profiles
     set owned_skins = array_remove(coalesce(owned_skins, array[]::text[]), p_skin)
   where id = v_id;
  return jsonb_build_object('ok', true);
end; $$;

-- Toggle the founder cosmetic grant for an account.
create or replace function public.admin_set_founder(p_username text, p_value boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  perform public.require_admin();
  select id into v_id from public.profiles where username = lower(trim(p_username));
  if v_id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  update public.profiles set founder = p_value where id = v_id;
  return jsonb_build_object('ok', true);
end; $$;

-- Church inquiries (newest first).
create or replace function public.admin_church_inquiries(p_limit int default 50)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.require_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', i.id, 'church_name', i.church_name, 'contact_name', i.contact_name,
      'email', i.email, 'size', i.size, 'message', i.message,
      'handled', i.handled, 'created_at', i.created_at
    ) order by i.created_at desc)
    from (select * from public.church_inquiries order by created_at desc limit greatest(p_limit,1)) i
  ), '[]'::jsonb);
end; $$;

grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_find_users(text, int) to authenticated;
grant execute on function public.admin_grant_skin(text, text) to authenticated;
grant execute on function public.admin_revoke_skin(text, text) to authenticated;
grant execute on function public.admin_set_founder(text, boolean) to authenticated;
grant execute on function public.admin_church_inquiries(int) to authenticated;

notify pgrst, 'reload schema';
