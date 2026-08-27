// Native in-app purchase — the app half of commerce, on both stores.
//
// versearcade.org sells cosmetic packs through Stripe Payment Links (lib/config).
// The App Store and Play builds MAY NOT: Apple requires digital cosmetics to be
// sold through in-app purchase (Review Guideline 3.1.1) and Google requires the
// same through Play Billing (Payments policy). So the same catalog is sold two
// ways — Stripe on the web, the platform's own billing in the app — and this
// file is the only place that knows the native half, the way lib/config owns the
// Stripe half.
//
// ONE PLUGIN, TWO STORES. RevenueCat fronts StoreKit on iOS and Play Billing on
// Android with one API, so everything below is written once and differs only in
// (a) which public SDK key configures it and (b) which product id each sku maps
// to. The server half doesn't branch at all: `iap-fulfill` (0047) asks
// RevenueCat what the subscriber owns, and RevenueCat already knows which store
// the purchase came from.
//
// EVERYTHING HERE FAILS CLOSED. If the platform's key is missing, the SDK won't
// configure, or the store returns no products, `useIap.ready` stays false and
// lib/commerce keeps the storefront hidden exactly as it is with no IAP at all.
// A native build that *can't* sell must never show a price: a hidden shop is
// compliant, a broken shop is a rejection.
//
// PRICES ARE NEVER HARDCODED HERE. Both stores return a localized price string
// for the buyer's own storefront (£, €, ¥, and every tax rule behind them) and
// that is the only thing we display. Shipping a hardcoded "$99.99" would be
// wrong for every non-US buyer and is its own review risk. The `price` fields in
// data/avatar are the WEB (Stripe) prices and must not leak into the app.

import { BUNDLES, FULL_SKINS } from '@/data/avatar'
import { nativePlatform, type NativePlatform } from './appStore'

/**
 * RevenueCat's PUBLIC SDK keys — `appl_...` for iOS, `goog_...` for Android.
 * Public by design: they only identify the app to RevenueCat and can't grant
 * anything on their own; the secret key lives server-side and never ships.
 *
 * Unset ⇒ no storefront on that platform, which is the safe default, so a build
 * that forgets one degrades to "no shop" instead of showing a shop that can't
 * take money. Android shipping before its key exists is therefore fine.
 */
export const REVENUECAT_IOS_KEY = import.meta.env.VITE_REVENUECAT_IOS_KEY || ''
export const REVENUECAT_ANDROID_KEY = import.meta.env.VITE_REVENUECAT_ANDROID_KEY || ''

const KEY_BY_PLATFORM: Record<NativePlatform, string> = {
  ios: REVENUECAT_IOS_KEY,
  android: REVENUECAT_ANDROID_KEY,
}

/**
 * WHAT THE APP SELLS: the whale, and nothing else.
 *
 * The web catalog is bigger — packs, single skins, the lot (data/avatar) — but
 * the native builds list exactly one product, the founding-supporter whale.
 * Everything else in the catalog stays *visible and wearable* if the player
 * already owns it (bought on the website, earned, or redeemed with a code); it
 * simply isn't for sale inside the app.
 *
 * This is the deliberate narrow surface, not an oversight. Adding a sku here
 * means creating the product in BOTH stores and getting it approved in both, and
 * every extra product is another thing that can be misconfigured into a dead
 * tile. Anything absent from these maps is unpurchasable on native and hidden by
 * lib/commerce, which is exactly the behavior we want by default.
 *
 * The sku is the SERVER's vocabulary and is shared with the Stripe path: a
 * bundle is `pack_<id>` and a single skin is its skin id, exactly what
 * `pack_skins()` and `fulfill_skin()` expect (migration 0044).
 *
 * Product ids differ per store on purpose. Apple's are reverse-DNS because App
 * Store Connect ids are global across all of Apple; Play's are already scoped to
 * the package name, so Google's own convention is a bare short id. Keep both in
 * sync with the products actually created in App Store Connect / Play Console —
 * a typo is a product that silently never loads, which (fail-closed) shows up as
 * a missing tile rather than a crash.
 */
export const PRODUCT_IDS: Record<NativePlatform, Record<string, string>> = {
  ios: {
    whale: 'com.versearcade.app.patron_founding',
  },
  android: {
    whale: 'patron_founding',
  },
}

/** The sku → product id map for whichever store this build is standing in. */
function productIds(): Record<string, string> {
  const platform = nativePlatform()
  return platform ? PRODUCT_IDS[platform] : {}
}

/** Every product id we ask the current store about, in one array. */
export const allProductIds = (): string[] => Object.values(productIds())

export function skuForProductId(productId: string): string | undefined {
  return Object.entries(productIds()).find(([, pid]) => pid === productId)?.[0]
}

/**
 * The skins a sku grants — the client mirror of SQL `pack_skins()` (0044).
 * Derived from BUNDLES rather than a second hand-written list, so a pack's
 * contents can't drift from the catalog the shop renders. Keep in sync with the
 * SQL: a bundle grants all of its skins, a single sku grants itself.
 *
 * Still bundle-aware even though the native catalog currently sells no bundle:
 * this also expands what the store reports the player ALREADY owns, and a pack
 * bought on the web before the app existed still comes back through RevenueCat.
 */
export function skinsForSku(sku: string): string[] {
  const bundle = BUNDLES.find((b) => b.sku === sku)
  if (bundle) return [...bundle.skins]
  return FULL_SKINS.some((s) => s.id === sku) ? [sku] : []
}

