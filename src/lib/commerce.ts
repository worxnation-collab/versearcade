// Where the app is allowed to sell things — one decision, made once.
//
// The web app at versearcade.org sells cosmetic packs through Stripe Payment
// Links. The native App Store / Play build sells them through Apple in-app
// purchase instead (App Store Review Guideline 3.1.1).
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

import { skinExpired, type SkinDef } from '@/data/avatar'
import { useIap } from '@/store/iap'
import { useAuth } from '@/store/auth'
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
  // Free skins are nobody's storefront question — no price, no checkout, no
  // entitlement. Since the de-monetisation this covers the launch trio
  // (Moses, Esther, Elijah), which used to be $2.99 each.
  if (skin.source === 'free') return true
  // Road (pass) skins are earned by playing and never sold — no price, no
  // checkout, so they show everywhere, exactly like 'earned'. Hiding one on
  // native would hide free content, not a storefront.
  if (skin.source === 'pass') return true
  // A promo-code exclusive is not a storefront question either, and this has to
  // be decided BEFORE the native branch below — it wears source 'paid' to reuse
  // the owned_skins entitlement, so with StoreKit live it used to fall into
  // skuPurchasable() and vanish for want of a product that is never meant to
  // exist. It carries no price and no checkout ANYWHERE: an unowned one opens
  // the redeem prompt (CustomizeSection), draws "🔒 <packName>" rather than an
  // amount, and is excluded from `pricedOnShelf` by name. So showing it in the
  // App Store build is showing free content, exactly as `pass` and `earned` are
  // — and hiding it would hide the thing a creator's audience was sent to
  // redeem, which is what CLAUDE.md means by "native still has free promo-code
  // skins, identical to web".
  if (skin.exclusive) return true // redeemed with a free code, never sold
  // A RETIRED skin is shown to its owners and to nobody else, in both stores.
  // It was withdrawn from sale, so listing it to a non-owner would be a tile
  // with no checkout behind it — the dead end the native rule below exists to
  // prevent, and just as wrong on the web where there is no longer a Payment
  // Link for it. Decided BEFORE the native branch for the reason `exclusive` is:
  // it wears source 'paid', and `skuPurchasable` would otherwise hide it from
  // the buyers it belongs to the moment StoreKit came up without it.
  if (skin.retired) return owned
  // On native, a priced skin is listed only if Apple will actually sell it —
  // a tile with no product behind it is a dead end and a review risk.
  if (isNativeApp() && storefrontEnabled() && skin.source === 'paid' && !owned) {
    return skin.bundleOnly ? false : skuPurchasable(skin.id)
  }
  if (storefrontEnabled()) return true
  if (skin.source === 'earned') return true
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

/**
 * The founding patron is the ONE thing in this app that still has a price, and
 * `cephas` is its sku in both stores — the Stripe link in `lib/config` and
 * `APPLE_PRODUCT_IDS` in `lib/iap` are keyed on it.
 *
 * It was `whale` until the rock replaced it. The SKU is ours and changed; the
 * Apple PRODUCT ID deliberately did not (`com.versearcade.app.patron_founding`
 * is already approved, so the new skin goes on sale in every existing build
 * without waiting on review — see lib/iap). Anyone who bought the whale owns
 * this by `supersedes` in data/avatar plus the backfill in migration 0095, so
 * `patronOffer` returns 'owned' for them and they are never asked twice.
 */
export const PATRON_SKU = 'cephas'

/**
 * What the support card on /you should draw.
 *
 * Cosmetics are no longer sold, so this is the whole shop, and the rule the
 * de-monetisation left standing still binds: don't show a price you can't
 * charge. Hence three states rather than a boolean —
 *
 *   `owned`  — already a patron. Draws a thank-you and NO checkout: the whole
 *              point of a one-off thank-you is that it is asked for once.
 *   `buy`    — a sale can actually be completed here.
 *   `hidden` — it cannot, so the card does not render AT ALL. Not a greyed
 *              button, not "opening soon" (CLAUDE.md: that line is still a
 *              storefront), not a price with nothing behind it.
 *
 * Fails closed on native for the reason `storefrontEnabled` does: no
 * RevenueCat key, no network, or a product not yet approved ⇒ hidden, which is
 * the compliant state and the one this app shipped with before IAP existed.
 */
export type PatronOffer = 'buy' | 'owned' | 'hidden'

export function patronOffer(skin: SkinDef, owned: boolean, webUrl: string): PatronOffer {
  // A GUEST MAY NOT BUY THIS, and the reason is delivery rather than policy.
  // Both fulfilment paths land the skin on a server-side account: Stripe's
  // webhook splits `client_reference_id` ("<username>-<skinId>") to find the
  // profile to grant, and `iap-fulfill` asks RevenueCat what a signed-in
  // subscriber owns. A guest has no such row, so the money would arrive with
  // nothing to attach it to — taking a payment we cannot deliver. Found by
  // driving /you as a guest, where this card renders above "Create account".
  //
  // This is NOT `useAccountLocked()`'s rule and deliberately doesn't reuse it:
  // that wall stands down in a keyless LOCAL build so a developer isn't shown
  // five padlocks with no backend to sign up to. Here a keyless build genuinely
  // cannot complete a sale either, so hiding is right in both cases.
  if (useAuth.getState().mode === 'local') return 'hidden'
  // Expiry first, and it hides the card for OWNERS too. That looks harsh and is
  // deliberately the same rule the Skins grid already applies (`skinExpired` +
  // the filter in CustomizeSection): a limited thank-you that keeps advertising
  // itself after its window has closed is a different promise from the one the
  // patron was sold.
  //
  // As of the rock this is a dormant branch rather than a live one: Cephas
  // carries no `limitedUntil`, so the shop no longer retires itself on a date
  // (the whale's expiry did, and that entry is retired instead — see
  // data/avatar). Kept, because whether the patron product expires is a
  // decision that lives in the catalog, and this file should keep honouring it
  // either way.
  if (skinExpired(skin)) return 'hidden'
  if (owned) return 'owned'
  if (!storefrontEnabled()) return 'hidden'
  // Native: only once StoreKit has this exact product. Web: only if a real
  // checkout URL is configured — an unset link would otherwise render a button
  // that opens nothing.
  return (isNativeApp() ? skuPurchasable(PATRON_SKU) : !!webUrl) ? 'buy' : 'hidden'
}
