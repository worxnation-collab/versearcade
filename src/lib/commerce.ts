// Where the app is allowed to sell things — one decision, made once.
//
// There is now exactly ONE thing for sale anywhere in Verse Arcade: the
// Founding Patron whale. The cosmetic packs that used to be sold — Exodus,
// Palace, Prophets, the Angel Pack — are earned by playing (see the
// requirements in data/avatar), and the Day One skin is a free code. That
// change makes most of this file quiet, and it deliberately did NOT delete it:
// the whale still has to obey every rule below, and a future paid pack should
// land here rather than growing a second storefront somewhere else.
//
// The web sells through a Stripe Payment Link; the native App Store / Play
// build sells the same thing through Apple in-app purchase instead (App Store
// Review Guideline 3.1.1).
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
// Until StoreKit actually has the product, native hides the marketplace
// entirely — the state this file originally shipped, and still the fallback
// whenever IAP isn't usable.
//
// Everything else is identical either way: earned skins, code skins, churches,
// battles, and every cosmetic the player already owns — including the packs
// they bought on the website back when those were sold, which stay wearable and
// visible on their profile.
//
// This is deliberately the ONLY place that decision lives, so the app and the
// site can't drift apart by accident — every commerce surface asks these.

import { skinSource, type SkinDef } from '@/data/avatar'
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
 * Only one thing in the catalog is sold now — the Founding Patron whale — so
 * this question is almost always "yes". Earned skins and the free code skin
 * carry no price and open no checkout, which makes them identical on the web
 * and in the app; there is nothing for a storefront rule to hide.
 *
 * The paid one still follows the old rule: on native it is listed only if Apple
 * will actually sell it, because a tile with no product behind it is a dead end
 * and a review risk.
 */
export function skinVisible(skin: SkinDef, owned: boolean): boolean {
  if (skinSource(skin) !== 'paid') return true
  if (owned) return true
  if (isNativeApp()) return storefrontEnabled() && !skin.bundleOnly && skuPurchasable(skin.id)
  return true
}

/**
 * Should this player-card background appear? Every pack that ships cards is
 * earned now, so there is no longer a case where a card sits locked behind
 * something the app can't sell. Kept as the one place that decision lives, so
 * adding a paid pack later is a change here and nowhere else.
 */
export function cardBgVisible(_def: { pack?: string }, _unlocked: boolean): boolean {
  return true
}
