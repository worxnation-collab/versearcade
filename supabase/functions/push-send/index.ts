// push-send — broadcasts a Web Push notification to every stored subscription.
//
// Two actions:
//   • (default) the operator broadcast — admin-only (sharkbait).
//   • `{ action: 'check_in', church_id, username }` — one church check-in note
//     (0137/0138, or a group leader's, 0156) to the ONE member it was sent to.
//     The caller is whoever's JWT this is; `church_check_in_push_claim` hands
//     back only a note THAT caller sent THAT member in the last fifteen
//     minutes and stamps it, so a retry never pushes twice and nobody can push
//     a note they did not send. The note is already in the member's mailbox —
//     this is a nudge on top, and every "can't" here is a quiet no-op.
//
//     Web Push only. Native (APNs) has no sender yet: `device_tokens` stays
//     empty until docs/NATIVE-PUSH.md is done, so a member on the iOS build
//     gets the in-app note and nothing on the lock screen. When that sender
//     exists, call it from `sendCheckIn` below for the recipient's tokens.
//
// The broadcast is admin-only (sharkbait). Implements VAPID (RFC 8292) auth and aes128gcm
// payload encryption (RFC 8291 + RFC 8188) with the Deno Web Crypto API — no
// external push library, so there's nothing to break on a runtime bump.
//
// Requires one secret: VAPID_PRIVATE_KEY (base64url, the 32-byte EC private
// scalar). VAPID_PUBLIC_KEY / VAPID_SUBJECT are optional overrides. The
// SUPABASE_* vars are injected by the platform.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const VAPID_PUBLIC =
  Deno.env.get('VAPID_PUBLIC_KEY') ??
  'BMjBZZ-dKxm_J-ARiuH3TPX1kjGbR4Uju1JtgZbsdp1P0phqRTiwKiEARyqOD_R0AkYhEDCcAX0tRWkkyvzHW1c'
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:worxnation@gmail.com'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ---- byte helpers -----------------------------------------------------------
function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : ''
  const bin = atob(s + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
function bytesToB64url(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function concat(...arrs: Uint8Array[]): Uint8Array {
  const len = arrs.reduce((n, a) => n + a.length, 0)
  const out = new Uint8Array(len)
  let o = 0
  for (const a of arrs) { out.set(a, o); o += a.length }
  return out
}
const enc = new TextEncoder()

async function hmac(keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data))
}

// ---- VAPID JWT (ES256) ------------------------------------------------------
async function vapidSigningKey(): Promise<CryptoKey> {
  const pub = b64urlToBytes(VAPID_PUBLIC) // 0x04 || X(32) || Y(32)
  const jwk = {
    kty: 'EC', crv: 'P-256', ext: true,
    x: bytesToB64url(pub.slice(1, 33)),
    y: bytesToB64url(pub.slice(33, 65)),
    d: VAPID_PRIVATE,
  }
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
}

async function vapidJwt(audience: string, key: CryptoKey): Promise<string> {
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const now = Math.floor(Date.now() / 1000)
  const payload = bytesToB64url(enc.encode(JSON.stringify({ aud: audience, exp: now + 12 * 3600, sub: VAPID_SUBJECT })))
  const input = `${header}.${payload}`
  // WebCrypto ECDSA returns raw r||s (64 bytes) — exactly JWS ES256 format.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(input)))
  return `${input}.${bytesToB64url(sig)}`
}

// ---- aes128gcm content encryption (RFC 8291 / RFC 8188) ---------------------
async function encryptPayload(plaintext: Uint8Array, uaPublic: Uint8Array, authSecret: Uint8Array): Promise<Uint8Array> {
  const asPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asPair.publicKey)) // 65 bytes

  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asPair.privateKey, 256))

  // Combine step (RFC 8291): IKM from auth secret + ECDH secret.
  const prkCombine = await hmac(authSecret, ecdh)
  const keyInfo = concat(enc.encode('WebPush: info'), Uint8Array.of(0), uaPublic, asPublic)
  const ikm = (await hmac(prkCombine, concat(keyInfo, Uint8Array.of(1)))).slice(0, 32)

  // Content encryption key + nonce (RFC 8188), salt is per-message.
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const prk = await hmac(salt, ikm)
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm'), Uint8Array.of(0, 1)))).slice(0, 16)
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce'), Uint8Array.of(0, 1)))).slice(0, 12)

  // Single record: plaintext followed by the 0x02 last-record delimiter.
  const record = concat(plaintext, Uint8Array.of(2))
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt'])
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, record))

  // Header: salt(16) | rs(4, BE) | idlen(1) | keyid(as_public) | ciphertext
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096, false)
  header[20] = asPublic.length
  header.set(asPublic, 21)
  return concat(header, ct)
}

