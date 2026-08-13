-- Server-side lock for PAID skins. The profiles self-update RLS policy lets a
-- user write their own owned_skins, so the client UI lock alone is bypassable.
-- This trigger enforces the lock in the database: a user cannot add a paid skin
-- to their OWN owned_skins. Legitimate grants come only from:
--   • an admin (admin_grant_skin, or the operator previewing), or
--   • a SECURITY DEFINER purchase flow that sets app.grant_ok = '1' (future).
-- Earned skins and free items are unaffected (earned skins don't gate on
-- owned_skins at all).

create or replace function public.enforce_skin_entitlement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  paid text[] := array['moses','esther','elijah','whale'];
  added text[];
  caller_admin boolean;
begin
  added := array(
    select unnest(coalesce(new.owned_skins, '{}'::text[]))
    except
    select unnest(coalesce(old.owned_skins, '{}'::text[]))
  );
  if added && paid then
    select is_admin into caller_admin from public.profiles where id = auth.uid();
    if coalesce(current_setting('app.grant_ok', true), '') <> '1' and not coalesce(caller_admin, false) then
      -- Strip only the unauthorized paid additions; keep everything else.
      new.owned_skins := array(
        select x from unnest(coalesce(new.owned_skins, '{}'::text[])) as x
        where not (x = any(paid)) or x = any(coalesce(old.owned_skins, '{}'::text[]))
      );
    end if;
  end if;
  return new;
end $$;

drop trigger if exists enforce_skin_entitlement_trg on public.profiles;
create trigger enforce_skin_entitlement_trg
  before update of owned_skins on public.profiles
  for each row execute function public.enforce_skin_entitlement();

-- admin_grant_skin flags the grant as authorized (belt-and-suspenders; the
-- is_admin check already permits it) — the same pattern a purchase RPC will use.
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
  return jsonb_build_object('ok', true);
end; $$;

notify pgrst, 'reload schema';
