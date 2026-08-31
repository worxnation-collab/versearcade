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
