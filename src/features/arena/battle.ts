import type { DailyVerse } from '@/types'
import { getVerseForDate, triviaQuestionsForSeed } from '@/data/bible/questions'

// Bible Battle engine. A battle is one quiz, the SAME for both players via a
// shared seed — so scores are comparable. We reuse the daily verse selector by
// mapping the seed to a far-future "virtual date" well outside the real daily
// range, so it never collides with an actual drop and both devices
// deterministically rebuild the identical verse + questions.
//
// ─────────────────────────────────────────────────────────────────────────────
// TWO KINDS OF BATTLE, AND THE MODE RIDES IN THE SEED'S SIGN.
//
// A challenger picks verse questions or Bible trivia before they play. That is
// a new fact about a battle, and the obvious place for it is a new column — but
// a column would have bought nothing and cost a migration, so it is encoded in
// the seed instead. The reasoning, written down because it will look like a
// hack otherwise:
//
//  - **The seed is already the whole contract.** `battles.seed` is a `bigint`
//    and `create_battle` inserts it without validating it, so a negative one
//    needs no schema change and works against every server already deployed —
//    including, immediately, the baked `dist` in approved iOS builds.
//  - **Every existing battle stays a verse battle**, because every seed ever
//    written is positive. Reserving a bit or a parity instead would have
//    silently reclassified half the battles in the table.
//  - **A column would not have helped the clients that matter.** An approved
//    build does not know the column exists, so it would read the row, ignore
//    the mode and rebuild a verse quiz from the seed — which is exactly what it
//    does with a negative seed today, since `battleVerse` has always taken the
//    absolute value. Same degradation, minus the migration.
//
// This is the same habit as the tier riding a placement value (`keep_woven_rug.3`)
// rather than earning a column of its own.
//
// The one consequence worth knowing: an OLD client handed a trivia battle plays
// verse questions on the anchor verse instead. Both players still answer five
// questions under identical scoring, so the battle completes and the result is
// sound — they just read different questions. That is not new here; the pool
// growing already changes distractors between app versions, which is why the
// seed rebuilds rather than the questions travelling.

/** What a battle asks. Verse questions about one verse, or Bible trivia. */
export type BattleMode = 'verse' | 'trivia'

export function newBattleSeed(mode: BattleMode = 'verse'): number {
  const n = Math.floor(Math.random() * 0x7fffffff)
  // `0` is its own negation and would read back as 'verse', so a trivia seed
  // never lands on it.
  return mode === 'trivia' ? -(n || 1) : n
}

/** Read the mode back off a seed. The only place the sign is interpreted. */
export function battleMode(seed: number): BattleMode {
  return seed < 0 ? 'trivia' : 'verse'
}

/**
 * The quiz both players get.
 *
 * Branching HERE rather than at the call sites is what makes the mode free:
 * `BattleNew`, `BattlePlay`, `BattleDetail` and a live room all ask this one
 * function for their verse and none of them needs to know a mode exists.
 */
export function battleVerse(seed: number): DailyVerse {
  const n = Math.abs(Math.trunc(seed))
  // Virtual day number far past the daily calendar (year ~2400+), derived from
  // the seed. getVerseForDate is deterministic in the date string.
  const dayNum = 160000 + (n % 200000)
  const iso = new Date(dayNum * 86400000).toISOString().slice(0, 10)
  const base = getVerseForDate(iso)
  if (seed >= 0) return base

  // A trivia battle keeps that verse and swaps only the QUESTIONS — it is the
  // same seed, so it is the same verse, and the two modes differ in what they
  // ask rather than in what they show. Two things follow, both wanted:
  //
  //  - An OLD client, which cannot read the sign, opens on the very verse its
  //    opponent is looking at and asks its own questions about it. That is the
  //    gentlest possible version of a client that doesn't know about a mode.
  //  - The read phase still puts scripture on screen, which is the arcade's
  //    rule that a machine playing a verse hands the verse back.
  //
  // Questions are drawn across ALL 66 books rather than scoped to the anchor's,
  // deliberately: a single-book round in a COMPETITIVE mode is a lottery on
  // whether you happen to know that book, where a spread samples what both
  // players actually know.
  const questions = triviaQuestionsForSeed(n)
  // Fails closed, like everything else that reads the trivia set: a build with
  // no trivia gives an ordinary verse battle rather than a run with no questions.
  return questions.length ? { ...base, questions } : base
}
