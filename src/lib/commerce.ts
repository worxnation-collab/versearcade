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
// So native hides the whole marketplace. Everything else is identical to the
// web: earned skins, promo-code skins, churches, battles, and every cosmetic
// the player already owns — including packs they bought on the website, which
// stay wearable and visible on their profile. Letting a player USE content they
// bought elsewhere is fine; advertising the sale inside the app is not.
//
// This is deliberately the ONLY place that decision lives, so the app and the
// site can't drift apart by accident — every commerce surface asks these.

import type { SkinDef } from '@/data/avatar'
import { isNativeApp } from './appStore'

/** May this build show a storefront at all — prices, packs, checkout? Web only. */
export const storefrontEnabled = (): boolean => !isNativeApp()

/**
 * Should this skin appear in the Skins grid at all?
 *
 * On web, everything shows. On native, a paid skin shows only once it's owned,
 * so the grid never advertises something with no way to get it. Earned skins
 * (shared days, referrals) and promo-code exclusives are free — no price, no
 * checkout — so they stay exactly as they are on the web.
 */
export function skinVisible(skin: SkinDef, owned: boolean): boolean {
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
