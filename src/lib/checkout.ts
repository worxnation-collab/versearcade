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
 * Start the one-time $79 Custom Leader Avatar purchase for a church (web only;
 * a church add-on is never sold in the App Store build — `churchPricesVisible`).
 *
 *   1. Here: POST the `church-billing` Edge Function { action: 'avatar',
 *      church } with the leader's own session, and send the page to the
 *      Checkout Session URL it returns. The function checks leadership of THAT
 *      church, a verified church, and that the add-on isn't held already; the
 *      session is mode 'payment', card only, `client_reference_id` = the church
 *      id and `metadata.product = 'custom_leader_avatar'` — drop either and the
 *      money arrives with no way to tell whose it was or what for.
 *   2. The church-billing webhook sees `checkout.session.completed` with
 *      `payment_status: 'paid'` and calls `billing_grant_custom_avatar` (0145,
 *      service_role only), which sets `church_addons.custom_leader_avatar` —
 *      the same flag the operator toggle (0136) sets.
 *   3. Stripe returns the leader to /church/:id/admin?avatar=1, which re-reads
 *      the entitlements until the flag lands and opens the photo form. The
 *      client never grants anything.
 */
export async function startCustomAvatarCheckout(churchId: string): Promise<'opened' | 'unavailable' | 'already' | 'failed'> {
  if (isNativeApp() || !churchId) return 'unavailable'
  const { startAvatarCheckout } = await import('@/store/churchAdmin')
  const r = await startAvatarCheckout(churchId)
  if ('url' in r) {
    window.location.href = r.url
    return 'opened'
  }
  return r.error === 'already' ? 'already' : r.error === 'unavailable' ? 'unavailable' : 'failed'
}
