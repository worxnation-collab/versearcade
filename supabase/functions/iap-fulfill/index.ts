// iap-fulfill — grant the skins an Apple purchase actually paid for.
//
// THE POINT OF THIS FUNCTION IS THAT IT DOES NOT BELIEVE THE CLIENT.
//
// The first cut of migration 0047 exposed `fulfill_apple_purchase(p_sku,
// p_skins, p_transaction_id)` to `authenticated` and granted whatever the
// caller asked for, intersected with what that sku is worth. Nothing in it
// established that a purchase had happened, so any signed-in user — from the
// website, with the public anon key that ships in the bundle — could hand
// themselves every paid cosmetic. That is precisely what enforce_skin_entitlement
// (0043/0044) exists to prevent. See issue #88; that RPC was never applied and
// this replaces it.
//
// Here the client sends NOTHING about the purchase. It says "settle up", and the
// server asks RevenueCat what this subscriber actually owns, using the SECRET
// key, which never leaves the edge. A tampered client can lie all it likes; the
// answer comes from RevenueCat either way.
//
// Identity: lib/iap.ts configures RevenueCat with `appUserID` = the Supabase
// profile id (store/iap.ts passes it, and only when online), so the caller's
// auth.uid() IS the RevenueCat subscriber id. That equivalence is what makes
// this lookup meaningful — if it ever stops being true, this function silently
// grants nothing rather than granting the wrong thing.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   REVENUECAT_SECRET_KEY   required. Missing ⇒ 503 and nothing is granted.
// SUPABASE_* are injected by the platform.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RC_SECRET = Deno.env.get('REVENUECAT_SECRET_KEY') ?? ''

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * Apple product id → our sku vocabulary.
 *
 * This map is the allowlist: a product id that isn't here grants nothing, so an
 * id invented by a caller (or added in App Store Connect but not here) is
 * simply ignored. What each sku is WORTH is not decided here — pack_skins() in
 * SQL stays the single authority for that, exactly as the Stripe path uses it.
 *
 * IT IS DELIBERATELY LONGER THAN APPLE_PRODUCT_IDS IN src/lib/iap.ts, and the
 * two must NOT be trimmed together. That list decides what the app OFFERS; this
 * one decides what a purchase somebody already made is WORTH. The angels pack
 * and the three launch skins stopped being sold in the de-monetisation, but
 * people bought them — deleting their rows here would mean a buyer who
 * reinstalls and taps Restore silently gets nothing back. An entry for a
 * product no longer on sale costs nothing: RevenueCat only ever reports it for
 * a subscriber who actually paid.
 *
 * So: add a row when a product goes on sale, and never remove one.
 */
const SKU_BY_PRODUCT_ID: Record<string, string> = {
  'com.versearcade.app.pack_angels': 'pack_angels',
  'com.versearcade.app.skin_moses': 'moses',
  'com.versearcade.app.skin_esther': 'esther',
  'com.versearcade.app.skin_elijah': 'elijah',
  'com.versearcade.app.patron_founding': 'whale',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

interface RcPurchase {
  id?: string
  store_transaction_id?: string
  purchase_date?: string
  store?: string
}

/**
 * Ask RevenueCat what this subscriber owns.
 *
 * Returns the product ids with at least one recorded non-subscription purchase,
 * plus the best transaction id we can find for each (for the idempotency
 * ledger). A 404 means RevenueCat has never seen this user — not an error, just
 * nothing to grant.
 */
async function ownedFromRevenueCat(
  appUserId: string,
): Promise<{ productIds: string[]; txnByProduct: Record<string, string | null>; raw: unknown }> {
  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
    { headers: { Authorization: `Bearer ${RC_SECRET}`, Accept: 'application/json' } },
  )
  if (res.status === 404) return { productIds: [], txnByProduct: {}, raw: null }
  if (!res.ok) throw new Error(`RevenueCat ${res.status}: ${(await res.text()).slice(0, 300)}`)

  const body = await res.json()
  // Non-consumables land in `non_subscriptions`, keyed by product identifier,
  // each holding an array of purchase records. Read defensively: an empty array
  // is "no purchase", and an unexpected shape must grant nothing rather than
  // throw a 500 at a player who just paid.
  const ns = (body?.subscriber?.non_subscriptions ?? {}) as Record<string, RcPurchase[]>
  const productIds: string[] = []
  const txnByProduct: Record<string, string | null> = {}
  for (const [productId, purchases] of Object.entries(ns)) {
    if (!Array.isArray(purchases) || purchases.length === 0) continue
    productIds.push(productId)
    const last = purchases[purchases.length - 1] ?? {}
    txnByProduct[productId] = last.store_transaction_id ?? last.id ?? null
  }
  return { productIds, txnByProduct, raw: body?.subscriber?.non_subscriptions ?? null }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  try {
    // Fail closed. An unconfigured function must never fall back to trusting
    // the caller — that is the whole bug this replaces.
    if (!RC_SECRET) return json({ error: 'purchases are not configured' }, 503)

    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
    } = await userClient.auth.getUser()
    if (!user) return json({ error: 'not signed in' }, 401)

    const { productIds, txnByProduct, raw } = await ownedFromRevenueCat(user.id)
    if (productIds.length === 0) {
      // Deliberately not an error: a restore with nothing to restore, or a
      // purchase RevenueCat hasn't recorded yet, both land here. `seen` is
      // echoed so a first-run mismatch is diagnosable without guesswork.
      return json({ granted: [], seen: raw })
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    // Expand each owned product into skins via pack_skins(), the same authority
    // the Stripe path uses, so a pack's contents can never drift between the
    // two checkouts. A sku that isn't a pack is worth itself.
    const granted = new Set<string>()
    for (const productId of productIds) {
      const sku = SKU_BY_PRODUCT_ID[productId]
      if (!sku) continue // unknown product — ignore rather than guess
      const { data: packSkins, error } = await admin.rpc('pack_skins', { p_sku: sku })
      if (error) throw new Error(`pack_skins(${sku}): ${error.message}`)
      const skins: string[] = Array.isArray(packSkins) && packSkins.length ? packSkins : [sku]
      for (const s of skins) granted.add(s)

      // Ledger: one row per transaction, so a replayed restore is a no-op and
      // there's something to reconcile against App Store Connect later.
      await admin
        .from('apple_purchases')
        .upsert(
          {
            transaction_id: txnByProduct[productId] ?? `${user.id}:${productId}`,
            user_id: user.id,
            sku,
            skins,
          },
          { onConflict: 'transaction_id', ignoreDuplicates: true },
        )
    }

    const skins = [...granted]
    if (skins.length) {
      // grant_skins is service_role-only and sets app.grant_ok, which is what
      // lets the write past enforce_skin_entitlement. Distinct-union inside, so
      // re-granting an owned skin is harmless.
      const { error } = await admin.rpc('grant_skins', { p_uid: user.id, p_skins: skins })
      if (error) throw new Error(`grant_skins: ${error.message}`)
    }

    return json({ granted: skins })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
