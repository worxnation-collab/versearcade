// church-billing — a church pays for the verified tier on the web, and its
// verified tier follows what Stripe says.
//
// Three doors, one function (it runs with verify_jwt OFF, because Stripe calls
// it with no Supabase session — supabase/config.toml says so):
//
//   GET  ?t=<token>                       the billing page asks who the link is for
//   POST { action: 'checkout', t, interval, addon }
//        → a Stripe Checkout Session (card), answered with its URL
//   POST { action: 'invoice', t, interval, addon, email, name }
//        → a subscription billed by INVOICE (card, ACH, bank transfer or a
//          cheque marked paid by hand), for a church whose treasurer has to
//          approve a bill rather than type a card in
//   POST with a `stripe-signature` header → the webhook
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
// No price is decided here either. The four price ids come from secrets, and
// what each costs is set in the Stripe dashboard; the add-on is a second line
// item on the SAME subscription, so one cancellation ends both.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY            sk_live_… (or sk_test_…)
//   STRIPE_CHURCH_WEBHOOK_SECRET whsec_… from this endpoint's webhook in Stripe
//   STRIPE_PRICE_BASE_MONTH / STRIPE_PRICE_BASE_YEAR
//   STRIPE_PRICE_ADDON_MONTH / STRIPE_PRICE_ADDON_YEAR
// Any missing ⇒ 503 and nothing is created or changed.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
const WEBHOOK_SECRET = Deno.env.get('STRIPE_CHURCH_WEBHOOK_SECRET') ?? ''
const PRICES = {
  base: { month: Deno.env.get('STRIPE_PRICE_BASE_MONTH') ?? '', year: Deno.env.get('STRIPE_PRICE_BASE_YEAR') ?? '' },
  addon: { month: Deno.env.get('STRIPE_PRICE_ADDON_MONTH') ?? '', year: Deno.env.get('STRIPE_PRICE_ADDON_YEAR') ?? '' },
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
  'Access-Control-Allow-Headers': 'content-type',
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

interface Linked { church_id: string; name: string; city: string | null; region: string | null; status: string | null }

async function churchFor(token: unknown): Promise<Linked | null> {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return null
  const { data } = await admin.from('church_billing').select('church_id,status,churches(name,city,region)').eq('billing_token', token).maybeSingle()
  if (!data) return null
  const c = (data as { churches: { name: string; city: string | null; region: string | null } | null }).churches
  return { church_id: data.church_id as string, status: (data.status as string | null) ?? null, name: c?.name ?? 'Your church', city: c?.city ?? null, region: c?.region ?? null }
}

const founding = () => FOUNDING_UNTIL - Date.now() > TRIAL_MIN_MS
const alreadyPaying = (s: string | null) => s === 'active' || s === 'trialing' || s === 'past_due'

function lineItems(interval: 'month' | 'year', addon: boolean): Record<string, string | number> {
  const items: Record<string, string | number> = { 'items[0][price]': PRICES.base[interval], 'items[0][quantity]': 1 }
  if (addon) Object.assign(items, { 'items[1][price]': PRICES.addon[interval], 'items[1][quantity]': 1 })
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
  items: { data: Array<{ price: { id: string; recurring: { interval: string } | null } }> }
}

async function apply(sub: Sub, churchHint?: string | null): Promise<unknown> {
  const church = sub.metadata?.church_id || churchHint
  if (!church) return { skipped: 'no church on subscription' }
  const prices = sub.items?.data ?? []
  const addons = new Set([PRICES.addon.month, PRICES.addon.year].filter(Boolean))
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

async function checkout(link: Linked, interval: 'month' | 'year', addon: boolean, token: string): Promise<Response> {
  const back = `${SITE}/church-billing/?t=${token}`
  const items = lineItems(interval, addon)
  const params: Record<string, string | number> = {
    mode: 'subscription',
    client_reference_id: link.church_id,
    'metadata[church_id]': link.church_id,
    'subscription_data[metadata][church_id]': link.church_id,
    'line_items[0][price]': items['items[0][price]'],
    'line_items[0][quantity]': 1,
    success_url: `${back}&done=card`,
    cancel_url: back,
    billing_address_collection: 'auto',
  }
  if (addon) Object.assign(params, { 'line_items[1][price]': items['items[1][price]'], 'line_items[1][quantity]': 1 })
  if (founding()) params['subscription_data[trial_end]'] = Math.floor(FOUNDING_UNTIL / 1000)
  const s = await stripe<{ url: string }>('POST', 'checkout/sessions', params)
  return json({ url: s.url })
}

async function invoice(link: Linked, interval: 'month' | 'year', addon: boolean, email: string, name: string): Promise<Response> {
  const customer = await stripe<{ id: string }>('POST', 'customers', {
    email, name: name || link.name, 'metadata[church_id]': link.church_id,
  })
  const params: Record<string, string | number> = {
    customer: customer.id,
    collection_method: 'send_invoice',
    days_until_due: 30,
    'metadata[church_id]': link.church_id,
    ...lineItems(interval, addon),
  }
  // A founding church's first invoice is issued when the trial ends, not now.
  if (founding()) params.trial_end = Math.floor(FOUNDING_UNTIL / 1000)
  const sub = await stripe<Sub>('POST', 'subscriptions', params)
  await apply(sub)
  return json({ ok: true, founding: founding() })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (!STRIPE_KEY || !WEBHOOK_SECRET || !PRICES.base.month || !PRICES.base.year || !PRICES.addon.month || !PRICES.addon.year) {
    return json({ error: 'billing is not configured' }, 503)
  }
  try {
    if (req.method === 'POST' && req.headers.get('stripe-signature')) return await webhook(req)

    if (req.method === 'GET') {
      const link = await churchFor(new URL(req.url).searchParams.get('t'))
      if (!link) return json({ error: 'unknown link' }, 404)
      return json({
        church: link.name, where: [link.city, link.region].filter(Boolean).join(', '),
        paying: alreadyPaying(link.status), founding: founding(), foundingUntil: '2027-03-28',
      })
    }

    if (req.method === 'POST') {
      const b = await req.json().catch(() => ({})) as Record<string, unknown>
      const link = await churchFor(b.t)
      if (!link) return json({ error: 'unknown link' }, 404)
      if (alreadyPaying(link.status)) return json({ error: 'already', message: 'This church already has a subscription.' }, 409)
      const interval = b.interval === 'year' ? 'year' : 'month'
      const addon = b.addon === true
      if (b.action === 'checkout') return await checkout(link, interval, addon, b.t as string)
      if (b.action === 'invoice') {
        const email = typeof b.email === 'string' ? b.email.trim().slice(0, 200) : ''
        const name = typeof b.name === 'string' ? b.name.trim().slice(0, 120) : ''
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'email', message: 'Enter the email the invoice should go to.' }, 400)
        return await invoice(link, interval, addon, email, name)
      }
    }
    return json({ error: 'not found' }, 404)
  } catch (e) {
    console.error(e)
    return json({ error: 'failed', message: 'Something went wrong on our side. Please try again, or reply to our email.' }, 500)
  }
})
