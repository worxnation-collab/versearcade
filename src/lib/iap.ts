// Apple in-app purchase — the native half of commerce.
//
// versearcade.org sells cosmetic packs through Stripe Payment Links (lib/config).
// The App Store build MAY NOT: Apple requires digital cosmetics to be sold
// through in-app purchase (Review Guideline 3.1.1). So the same catalog is sold
// two ways — Stripe on the web, StoreKit in the app — and this file is the only
// place that knows the StoreKit half, the way lib/config owns the Stripe half.
//
// EVERYTHING HERE FAILS CLOSED. If the RevenueCat key is missing, the SDK won't
// configure, or StoreKit returns no products, `iapReady()` stays false and
// lib/commerce keeps the storefront hidden exactly as it is with no IAP at all.
// A native build that *can't* sell must never show a price: a hidden shop is
// compliant, a broken shop is a rejection.
//
// PRICES ARE NEVER HARDCODED HERE. Apple returns a localized price string for
// the user's own storefront (£, €, ¥, and every tax rule behind them) and that
// is the only thing we display. Shipping a hardcoded "$5.99" would be wrong for
// every non-US buyer and is its own review risk. The `price` fields in
// data/avatar are the WEB (Stripe) prices and must not leak into the app.

import { BUNDLES, FULL_SKINS } from '@/data/avatar'
import { isNativeApp } from './appStore'

/**
 * RevenueCat's PUBLIC iOS SDK key (`appl_...`). Public by design — it only
 * identifies the app to RevenueCat and can't grant anything on its own; the
 * secret key lives server-side and never ships. Unset ⇒ no storefront on
 * native, which is the safe default, so a build that forgets it degrades to
 * today's behavior instead of showing a shop that can't take money.
 */
export const REVENUECAT_IOS_KEY = import.meta.env.VITE_REVENUECAT_IOS_KEY || ''

/**
 * sku → Apple product id.
 *
 * The sku is the SERVER's vocabulary and is shared with the Stripe path: a
 * bundle is `pack_<id>` and a single skin is its skin id, exactly what
 * `pack_skins()` and `fulfill_skin()` expect (migration 0044). Keep this map in
 * sync with BUNDLES / FULL_SKINS in data/avatar and with the products created in
 * App Store Connect — a typo here is a product that silently never loads, which
 * (fail-closed) shows up as a missing tile rather than a crash.
 */
export const APPLE_PRODUCT_IDS: Record<string, string> = {
  whale: 'com.versearcade.app.patron_founding',
}

// The four products that used to be here — pack_angels, skin_moses,
// skin_esther, skin_elijah — are gone with the de-monetisation. Removing them
// from this map is what stops the app ASKING StoreKit about them, which matters
// more than it looks: a product still approved in App Store Connect but absent
// here simply never loads, and its tile stays hidden (fail closed). Anyone who
// BOUGHT one keeps it — entitlements are granted from what RevenueCat says the
// subscriber owns (supabase/functions/iap-fulfill), never from this list.
//
// Deactivate them in App Store Connect too, or they remain purchasable by a
// crafted client for a skin the app now gives away.

const SKU_BY_PRODUCT_ID: Record<string, string> = Object.fromEntries(
  Object.entries(APPLE_PRODUCT_IDS).map(([sku, pid]) => [pid, sku]),
)

/** Every product id we ask StoreKit about, in one array. */
export const ALL_PRODUCT_IDS = Object.values(APPLE_PRODUCT_IDS)

export const skuForProductId = (productId: string): string | undefined =>
  SKU_BY_PRODUCT_ID[productId]

/**
 * The skins a sku grants — the client mirror of SQL `pack_skins()` (0044).
 * Derived from BUNDLES rather than a second hand-written list, so the pack's
 * contents can't drift from the catalog the shop renders. Keep in sync with the
 * SQL: a bundle grants all of its skins, a single sku grants itself.
 */
export function skinsForSku(sku: string): string[] {
  const bundle = BUNDLES.find((b) => b.sku === sku)
  if (bundle) return [...bundle.skins]
  return FULL_SKINS.some((s) => s.id === sku) ? [sku] : []
}

/** A product as StoreKit describes it — the price is Apple's, already localized. */
export interface IapProduct {
  sku: string
  productId: string
  /** Localized, tax-inclusive where required, e.g. "$5.99" / "£5.99" / "¥900". */
  priceString: string
}

// The RevenueCat SDK is loaded lazily so it never enters the web bundle — the
// site has no use for it, and a static import would ship the whole plugin to
// every browser.
type PurchasesModule = typeof import('@revenuecat/purchases-capacitor')
let sdk: PurchasesModule | null = null

