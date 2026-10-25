// church-billing — a church pays for the verified tier on the web, and its
// verified tier follows what Stripe says.
//
// Three doors, one function (it runs with verify_jwt OFF, because Stripe calls
// it with no Supabase session — supabase/config.toml says so):
//
//   GET  ?t=<token>                       the billing page asks who the link is for
//   POST { action: 'checkout', t, interval, plan }
//        → a Stripe Checkout Session (card), answered with its URL
//   POST { action: 'invoice', t, interval, plan, email, name }
//        → a subscription billed by INVOICE (card, ACH, bank transfer or a
//          cheque marked paid by hand), for a church whose treasurer has to
//          approve a bill rather than type a card in
//   POST { action: 'portal', church } + the leader's own Authorization header
//        → a Stripe customer-portal session (cancel, change card, invoices),
//          answered with its URL. The ONE door that takes a church id, and it
//          is safe because the caller's session is checked against
//          `church_admins` for that church before Stripe is asked anything
//          (0135). Same portal for a Founding trial and a paying church.
//          `flow: 'plan'` opens it on the plan picker ("Manage plan").
//   POST { action: 'upgrade', church, interval? } + the same header
//        → "Unlock with Church Suite": a portal session on the confirm step of
//          Verified → Suite for a card subscription, or a Suite Checkout for a
//          church with none (a free claim). Same leadership check.
//   POST with a `stripe-signature` header → the webhook
//
// A SELF-SERVE CLAIM (0134) uses the same three doors with `c` in place of `t`:
// the one-time token `start_church_claim` handed a signed-in claimant. It
// opens a card checkout only — never an invoice, because an invoiced Founding
// subscription is live with no payment method at all, and a live subscription
// is what makes a claimant leadership. The subscription carries the claim id,
// and the webhook calls `billing_activate_claim` before it applies the
// subscription; a claim that lost the race to another payer is a 'conflict',
// and its subscription is NOT applied, so the first payer's billing row stands.
//
// A FREE CLAIM (0137) is a fourth door: POST { action: 'setup', f } with the
// token `start_church_free_claim` handed a signed-in claimant for a church with
// at least three members. It opens a Checkout Session in SETUP mode — a
// SetupIntent, $0, no price, no subscription — so a card lands on Stripe's file
// as the identity signal and nothing is charged. The webhook sees
// `checkout.session.completed` with mode 'setup' and calls
// `billing_activate_free_claim`, which makes the claimant leadership and leaves
// the church UNVERIFIED (verification is what the paid plan buys).
//
// THE TOKEN IS THE ONLY THING A CALLER SENDS ABOUT WHICH CHURCH. It comes from
// `admin_church_billing_link` (0131) and is looked up here with the service
// role; a church id in a request is never trusted, so nobody can open a
// checkout (or send an invoice) for a church they were not given a link to.
//
// BOTH WAYS OF PAYING END IN THE SAME SUBSCRIPTION EVENTS, and the webhook only
// ever acts on a subscription: `customer.subscription.*` for every state change,
// with `checkout.session.completed` and `invoice.paid` / `invoice.payment_failed`
// re-reading the subscription so a missed event costs nothing. What a status
// MEANS (verified or not) is decided in SQL (`billing_apply_subscription`), not
// here, so this file and any future caller cannot disagree about it.
//
// FOUNDING CHURCHES: anybody signing up before Easter 2027 is a Founding Church,
// which is what /churches promises — free through Easter 2027. Their
// subscription carries `trial_end` = the Monday after Easter, so a card (or an
// invoicing address) is on file now and the first charge happens by itself at
// the base price they chose. Nobody has to ask a church for money twice.
//
// No price is decided here either. The price ids are named below, and what
// each costs is set in the Stripe dashboard.
//
// TWO PLANS. `plan: 'suite'` is the CHURCH SUITE — Verified Church and Content
// Generation as ONE price ($39/mo, $390/yr, created 2026-10-23), the default on
// the billing page. `plan: 'verified'` is the base alone. An older page that
// still sends `addon: true` gets the base plus the add-on as two line items, as
// before, so a link opened mid-deploy still works. Whatever a subscription
// carries, the webhook reads Content Generation as ON for an add-on price OR a
// suite price — a suite subscription has no add-on line item, and missing that
// would sell a church the add-on and never switch it on.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY            a RESTRICTED rk_live_… key (Customers, Subscriptions,
//     Checkout Sessions, Customer portal: write), or Vault via stripe_church_secret_key() (0133),
//     which is where it is
//   STRIPE_CHURCH_WEBHOOK_SECRET whsec_… of webhook we_1UTB3nHlxD9PZQmbjy4PiBb9,
//     or Vault via stripe_church_webhook_secret() (0132), which is where it is
//     (pinned to API version 2024-06-20, the version STRIPE_VERSION reads)
// Either missing ⇒ 503 and nothing is created or changed. STRIPE_PRICE_* may
// override the four price ids below (for a test-mode run).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
let STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
let WEBHOOK_SECRET = Deno.env.get('STRIPE_CHURCH_WEBHOOK_SECRET') ?? ''
// The live price ids (created 2026-10-22: "Verified Church" $29/mo + $290/yr,
// "Content Generation (church add-on)" $19/mo + $190/yr). A price id is not a
// secret, so it lives here rather than in a secret nobody can read back; an
// env var of the same name still wins, which is how a test-mode run swaps in
// sandbox prices.
const PRICES = {
  base: {
    month: Deno.env.get('STRIPE_PRICE_BASE_MONTH') || 'price_1UTB37HlxD9PZQmbqMEqfOkw',
    year: Deno.env.get('STRIPE_PRICE_BASE_YEAR') || 'price_1UTB3HHlxD9PZQmbx5QN6Xa5',
  },
  addon: {
    month: Deno.env.get('STRIPE_PRICE_ADDON_MONTH') || 'price_1UTB3BHlxD9PZQmbGFHjSxMP',
    year: Deno.env.get('STRIPE_PRICE_ADDON_YEAR') || 'price_1UTB3LHlxD9PZQmb701EVjML',
  },
  // "Church Suite" (prod_VUaHXSAxvbhT5z): base + add-on as one price.
  suite: {
    month: Deno.env.get('STRIPE_PRICE_SUITE_MONTH') || 'price_1UTb6qHlxD9PZQmbVvypDKKU',
    year: Deno.env.get('STRIPE_PRICE_SUITE_YEAR') || 'price_1UTb6tHlxD9PZQmbP6YBOfU9',
  },
}
const SITE = 'https://versearcade.org'
/** The Monday after Easter Sunday 2027 (28 March), at midnight US Eastern. */
const FOUNDING_UNTIL = Date.parse('2027-03-29T04:00:00Z')
/** Stripe refuses a Checkout trial ending less than 48 hours out. */
const TRIAL_MIN_MS = 49 * 60 * 60 * 1000
/** Pinned so a dashboard API upgrade cannot move `current_period_end` under us. */
const STRIPE_VERSION = '2024-06-20'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

