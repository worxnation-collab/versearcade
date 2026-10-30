// emailClick — the tap on a come-back email's "Play today's verse" link.
//
// push-send puts the send's own random id on the link (`/play/run?e=<id>`,
// 0174). Reading it here counts the tap through `note_email_click`, which is
// keyed only by that id and can stamp one click time on one send — so it is
// sent signed in or not, before the run's own screen decides where to go.
// Stripped from the address bar on capture so a shared link never re-counts.

import { supabase } from './supabase'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function captureEmailClick(): void {
  try {
    const url = new URL(window.location.href)
    const raw = url.searchParams.get('e')
    if (raw === null) return
    url.searchParams.delete('e')
    window.history.replaceState(window.history.state, '', url.pathname + (url.search || '') + url.hash)
    if (!supabase || !UUID.test(raw)) return
    void supabase.rpc('note_email_click', { p_send: raw.toLowerCase() }).then(() => undefined, () => undefined)
  } catch { /* a count is never worth an error */ }
}