interface Sub { endpoint: string; p256dh: string; auth: string }

async function sendOne(sub: Sub, payload: Uint8Array, key: CryptoKey): Promise<number> {
  const audience = new URL(sub.endpoint).origin
  const jwt = await vapidJwt(audience, key)
  const body = await encryptPayload(payload, b64urlToBytes(sub.p256dh), b64urlToBytes(sub.auth))
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt}, k=${VAPID_PUBLIC}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'normal',
    },
    body,
  })
  return res.status
}

// One check-in note to its one recipient. Never throws: the note is in their
// mailbox whatever happens here.
// deno-lint-ignore no-explicit-any
async function sendCheckIn(admin: any, sender: string, input: Record<string, unknown>) {
  const churchId = String(input.church_id ?? '')
  const username = String(input.username ?? '')
  if (!churchId || !username) return { pushed: 0, reason: 'bad_input' }
  const { data: claim, error } = await admin.rpc('church_check_in_push_claim', {
    p_sender: sender, p_church_id: churchId, p_username: username,
  })
  if (error || !claim?.ok) return { pushed: 0, reason: claim?.reason ?? 'claim_failed' }

  const { data: subs } = await admin
    .from('push_subscriptions').select('endpoint, p256dh, auth').eq('profile_id', claim.recipient_id)
  // Native: no APNs sender yet (docs/NATIVE-PUSH.md), so tokens are counted, not used.
  const { count: tokens } = await admin
    .from('device_tokens').select('token', { count: 'exact', head: true }).eq('profile_id', claim.recipient_id)
  if (!subs?.length || !VAPID_PRIVATE) return { pushed: 0, reason: 'no_subscription', native_pending: tokens ?? 0 }

  // The note's own words, or the verse when the leader sent only that. No
  // link in the body; tapping opens the mailbox, where the note is.
  const body = (claim.message || (claim.verse_ref ? `${claim.verse_ref} — a verse for you` : 'A note for you'))
  const payload = enc.encode(JSON.stringify({
    title: `${claim.from_username} · ${claim.church_name}`.slice(0, 80),
    body: String(body).slice(0, 240),
    url: '/mail',
    tag: `check-in-${claim.id}`,
  }))
  const key = await vapidSigningKey()
  let pushed = 0
  const dead: string[] = []
  for (const s of subs as Sub[]) {
    try {
      const status = await sendOne(s, payload, key)
      if (status >= 200 && status < 300) pushed++
      else if (status === 404 || status === 410) dead.push(s.endpoint)
    } catch { /* one bad endpoint never fails the rest */ }
  }
  if (dead.length) await admin.from('push_subscriptions').delete().in('endpoint', dead)
  return { pushed, native_pending: tokens ?? 0 }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  try {
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

    // Verify the caller is the admin (sharkbait).
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'unauthorized' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    const input = await req.json().catch(() => ({}))
    if (input.action === 'check_in') return json(await sendCheckIn(admin, user.id, input))

    const { data: prof } = await admin.from('profiles').select('username').eq('id', user.id).single()
    if (!prof || prof.username !== 'sharkbait') return json({ error: 'forbidden' }, 403)

    if (!VAPID_PRIVATE) return json({ error: 'VAPID_PRIVATE_KEY is not configured' }, 500)
    const title = String(input.title ?? 'Verse Arcade').slice(0, 80)
    const bodyText = String(input.body ?? '').slice(0, 240)
    const url = String(input.url ?? '/')
    const tag = String(input.tag ?? 'verse-arcade')
    if (!bodyText) return json({ error: 'body is required' }, 400)

    const { data: subs, error } = await admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
    if (error) return json({ error: error.message }, 500)
    if (!subs || subs.length === 0) return json({ sent: 0, failed: 0, removed: 0, total: 0 })

    const payload = enc.encode(JSON.stringify({ title, body: bodyText, url, tag }))
    const key = await vapidSigningKey()

    let sent = 0, failed = 0
    const dead: string[] = []
    const results = await Promise.allSettled(
      (subs as Sub[]).map(async (s) => ({ s, status: await sendOne(s, payload, key) })),
    )
    for (const r of results) {
      if (r.status === 'fulfilled') {
        const { s, status } = r.value
        if (status >= 200 && status < 300) sent++
        else { failed++; if (status === 404 || status === 410) dead.push(s.endpoint) }
      } else {
        failed++
      }
    }

    // Prune subscriptions the push service says are gone.
    if (dead.length) await admin.from('push_subscriptions').delete().in('endpoint', dead)

    return json({ sent, failed, removed: dead.length, total: subs.length })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
