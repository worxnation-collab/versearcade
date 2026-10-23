import { supabase } from '@/lib/supabase'

// A one-time invite link that makes a pastor their church's leadership (0121).
//
// The operator makes the link; the pastor redeems it once signed in. The code
// rides in the URL FRAGMENT (`/church/<id>/claim#<code>`) rather than the query,
// so it never reaches a server log, an edge function or a Referer header, and
// the claim screen strips it from the address bar the moment it has read it.
// It survives sign-up the way a church page does: parked in localStorage and
// picked up by `ChurchResume`.

const KEY = 'va.pendingClaim'

export type ClaimStatus = 'valid' | 'used' | 'expired' | 'invalid'

export function claimUrl(churchId: string, code: string): string {
  return `${location.origin}/church/${churchId}/claim#${code}`
}

export async function createClaimCode(churchId: string, note?: string) {
  if (!supabase) return { ok: false as const, reason: 'unavailable' }
  const { data, error } = await supabase.rpc('admin_create_church_claim_code', {
    p_church_id: churchId, p_note: note || null, p_days: 14,
  })
  const d = data as { ok?: boolean; code?: string; expires_at?: string; reason?: string } | null
  if (error || !d?.ok || !d.code) return { ok: false as const, reason: d?.reason ?? 'unavailable' }
  return { ok: true as const, url: claimUrl(churchId, d.code), expiresAt: String(d.expires_at) }
}

export async function previewClaim(churchId: string, code: string): Promise<ClaimStatus | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('church_claim_preview', { p_church_id: churchId, p_code: code })
  const d = data as { ok?: boolean; status?: ClaimStatus } | null
  return error || !d?.ok ? null : (d.status ?? null)
}

export async function redeemClaim(churchId: string, code: string) {
  if (!supabase) return { ok: false as const, reason: 'unavailable' }
  const { data, error } = await supabase.rpc('redeem_church_claim_code', { p_church_id: churchId, p_code: code })
  const d = data as { ok?: boolean; reason?: string } | null
  if (error || !d?.ok) return { ok: false as const, reason: d?.reason ?? 'unavailable' }
  return { ok: true as const }
}

export function setPendingClaim(churchId: string, code: string): void {
  try { localStorage.setItem(KEY, JSON.stringify({ churchId, code })) } catch { /* resume just won't happen */ }
}

export function getPendingClaim(): { churchId: string; code: string } | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return v && typeof v.churchId === 'string' && typeof v.code === 'string' ? v : null
  } catch {
    return null
  }
}

export function clearPendingClaim(): void {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}

// ── Self-serve: claim → pay → verified (0134) ───────────────────────────────
//
// No invite at all. A signed-in claimant opens a claim on a church nobody leads
// yet, gets a one-time token, and pays on the web billing page with it; the
// church-billing webhook makes them leadership once the subscription is live.
// Starting a claim grants nothing, and the token is never stored here — it goes
// straight into the billing page's URL. A parked self-serve claim is
// `setPendingClaim(id, '')`: an empty code is the self-serve screen.

export type SelfClaimStatus = 'open' | 'has_leader' | 'paying' | 'you_lead' | 'not_found'

export async function selfClaimStatus(churchId: string): Promise<SelfClaimStatus | null> {
  return (await claimOptions(churchId))?.status ?? null
}

/**
 * Everything the claim screen asks before drawing anything (0134, widened by
 * 0137): the status, how many members the page has, whether the FREE door is
 * open, and whether the caller already has a manual claim waiting on review.
 * A server without 0137 answers `members`/`freeOk` as 0/false, so the screen
 * simply offers the paid claim it always did.
 */
export interface ClaimOptions {
  status: SelfClaimStatus
  members: number
  freeOk: boolean
  pendingManual: boolean
}

export async function claimOptions(churchId: string): Promise<ClaimOptions | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('church_self_claim_status', { p_church_id: churchId })
  const d = data as { ok?: boolean; status?: SelfClaimStatus; members?: number; free_ok?: boolean; my_pending?: string | null } | null
  if (error || !d?.ok || !d.status) return null
  return {
    status: d.status,
    members: Number.isFinite(Number(d.members)) ? Number(d.members) : 0,
    freeOk: d.free_ok === true,
    pendingManual: d.my_pending === 'manual',
  }
}

export async function startSelfClaim(churchId: string, role: string, name: string, email: string) {
  if (!supabase) return { ok: false as const, reason: 'unavailable' }
  const { data, error } = await supabase.rpc('start_church_claim', {
    p_church_id: churchId, p_role: role, p_name: name, p_email: email,
  })
  const d = data as { ok?: boolean; token?: string; reason?: string } | null
  if (error || !d?.ok || !d.token) return { ok: false as const, reason: d?.reason ?? 'unavailable' }
  return { ok: true as const, billingUrl: `${location.origin}/church-billing/?c=${d.token}` }
}

// ── Free claim (0137) ───────────────────────────────────────────────────────
//
// A church page with at least this many members can be claimed for nothing.
// Mirrors `church_free_claim_min_members()` in SQL and FREE_CLAIM_MIN_MEMBERS
// in the church-billing function — keep the three in sync.
export const FREE_CLAIM_MIN_MEMBERS = 3

export type FreeClaimMethod = 'card' | 'manual'

/**
 * Open a free claim. `card` comes back with the Stripe setup page to send the
 * claimant to (a $0 SetupIntent — the card is saved, nothing is charged);
 * `manual` comes back waiting on an operator, with whether the email's domain
 * matched the church's own website (a flag for the reviewer, not a grant).
 */
export async function startFreeClaim(
  churchId: string,
  method: FreeClaimMethod,
  form: { role: string; name: string; email: string; phone?: string },
): Promise<
  | { ok: true; method: 'card'; setupUrl: string }
  | { ok: true; method: 'manual'; domainMatch: boolean }
  | { ok: false; reason: string; members?: number }
> {
  if (!supabase) return { ok: false, reason: 'unavailable' }
  const { data, error } = await supabase.rpc('start_church_free_claim', {
    p_church_id: churchId, p_method: method, p_role: form.role, p_name: form.name,
    p_email: form.email, p_phone: form.phone || null,
  })
  const d = data as { ok?: boolean; method?: string; token?: string; domain_match?: boolean; reason?: string; members?: number } | null
  if (error || !d?.ok) return { ok: false, reason: d?.reason ?? 'unavailable', members: d?.members }
  if (d.method === 'manual') return { ok: true, method: 'manual', domainMatch: d.domain_match === true }
  if (!d.token) return { ok: false, reason: 'unavailable' }
  const r = await supabase.functions.invoke('church-billing', { body: { action: 'setup', f: d.token } })
  const url = (r.data as { url?: unknown } | null)?.url
  if (r.error || typeof url !== 'string') return { ok: false, reason: 'setup_failed' }
  return { ok: true, method: 'card', setupUrl: url }
}
