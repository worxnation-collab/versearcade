// push-send — broadcasts a Web Push notification to every stored subscription.
//
// Six actions, and every one but the broadcast is a KIND the recipient can
// switch off on its own (0163, `profiles.push_prefs`, read in `deliver`):
//   • (default) the operator broadcast — admin-only (sharkbait).
//   • `{ action: 'check_in', church_id, username }` — one church check-in note
//     (0137/0138, or a group leader's, 0156) to the ONE member it was sent to.
//     The caller is whoever's JWT this is; `church_check_in_push_claim` hands
//     back only a note THAT caller sent THAT member in the last fifteen
//     minutes and stamps it, so a retry never pushes twice and nobody can push
//     a note they did not send. The note is already in the member's mailbox —
//     this is a nudge on top, and every "can't" here is a quiet no-op.
//
//     Both transports: the recipient's Web Push subscriptions AND their iOS
//     device tokens (APNs).
//   • `{ action: 'battle_played', battle_id }` — the opponent who just
//     finished an async battle tells its challenger (0159), once per battle.
//   • `{ action: 'buddy_accepted', username }` — the player who just accepted
//     a buddy request tells the one who sent it (0160), once per request.
//   • `{ action: 'gesture', kind: 'wash' | 'kneel', target }` — a friend's
//     washing or a kneeling at a Prayer Wall note reaches its person (0161),
//     at most once a day per recipient, whichever comes first.
//   • `{ action: 'answered', request_id }` — the owner of a Prayer Wall note
//     just marked it answered; everybody who knelt at it hears so, once (0162).
//   • `{ action: 'flush' }` with `x-push-token` — the cron's morning run: sends
//     what a recipient's quiet hours (0164) held back. Every kind above goes
//     through `deliver`, which parks a note that would land in somebody's night.
//
// APNs (docs/NATIVE-PUSH.md): token auth with the team's .p8 key — ES256 JWT,
// iss = team id, kid = key id, reused for 50 minutes (Apple refuses one older
// than an hour and throttles one minted per request). Each token goes to the
// host its `environment` names, since a sandbox token 400s on production. A
// 410, or a 400 BadDeviceToken, deletes the row: that is Apple saying the app
// is gone from that phone, and the only way tokens get cleaned up. Secrets:
// APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY_P8 (the whole .p8, header lines and
// all); APNS_TOPIC overrides the bundle id. Missing any of the three ⇒ native
// is skipped and said so, never an error.
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

const APNS_KEY_ID = (Deno.env.get('APNS_KEY_ID') ?? '').trim()
const APNS_TEAM_ID = (Deno.env.get('APNS_TEAM_ID') ?? '').trim()
const APNS_KEY_P8 = Deno.env.get('APNS_KEY_P8') ?? ''
const APNS_TOPIC = (Deno.env.get('APNS_TOPIC') ?? 'com.versearcade.app').trim()
const APNS_READY = !!(APNS_KEY_ID && APNS_TEAM_ID && APNS_KEY_P8)

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

// ---- APNs (iOS) -------------------------------------------------------------
let apnsToken: { jwt: string; at: number } | null = null

async function apnsJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (apnsToken && now - apnsToken.at < 50 * 60) return apnsToken.jwt
  // The .p8 is a PKCS#8 PEM. Pasted secrets sometimes arrive with literal "\n"
  // or with the line breaks gone; stripping to the base64 body handles both.
  const body = APNS_KEY_P8.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const key = await crypto.subtle.importKey(
    'pkcs8', b64urlToBytes(body), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  )
  const header = bytesToB64url(enc.encode(JSON.stringify({ alg: 'ES256', kid: APNS_KEY_ID })))
  const claims = bytesToB64url(enc.encode(JSON.stringify({ iss: APNS_TEAM_ID, iat: now })))
  const input = `${header}.${claims}`
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(input)))
  apnsToken = { jwt: `${input}.${bytesToB64url(sig)}`, at: now }
  return apnsToken.jwt
}

interface DeviceToken { token: string; environment: string }
interface Note { title: string; body: string; url: string; tag: string }

