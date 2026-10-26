// The Verified Church plan through Apple — what RevenueCat says, turned into
// one call to `billing_apply_apple` (migration 0139).
//
// Shared by iap-fulfill (the app says "settle up") and revenuecat-webhook
// (RevenueCat says "something changed"). Both re-ask RevenueCat with the SECRET
// key and act on that answer, never on what a client or an event body claims,
// so a forged request can at most make the server look something up.

/**
 * Apple product id → plan interval. The allowlist: a product not here is not a
 * church plan. Both products live in ONE App Store subscription group, so an
 * Apple ID holds at most one of them at a time (a switch is a crossgrade).
 * Like SKU_BY_PRODUCT_ID in iap-fulfill: add rows, never remove them.
 */
export const CHURCH_PLAN_PRODUCTS: Record<string, 'month' | 'year'> = {
  'com.versearcade.app.church_verified_monthly': 'month',
  'com.versearcade.app.church_verified_yearly': 'year',
}

interface RcSubscription {
  expires_date?: string | null
  grace_period_expires_date?: string | null
  refunded_at?: string | null
}

export interface ChurchPlan {
  live: boolean
  productId: string
  interval: 'month' | 'year'
  expiresAt: string | null
}

/** GET a RevenueCat subscriber. Null when RevenueCat has never seen the id. */
export async function fetchSubscriber(rcSecret: string, appUserId: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
    { headers: { Authorization: `Bearer ${rcSecret}`, Accept: 'application/json' } },
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`RevenueCat ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const body = await res.json()
  return (body?.subscriber ?? null) as Record<string, unknown> | null
}

/**
 * The church plan this subscriber holds, or null if they never bought one.
 *
 * Live = not refunded, and either inside its period or inside Apple's billing
 * grace period (a card that failed and is being retried — 0131 keeps a
 * `past_due` Stripe church verified for the same reason). With two products
 * on record (a crossgrade), the one that runs latest wins.
 */
export function churchPlanFrom(subscriber: Record<string, unknown> | null, now = Date.now()): ChurchPlan | null {
  const subs = (subscriber?.subscriptions ?? {}) as Record<string, RcSubscription>
  let best: ChurchPlan | null = null
  let bestEnd = -Infinity
  for (const [productId, s] of Object.entries(subs)) {
    const interval = CHURCH_PLAN_PRODUCTS[productId]
    if (!interval || !s || typeof s !== 'object') continue
    const exp = s.expires_date ? Date.parse(s.expires_date) : Infinity
    const grace = s.grace_period_expires_date ? Date.parse(s.grace_period_expires_date) : -Infinity
    const end = Math.max(exp, grace)
    const live = !s.refunded_at && end > now
    if (end > bestEnd) {
      bestEnd = end
      best = { live, productId, interval, expiresAt: s.expires_date ?? null }
    }
  }
  return best
}

// deno-lint-ignore no-explicit-any
type Admin = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }> }

async function apply(admin: Admin, churchId: string, userId: string, plan: ChurchPlan | null) {
  const { data, error } = await admin.rpc('billing_apply_apple', {
    p_church_id: churchId,
    p_user_id: userId,
    p_product_id: plan?.productId ?? '',
    p_interval: plan?.interval ?? null,
    p_live: !!plan?.live,
    p_expires_at: plan?.expiresAt ?? null,
  })
  if (error) throw new Error(`billing_apply_apple: ${error.message}`)
  return data as { ok: boolean; reason?: string; verified?: boolean; unchanged?: boolean }
}

/**
 * Bring this user's church bindings in line with RevenueCat.
 *
 * `churchId` is a church the caller asked to bind (a purchase or a restore on
 * that church's screen); `billing_apply_apple` checks they lead it. Every
 * church the user's Apple ID is ALREADY verifying is re-applied too, which is
 * how a renewal, a lapse or a refund lands even when the leader never opens
 * the screen again.
 */
export async function syncChurchPlans(
  admin: Admin,
  userId: string,
  subscriber: Record<string, unknown> | null,
  churchId?: string | null,
): Promise<{ church: unknown; synced: number }> {
  const plan = churchPlanFrom(subscriber)
  let church: unknown = null
  if (churchId) {
    church = plan?.live ? await apply(admin, churchId, userId, plan) : { ok: false, reason: 'not_subscribed' }
  }
  const { data: bound, error } = await admin.rpc('billing_apple_bindings', { p_user_id: userId })
  if (error) throw new Error(`billing_apple_bindings: ${error.message}`)
  let synced = 0
  for (const row of (Array.isArray(bound) ? bound : []) as unknown[]) {
    const id = typeof row === 'string' ? row : (row as Record<string, string>)?.billing_apple_bindings
    if (!id || id === churchId) continue
    await apply(admin, id, userId, plan)
    synced++
  }
  return { church, synced }
}
