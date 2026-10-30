// verseLink — a social post's link opens the verse that post was ABOUT.
//
// The engine's tracked link is `versearcade.org/play?src=<network>&d=<date>`
// (`siteLink` in supabase/functions/tiktok-gen/social.ts). `/play` alone
// always shows TODAY's verse, so somebody tapping Tuesday's video on Friday
// landed on a different verse from the one they had just watched. `d` names
// the post's own date, and the verse for a date is `getVerseForDate`, the
// same for everybody forever — so the date is the whole of the link.
//
// It is captured at boot and parked, exactly like `?src=` (lib/attribution),
// because a stranger meets /welcome before /play and a bare query param does
// not survive that. It is taken ONCE, by the Play tab, the first time a
// profile exists to play it with:
//
//   - today's date  → the drop's run (`/play/run`, which itself goes to the
//     result if the day is already played)
//   - a past date   → that date's replay (`/play/practice/<date>`), which is
//     behind the account wall for a guest — the wall says what an account
//     keeps, and that is the intended pitch, not a dead end
//   - anything else → nothing; the Play tab as usual
//
// A link older than a day on the device is dropped rather than acted on, so
// a half-finished sign-up from last week cannot hijack the next app open.
//
// The universal-link half (opening the INSTALLED app from the same URL) is
// parked for the next store build: it needs an apple-app-site-association
// file and an Associated Domains entitlement, and only the second costs a
// submission.

const KEY = 'va.verseLink'
const DATE = /^\d{4}-\d{2}-\d{2}$/
const TTL_MS = 24 * 60 * 60 * 1000
/** Nothing before the first day the engine posted can be a post's date. */
const EARLIEST = '2026-08-01'

/** Read `?d=` off the current URL, park it, and take it off the address bar. */
export function captureVerseLink(): void {
  try {
    const url = new URL(window.location.href)
    const d = url.searchParams.get('d')
    if (d === null) return
    if (DATE.test(d) && d >= EARLIEST) localStorage.setItem(KEY, JSON.stringify({ d, at: Date.now() }))
    url.searchParams.delete('d')
    window.history.replaceState(window.history.state, '', url.pathname + (url.search || '') + url.hash)
  } catch { /* storage or URL unavailable — the Play tab as usual */ }
}

/** Where a parked link should go, given today's local date — and forget it. */
export function takeVerseLink(today: string): string | null {
  const to = peekVerseLink(today)
  try { localStorage.removeItem(KEY) } catch { /* nothing to forget */ }
  return to
}

/** The same answer without forgetting it — Landing asks this to know a friend
 *  sent today's verse, and leaves the link for the Play tab to take. */
export function peekVerseLink(today: string): string | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const { d, at } = JSON.parse(raw) as { d?: unknown; at?: unknown }
    if (typeof d !== 'string' || !DATE.test(d) || typeof at !== 'number' || Date.now() - at > TTL_MS) return null
    if (d === today) return '/play/run'
    if (d < today && d >= EARLIEST) return `/play/practice/${d}`
    return null
  } catch { return null }
}
