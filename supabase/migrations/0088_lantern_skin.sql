-- Verse Arcade — the "Light in the Darkness" creator-collab skin.
-- ---------------------------------------------------------------------------
-- One exclusive skin ('lantern' — a friendly carved jack-o'-lantern head, an
-- indigo hooded cloak, a lit brass lantern raised in one hand), given to the
-- people who arrive through Tyler Talks 2 U. Client catalog: FULL_SKINS in
-- src/data/avatar.ts; the art is a Nano Banana render (art/skins-lantern.json
-- -> public/skins/lantern.png) wired through GENERATED_ART, so no RASTER_SKINS
-- edit was needed.
--
-- Three server-side rules, the same shape as 0057_sonshine_skin and
-- 0082_porchlight_skin:
--   1. 'lantern' joins the protected list in enforce_skin_entitlement, so no
--      client can write it into its own owned_skins. THAT LIST IS RESTATED HERE
--      IN FULL because the function is replaced wholesale — dropping a name
--      would silently unlock that skin for everyone. It was last set by
--      0082_porchlight_skin (0031, 0034, 0043, 0044, 0046 and 0057 all set it
--      earlier and are superseded); the eleven names below are 0082's list
--      verbatim, plus the new one.
--   2. It is deliberately NOT added to fulfill_skin's allowlist (0044, still
--      'moses','esther','elijah','whale','shades'). It is not for sale, so
--      Stripe and the IAP path must never be able to grant it; the ways in are
--      redeem_code, admin_grant_skin, and grant_skins() called directly.
--   3. Prefer grant_skins() over admin_grant_skin() for the collab grants.
--      admin_grant_skin also writes a skin_purchases row with reason='manual'
--      (0035_manual_grants_as_sales), which puts a free creator grant in the
--      dashboard Sales tab as though it were revenue. grant_skins() is the
--      entitlement without the receipt. The creator's own copy was granted that
--      way when this shipped.
--
-- IT LOOKS SEASONAL AND IS NOT. The client catalog gives 'lantern' no
-- `limitedUntil`, on purpose and more pointedly than the other three: a
-- Halloween skin that expired in November would disappear out from under
-- everybody who redeemed it. Retire it the way the others retire — toggle its
-- code off in the admin panel (promo_codes.active) — never by expiring the skin.
--
-- Idempotent — create-or-replace plus on-conflict-do-nothing; re-running is a
-- no-op.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_skin_entitlement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  paid text[] := array[
    'moses','esther','elijah','whale','shades','gabriel','michael','seraph','eden','sonshine',
    'porchlight','lantern'
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

-- The code he hands his audience. Named for the creator rather than the skin,
-- because this is the string he has to say out loud on camera. Change it, or
-- flip it inactive, from the admin panel at any time — nothing else references
-- the literal, and redeem_code upper/trims whatever the player types.
insert into public.promo_codes(code, skin_id, active) values ('TYLERTALKS2U', 'lantern', true)
on conflict (code) do nothing;

notify pgrst, 'reload schema';
