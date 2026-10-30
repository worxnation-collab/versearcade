// Svix webhook signatures, as Resend sends them (pure — no Deno, so a script
// can test it). The signed content is `${id}.${timestamp}.${body}`, HMAC-SHA256
// keyed with the base64 half of a `whsec_…` secret; `svix-signature` carries
// one or more space-separated `v1,<base64>` entries, any of which may match.
// A timestamp more than five minutes off is refused, so a captured request
// cannot be replayed later.

const TOLERANCE_S = 5 * 60

function b64decode(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function b64encode(b: Uint8Array): string {
  let s = ''
  for (const x of b) s += String.fromCharCode(x)
  return btoa(s)
}

function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function svixSign(secret: string, id: string, ts: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', b64decode(secret.replace(/^whsec_/, '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`))
  return b64encode(new Uint8Array(mac))
}

export async function svixVerify(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  nowS = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const { id, timestamp, signature } = headers
  if (!secret || !id || !timestamp || !signature) return false
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(nowS - ts) > TOLERANCE_S) return false
  let expected: string
  try { expected = await svixSign(secret, id, timestamp, body) } catch { return false }
  return signature.split(' ').some((part) => {
    const [v, sig] = part.split(',')
    return v === 'v1' && typeof sig === 'string' && sameString(sig, expected)
  })
}

export type EmailEventKind = 'bounce_permanent' | 'bounce_transient' | 'complaint'

/** What a Resend event means here, or null for the events this app ignores. */
export function classify(event: unknown): { kind: EmailEventKind; to: string[] } | null {
  const e = event as { type?: unknown; data?: { to?: unknown; bounce?: { type?: unknown } } }
  const to = Array.isArray(e?.data?.to)
    ? (e.data!.to as unknown[]).filter((t): t is string => typeof t === 'string' && t.includes('@')).slice(0, 10)
    : typeof e?.data?.to === 'string' && (e.data!.to as string).includes('@') ? [e.data!.to as string] : []
  if (e?.type === 'email.complained') return { kind: 'complaint', to }
  if (e?.type === 'email.bounced') {
    // Only a PERMANENT bounce means the address is gone. Transient and
    // Undetermined are counted and the next send is still allowed.
    const bt = String(e?.data?.bounce?.type ?? '').toLowerCase()
    return { kind: bt === 'permanent' ? 'bounce_permanent' : 'bounce_transient', to }
  }
  return null
}
