import type { Question } from '@/types'

// The daily drop's answer poll — how everybody answered each question.
//
// After you lock an answer on the day's verse, the feedback screen shows how
// the crowd split across the four options. It is a fact about the CROWD and
// never about a person: the tally (0100, `daily_answer_tallies`) is a count
// per (day, deal, question, option) with no user on the row, so a "who got it
// wrong" list can never be built out of it. Full argument in the migration
// header. Three rules the client keeps:
//
//  * After the answer, never before. Everybody gets the same five questions
//    on a date, so a split shown before you tap is the answer key.
//  * Below the floor, nothing. The server withholds a question until at least
//    POLL_MIN_ANSWERS accounts have answered it, and the client renders
//    nothing for a withheld question rather than "67%" off three players.
//  * Fail closed. No keys, a server without 0100, a deal this build disagrees
//    with — all of it is simply no poll, never an error and never a wrong one.

/** ↔ `poll_min` in `daily_answer_poll` (0100). Keep the two in sync. */
export const POLL_MIN_ANSWERS = 10

/** Per-question option counts from the server, for the questions it released. */
export type AnswerPoll = Record<number, number[]>

/**
 * A short fingerprint of the deal a run actually showed — FNV-1a 32 over every
 * prompt and its options in order, as 8 hex chars. The tally is keyed on it
 * (see the migration header): distractors come out of VERSE_POOL and the pool
 * grows, so two app versions can show the same date's question with different
 * options in different places. A build whose deal differs sees no poll rather
 * than another build's crowd under its own option text.
 */
export function dealFingerprint(questions: Question[]): string {
  let h = 0x811c9dc5
  const eat = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
  }
  // Unit separators between fields, a record separator between questions, so
  // "ab" + "c" and "a" + "bc" can't collide.
  for (const q of questions) {
    eat(q.prompt)
    eat('\u001f')
    for (const o of q.options) {
      eat(o)
      eat('\u001f')
    }
    eat('\u001e')
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** The four bars for one question: shares in percent, summing to 100 (or 0). */
export function pollShares(counts: number[]): number[] {
  const total = counts.reduce((s, n) => s + n, 0)
  if (total <= 0) return counts.map(() => 0)
  // Largest-remainder rounding so the four always sum to exactly 100 — a poll
  // that reads 33 / 33 / 33 / 0 looks like a bug even when it is right.
  const raw = counts.map((n) => (n * 100) / total)
  const floors = raw.map(Math.floor)
  let left = 100 - floors.reduce((s, n) => s + n, 0)
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
  for (const { i } of order) {
    if (left <= 0) break
    floors[i] += 1
    left -= 1
  }
  return floors
}