// ---- Stripe over plain REST -------------------------------------------------
//
// No SDK: four endpoints and a signature check do not justify pulling a Node
// library through esm.sh into Deno, and the SDK's webhook helper is the part
// that most often breaks there.

function form(params: Record<string, string | number | boolean | undefined>): string {
  const out = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') out.append(k, String(v))
  return out.toString()
}

async function stripe<T>(method: 'GET' | 'POST', path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const q = method === 'GET' && params ? `?${form(params)}` : ''
  const r = await fetch(`https://api.stripe.com/v1/${path}${q}`, {
    method,
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
      'Stripe-Version': STRIPE_VERSION,
      ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: method === 'POST' && params ? form(params) : undefined,
  })
  const body = await r.json()
  if (!r.ok) throw new Error(`stripe ${path}: ${body?.error?.message ?? r.status}`)
  return body as T
}

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')

/** Stripe's v1 signature: HMAC-SHA256 of `${t}.${payload}`, keyed with the whole whsec_ string. */
async function verifySignature(payload: string, header: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=', 2)).filter((p) => p.length === 2)) as Record<string, string>
  const sigs = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3))
  const t = Number(parts.t)
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - t) > 300) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const want = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`)))
  // Constant-time compare against every v1 signature present (Stripe sends
  // more than one while a secret is being rolled).
  return sigs.some((s) => s.length === want.length && [...s].reduce((d, c, i) => d | (c.charCodeAt(0) ^ want.charCodeAt(i)), 0) === 0)
}

// ---- the church a link is for ----------------------------------------------

interface Linked { church_id: string; name: string; city: string | null; region: string | null; status: string | null; claim?: string }

async function churchFor(token: unknown): Promise<Linked | null> {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return null
  const { data } = await admin.from('church_billing').select('church_id,status,churches(name,city,region)').eq('billing_token', token).maybeSingle()
  if (!data) return null
  const c = (data as { churches: { name: string; city: string | null; region: string | null } | null }).churches
  return { church_id: data.church_id as string, status: (data.status as string | null) ?? null, name: c?.name ?? 'Your church', city: c?.city ?? null, region: c?.region ?? null }
}

/** sha256 hex, the way 0134 stores a claim token. */
async function sha256(text: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

/**
 * The church a SELF-SERVE claim token is for, while it is still claimable:
 * the claim pending, nobody leading the church, no live subscription on file.
 * Anything else answers null, exactly as an unknown link does.
 */
async function claimFor(token: unknown): Promise<Linked | null> {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return null
  const { data } = await admin.from('church_claims').select('id,church_id,status,tier,churches(name,city,region)')
    .eq('token_hash', await sha256(token)).maybeSingle()
  if (!data || data.status !== 'pending' || data.tier !== 'paid') return null
  const [{ count }, { data: bill }] = await Promise.all([
    admin.from('church_admins').select('user_id', { count: 'exact', head: true }).eq('church_id', data.church_id),
    admin.from('church_billing').select('status').eq('church_id', data.church_id).maybeSingle(),
  ])
  const status = (bill?.status as string | null) ?? null
  if ((count ?? 0) > 0 || alreadyPaying(status)) return null
  const c = (data as { churches: { name: string; city: string | null; region: string | null } | null }).churches
  return { church_id: data.church_id as string, status, claim: data.id as string, name: c?.name ?? 'Your church', city: c?.city ?? null, region: c?.region ?? null }
}

/** The free door's threshold; mirrors church_free_claim_min_members() (0137). */
const FREE_CLAIM_MIN_MEMBERS = 3

/**
 * The church a FREE card claim token is for, while it is still claimable: the
 * claim pending, nobody leading, no live subscription, and still at least
 * three members. Anything else answers null.
 */
async function freeClaimFor(token: unknown): Promise<(Linked & { claim: string; email: string; contact: string }) | null> {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return null
  const { data } = await admin.from('church_claims').select('id,church_id,status,tier,method,email,contact_name,churches(name,city,region)')
    .eq('token_hash', await sha256(token)).maybeSingle()
  if (!data || data.status !== 'pending' || data.tier !== 'free' || data.method !== 'card') return null
  const [{ count: leaders }, { count: members }, { data: bill }] = await Promise.all([
    admin.from('church_admins').select('user_id', { count: 'exact', head: true }).eq('church_id', data.church_id),
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('church_id', data.church_id),
    admin.from('church_billing').select('status').eq('church_id', data.church_id).maybeSingle(),
  ])
  const status = (bill?.status as string | null) ?? null
  if ((leaders ?? 0) > 0 || alreadyPaying(status) || (members ?? 0) < FREE_CLAIM_MIN_MEMBERS) return null
  const c = (data as { churches: { name: string; city: string | null; region: string | null } | null }).churches
  return {
    church_id: data.church_id as string, status, claim: data.id as string,
    email: data.email as string, contact: data.contact_name as string,
    name: c?.name ?? 'Your church', city: c?.city ?? null, region: c?.region ?? null,
  }
}

const founding = () => FOUNDING_UNTIL - Date.now() > TRIAL_MIN_MS
const alreadyPaying = (s: string | null) => s === 'active' || s === 'trialing' || s === 'past_due'

/** suite = the one bundled price; verified = base alone; legacy = base + add-on line items. */
type Plan = 'suite' | 'verified' | 'legacy'

function planOf(b: Record<string, unknown>): Plan {
  if (b.plan === 'suite') return 'suite'
  if (b.plan === 'verified') return 'verified'
  return b.addon === true ? 'legacy' : 'verified'
}

function lineItems(interval: 'month' | 'year', plan: Plan): Record<string, string | number> {
  if (plan === 'suite') return { 'items[0][price]': PRICES.suite[interval], 'items[0][quantity]': 1 }
  const items: Record<string, string | number> = { 'items[0][price]': PRICES.base[interval], 'items[0][quantity]': 1 }
  if (plan === 'legacy') Object.assign(items, { 'items[1][price]': PRICES.addon[interval], 'items[1][quantity]': 1 })
  return items
}

// ---- the webhook ------------------------------------------------------------

interface Sub {
  id: string
  status: string
  customer: string
  collection_method: string
  current_period_end: number | null
  metadata: Record<string, string>
  items: { data: Array<{ id: string; price: { id: string; recurring: { interval: string } | null } }> }
}

async function apply(sub: Sub, churchHint?: string | null): Promise<unknown> {
  const church = sub.metadata?.church_id || churchHint
  if (!church) return { skipped: 'no church on subscription' }
  // A self-serve claim becomes leadership on a live subscription, and only if
  // nobody else got there first. A conflict is left for an operator to refund
  // and never applied, so it cannot overwrite the first payer's billing row.
  const claim = sub.metadata?.claim_id
  if (claim && (sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due')) {
    const { data: act, error: actErr } = await admin.rpc('billing_activate_claim', {
      p_claim_id: claim, p_church_id: church, p_subscription_id: sub.id,
    })
    if (actErr) throw new Error(`activate: ${actErr.message}`)
    if ((act as { reason?: string } | null)?.reason === 'conflict') return { claim: 'conflict', subscription: sub.id }
  }
  const prices = sub.items?.data ?? []
  // Content Generation is on for the add-on's line item OR the suite's price.
  const addons = new Set([PRICES.addon.month, PRICES.addon.year, PRICES.suite.month, PRICES.suite.year].filter(Boolean))
  const { data, error } = await admin.rpc('billing_apply_subscription', {
    p_church_id: church,
    p_subscription_id: sub.id,
    p_customer_id: typeof sub.customer === 'string' ? sub.customer : null,
    p_status: sub.status,
    p_interval: prices[0]?.price?.recurring?.interval ?? null,
    p_content_addon: prices.some((i) => addons.has(i.price?.id)),
    p_collection_method: sub.collection_method ?? null,
    p_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
  })
  if (error) throw new Error(`apply: ${error.message}`)
  return data
}

async function webhook(req: Request): Promise<Response> {
  const payload = await req.text()
  if (!(await verifySignature(payload, req.headers.get('stripe-signature') ?? ''))) return json({ error: 'bad signature' }, 400)
  const event = JSON.parse(payload) as { type: string; data: { object: Record<string, unknown> } }
  const o = event.data.object
  let result: unknown = { ignored: event.type }
  if (event.type.startsWith('customer.subscription.')) {
    result = await apply(o as unknown as Sub)
  } else if (event.type === 'checkout.session.completed' && o.mode === 'setup') {
    // A free claim's card is saved. Only a session carrying a free claim id
    // means anything; the SetupIntent id is kept on the claim for the review.
    const md = (o.metadata ?? {}) as Record<string, string>
    if (md.free_claim_id && md.church_id) {
      const { data, error } = await admin.rpc('billing_activate_free_claim', {
        p_claim_id: md.free_claim_id, p_church_id: md.church_id,
        p_setup_intent_id: typeof o.setup_intent === 'string' ? o.setup_intent : null,
      })
      if (error) throw new Error(`activate free: ${error.message}`)
      result = data
    }
  } else if (event.type === 'checkout.session.completed' && o.mode === 'subscription' && typeof o.subscription === 'string') {
    result = await apply(await stripe<Sub>('GET', `subscriptions/${o.subscription}`), o.client_reference_id as string | null)
  } else if ((event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') && typeof o.subscription === 'string') {
    result = await apply(await stripe<Sub>('GET', `subscriptions/${o.subscription}`))
  }
  // Logged so a church that says "we paid and nothing happened" can be traced.
  console.log(event.type, JSON.stringify(result))
  return json({ received: true })
}

// ---- the two ways to start paying -------------------------------------------

async function checkout(link: Linked, interval: 'month' | 'year', plan: Plan, token: string): Promise<Response> {
  const back = `${SITE}/church-billing/?${link.claim ? 'c' : 't'}=${token}`
  const items = lineItems(interval, plan)
  const params: Record<string, string | number> = {
    mode: 'subscription',
    client_reference_id: link.church_id,
    'metadata[church_id]': link.church_id,
    'subscription_data[metadata][church_id]': link.church_id,
    'line_items[0][price]': items['items[0][price]'],
    'line_items[0][quantity]': 1,
    // A claimant comes back to the app's claim screen, which waits for the
    // webhook to make them leadership and then opens their tools.
    success_url: link.claim ? `${SITE}/church/${link.church_id}/claim?paid=1` : `${back}&done=card`,
    cancel_url: back,
    billing_address_collection: 'auto',
  }
  if (items['items[1][price]']) Object.assign(params, { 'line_items[1][price]': items['items[1][price]'], 'line_items[1][quantity]': 1 })
  if (link.claim) {
    params['metadata[claim_id]'] = link.claim
    params['subscription_data[metadata][claim_id]'] = link.claim
    // A card on file is the whole of what a claim proves, so it is required
    // even when the Founding trial means nothing is charged today.
    params.payment_method_collection = 'always'
  }
  if (founding()) params['subscription_data[trial_end]'] = Math.floor(FOUNDING_UNTIL / 1000)
  const s = await stripe<{ url: string }>('POST', 'checkout/sessions', params)
  return json({ url: s.url })
}

async function invoice(link: Linked, interval: 'month' | 'year', plan: Plan, email: string, name: string): Promise<Response> {
  const customer = await stripe<{ id: string }>('POST', 'customers', {
    email, name: name || link.name, 'metadata[church_id]': link.church_id,
  })
  const params: Record<string, string | number> = {
    customer: customer.id,
    collection_method: 'send_invoice',
    days_until_due: 30,
    'metadata[church_id]': link.church_id,
    ...lineItems(interval, plan),
  }
  // A founding church's first invoice is issued when the trial ends, not now.
  if (founding()) params.trial_end = Math.floor(FOUNDING_UNTIL / 1000)
  const sub = await stripe<Sub>('POST', 'subscriptions', params)
  await apply(sub)
  return json({ ok: true, founding: founding() })
}

// The free claim's card check: a customer for the church, then a Checkout
// Session in setup mode on it. No price anywhere, so nothing on the page
// Stripe shows can read as a charge.
async function setup(link: Linked & { claim: string; email: string; contact: string }): Promise<Response> {
  const customer = await stripe<{ id: string }>('POST', 'customers', {
    email: link.email, name: link.contact,
    'metadata[church_id]': link.church_id, 'metadata[free_claim_id]': link.claim,
  })
  const s = await stripe<{ url: string }>('POST', 'checkout/sessions', {
    mode: 'setup',
    customer: customer.id,
    'payment_method_types[0]': 'card',
    client_reference_id: link.church_id,
    'metadata[church_id]': link.church_id,
    'metadata[free_claim_id]': link.claim,
    'setup_intent_data[metadata][church_id]': link.church_id,
    'setup_intent_data[metadata][free_claim_id]': link.claim,
    success_url: `${SITE}/church/${link.church_id}/claim?carded=1`,
    cancel_url: `${SITE}/church/${link.church_id}/claim`,
  })
  return json({ url: s.url })
}

// The leader doors (portal, upgrade) take a church id, and are safe because
// the caller's own session is checked against `church_admins` for THAT church
// before Stripe is asked anything. Answers the leader's user, or a Response.
async function leaderOf(req: Request, churchId: unknown): Promise<{ uid: string; email: string | null; church: string } | Response> {
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt || typeof churchId !== 'string' || !/^[0-9a-f-]{36}$/i.test(churchId)) return json({ error: 'unauthorized' }, 401)
  const { data: who } = await admin.auth.getUser(jwt)
  const uid = who?.user?.id
  if (!uid) return json({ error: 'unauthorized' }, 401)
  const { count } = await admin.from('church_admins').select('user_id', { count: 'exact', head: true })
    .eq('church_id', churchId).eq('user_id', uid)
  if (!count) return json({ error: 'not_leadership' }, 403)
  return { uid, email: who.user?.email ?? null, church: churchId }
}

interface Bill { stripe_customer_id: string | null; stripe_subscription_id: string | null; status: string | null; collection_method: string | null; content_addon: boolean | null }

async function billOf(churchId: string): Promise<Bill | null> {
  const { data } = await admin.from('church_billing')
    .select('stripe_customer_id, stripe_subscription_id, status, collection_method, content_addon')
    .eq('church_id', churchId).maybeSingle()
  return (data as Bill | null) ?? null
}

const dashboard = (churchId: string) => `${SITE}/church/${churchId}/admin`

// The portal: leadership of THIS church, with a live Stripe subscription, gets
// a session on the church's own Stripe customer. The customer id never leaves
// the server. A church verified by hand (no customer) gets `no_subscription`,
// and its dashboard never draws the button anyway. `flow: 'plan'` opens
// straight on the plan picker ("Manage plan": downgrade, monthly ↔ yearly);
// without it, the portal's home page ("Manage billing").
async function portal(req: Request, churchId: unknown, flow: unknown): Promise<Response> {
  const who = await leaderOf(req, churchId)
  if (who instanceof Response) return who
  const bill = await billOf(who.church)
  const customer = bill?.stripe_customer_id
  if (!customer || !alreadyPaying(bill?.status ?? null)) return json({ error: 'no_subscription' }, 404)
  const params: Record<string, string> = { customer, return_url: dashboard(who.church) }
  // Stripe's portal will not change the plan of an invoiced subscription, so a
  // plan flow there would be a dead end: it gets the portal's home instead.
  if (flow === 'plan' && bill?.stripe_subscription_id && bill.collection_method !== 'send_invoice') {
    params['flow_data[type]'] = 'subscription_update'
    params['flow_data[subscription_update][subscription]'] = bill.stripe_subscription_id
  }
  const s = await stripe<{ url: string }>('POST', 'billing_portal/sessions', params)
  return json({ url: s.url })
}

// "Unlock with Church Suite" on the dashboard's locked Content Generation row.
// Two shapes, one door, and no new product — the Suite price is the one the
// billing page already sells:
//
//   * a card-billed Verified subscription → a portal session that opens on the
//     CONFIRM step of swapping its base item for the Suite price at the same
//     interval. The portal configuration (bpc_1UTNfW…) has
//     `trial_update_behavior: continue_trial`, so a Founding trial survives
//     the switch, and the webhook reads the Suite price as Content Generation
//     on exactly as it does for a Suite bought on the billing page.
//   * no live subscription (a free claim, or nothing at all) → a Checkout
//     Session for the Suite, with the Founding trial while it lasts. A free
//     claim already put a card on a Stripe customer (its SetupIntent), so that
//     customer is reused and the card is waiting on the page.
//
// An invoiced subscription is refused: the portal cannot change its plan, and
// the dashboard tells that church to reply to an invoice email instead.
async function upgrade(req: Request, b: Record<string, unknown>): Promise<Response> {
  const who = await leaderOf(req, b.church)
  if (who instanceof Response) return who
  const church = who.church
  const bill = await billOf(church)
  const back = dashboard(church)

  if (bill?.stripe_customer_id && alreadyPaying(bill.status)) {
    if (bill.content_addon) return json({ error: 'already', message: 'This church already has Content Generation.' }, 409)
    if (bill.collection_method === 'send_invoice' || !bill.stripe_subscription_id) {
      return json({ error: 'invoiced', message: 'Reply to any invoice email and we’ll switch it.' }, 409)
    }
    const sub = await stripe<Sub>('GET', `subscriptions/${bill.stripe_subscription_id}`)
    const baseIds = new Set([PRICES.base.month, PRICES.base.year])
    const item = sub.items.data.find((i) => baseIds.has(i.price?.id)) ?? sub.items.data[0]
    if (!item || sub.items.data.length !== 1) {
      // More than one line item (not a shape this function ever sells without
      // the add-on) cannot be confirmed as one swap: let them choose in the portal.
      return portal(req, church, 'plan')
    }
    const interval = item.price?.recurring?.interval === 'year' ? 'year' : 'month'
    const s = await stripe<{ url: string }>('POST', 'billing_portal/sessions', {
      customer: bill.stripe_customer_id,
      return_url: back,
      'flow_data[type]': 'subscription_update_confirm',
      'flow_data[subscription_update_confirm][subscription]': sub.id,
      'flow_data[subscription_update_confirm][items][0][id]': item.id,
      'flow_data[subscription_update_confirm][items][0][price]': PRICES.suite[interval],
      'flow_data[subscription_update_confirm][items][0][quantity]': 1,
      'flow_data[after_completion][type]': 'redirect',
      'flow_data[after_completion][redirect][return_url]': `${back}?upgraded=1`,
    })
    return json({ url: s.url })
  }

  // No live subscription: Checkout for the Suite. Reuse a customer this church
  // already has — on its billing row, or the one its free claim's card is on.
  let customer = bill?.stripe_customer_id ?? null
  if (!customer) {
    const { data: claim } = await admin.from('church_claims').select('stripe_setup_intent_id')
      .eq('church_id', church).eq('status', 'active').not('stripe_setup_intent_id', 'is', null)
      .order('activated_at', { ascending: false }).limit(1).maybeSingle()
    const si = claim?.stripe_setup_intent_id as string | undefined
    if (si) {
      try {
        const intent = await stripe<{ customer: string | null }>('GET', `setup_intents/${si}`)
        customer = typeof intent.customer === 'string' ? intent.customer : null
      } catch (e) {
        console.error(e) // a fresh customer is fine; the card is simply typed again
      }
    }
  }
  const interval = b.interval === 'year' ? 'year' : 'month'
  const params: Record<string, string | number> = {
    mode: 'subscription',
    client_reference_id: church,
    'metadata[church_id]': church,
    'subscription_data[metadata][church_id]': church,
    'line_items[0][price]': PRICES.suite[interval],
    'line_items[0][quantity]': 1,
    payment_method_collection: 'always',
    success_url: `${back}?upgraded=1`,
    cancel_url: back,
    billing_address_collection: 'auto',
  }
  if (customer) params.customer = customer
  else if (who.email) params.customer_email = who.email
  if (founding()) params['subscription_data[trial_end]'] = Math.floor(FOUNDING_UNTIL / 1000)
  const s = await stripe<{ url: string }>('POST', 'checkout/sessions', params)
  return json({ url: s.url })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  // Both secrets live in Vault (0132, 0133); a function secret of the same
  // name wins. Read once per worker, not per request.
  if (!WEBHOOK_SECRET) {
    const { data } = await admin.rpc('stripe_church_webhook_secret')
    WEBHOOK_SECRET = typeof data === 'string' ? data : ''
  }
  if (!STRIPE_KEY) {
    const { data } = await admin.rpc('stripe_church_secret_key')
    STRIPE_KEY = typeof data === 'string' ? data : ''
  }
  if (!STRIPE_KEY || !WEBHOOK_SECRET || !PRICES.base.month || !PRICES.base.year || !PRICES.addon.month || !PRICES.addon.year
      || !PRICES.suite.month || !PRICES.suite.year) {
    return json({ error: 'billing is not configured' }, 503)
  }
  try {
    if (req.method === 'POST' && req.headers.get('stripe-signature')) return await webhook(req)

    if (req.method === 'GET') {
      const q = new URL(req.url).searchParams
      const link = q.get('c') ? await claimFor(q.get('c')) : await churchFor(q.get('t'))
      if (!link) return json({ error: 'unknown link' }, 404)
      return json({
        church: link.name, where: [link.city, link.region].filter(Boolean).join(', '),
        paying: alreadyPaying(link.status), founding: founding(), foundingUntil: '2027-03-28',
        claim: !!link.claim, churchId: link.claim ? link.church_id : undefined,
      })
    }

    if (req.method === 'POST') {
      const b = await req.json().catch(() => ({})) as Record<string, unknown>
      if (b.action === 'portal') return await portal(req, b.church, b.flow)
      if (b.action === 'upgrade') return await upgrade(req, b)
      if (b.action === 'setup') {
        const free = await freeClaimFor(b.f)
        if (!free) return json({ error: 'unknown link' }, 404)
        return await setup(free)
      }
      const link = b.c ? await claimFor(b.c) : await churchFor(b.t)
      if (!link) return json({ error: 'unknown link' }, 404)
      if (alreadyPaying(link.status)) return json({ error: 'already', message: 'This church already has a subscription.' }, 409)
      const interval = b.interval === 'year' ? 'year' : 'month'
      const plan = planOf(b)
      if (b.action === 'checkout') return await checkout(link, interval, plan, (link.claim ? b.c : b.t) as string)
      if (b.action === 'invoice') {
        if (link.claim) return json({ error: 'card_required', message: 'Claiming a church is done by card.' }, 400)
        const email = typeof b.email === 'string' ? b.email.trim().slice(0, 200) : ''
        const name = typeof b.name === 'string' ? b.name.trim().slice(0, 120) : ''
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'email', message: 'Enter the email the invoice should go to.' }, 400)
        return await invoice(link, interval, plan, email, name)
      }
    }
    return json({ error: 'not found' }, 404)
  } catch (e) {
    console.error(e)
    return json({ error: 'failed', message: 'Something went wrong on our side. Please try again, or reply to our email.' }, 500)
  }
})
