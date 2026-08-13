import type { DailyVerse } from '@/types'
import { getVerseForDate } from '@/data/bible/questions'

// Bible Battle engine. A battle is one random verse (+ its quiz), the SAME for
// both players via a shared seed — so scores are comparable. We reuse the daily
// verse selector by mapping the seed to a far-future "virtual date" well outside
// the real daily range, so it never collides with an actual drop and both
// devices deterministically rebuild the identical verse + questions.

export function newBattleSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff)
}

export function battleVerse(seed: number): DailyVerse {
  // Virtual day number far past the daily calendar (year ~2400+), derived from
  // the seed. getVerseForDate is deterministic in the date string.
  const dayNum = 160000 + (Math.abs(Math.trunc(seed)) % 200000)
  const iso = new Date(dayNum * 86400000).toISOString().slice(0, 10)
  return getVerseForDate(iso)
}
