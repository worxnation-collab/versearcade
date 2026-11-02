// boardLink — a quiz or myth post's link brings the viewer to the board.
//
// The chalkboard quiz never gives its answer on the video; it is chalked on
// the top of the NEXT day's board. That loop used to live only on social, so
// somebody who tapped through landed on today's verse with nothing about the
// question they had just argued over in the comments. The first comment under
// a quiz or myth now carries `&b=1` (`siteLink` in tiktok-gen/social.ts), and
// the Play tab's "Yesterday's board" card (`features/daily/YesterdayBoard`)
// scrolls into view and glows once when it was the reason they came.
//
// Captured at boot and parked for the reason `?d=` is (lib/verseLink.ts): a
// stranger meets /welcome before /play, and a bare query param does not
// survive that. Taken once; a day-old parked flag is dropped.

const KEY = 'va.boardLink'
const TTL_MS = 24 * 60 * 60 * 1000

/** Read `?b=1` off the current URL, park it, and take it off the address bar. */
export function captureBoardLink(): void {
  try {
    const url = new URL(window.location.href)
    if (url.searchParams.get('b') === null) return
    if (url.searchParams.get('b') === '1') localStorage.setItem(KEY, String(Date.now()))
    url.searchParams.delete('b')
    window.history.replaceState(window.history.state, '', url.pathname + (url.search || '') + url.hash)
  } catch { /* storage or URL unavailable — the Play tab as usual */ }
}

/** Whether a fresh board link is waiting — and forget it. */
export function takeBoardLink(): boolean {
  try {
    const at = Number(localStorage.getItem(KEY))
    localStorage.removeItem(KEY)
    return at > 0 && Date.now() - at < TTL_MS
  } catch { return false }
}
