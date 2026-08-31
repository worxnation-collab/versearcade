// Tap games — the rules half of the arcade cabinet.
//
// A tap game here is deliberately NOT a reflex test. Something appears; the
// question the player answers is whether it should be taken or left alone, and
// every wrong answer hands over the verse that says why. That is the same
// bargain the quiz makes ("every answer reveals a fact") in a shape that needs
// one thumb and no reading speed.
//
// This file is the pure half: shapes, the round table and the two decisions a
// tap can produce. It imports nothing from React or the stores, so the rules
// can be read, tested and reasoned about without a screen — the same split
// lib/practice.ts and data/placement.ts make.
//
// What a game must NOT have, and why the arcade can exist at all next to the
// no-losers rule:
//
//   - no fail state. A round ends; it is never lost. The run always finishes
//     with something gathered.
//   - nothing rankable. TapRunner rolls a study drop and nothing else — no XP,
//     no points, no standing. See lib/drops.ts for why that is the one reward
//     shape this app allows for something you could be better at than a friend.
//   - no comparison. The end screen counts your own run against your own bar.

/** What a tap on a target should have been. */
export type TapVerdict = 'take' | 'leave'

/** One thing a round can put on the field. */
export interface TapKindDef {
  /** Opaque to this file — the game's own renderer decides what it looks like. */
  kind: string
  verdict: TapVerdict
  /** Relative likelihood within the round. Weights need not sum to anything. */
  weight: number
}

/** A line of teaching, shown for about two seconds and never as an error. */
export interface TeachLine {
  text: string
  /** Chapter and verse, when the line is one. */
  cite?: string
}

export interface TapRoundDef {
  key: string
  /** Big on the interstitial card — "Day 3". */
  title: string
  /** The line under it, saying what this round asks for. */
  note: string
  /**
   * Targets to take before the round ends early and happily.
   *
   * ZERO is a real value and the most interesting one: a round nobody is
   * meant to tap. Manna Rush's seventh day is quota 0, and keeping still
   * through it is the best thing you can do in the game.
   */
  quota: number
  durationMs: number
  spawnEveryMs: number
  /** How long one target stays on the field before it goes by itself. */
  lifeMs: number
  kinds: TapKindDef[]
}

/**
 * What a game is told when it decides what to put on the field, or whether a
 * tap was right.
 *
 * This exists because "should I tap this?" is not always a fact about the
 * thing. In Manna Rush it is — a lump is a lump whenever you touch it. In Word
 * Catch the same word is wrong now and right in four seconds, because what
 * makes it right is how much of the verse you have already rebuilt. A spawn
 * table of fixed weights cannot say that, so a game may answer both questions
 * itself.
 */
export interface TapContext {
  /** Index of the round being played. */
  round: number
  /** Correct taps in THIS round so far. */
  taken: number
  /** Kinds currently on the field, so a game can avoid spawning a duplicate. */
  live: string[]
}

export interface TapGameDef {
  id: string
  name: string
  rounds: TapRoundDef[]
  /**
   * Choose what to put on the field next. Return null to put nothing there
   * this tick. Defaults to drawing from the round's weighted `kinds` table,
   * which is all a game with fixed verdicts ever needs.
   */
  plan?: (ctx: TapContext, round: TapRoundDef) => { kind: string; verdict: TapVerdict } | null
  /**
   * Judge a tap AT TAP TIME rather than at spawn time. Defaults to the verdict
   * the target was spawned with.
   *
   * The distinction is the whole reason this hook exists: a word that was the
   * wrong answer when it landed becomes the right one the moment the word
   * before it is placed, and it is still sitting there on the field.
   */
  verdictOf?: (kind: string, ctx: TapContext, round: TapRoundDef) => TapVerdict
  teach: {
    /** Tapped something whose verdict was 'leave'. */
    wrong: TeachLine
    /** A 'take' expired untouched. Shown ONCE per run — it is a fact about the
     *  world, not a telling-off, and repeating it every few seconds turns it
     *  into one. */
    missed?: TeachLine
    /** The quota filled and the round ended early. */
    quota?: TeachLine
    /** Tapping bare ground during a quota-0 round. */
    ground?: TeachLine
  }
  /** What the harvest screen calls the two numbers and the rest round. */
  labels: {
    taken: string
    clean: string
    restKept: string
    restBroken: string
  }
}

export interface TapResult {
  /** Targets correctly taken across the whole run. */
  taken: number
  /** Scoring rounds finished without tapping something that should be left. */
  cleanRounds: number
  /** Scoring rounds there were, so `cleanRounds` reads as "5 of 6". */
  scoringRounds: number
  /**
   * Whether the quota-0 round was kept — null when the game has none.
   * A game without a rest round simply doesn't show that line.
   */
  restKept: boolean | null
}

/** A round nobody is meant to tap. */
export const isRestRound = (r: TapRoundDef): boolean => r.quota === 0

/** Scoring rounds — the ones a "clean" count is out of. */
export const scoringRounds = (g: TapGameDef): number =>
  g.rounds.filter((r) => !isRestRound(r)).length

/**
 * Draw one kind for a spawn.
 *
 * `rnd` is injected rather than reached for so a caller can seed it. Nothing
 * seeds it today: a tap run isn't compared between players, so a shared layout
 * would buy fairness nobody needs and cost every replay of a day being the
 * identical field. (Verses are the opposite case, which is why
 * getVerseForDate is fixed forever.)
 */
export function pickKind(kinds: TapKindDef[], rnd: () => number = Math.random): TapKindDef {
  const usable = kinds.filter((k) => k.weight > 0)
  if (!usable.length) return kinds[0]
  const total = usable.reduce((n, k) => n + k.weight, 0)
  let roll = rnd() * total
  for (const k of usable) {
    roll -= k.weight
    if (roll <= 0) return k
  }
  return usable[usable.length - 1]
}

/** Where a target can appear, as percentages of the field box. */
export interface TapPlot {
  x: number
  y: number
  /** Depth cue — further up the field is smaller, as in every scene here. */
  scale: number
}

/**
 * Rows of plots with a depth ramp, since every tap field wants the same thing.
 *
 * The caller passes percentages that already keep clear of whatever the screen
 * puts over the field. That matters more than it sounds: a target under the
 * teach-line toast is one you cannot tap, which is the same trap the z-index
 * ladder note warns about for toasts over buttons.
 */
export function plotGrid(cols: number[], rows: { y: number; scale: number }[]): TapPlot[] {
  const out: TapPlot[] = []
  for (const r of rows) for (const x of cols) out.push({ x, y: r.y, scale: r.scale })
  return out
}