async function sendApns(t: DeviceToken, note: Note): Promise<{ status: number; reason: string }> {
  const host = t.environment === 'development' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com'
  const res = await fetch(`${host}/3/device/${encodeURIComponent(t.token)}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${await apnsJwt()}`,
      'apns-topic': APNS_TOPIC,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'apns-expiration': String(Math.floor(Date.now() / 1000) + 86400),
      'apns-collapse-id': note.tag.slice(0, 64),
      'content-type': 'application/json',
    },
    // `url` rides beside `aps`; the app opens it on tap (lib/native.ts).
    body: JSON.stringify({ aps: { alert: { title: note.title, body: note.body }, sound: 'default' }, url: note.url }),
  })
  let reason = ''
  if (res.status !== 200) {
    try { reason = String((await res.json())?.reason ?? '') } catch { /* empty body */ }
  } else {
    await res.body?.cancel()
  }
  return { status: res.status, reason }
}

/** Sends one note to a set of iOS tokens; prunes the dead ones. Never throws. */
// deno-lint-ignore no-explicit-any
async function sendNative(admin: any, tokens: DeviceToken[], note: Note) {
  if (!tokens.length) return { native_sent: 0, native_failed: 0, native_removed: 0 }
  if (!APNS_READY) return { native_sent: 0, native_failed: 0, native_removed: 0, native_error: 'apns_not_configured' }
  let sent = 0, failed = 0
  const dead: string[] = []
  let error = ''
  const results = await Promise.allSettled(tokens.map(async (t) => ({ t, r: await sendApns(t, note) })))
  for (const x of results) {
    if (x.status !== 'fulfilled') { failed++; error ||= String(x.reason); continue }
    const { t, r } = x.value
    if (r.status === 200) { sent++; continue }
    failed++
    error ||= `${r.status} ${r.reason}`.trim()
    if (r.status === 410 || (r.status === 400 && r.reason === 'BadDeviceToken')) dead.push(t.token)
  }
  if (dead.length) await admin.from('device_tokens').delete().in('token', dead)
  return { native_sent: sent, native_failed: failed, native_removed: dead.length, ...(error ? { native_error: error } : {}) }
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

  // The note's own words, or the verse when the leader sent only that. No
  // link in the body; tapping opens the mailbox, where the note is.
  const body = (claim.message || (claim.verse_ref ? `${claim.verse_ref} — a verse for you` : 'A note for you'))
  return deliver(admin, claim.recipient_id, 'check_in', {
    title: `${claim.from_username} · ${claim.church_name}`.slice(0, 80),
    body: String(body).slice(0, 240),
    url: '/mail',
    tag: `check-in-${claim.id}`,
  })
}

// "You'll hear when they play" (0159): the opponent who just finished an async
// battle pushes its challenger, once. `battle_played_push_claim` checks the
// caller IS that opponent, the battle completed in the last fifteen minutes
// and nobody pushed for it yet. No score in the note — the battle screen
// says who won, and a push is no place to start counting at somebody.
// deno-lint-ignore no-explicit-any
async function sendBattlePlayed(admin: any, sender: string, input: Record<string, unknown>) {
  const battleId = String(input.battle_id ?? '')
  if (!battleId) return { pushed: 0, reason: 'bad_input' }
  const { data: claim, error } = await admin.rpc('battle_played_push_claim', {
    p_sender: sender, p_battle: battleId,
  })
  if (error || !claim?.ok) return { pushed: 0, reason: claim?.reason ?? 'claim_failed' }
  return deliver(admin, claim.recipient_id, 'battle', {
    title: `${claim.from_username} played your battle`.slice(0, 80),
    body: 'See how it went.',
    url: `/battle/${claim.battle_id}`,
    tag: `battle-${claim.battle_id}`,
  })
}

// "We'll tell you when they answer" (0160): the player who just accepted a
// buddy request tells the one who sent it, once. `buddy_accepted_push_claim`
// checks the caller is the addressee, the request was accepted in the last
// fifteen minutes and nobody pushed for it yet. A decline sends nothing.
// deno-lint-ignore no-explicit-any
async function sendBuddyAccepted(admin: any, sender: string, input: Record<string, unknown>) {
  const username = String(input.username ?? '')
  if (!username) return { pushed: 0, reason: 'bad_input' }
  const { data: claim, error } = await admin.rpc('buddy_accepted_push_claim', {
    p_sender: sender, p_username: username,
  })
  if (error || !claim?.ok) return { pushed: 0, reason: claim?.reason ?? 'claim_failed' }
  return deliver(admin, claim.recipient_id, 'buddy', {
    title: `@${claim.from_username} is your buddy now`.slice(0, 80),
    body: 'They said yes to your buddy request.',
    url: '/buddies',
    tag: `buddy-${claim.recipient_id}-${sender}`,
  })
}

