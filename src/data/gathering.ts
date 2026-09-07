// The gathering hour — one stated hour a day when a live match is likeliest.
//
// Quick match's usual state is an empty lobby, and that is not a bug in the
// lobby: a small population spread across twenty-four hours is nobody at any
// one of them. The cheap fix is the one Pokémon Go's community day and every
// arcade's "Friday night" make — tell everybody the SAME time, so the people
// who want a stranger arrive together.
//
// Three things about it are deliberate:
//
//  - **It is ONE instant worldwide, shown in local time.** 8pm in New York is
//    the anchor (most of the congregations here are American), rendered as
//    "5:00 pm" in Los Angeles and "1:00 am" in London. A per-viewer "8pm local"
//    would scatter the players again, which is the exact problem.
//  - **It carries no number about a person.** No "12 people usually show up",
//    no attendance, no streak for attending. It is a clock on the wall.
//  - **Nothing else changes during it.** No bonus XP, no double drops: an hour
//    that pays more is an hour you can be behind on. The only thing the hour
//    buys is company.

/** The anchor: this wall-clock hour in this zone, every day. */
const ANCHOR_ZONE = 'America/New_York'
const ANCHOR_HOUR = 20
/** How long the window is open, in minutes. */
export const GATHERING_MINUTES = 60

/** Offset of `zone` from UTC in minutes, at `at`. */
function zoneOffsetMinutes(zone: string, at: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(at)
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0)
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
    return Math.round((asUtc - at.getTime()) / 60_000)
  } catch {
    return -300 // Eastern standard time; the fallback for a runtime without zones
  }
}

/** The anchor's next start on or after `from` (or the one currently open). */
export function gatheringWindow(from: Date = new Date()): { start: Date; end: Date } {
  // Find today's anchor instant in the anchor zone, then step forward until the
  // window's END is still ahead of `from`.
  for (let dayOffset = -1; dayOffset <= 2; dayOffset++) {
    const probe = new Date(from.getTime() + dayOffset * 86_400_000)
    const offset = zoneOffsetMinutes(ANCHOR_ZONE, probe)
    // Local calendar date in the anchor zone, as UTC fields.
    const local = new Date(probe.getTime() + offset * 60_000)
    const startUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), ANCHOR_HOUR, 0, 0) - offset * 60_000
    const start = new Date(startUtc)
    const end = new Date(startUtc + GATHERING_MINUTES * 60_000)
    if (end > from) return { start, end }
  }
  // Unreachable in practice; keep the shape.
  const start = new Date(from.getTime() + 86_400_000)
  return { start, end: new Date(start.getTime() + GATHERING_MINUTES * 60_000) }
}

/** Whether the gathering hour is open right now. */
export function gatheringOpen(now: Date = new Date()): boolean {
  const { start, end } = gatheringWindow(now)
  return now >= start && now < end
}

/** "8:00 pm", in the viewer's own clock. */
export function gatheringLabel(now: Date = new Date()): string {
  const { start } = gatheringWindow(now)
  try {
    return start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).toLowerCase()
  } catch {
    return `${start.getHours()}:00`
  }
}

/** A short line for a surface that offers a live match. */
export function gatheringLine(now: Date = new Date()): string {
  if (gatheringOpen(now)) return 'It’s the gathering hour — this is when people are likeliest to be looking.'
  const { start } = gatheringWindow(now)
  const mins = Math.round((start.getTime() - now.getTime()) / 60_000)
  const when =
    mins < 60
      ? `in ${mins} min`
      : mins < 24 * 60 && start.getDate() === now.getDate()
        ? `at ${gatheringLabel(now)} tonight`
        : `at ${gatheringLabel(now)} tomorrow`
  return `The gathering hour is ${when} — the one time a day everyone’s told to come.`
}
