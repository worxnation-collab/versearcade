-- Verse Arcade — the "Eden" thank-you skin.
-- ---------------------------------------------------------------------------
-- One exclusive skin ('eden' — Eve reaching for the fruit), handed out by promo
-- code to people who install from the App Store. Client catalog: FULL_SKINS in
-- src/data/avatar.ts.
--
-- Two server-side rules:
--   1. 'eden' joins the protected list in enforce_skin_entitlement, so no client
--      can write it into its own owned_skins. That list is restated here IN FULL
--      (it was last set by 0043_angels_pack) because the function is replaced
--      wholesale — dropping a name here would silently unlock that skin.
--   2. It is deliberately NOT added to fulfill_skin's single-skin allowlist
--      (0044_bundle_skus). It is not for sale, so Stripe must never be able to
--      grant it; the only ways in are redeem_code and admin_grant_skin, which
--      call grant_skins() directly and don't consult that allowlist.
--
-- Retiring it: toggle its code off in the admin panel (promo_codes.active), not
-- by expiring the skin — the client catalog gives 'eden' no `limitedUntil`, so
-- unlike the launch skins it never disappears out from under the people who
-- redeemed it.
--
-- Idempotent — create-or-replace plus on-conflict-do-nothing; re-running is a
-- no-op.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_skin_entitlement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  paid text[] := array[
    'moses','esther','elijah','whale','shades','gabriel','michael','seraph','eden'
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

-- Seed the thank-you code. Change the code, or flip it inactive, from the admin
-- panel at any time — nothing else references the literal.
insert into public.promo_codes(code, skin_id, active) values ('GARDEN', 'eden', true)
on conflict (code) do nothing;

notify pgrst, 'reload schema';
