-- Verse Arcade — the founding patron becomes the rock.
-- ---------------------------------------------------------------------------
-- The app's one product changes skin: Jonah's whale is withdrawn and 'cephas'
-- (Peter with the keys, standing on the bedrock — Matthew 16:18) takes its
-- place at the same $9.99, together with a 'patron_cornerstone' player-card
-- background. Client catalog: FULL_SKINS in src/data/avatar.ts and PACK in
-- src/data/playerCards.ts.
--
-- THE PRODUCT DID NOT CHANGE, ONLY WHAT IT GRANTS. Both stores keep selling
-- exactly what they were selling: the Stripe Payment Link is the same link (a
-- link is a price — what it grants comes from client_reference_id, resolved
-- here by fulfill_skin), and the Apple product id is the same already-approved
-- 'com.versearcade.app.patron_founding' (see src/lib/iap.ts). That is what lets
-- the rock go on sale in every build already on phones, with no submission.
--
-- Four changes, and the first three are wholesale restatements of functions
-- this project replaces rather than alters — read them as "0044's fulfill_skin
-- plus one sku", not as new code:
--
--   1. 'cephas' joins the protected list in enforce_skin_entitlement, so no
--      client can write it into its own owned_skins. THE LIST IS RESTATED IN
--      FULL because the function is replaced wholesale — dropping a name would
--      silently unlock that skin for everyone. It was last set by
--      0088_lantern_skin (0031, 0034, 0043, 0044, 0046, 0057 and 0082 are all
--      superseded); the twelve names below are 0088's list verbatim, plus one.
--   2. 'cephas' joins fulfill_skin's allowlist, or a Stripe purchase would come
--      back 'bad_skin' and take money for nothing. 'whale' STAYS in that list
--      even though nothing sells it any more: a late webhook retry for a
--      purchase already made must still settle. Add rows, never remove them —
--      the same rule SKU_BY_PRODUCT_ID in supabase/functions/iap-fulfill runs
--      on, and for the same reason.
--   3. set_card_background learns the patron card, gated on owning EITHER
--      founding-patron skin. The whale's buyers get the cornerstone too; they
--      paid for the founding patron, and which skin it happened to be that
--      month is our decision, not theirs.
--   4. A backfill grants 'cephas' to everyone who already owns 'whale'. Without
--      it a patron would have to tap Restore (native) or wait for a webhook
--      that will never come again (web) before the app stopped offering them a
--      product they have already bought. src/data/avatar's `supersedes` covers
--      the same case client-side; this is the durable half.
--
-- NOTHING IS REVOKED ANYWHERE. The whale stays in owned_skins, stays wearable,
-- and its `limitedUntil` is dropped in the client catalog so it is no longer
-- deleted out of its buyers' wardrobes in October. Retiring a product hides the
-- offer; it does not take back the thing somebody bought.
--
-- Idempotent — create-or-replace plus a guarded backfill; re-running is a no-op.
-- ---------------------------------------------------------------------------

-- 1. Paid-skin lock. 0088's twelve names, plus 'cephas'.
create or replace function public.enforce_skin_entitlement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  paid text[] := array[
    'moses','esther','elijah','whale','shades','gabriel','michael','seraph','eden','sonshine',
    'porchlight','lantern','cephas'
  ];
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

-- 2. Stripe fulfillment. 0044's function verbatim apart from the allowlist.
create or replace function public.fulfill_skin(
  p_session text, p_username text, p_skin text, p_email text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  paid text[] := array['moses','esther','elijah','whale','shades','cephas'];
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

revoke all on function public.fulfill_skin(text, text, text, text) from public, anon, authenticated;
grant execute on function public.fulfill_skin(text, text, text, text) to service_role;

-- 3. Equipping a background. 0043's function, plus the patron card.
create or replace function public.set_card_background(p_key text)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  clean text := nullif(trim(coalesce(p_key, '')), '');
  -- Pack cards → the skins that unlock them. Keep in sync with the PACK list in
  -- src/data/playerCards.ts and the packs in src/data/avatar.ts.
  angels_cards text[] := array['angels_ladder','angels_host'];
  angels_skins text[] := array['gabriel','michael','seraph'];
  -- EITHER founding-patron skin opens the cornerstone: 'whale' is retired but
  -- its owners bought the same thing 'cephas' buyers are buying.
  patron_cards text[] := array['patron_cornerstone'];
  patron_skins text[] := array['cephas','whale'];
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

  if clean = any(patron_cards) then
    if not exists (
      select 1 from public.profiles
      where id = uid
        and (coalesce(owned_skins, '{}'::text[]) && patron_skins or coalesce(is_admin, false))
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

-- 4. Every existing patron gets the rock. Through grant_skins() rather than a
-- direct update, so it goes past enforce_skin_entitlement the way every other
-- legitimate grant does — and deliberately NOT through admin_grant_skin(),
-- which would file each one in the dashboard's Sales tab as fresh revenue
-- (0035_manual_grants_as_sales). These are not sales; they are the same sale,
-- honoured again.
do $$
declare r record;
begin
  for r in
    select id from public.profiles
    where 'whale' = any(coalesce(owned_skins, '{}'::text[]))
      and not ('cephas' = any(coalesce(owned_skins, '{}'::text[])))
  loop
    perform public.grant_skins(r.id, array['cephas']);
  end loop;
end $$;

notify pgrst, 'reload schema';
