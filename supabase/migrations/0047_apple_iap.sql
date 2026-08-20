-- Verse Arcade — Apple in-app purchase fulfillment.
-- ---------------------------------------------------------------------------
-- The web sells cosmetic packs through Stripe (fulfill_skin, 0034/0043/0044).
-- The App Store build sells the same catalog through in-app purchase instead
-- (Review Guideline 3.1.1). Same catalog, same entitlements, second checkout.
--
-- WHAT CHANGED, AND WHY IT MATTERS
--
-- The first version of this file exposed
--     fulfill_apple_purchase(p_sku, p_skins, p_transaction_id)
-- to `authenticated` and granted what the caller asked for, intersected with
-- what that sku is worth. It never established that a purchase had happened.
-- No receipt, no signature, no callback from Apple or RevenueCat. Since
-- PostgREST exposes every function and the anon key ships in the web bundle,
-- ANY signed-in user could have handed themselves every paid cosmetic — the
-- exact attack enforce_skin_entitlement (0043, narrowed in 0044) exists to
-- stop, and which the old header in this very file called "the whole defense
-- against 'just PATCH owned_skins'".
--
-- That version was never applied to visuppaucpzzigwtqmdd, so there is nothing
-- to undo; this file is that migration, rewritten before its first run rather
-- than a repair on top of it. See issue #88.
--
-- Fulfillment now lives in the `iap-fulfill` Edge Function, which asks
-- RevenueCat what the subscriber actually owns using the SECRET key, and only
-- then calls grant_skins() with the service role. Verification needs a secret,
-- and a secret cannot live in a function the client can call — which is why
-- this migration deliberately creates NO client-callable grant path at all.
--
-- Client: src/store/iap.ts invokes the function; src/lib/iap.ts holds the
-- product ids. Keep the sku vocabulary identical to 0044 — a bundle is
-- 'pack_<id>', a single skin is its skin id.
--
-- Idempotent: `if not exists` / `create or replace` / `drop ... if exists`
-- throughout, so a re-run is a no-op (see CLAUDE.md — applied by hand).
-- ---------------------------------------------------------------------------

-- Every Apple purchase we've fulfilled, so a replayed restore can't
-- double-grant and there's a paper trail to reconcile against App Store
-- Connect. Written ONLY by the Edge Function, using the service role.
create table if not exists public.apple_purchases (
  transaction_id text primary key,
  user_id        uuid references auth.users(id) on delete set null,
  sku            text,
  skins          text[]      not null default '{}',
  created_at     timestamptz not null default now()
);

alter table public.apple_purchases enable row level security;

-- A buyer can read their own receipts. Nobody can write here through the API:
-- there is no insert/update/delete policy, and the service role bypasses RLS.
drop policy if exists apple_purchases_select_own on public.apple_purchases;
create policy apple_purchases_select_own on public.apple_purchases
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Remove the client-trusting RPC if it exists anywhere.
--
-- It was never applied to production, but a branch, a local stack, or a
-- preview database may have run the earlier file. Dropping it here means
-- applying this migration REPAIRS such an environment rather than leaving a
-- free-skins function sitting next to the fixed one. Idempotent by design.
-- ---------------------------------------------------------------------------
drop function if exists public.fulfill_apple_purchase(text, text[], text);

-- Note on grant_skins (0044): it is SECURITY DEFINER but its EXECUTE grant is
-- restricted to postgres and service_role — verified against production, not
-- assumed — so the Edge Function can call it and no client can. That, plus the
-- absence of any RPC here, is what makes purchases unforgeable.

notify pgrst, 'reload schema';
