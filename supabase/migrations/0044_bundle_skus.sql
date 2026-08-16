-- Verse Arcade — bundle skus.
-- ---------------------------------------------------------------------------
-- The Angel Pack is sold whole: one listing, one price ($5.99), one checkout
-- sku ('pack_angels'). Nothing in it is for sale on its own, so no client change
-- alone can enforce that — the SERVER has to be what makes owning a fraction of
-- a pack impossible. This migration teaches every grant path to expand a pack
-- sku into all of its skins, atomically:
--
--   • fulfill_skin      — Stripe checkout (0034_skin_purchases / 0043)
--   • redeem_code       — promo codes (0034_promo_codes)
--   • admin_grant_skin  — operator grants (0031)
--
-- One source of truth for the mapping: pack_skins(). Client catalog: BUNDLES in
-- src/data/avatar.ts — keep the two in sync (the sku is always 'pack_<id>').
-- The pack's two calling cards need no grant of their own; they gate on the
-- pack entitlement already (set_card_background, migration 0043).
--
-- This deliberately NARROWS what 0043 allowed: 'gabriel', 'michael' and 'seraph'
-- come out of fulfill_skin's single-skin allowlist, so the only sku that can buy
-- them is the pack. They stay in enforce_skin_entitlement's protected list —
-- they're still paid skins nobody may write to their own profile.
--
-- Idempotent — every function is create-or-replace and re-running is a no-op.
-- ---------------------------------------------------------------------------

-- The skins a bundle sku expands to. Returns empty for anything that isn't a
-- bundle, which is how callers tell the two apart.
create or replace function public.pack_skins(p_sku text)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case lower(trim(coalesce(p_sku, '')))
    when 'pack_angels' then array['gabriel','michael','seraph']
    else '{}'::text[]
  end;
$$;

grant execute on function public.pack_skins(text) to authenticated, service_role;

-- Grant a set of skins to one account in a single statement. Callers must have
-- already authorized the grant; this is only the write.
--
-- NOTE ON GRANTS: the house pattern leaves SECURITY DEFINER functions executable
-- by PUBLIC because each one guards itself with auth.uid(). This helper has no
-- guard of its own — it IS the privileged write — so it must be revoked, or any
-- anon caller could grant themselves every paid skin. That's not "tightening one
-- function in isolation"; it's a new function that was never meant to be
-- reachable from the API in the first place.
create or replace function public.grant_skins(p_uid uuid, p_skins text[])
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform set_config('app.grant_ok', '1', true);
  update public.profiles
     set owned_skins = (
       select array(select distinct unnest(coalesce(owned_skins, '{}'::text[]) || p_skins))
     )
   where id = p_uid;
end $$;

revoke all on function public.grant_skins(uuid, text[]) from public, anon, authenticated;

-- ── Stripe fulfillment ──────────────────────────────────────────────────────
-- p_skin may now be either a single paid skin or a bundle sku. A bundle grants
-- every skin inside it, so a buyer can never end up holding part of a pack.
create or replace function public.fulfill_skin(
  p_session text, p_username text, p_skin text, p_email text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  paid text[] := array['moses','esther','elijah','whale','shades'];
  v_pack text[] := public.pack_skins(p_skin);
  v_grant text[];
begin
  -- Idempotency: a session is fulfilled at most once (Stripe retries webhooks).
  insert into public.skin_purchases(stripe_session_id, username, skin, email)
  values (p_session, nullif(lower(trim(coalesce(p_username,''))),''), p_skin, nullif(lower(trim(coalesce(p_email,''))),''))
  on conflict (stripe_session_id) do nothing;
  if not found then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  if array_length(v_pack, 1) is not null then
    v_grant := v_pack;                                  -- a bundle sku
  elsif p_skin is not null and p_skin = any(paid) then
    v_grant := array[p_skin];                           -- a single paid skin
  else
    update public.skin_purchases set reason = 'bad_skin' where stripe_session_id = p_session;
    return jsonb_build_object('ok', false, 'reason', 'bad_skin');
  end if;

  -- Resolve the buyer: username first (from client_reference_id), else email.
  if length(coalesce(p_username,'')) > 0 then
    select id into v_uid from public.profiles where username = lower(trim(p_username));
  end if;
  if v_uid is null and length(coalesce(p_email,'')) > 0 then
    select p.id into v_uid from public.profiles p
      join auth.users u on u.id = p.id
      where lower(u.email) = lower(trim(p_email)) limit 1;
  end if;

  if v_uid is null then
    update public.skin_purchases set reason = 'user_not_found' where stripe_session_id = p_session;
    return jsonb_build_object('ok', false, 'reason', 'user_not_found');
  end if;

  perform public.grant_skins(v_uid, v_grant);
  update public.skin_purchases set user_id = v_uid, granted = true, reason = 'granted' where stripe_session_id = p_session;
  return jsonb_build_object('ok', true, 'granted', true, 'skins', to_jsonb(v_grant));
end $$;

grant execute on function public.fulfill_skin(text, text, text, text) to service_role;

-- ── Promo codes ─────────────────────────────────────────────────────────────
-- A code whose skin_id is a bundle sku grants the whole pack, so a giveaway
-- can't hand out a partial one either.
create or replace function public.redeem_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  v_skin text;
  v_grant text[];
  v_owned text[];
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select skin_id into v_skin from public.promo_codes where code = upper(trim(p_code)) and active;
  if v_skin is null then return jsonb_build_object('ok', false, 'reason', 'invalid'); end if;

  v_grant := public.pack_skins(v_skin);
  if array_length(v_grant, 1) is null then v_grant := array[v_skin]; end if;

  select coalesce(owned_skins, '{}'::text[]) into v_owned from public.profiles where id = uid;
  if v_owned @> v_grant then
    return jsonb_build_object('ok', true, 'skin', v_skin, 'already', true);
  end if;

  perform public.grant_skins(uid, v_grant);
  update public.promo_codes set redeemed_count = redeemed_count + 1 where code = upper(trim(p_code));
  return jsonb_build_object('ok', true, 'skin', v_skin, 'skins', to_jsonb(v_grant));
end $$;

grant execute on function public.redeem_code(text) to authenticated;

-- ── Operator grants ─────────────────────────────────────────────────────────
create or replace function public.admin_grant_skin(p_username text, p_skin text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_id uuid;
  v_grant text[];
begin
  perform public.require_admin();
  select id into v_id from public.profiles where username = lower(trim(p_username));
  if v_id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  v_grant := public.pack_skins(p_skin);
  if array_length(v_grant, 1) is null then v_grant := array[p_skin]; end if;

  perform public.grant_skins(v_id, v_grant);
  return jsonb_build_object('ok', true, 'skins', to_jsonb(v_grant));
end; $$;

notify pgrst, 'reload schema';
