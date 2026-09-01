import type { DailyVerse } from '@/types'
import { getVerseForDate, triviaBattleBook, triviaBattleVerse } from '@/data/bible/questions'

// Bible Battle engine. A battle is one seeded round, the SAME for both players,
// so scores are comparable.
//
// ── TWO MODES, AND WHY THE SIGNATURE IS SHAPED LIKE THIS ─────────────────────
//
// `verse` is what this app has always had: a verse, four questions about it and
// a bonus about its book. `trivia` is five questions about ONE book, read over a
// verse from that book — the daily trivia round, dealt from a battle seed.
//
// **`mode` defaults to 'verse', and that default is load-bearing.** Every
// battle row written before 0094 has no mode, every already-approved iOS build
// ships a baked `dist` that calls this with one argument, and a pending
// challenge sent an hour ago stores only a seed. All three have to keep
// rebuilding the exact round they were dealt, so a one-argument call must be
// byte-identical to what it was — which is why the mode is a SECOND argument
// rather than something folded into the seed. Encoding it in the seed would
// have shipped no migration and silently re-dealt every pending battle, handing
// the two players different questions under one score column.
export type BattleMode = 'verse' | 'trivia'

/** Whether a value off the wire is a mode, failing closed to what always was. */
export function asBattleMode(v: unknown): BattleMode {
  return v === 'trivia' ? 'trivia' : 'verse'
}

export function newBattleSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff)
}

export function battleVerse(seed: number, mode: BattleMode = 'verse'): DailyVerse {
  if (mode === 'trivia') return triviaBattleVerse(seed)
  // Virtual day number far past the daily calendar (year ~2400+), derived from
  // the seed. getVerseForDate is deterministic in the date string. UNCHANGED —
  // every seed ever stored still lands on the round it was dealt.
  const dayNum = 160000 + (Math.abs(Math.trunc(seed)) % 200000)
  const iso = new Date(dayNum * 86400000).toISOString().slice(0, 10)
  return getVerseForDate(iso)
}

/**
 * The pill above the run. It names the BOOK on a trivia battle, because that is
 * the one thing a player wants to know before the clock starts and the round
 * cannot tell them any other way — a verse battle shows its verse on the read
 * screen, a trivia battle's verse is the anchor rather than the subject.
 */
export function battleModeLabel(seed: number, mode: BattleMode): string {
  if (mode !== 'trivia') return 'Verse round'
  return `Trivia · ${triviaBattleBook(seed) ?? 'the whole Bible'}`
}

/** One line saying what the mode asks, for the picker. */
export const MODE_BLURB: Record<BattleMode, string> = {
  verse: 'Read a verse, then race the clock on it — the last question a bonus about its book.',
  trivia: 'Five questions about one book of the Bible: its people, its places and what happens in it.',
}

export const MODE_LABEL: Record<BattleMode, string> = {
  verse: '📖 Verse',
  trivia: '✨ Trivia',
}
