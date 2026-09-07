// attribution — which network a person came from, kept until they sign up.
//
// Every link the social engine posts ends in `?src=<network>` (the same ids
// the engine's Platform union uses: tiktok, youtube, threads, pinterest…).
// The first one this device sees is parked here, survives the guest run and
// the OAuth reload exactly as the referral code does (`va.ref` in App.tsx),
// and is handed to `set_signup_source` (0106) once an account exists. The
// server keeps only the first value and only for a NEW account, so this is
// a hint the server verifies, never a fact the client asserts.
//
// It is stripped from the URL on capture: a src that stays in the address
// bar gets copied into the next share and mis-files a friend's sign-up.

import { supabase } from './supabase'

const KEY = 'va.src'
const SHAPE = /^[a-z0-9][a-z0-9_-]{0,31}$/

/** Read `?src=` off the current URL, keep the first one, and take it off the address bar. */
export function captureSource(): void {
  try {
    const url = new URL(window.location.href)
    const raw = url.searchParams.get('src')
    if (raw === null) return
    const src = raw.trim().toLowerCase()
    if (SHAPE.test(src) && !localStorage.getItem(KEY)) localStorage.setItem(KEY, src)
    url.searchParams.delete('src')
    window.history.replaceState(window.history.state, '', url.pathname + (url.search || '') + url.hash)
  } catch { /* storage or URL unavailable — attribution is never worth an error */ }
}

export function pendingSource(): string | null {
  try { const v = localStorage.getItem(KEY); return v && SHAPE.test(v) ? v : null } catch { return null }
}

/**
 * Tell the server, once. Any settled answer — recorded, already set, or the
 * account is too old to attribute — clears the pending value, so an old
 * account that tapped a tracked link stops asking after one round-trip.
 */
export async function applyPendingSource(): Promise<void> {
  const src = pendingSource()
  if (!src || !supabase) return
  try {
    const { data, error } = await supabase.rpc('set_signup_source', { p_src: src })
    if (error) return
    if ((data as { ok?: boolean })?.ok !== undefined) localStorage.removeItem(KEY)
  } catch { /* non-critical */ }
}