/** A product as the store describes it — the price is the store's, localized. */
export interface IapProduct {
  sku: string
  productId: string
  /** Localized, tax-inclusive where required, e.g. "$99.99" / "£99.99" / "¥15,000". */
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

// PRODUCT_CATEGORY is a runtime enum in the RevenueCat SDK, and importing it as
// a value would defeat the lazy import above and pull the plugin into the web
// bundle. The string is the enum's own value (PRODUCT_CATEGORY.NON_SUBSCRIPTION
// === 'NON_SUBSCRIPTION'), so this cast is a types-only workaround, not a lie.
// It matters on Android, where Play Billing genuinely needs to be told whether
// it's querying in-app products or subscriptions; iOS ignores it.
const NON_SUBSCRIPTION = 'NON_SUBSCRIPTION' as never

/** Can this build sell anything at all? Native + a key for THIS platform. */
export function iapAvailable(): boolean {
  const platform = nativePlatform()
  return !!platform && KEY_BY_PLATFORM[platform] !== ''
}

/**
 * Start the SDK and hand it the account it should attribute purchases to.
 *
 * `appUserId` is the Supabase user id when signed in, so a purchase follows the
 * account across devices AND across stores — someone who bought on an iPhone and
 * signs in on Android gets the whale, because the server asks RevenueCat about
 * the user, not about the device. Guests pass null and get RevenueCat's
 * anonymous id, which still restores on the same device/store account — the same
 * LOCAL-vs-ONLINE split every other store in this app makes.
 */
export async function configureIap(appUserId: string | null): Promise<void> {
  if (!iapAvailable()) return
  const platform = nativePlatform()
  if (!platform) return
  const { Purchases } = await loadSdk()
  const { isConfigured } = await Purchases.isConfigured()
  if (isConfigured) {
    if (appUserId) await Purchases.logIn({ appUserID: appUserId })
    return
  }
  await Purchases.configure({ apiKey: KEY_BY_PLATFORM[platform], appUserID: appUserId })
}

/**
 * Ask the store for the catalog. Returns only what the store actually returned —
 * a product that isn't approved, isn't in this storefront, or is misspelled in
 * PRODUCT_IDS simply doesn't come back, and its tile stays hidden rather than
 * showing a price the user can't pay.
 */
export async function fetchProducts(): Promise<IapProduct[]> {
  if (!iapAvailable()) return []
  const ids = allProductIds()
  if (!ids.length) return []
  const { Purchases } = await loadSdk()
  const { products } = await Purchases.getProducts({
    productIdentifiers: ids,
    type: NON_SUBSCRIPTION,
  })
  return products.flatMap((p) => {
    const sku = skuForProductId(p.identifier)
    return sku ? [{ sku, productId: p.identifier, priceString: p.priceString }] : []
  })
}

export interface PurchaseOutcome {
  /** False when the user simply backed out — not an error, and never surfaced. */
  cancelled: boolean
  /** The store's transaction id, for the server's idempotency key. */
  transactionId: string | null
  /** Every product id RevenueCat believes this account owns, post-purchase. */
  ownedProductIds: string[]
}

/**
 * Run the platform's purchase sheet for one sku.
 *
 * A cancel is reported, not thrown — backing out of the sheet is ordinary and
 * must never look like a failure. Anything else throws, so the caller can say
 * "that didn't go through" without inventing an entitlement.
 */
export async function purchaseSku(sku: string): Promise<PurchaseOutcome> {
  const { Purchases } = await loadSdk()
  const productId = productIds()[sku]
  if (!productId) throw new Error(`No native product for sku ${sku}`)

  const { products } = await Purchases.getProducts({
    productIdentifiers: [productId],
    type: NON_SUBSCRIPTION,
  })
  const product = products[0]
  if (!product) throw new Error(`The store has no product ${productId}`)

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
 * (Guideline 3.1.1) — an app that can't restore is rejected. Google doesn't
 * mandate the control, but Play Billing has exactly the same reinstall problem,
 * and a buyer who loses a $99.99 skin is a support ticket on either store. Same
 * control, both platforms.
 */
export async function restorePurchases(): Promise<string[]> {
  if (!iapAvailable()) return []
  const { Purchases } = await loadSdk()
  const { customerInfo } = await Purchases.restorePurchases()
  return customerInfo.allPurchasedProductIdentifiers ?? []
}

/**
 * Product ids → the skin ids they entitle, expanded through packs.
 *
 * Deliberately looks across BOTH stores' maps rather than just this device's:
 * RevenueCat reports everything the subscriber owns, and someone who bought on
 * iOS and reinstalled on Android must still have their purchase recognised here.
 */
export function skinsForProductIds(productIds: string[]): string[] {
  const bySku = new Map<string, string>()
  for (const map of Object.values(PRODUCT_IDS)) {
    for (const [sku, pid] of Object.entries(map)) bySku.set(pid, sku)
  }
  const skins = productIds.flatMap((pid) => {
    const sku = bySku.get(pid)
    return sku ? skinsForSku(sku) : []
  })
  return [...new Set(skins)]
}

// RevenueCat surfaces a cancel as userCancelled on the error object, with the
// store code as a fallback for older shapes.
function isUserCancelled(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false
  const err = e as { userCancelled?: boolean; code?: string | number; message?: string }
  if (err.userCancelled === true) return true
  if (err.code === '1' || err.code === 1) return true
  return /cancel/i.test(err.message ?? '')
}
