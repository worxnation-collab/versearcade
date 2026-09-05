// Date helpers. The "drop" rolls over at local midnight so the ritual matches
// the user's own day (like Wordle). Everyone still gets the same verse for the
// same calendar date.

export function todayLocalDate(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function msUntilNextLocalMidnight(now = new Date()): number {
  const next = new Date(now)
  next.setHours(24, 0, 0, 0)
  return next.getTime() - now.getTime()
}

export function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = String(Math.floor(totalSec / 3600)).padStart(2, '0')
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0')
  const s = String(totalSec % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

/**
 * The viewer's IANA zone (e.g. "America/Chicago"), or 'UTC' where the runtime
 * won't say. Sent to the admin RPCs so the dashboard's "today" is the
 * operator's day rather than the database's — the server's TimeZone is UTC, so
 * `current_date` there rolls over hours before midnight anywhere in the US.
 * The server validates the name and falls back to UTC, so a junk value from an
 * exotic runtime degrades to the old behaviour instead of erroring.
 */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * A calendar date, shifted by whole days. Date-only arithmetic in UTC so a
 * DST boundary can't move the answer — "yesterday" is the day before on the
 * calendar, not 24 hours ago.
 */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
