// revenuecat-webhook — RevenueCat tells us a subscription changed; we re-ask.
//
// A Verified Church plan bought through Apple (migration 0139) renews, lapses,
// is refunded and moves between app users without the leader ever opening the
// app, so the app alone cannot keep `churches.verified` honest. RevenueCat
// calls this on every such event.
//
// THE EVENT BODY IS NOT BELIEVED. It is used only to learn WHICH app user to
// look at; what that user holds comes from RevenueCat's API with the secret
// key, exactly as iap-fulfill does, and goes through the same
// `syncChurchPlans`. A forged event can therefore only make us look something
// up. The shared Authorization value keeps strangers from doing even that.
//
// Runs with verify_jwt OFF (supabase/config.toml): RevenueCat has no Supabase
// session. Configure in RevenueCat → Integrations → Webhooks: this function's
// URL, and an Authorization header equal to REVENUECAT_WEBHOOK_AUTH.
//
// Secrets: REVENUECAT_SECRET_KEY (shared with iap-fulfill) and
// REVENUECAT_WEBHOOK_AUTH. Either missing ⇒ 503, nothing done, and RevenueCat
// retries later.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { CHURCH_PLAN_PRODUCTS, fetchSubscriber, syncChurchPlans } from '../_shared/churchApple.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RC_SECRET = Deno.env.get('REVENUECAT_SECRET_KEY') ?? ''
const HOOK_AUTH = Deno.env.get('REVENUECAT_WEBHOOK_AUTH') ?? ''

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** Compare as SHA-256 digests, so the check takes the same time either way. */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  const u = new Uint8Array(x), v = new Uint8Array(y)
  let diff = 0
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i]
  return diff === 0
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)
  if (!RC_SECRET || !HOOK_AUTH) return json({ error: 'not configured' }, 503)
  const given = req.headers.get('Authorization') ?? ''
  if (!(await sameSecret(given, HOOK_AUTH)) && !(await sameSecret(given, `Bearer ${HOOK_AUTH}`))) {
    return json({ error: 'unauthorized' }, 401)
  }

  try {
    const event = (await req.json().catch(() => ({})))?.event ?? {}
    const productId = typeof event.product_id === 'string' ? event.product_id : ''
    const transfer = event.type === 'TRANSFER'
    // Most events are about the founding patron or nothing we sell; only a
    // church plan or a transfer (which can move one) is worth a lookup.
    if (!transfer && !CHURCH_PLAN_PRODUCTS[productId]) return json({ ok: true, skipped: true })

    // Our app user ids are Supabase profile ids; RevenueCat's anonymous ids
    // ($RCAnonymousID:…) have no church to verify and are ignored.
    const ids = new Set<string>()
    for (const v of [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? []),
      ...(event.transferred_from ?? []), ...(event.transferred_to ?? [])]) {
      if (typeof v === 'string' && UUID.test(v)) ids.add(v)
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    let synced = 0
    for (const id of ids) {
      const subscriber = await fetchSubscriber(RC_SECRET, id)
      synced += (await syncChurchPlans(admin, id, subscriber)).synced
    }
    return json({ ok: true, users: ids.size, synced })
  } catch (e) {
    // A 500 makes RevenueCat retry, which is what a transient failure wants.
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
