-- Verse Arcade — Angels Pack.
-- ---------------------------------------------------------------------------
-- Three paid skins (gabriel, michael, seraph) plus two player-card backgrounds
-- (angels_ladder, angels_host) that ship with the pack. Client catalog:
-- src/data/avatar.ts (FULL_SKINS) and src/data/playerCards.ts (PACK).
--
-- Three server-side rules to keep in sync with that catalog:
--   1. The new skins join the paid list in enforce_skin_entitlement, so a client
--      can't write them into its own owned_skins (migration 0031, extended with
--      'shades' by 0034_promo_codes — that list is restated here in full).
--   2. They also join fulfill_skin's allowlist, or Stripe checkout would come
--      back 'bad_skin' and never grant what someone paid for (0034_skin_purchases).
--   3. set_card_background learns about pack cards: they have no collectible
--      behind them, so they gate on owning a skin from the pack instead of on
--      user_unlocks.
-- Idempotent — every function is create-or-replace and re-running is a no-op.
-- ---------------------------------------------------------------------------

-- 1. Paid-skin lock, now covering the Angels Pack.
create or replace function public.enforce_skin_entitlement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  paid text[] := array['moses','esther','elijah','whale','shades','gabriel','michael','seraph'];
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

-- 2. Stripe fulfillment allowlist. Unchanged apart from the three new skus —
-- kept identical to 0034_skin_purchases otherwise.
create or replace function public.fulfill_skin(
  p_session text, p_username text, p_skin text, p_email text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  paid text[] := array['moses','esther','elijah','whale','shades','gabriel','michael','seraph'];
begin
  -- Idempotency: a session is fulfilled at most once (Stripe retries webhooks).
  insert into public.skin_purchases(stripe_session_id, username, skin, email)
  values (p_session, nullif(lower(trim(coalesce(p_username,''))),''), p_skin, nullif(lower(trim(coalesce(p_email,''))),''))
  on conflict (stripe_session_id) do nothing;
  if not found then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  if p_skin is null or not (p_skin = any(paid)) then
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

  -- Grant (the entitlement trigger allows paid skins when app.grant_ok is set).
  perform set_config('app.grant_ok', '1', true);
  update public.profiles
     set owned_skins = (select array(select distinct unnest(coalesce(owned_skins, array[]::text[]) || p_skin)))
   where id = v_uid;
  update public.skin_purchases set user_id = v_uid, granted = true, reason = 'granted' where stripe_session_id = p_session;
  return jsonb_build_object('ok', true, 'granted', true);
end $$;

grant execute on function public.fulfill_skin(text, text, text, text) to service_role;

-- 3. Equipping a background. Earned backgrounds still check user_unlocks; pack
-- backgrounds check the pack entitlement. Everything else is refused, so a
-- crafted client still can't equip artwork it didn't earn or buy.
create or replace function public.set_card_background(p_key text)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  clean text := nullif(trim(coalesce(p_key, '')), '');
  -- Pack cards → the skins that unlock them. Keep in sync with the PACK list in
  -- src/data/playerCards.ts and the 'angels' pack in src/data/avatar.ts.
  angels_cards text[] := array['angels_ladder','angels_host'];
  angels_skins text[] := array['gabriel','michael','seraph'];
begin
  if uid is null then raise exception 'not authenticated'; end if;

  if clean is null or clean = 'default' then
    update public.profiles set card_background = null where id = uid;
    return json_build_object('ok', true, 'key', 'default');
  end if;

  if clean = any(angels_cards) then
    if not exists (
      select 1 from public.profiles
      where id = uid
        and (coalesce(owned_skins, '{}'::text[]) && angels_skins or coalesce(is_admin, false))
    ) then
      return json_build_object('ok', false, 'error', 'not unlocked');
    end if;
    update public.profiles set card_background = clean where id = uid;
    return json_build_object('ok', true, 'key', clean);
  end if;

  if not exists (
    select 1 from public.user_unlocks
    where user_id = uid and collectible_key = clean
  ) then
    return json_build_object('ok', false, 'error', 'not unlocked');
  end if;

  update public.profiles set card_background = clean where id = uid;
  return json_build_object('ok', true, 'key', clean);
end;
$$;

grant execute on function public.set_card_background(text) to authenticated;

notify pgrst, 'reload schema';
