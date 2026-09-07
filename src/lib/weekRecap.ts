import { addDays } from '@/lib/date'

// The pure half of "Your week" — shapes and the recap derivation, with no
// store imports so it can be run and tested without a browser (the
// lib/tapGame.ts split). store/weekly.ts owns the snapshots and the device key.

export interface WeekNumbers {
  xp: number
  plays: number
  studied: number
  chapters: number
  relics: number
  battles: number
  given: number
}

export interface Snapshot extends WeekNumbers {
  date: string
}

export interface WeekRecap {
  /** The Sunday this recap became available (YYYY-MM-DD). */
  key: string
  /** The seven days it covers, first and last. */
  from: string
  to: string
  delta: WeekNumbers
}

/** The Sunday on or before `date`. */
export function sundayOnOrBefore(date: string): string {
  const d = new Date(`${date}T12:00:00`)
  return addDays(date, -d.getDay())
}

function diff(a: Snapshot, b: Snapshot): WeekNumbers {
  const nz = (n: number) => Math.max(0, n)
  return {
    xp: nz(b.xp - a.xp),
    plays: nz(b.plays - a.plays),
    studied: nz(b.studied - a.studied),
    chapters: nz(b.chapters - a.chapters),
    relics: nz(b.relics - a.relics),
    battles: nz(b.battles - a.battles),
    // Given can be 0 on a device that never loaded the church store; the
    // baseline and the end are read the same way, so it stays honest.
    given: nz(b.given - a.given),
  }
}

/**
 * Last week's recap out of the snapshot history, or null when there isn't a
 * week of history to speak of.
 *
 * Baseline: the newest snapshot on or before the Sunday a week ago. End: the
 * newest on or before this Sunday, or — when the player didn't open the app
 * that weekend — the oldest after it, which folds a day or two of this week in
 * rather than showing nothing.
 */
export function deriveRecap(history: Snapshot[], today: string): WeekRecap | null {
  if (history.length < 2) return null
  const sorted = [...history].sort((a, b) => (a.date < b.date ? -1 : 1))
  const thisSunday = sundayOnOrBefore(today)
  const lastSunday = addDays(thisSunday, -7)
  const baseline = [...sorted].reverse().find((s) => s.date <= lastSunday)
  if (!baseline) return null
  const end =
    [...sorted].reverse().find((s) => s.date <= thisSunday && s.date > baseline.date) ??
    sorted.find((s) => s.date > thisSunday)
  if (!end || end.date === baseline.date) return null
  return { key: thisSunday, from: addDays(lastSunday, 1), to: addDays(thisSunday, -1), delta: diff(baseline, end) }
}