async function loadSdk(): Promise<PurchasesModule> {
  if (!sdk) sdk = await import('@revenuecat/purchases-capacitor')
  return sdk
}

/** Can this build sell anything at all? Native + a key + at least one product. */
export function iapAvailable(): boolean {
  return isNativeApp() && REVENUECAT_IOS_KEY !== ''
}

/**
 * Start the SDK and hand it the account it should attribute purchases to.
 *
 * `appUserId` is the Supabase user id when signed in, so a purchase follows the
 * account across devices and a reinstall restores it. Guests pass null and get
 * RevenueCat's anonymous id, which still restores on the same device/Apple ID —
 * the same LOCAL-vs-ONLINE split every other store in this app makes.
 */
export async function configureIap(appUserId: string | null): Promise<void> {
  if (!iapAvailable()) return
  const { Purchases } = await loadSdk()
  const { isConfigured } = await Purchases.isConfigured()
  if (isConfigured) {
    if (appUserId) await Purchases.logIn({ appUserID: appUserId })
    return
  }
  await Purchases.configure({ apiKey: REVENUECAT_IOS_KEY, appUserID: appUserId })
}

/**
 * Ask StoreKit for the catalog. Returns only what Apple actually returned — a
 * product that isn't approved, isn't in this storefront, or is misspelled here
 * simply doesn't come back, and its tile stays hidden rather than showing a
 * price the user can't pay.
 */
export async function fetchProducts(): Promise<IapProduct[]> {
  if (!iapAvailable()) return []
  const { Purchases } = await loadSdk()
  const { products } = await Purchases.getProducts({
    productIdentifiers: ALL_PRODUCT_IDS,
    // iOS ignores this; it keeps Android honest if a Play build follows.
    type: 'NON_SUBSCRIPTION' as never,
  })
  return products.flatMap((p) => {
    const sku = skuForProductId(p.identifier)
    return sku ? [{ sku, productId: p.identifier, priceString: p.priceString }] : []
  })
}

export interface PurchaseOutcome {
  /** False when the user simply backed out — not an error, and never surfaced. */
  cancelled: boolean
  /** Apple's transaction id, for the server's idempotency key. */
  transactionId: string | null
  /** Every product id RevenueCat believes this account owns, post-purchase. */
  ownedProductIds: string[]
}

/**
 * Run Apple's purchase sheet for one sku.
 *
 * A cancel is reported, not thrown — backing out of the sheet is ordinary and
 * must never look like a failure. Anything else throws, so the caller can say
 * "that didn't go through" without inventing an entitlement.
 */
export async function purchaseSku(sku: string): Promise<PurchaseOutcome> {
  const { Purchases } = await loadSdk()
  const productId = APPLE_PRODUCT_IDS[sku]
  if (!productId) throw new Error(`No Apple product for sku ${sku}`)

  const { products } = await Purchases.getProducts({
    productIdentifiers: [productId],
    type: 'NON_SUBSCRIPTION' as never,
  })
  const product = products[0]
  if (!product) throw new Error(`Apple has no product ${productId}`)

  try {
    const result = await Purchases.purchaseStoreProduct({ product })
    return {
      cancelled: false,
      transactionId: result.transaction?.transactionIdentifier ?? null,
      ownedProductIds: result.customerInfo.allPurchasedProductIdentifiers ?? [],
    }
  } catch (e) {
    if (isUserCancelled(e)) {
      return { cancelled: true, transactionId: null, ownedProductIds: [] }
    }
    throw e
  }
}

/**
 * Apple REQUIRES a visible "Restore Purchases" control for non-consumable IAP
 * (Guideline 3.1.1) — an app that can't restore is rejected, and a buyer who
 * reinstalls and loses a pack is a support ticket besides.
 */
export async function restorePurchases(): Promise<string[]> {
  if (!iapAvailable()) return []
  const { Purchases } = await loadSdk()
  const { customerInfo } = await Purchases.restorePurchases()
  return customerInfo.allPurchasedProductIdentifiers ?? []
}

/** Product ids → the skin ids they entitle, expanded through packs. */
export function skinsForProductIds(productIds: string[]): string[] {
  const skins = productIds.flatMap((pid) => {
    const sku = skuForProductId(pid)
    return sku ? skinsForSku(sku) : []
  })
  return [...new Set(skins)]
}

// RevenueCat surfaces a cancel as userCancelled on the error object, with the
// StoreKit code as a fallback for older shapes.
function isUserCancelled(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false
  const err = e as { userCancelled?: boolean; code?: string | number; message?: string }
  if (err.userCancelled === true) return true
  if (err.code === '1' || err.code === 1) return true
  return /cancel/i.test(err.message ?? '')
}
