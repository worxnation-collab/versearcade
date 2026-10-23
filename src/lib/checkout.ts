// The one place a skin purchase actually happens.
//
// There are two checkouts (Stripe on the web, Apple IAP in the app) and, since
// the patron card, two SURFACES that start one — the Skins grid and the support
// card on /you. Two surfaces each writing their own version of "which store am
// I in, and what do I pass it" is the drift `lib/commerce.ts` exists to prevent,
// one layer down: commerce decides WHETHER a thing may be sold here, this
// decides HOW the sale is started. Neither decision belongs in a component.
//
// The web path's `client_reference_id` is load-bearing rather than decorative:
// it is `<username>-<skinId>`, and the Stripe webhook splits it to know which
// account to grant which skin. Drop it and the money arrives with no way to
// tell whose it was.

import { useIap } from '@/store/iap'
import type { PurchaseOutcome } from '@/store/iap'
import { isNativeApp } from './appStore'
import { skinBuyUrl } from './config'

/**
 * `opened` is the web outcome and means only that the tab opened — Stripe
 * settles later through the webhook, so the caller must NOT claim the skin has
 * landed. `unavailable` means there is no checkout for this sku in this store,
 * which is a fail-closed state and never an error to apologise for.
 */
export type CheckoutResult = PurchaseOutcome | 'opened' | 'unavailable'

export async function startSkinCheckout(
  skinId: string,
  username: string,
): Promise<CheckoutResult> {
  // Apple's purchase sheet — the app may not check out anywhere else.
  if (isNativeApp()) return useIap.getState().buy(skinId)

  const base = skinBuyUrl(skinId)
  if (!base) return 'unavailable'
  const ref = encodeURIComponent(`${username}-${skinId}`)
  const url = base + (base.includes('?') ? '&' : '?') + 'client_reference_id=' + ref
  window.open(url, '_blank', 'noopener,noreferrer')
  return 'opened'
}

/**
 * Start the one-time Custom Leader Avatar purchase for a church (web only).
 *
 * Returns 'unavailable' until there is something real to open: on native (a
 * church add-on is never sold in the App Store build — `churchPricesVisible`),
 * and on the web while `CHURCH_PRODUCTS.customLeaderAvatar.priceId` is still a
 * placeholder.
 *
 * The wiring, when the Stripe price exists:
 *   1. Here: POST the `church-billing` Edge Function { action:
 *      'avatar-checkout', church_id } and open the Checkout Session URL it
 *      returns (mode 'payment', `client_reference_id` = the church id,
 *      metadata.product = 'custom_leader_avatar'). The church id rides as the
 *      reference exactly as 0131's subscription checkout does — drop it and
 *      the money arrives with no way to tell whose it was.
 *   2. Success path: the existing church-billing webhook handles
 *      `checkout.session.completed` with that metadata by calling a
 *      service_role-only writer (the `billing_apply_subscription` shape, 0131)
 *      that sets `church_addons.custom_leader_avatar = true` — the same flag
 *      the operator toggle (`admin_set_church_custom_avatar`, 0136) sets, so
 *      `church_entitlements` reads one flag however it was granted.
 *   3. The leader returns to /church/:id/admin, whose reload of entitlements
 *      opens the photo form. The client never grants anything.
 */
export async function startCustomAvatarCheckout(churchId: string): Promise<'opened' | 'unavailable'> {
  const { CHURCH_PRODUCTS, isPlaceholderPriceId } = await import('@/features/church/pricing')
  if (isNativeApp() || !churchId || isPlaceholderPriceId(CHURCH_PRODUCTS.customLeaderAvatar.priceId)) return 'unavailable'
  // Unreachable until the price id is real; the session call lands here.
  return 'unavailable'
}