// The gestures that give (0161): a washing names the washer, as the basin
// does; a kneeling names nobody, as the wall does. At most one a day per
// recipient — `gesture_push_claim` decides, and stamps the day it spends.
// No counts anywhere: one person, or "somebody", and nothing to tally.
// deno-lint-ignore no-explicit-any
async function sendGesture(admin: any, sender: string, input: Record<string, unknown>) {
  const kind = String(input.kind ?? '')
  const target = String(input.target ?? '')
  if ((kind !== 'wash' && kind !== 'kneel') || !target) return { pushed: 0, reason: 'bad_input' }
  const { data: claim, error } = await admin.rpc('gesture_push_claim', {
    p_sender: sender, p_kind: kind, p_target: target,
  })
  if (error || !claim?.ok) return { pushed: 0, reason: claim?.reason ?? 'claim_failed' }
  const day = new Date().toISOString().slice(0, 10)
  const note: Note = kind === 'wash'
    ? {
        title: `@${claim.from_username ?? 'A friend'} washed your feet`.slice(0, 80),
        body: 'A small kindness, given to you today.',
        url: '/you?people=basin',
        tag: `gesture-${claim.recipient_id}-${day}`,
      }
    : {
        title: 'Somebody prayed for you today',
        body: 'Someone knelt at your note on the Prayer Wall.',
        url: '/pray',
        tag: `gesture-${claim.recipient_id}-${day}`,
      }
  return deliver(admin, claim.recipient_id, 'gesture', note)
}

// "Your prayer mattered" (0162): the owner of a note marked it answered, and
// everybody who knelt at it hears so, once. `answered_push_claim` checks the
// caller owns the note and stamps it; the kneelers come back as ids only. The
// note names nobody and counts nothing — not whose note, not how many knelt.
// Ten at a time, so a well-loved note can't pin the function on one request.
// deno-lint-ignore no-explicit-any
async function sendAnswered(admin: any, sender: string, input: Record<string, unknown>) {
  const requestId = String(input.request_id ?? '')
  if (!requestId) return { pushed: 0, reason: 'bad_input' }
  const { data: claim, error } = await admin.rpc('answered_push_claim', {
    p_sender: sender, p_request: requestId,
  })
  if (error || !claim?.ok) return { pushed: 0, reason: claim?.reason ?? 'claim_failed' }
  const recipients = (claim.recipients ?? []) as string[]
  const note: Note = {
    title: 'A prayer you held was answered',
    body: 'Someone you knelt for on the Prayer Wall says it was answered. Thank you for praying.',
    url: '/mail',
    tag: `answered-${claim.request_id}`,
  }
  let pushed = 0
  for (let i = 0; i < recipients.length; i += 10) {
    const batch = await Promise.allSettled(recipients.slice(i, i + 10).map((r) => deliver(admin, r, 'answered', note)))
    for (const b of batch) if (b.status === 'fulfilled') pushed += b.value.pushed
  }
  return { pushed, recipients: recipients.length }
}

// The five kinds a player can switch off one by one (0163). A missing key in
// `profiles.push_prefs` is ON, so an account that never opened Settings hears
// everything it heard before.
type PushKind = 'battle' | 'buddy' | 'gesture' | 'answered' | 'check_in'

// One note to one person, on both transports; prunes dead endpoints. Never
// throws. Asks the recipient's own setting for this kind FIRST, server-side,
// so the choice holds whatever build their phone is running.
// deno-lint-ignore no-explicit-any
async function deliver(admin: any, recipientId: string, kind: PushKind, note: Note) {
  const { data: pref } = await admin.from('profiles').select('push_prefs').eq('id', recipientId).maybeSingle()
  if (pref?.push_prefs?.[kind] === false) return { pushed: 0, reason: 'muted' }

  // Quiet hours (0164): inside the recipient's own night the note is parked
  // and the morning flush sends it. Nothing is dropped; a failed park falls
  // through to sending now rather than losing the note.
  const { data: until } = await admin.rpc('push_quiet_until', { p_user: recipientId })
  if (until) {
    const { data: parked } = await admin.rpc('push_defer', {
      p_user: recipientId, p_kind: kind, p_note: note, p_after: until,
    })
    if (parked) return { pushed: 0, deferred: true, until }
  }
  return sendNow(admin, recipientId, note)
}

