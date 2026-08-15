-- Show manual admin grants in the dashboard Sales tab (until the Stripe webhook
-- is wired). admin_grant_skin now records a skin_purchases row, and existing
-- real paid-skin owners are backfilled. Excludes free "Day One/shades" code
-- redemptions and admin/test grants.

create or replace function public.admin_grant_skin(p_username text, p_skin text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  perform public.require_admin();
  select id into v_id from public.profiles where username = lower(trim(p_username));
  if v_id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  perform set_config('app.grant_ok', '1', true);
  update public.profiles
     set owned_skins = (select array(select distinct unnest(coalesce(owned_skins, array[]::text[]) || p_skin)))
   where id = v_id;
  insert into public.skin_purchases(stripe_session_id, user_id, username, skin, granted, reason)
  values ('manual-' || v_id::text || '-' || p_skin, v_id, lower(trim(p_username)), p_skin, true, 'manual')
  on conflict (stripe_session_id) do nothing;
  return jsonb_build_object('ok', true);
end; $$;

insert into public.skin_purchases(stripe_session_id, user_id, username, skin, granted, reason)
select 'backfill-' || p.id::text || '-' || s.skin, p.id, p.username, s.skin, true, 'manual'
from public.profiles p
cross join lateral unnest(p.owned_skins) as s(skin)
where s.skin = any(array['moses','esther','elijah','whale'])
  and not p.is_admin
on conflict (stripe_session_id) do nothing;
