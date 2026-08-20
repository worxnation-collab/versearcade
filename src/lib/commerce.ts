// Where the app is allowed to sell things — one decision, made once.
//
// The web app at versearcade.org sells cosmetic packs through Stripe Payment
// Links. The native App Store / Play build MAY NOT: Apple requires digital
// cosmetics to be sold through in-app purchase (App Store Review Guideline
// 3.1.1), and the anti-steering rules mean a native build must not show a
// price, name a pack you can't buy here, or point anywhere outside the app to
// buy one. Hiding only the checkout button isn't enough — a "$5.99" label and a
// "purchases are opening soon" line are still a storefront.
//
// So the same catalog is sold two ways: Stripe on the web, Apple in-app
// purchase in the app (lib/iap + store/iap). Until StoreKit actually has the
// products, native hides the marketplace entirely — the state this file
// originally shipped, and still the fallback whenever IAP isn't usable.
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
 * May this build show a storefront at all — prices, packs, checkout?
 *
 * Web always: it sells through Stripe. Native only once StoreKit has actually
 * returned products (see store/iap), because that is the only state in which
 * the app can complete a sale through Apple. Missing key, offline, products not
 * approved yet ⇒ false ⇒ the whole marketplace stays hidden, which is exactly
 * the compliant behavior this file shipped with. Fail closed, never open.
 */
export const storefrontEnabled = (): boolean =>
  !isNativeApp() || useIap.getState().ready

/**
 * The price to SHOW for a sku.
 *
 * On native this is Apple's own localized string for the buyer's storefront —
 * never the `price` fields in data/avatar, which are the web/Stripe prices in
 * USD and would be wrong for every other currency (and misstate the actual
 * charge, which Apple rejects). On web, the catalog price stands.
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
 * On web, everything shows. On native, a paid skin shows only once it's owned,
 * so the grid never advertises something with no way to get it. Earned skins
 * (shared days, referrals) and promo-code exclusives are free — no price, no
 * checkout — so they stay exactly as they are on the web.
 */
export function skinVisible(skin: SkinDef, owned: boolean): boolean {
  // On native, a priced skin is listed only if Apple will actually sell it —
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
 * Should this player-card background appear? Same rule as skins: a card that
 * only comes with a paid pack is hidden on native until the pack is owned,
 * rather than sitting locked behind a pack the app can't sell.
 */
export function cardBgVisible(def: { pack?: string }, unlocked: boolean): boolean {
  if (storefrontEnabled()) return true
  return !def.pack || unlocked
}