// The two transports, no gates — `deliver` and the flush decide whether.
// deno-lint-ignore no-explicit-any
async function sendNow(admin: any, recipientId: string, note: Note) {
  const { data: subs } = await admin
    .from('push_subscriptions').select('endpoint, p256dh, auth').eq('profile_id', recipientId)
  const { data: tokens } = await admin
    .from('device_tokens').select('token, environment').eq('profile_id', recipientId).eq('platform', 'ios')

  const native = await sendNative(admin, (tokens ?? []) as DeviceToken[], note)
  if (!subs?.length || !VAPID_PRIVATE) {
    return { pushed: native.native_sent, ...native, ...(native.native_sent ? {} : { reason: 'no_subscription' }) }
  }

  const payload = enc.encode(JSON.stringify(note))
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
  return { pushed: pushed + native.native_sent, ...native }
}

// The morning run (0164): pg_cron posts `{ action: 'flush' }` every fifteen
// minutes with `x-push-token` (Vault PUSH_CRON_TOKEN). Claims what quiet hours
// held back and has come due — the claim stamps and empties each row once —
// and sends it through `deliver`, so a kind switched off overnight is honoured
// and a setting moved later re-parks the note rather than waking anybody.
async function sameSecret(a: string, b: string): Promise<boolean> {
  const h = async (x: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(x)))
  const [x, y] = await Promise.all([h(a), h(b)])
  let d = 0
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i]
  return d === 0
}

// deno-lint-ignore no-explicit-any
async function flushDeferred(admin: any) {
  const { data, error } = await admin.rpc('push_deferred_claim', { p_limit: 200 })
  if (error) return { ok: false, reason: 'unavailable' }
  const rows = (Array.isArray(data) ? data : []) as Array<{ recipient: string; kind: PushKind; note: Note }>
  let pushed = 0
  for (let i = 0; i < rows.length; i += 10) {
    const batch = await Promise.allSettled(rows.slice(i, i + 10).map((r) => deliver(admin, r.recipient, r.kind, r.note)))
    for (const b of batch) if (b.status === 'fulfilled') pushed += b.value.pushed
  }
  // The run's own receipt (0165): pg_cron calls a run "succeeded" once the
  // request is queued, so this row is what says the flush really happened.
  await admin.rpc('push_flush_note', { p_due: rows.length, p_pushed: pushed })
  return { ok: true, due: rows.length, pushed }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  try {
    if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

    // The cron carries no user session, so it is answered before the JWT check.
    const cronToken = req.headers.get('x-push-token')
    if (cronToken) {
      const admin = createClient(SUPABASE_URL, SERVICE_KEY)
      const env = Deno.env.get('PUSH_CRON_TOKEN')
      const want = env || ((await admin.rpc('push_cron_secret')).data as string | null)
      if (!want || !(await sameSecret(cronToken, want))) return json({ error: 'unauthorized' }, 401)
      return json(await flushDeferred(admin))
    }

    // Verify the caller is the admin (sharkbait).
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'unauthorized' }, 401)

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    const input = await req.json().catch(() => ({}))
    if (input.action === 'check_in') return json(await sendCheckIn(admin, user.id, input))
    if (input.action === 'battle_played') return json(await sendBattlePlayed(admin, user.id, input))
    if (input.action === 'buddy_accepted') return json(await sendBuddyAccepted(admin, user.id, input))
    if (input.action === 'gesture') return json(await sendGesture(admin, user.id, input))
    if (input.action === 'answered') return json(await sendAnswered(admin, user.id, input))

    const { data: prof } = await admin.from('profiles').select('username').eq('id', user.id).single()
    if (!prof || prof.username !== 'sharkbait') return json({ error: 'forbidden' }, 403)

    const title = String(input.title ?? 'Verse Arcade').slice(0, 80)
    const bodyText = String(input.body ?? '').slice(0, 240)
    const url = String(input.url ?? '/')
    const tag = String(input.tag ?? 'verse-arcade')
    if (!bodyText) return json({ error: 'body is required' }, 400)

    // Native first, so a missing VAPID key never stops the iOS half.
    const { data: tokens } = await admin.from('device_tokens').select('token, environment').eq('platform', 'ios')
    const native = await sendNative(admin, (tokens ?? []) as DeviceToken[], { title, body: bodyText, url, tag })

    if (!VAPID_PRIVATE) return json({ sent: 0, failed: 0, removed: 0, total: 0, ...native, web_error: 'VAPID_PRIVATE_KEY is not configured' })
    const { data: subs, error } = await admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
    if (error) return json({ error: error.message, ...native }, 500)
    if (!subs || subs.length === 0) return json({ sent: 0, failed: 0, removed: 0, total: 0, ...native })

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

    return json({ sent, failed, removed: dead.length, total: subs.length, ...native })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
