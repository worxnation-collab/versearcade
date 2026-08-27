// Where the app is allowed to sell things — one decision, made once.
//
// The web app at versearcade.org sells cosmetic packs through Stripe Payment
// Links. The native builds sell through the platform's own billing instead —
// StoreKit on iOS (App Store Review Guideline 3.1.1), Play Billing on Android
// (Google Play Payments policy). Same rule, two stores.
//
// THE NATIVE CATALOG IS ONE PRODUCT: the founding-supporter whale. The web sells
// the whole catalog; the app sells the whale. That's a product decision, and it
// lives in PRODUCT_IDS in lib/iap — everything here just asks "can this store
// actually sell that?" and hides whatever it can't, which is what already makes
// the narrow catalog safe to render against the full one.
//
// ON ANTI-STEERING, precisely: since the Epic v. Apple injunction, apps on the
// UNITED STATES storefront may include buttons, external links and other calls
// to action pointing at an outside checkout, with no entitlement required. That
// exception is US-only — in every other storefront, linking out is still
// prohibited. Because the storefront is a per-device runtime fact, this app
// takes the one path that is correct everywhere and sells through IAP full
// stop. That's a deliberate simplification, not a legal requirement; adding a
// US-only Stripe path later means detecting the storefront here, and nowhere
// else.
//
// Where a shop is shown at all, the old rule still binds: don't show a price
// you can't charge, name a pack you can't sell, or point outside the app in a
// storefront that forbids it. Hiding only the checkout button isn't enough — a
// "$5.99" label and a "purchases are opening soon" line are still a storefront.
//
// So the same catalog is sold two ways: Stripe on the web, native billing in the
// app (lib/iap + store/iap). Until the store actually returns products, native
// hides the marketplace entirely — the state this file originally shipped, and
// still the fallback whenever IAP isn't usable. That's also how Android ships
// before its Play products exist: no products, no shop, nothing to reject.
//
// Everything else is identical to the web either way: earned skins, promo-code
// skins, churches, battles, and every cosmetic the player already owns —
// including packs they bought on the website, which stay wearable and visible
// on their profile. Letting a player USE content they bought elsewhere is fine;
// advertising a sale the app can't complete is not.
//
// This is deliberately the ONLY place that decision lives, so the app and the
// site can't drift apart by accident — every commerce surface asks these.

import type { SkinDef } from '@/data/avatar'
import { useIap } from '@/store/iap'
import { isNativeApp } from './appStore'

/**
 * Subscribe a component to the storefront, and get back whether it's open.
 *
 * EVERY COMMERCE SURFACE MUST CALL THIS ONCE, at the top, even if it ignores the
 * result. Here's why: the helpers below read the IAP store with
 * `useIap.getState()` rather than as a hook, deliberately — they're called from
 * inside `.filter()` callbacks and non-component code, where hooks are illegal.
 * But an imperative read creates no subscription, so a component that only calls
 * them never re-renders when the catalog finally arrives from the store.
 *
 * That is not theoretical. The catalog lands ~a second after the customizer
 * mounts (store/iap `load()` is async), and until something else re-rendered
 * CustomizeSection the shop stayed hidden with "Skins are earned" showing —
 * on a device that could sell perfectly well. Collapsing a <Section> didn't fix
 * it either: Section's own state change re-renders Section, but `children` is an
 * element tree the PARENT already built, so the parent's render never re-runs
 * and none of these functions are re-evaluated.
 *
 * Subscribing to `ready` and `products` is what turns the arrival of the catalog
 * into a render. Once that render happens, every imperative helper below returns
 * the right answer.
 */
export function useStorefront(): boolean {
  const ready = useIap((s) => s.ready)
  // Subscribed for the re-render, not the value: a sku can become purchasable
  // (or stop being) without `ready` itself changing.
  useIap((s) => s.products)
  return !isNativeApp() || ready
}

/**
 * May this build show a storefront at all — prices, packs, checkout?
 *
 * Web always: it sells through Stripe. Native only once the store has actually
 * returned products (see store/iap), because that is the only state in which
 * the app can complete a sale. Missing key, offline, products not approved yet ⇒
 * false ⇒ the whole marketplace stays hidden, which is exactly the compliant
 * behavior this file shipped with. Fail closed, never open.
 */
export const storefrontEnabled = (): boolean =>
  !isNativeApp() || useIap.getState().ready

/**
 * The price to SHOW for a sku.
 *
 * On native this is the store's own localized string for the buyer's storefront
 * — never the `price` fields in data/avatar, which are the web/Stripe prices in
 * USD and would be wrong for every other currency (and misstate the actual
 * charge, which both stores reject). On web, the catalog price stands.
 *
 * Returns undefined on native for anything the store didn't return, which is
 * every sku outside the native catalog. Callers MUST treat undefined as "don't
 * render this" — a tile that prints it anyway shows the literal word
 * "undefined" where a price goes, which is a storefront defect, not a cosmetic
 * one. bundleVisible/skinVisible below exist so no caller has to remember.
 */
export function displayPrice(sku: string, webPrice?: string): string | undefined {
  if (!isNativeApp()) return webPrice
  return useIap.getState().products[sku]?.priceString
}

/** Is this sku actually purchasable right now, in whichever store applies? */
export function skuPurchasable(sku: string): boolean {
  if (!isNativeApp()) return true
  return !!useIap.getState().products[sku]
}

/**
 * Should this skin appear in the Skins grid at all?
 *
 * On web, everything shows. On native, a paid skin shows only if this store can
 * actually sell it, or it's already owned — so the grid never advertises
 * something with no way to get it. With a whale-only native catalog that hides
 * the other paid skins on native, which is the intended outcome. Earned skins
 * (shared days, referrals) and promo-code exclusives are free — no price, no
 * checkout — so they stay exactly as they are on the web.
 */
export function skinVisible(skin: SkinDef, owned: boolean): boolean {
  // On native, a priced skin is listed only if the store will actually sell it —
  // a tile with no product behind it is a dead end and a review risk.
  if (isNativeApp() && storefrontEnabled() && skin.source === 'paid' && !owned) {
    return skin.bundleOnly ? false : skuPurchasable(skin.id)
  }
  if (storefrontEnabled()) return true
  if (skin.source === 'earned') return true
  if (skin.exclusive) return true // redeemed with a free code, never sold
  return owned
}

/**
 * Should this bundle be listed as a pack for sale?
 *
 * The skins grid renders BUNDLES as one big tile with a price on it, and that
 * tile is a storefront in its own right — so it needs the same gate the skins
 * do, not just `storefrontEnabled()`. On native with a whale-only catalog the
 * store returns no product for `pack_angels`, so displayPrice() gives undefined
 * and the tile would advertise a pack at a price of "undefined" that no tap
 * could ever buy. That's the exact failure lib/iap fails closed to avoid, and
 * the pack tile was the one surface still reaching past it.
 *
 * Owned packs don't come through here at all — the caller filters entitled packs
 * out before asking, because a pack you own stops being a listing.
 */
export function bundleVisible(bundle: { sku: string }): boolean {
  if (!storefrontEnabled()) return false
  return skuPurchasable(bundle.sku)
}

/**
 * Should this player-card background appear? Same rule as skins: a card that
 * only comes with a paid pack is hidden on native until the pack is owned,
 * rather than sitting locked behind a pack the app can't sell.
 */
export function cardBgVisible(def: { pack?: string }, unlocked: boolean): boolean {
  if (storefrontEnabled()) return true
  return !def.pack || unlocked
}
