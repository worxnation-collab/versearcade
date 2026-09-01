// Crosses cut from any verse in the pool, on demand.
//
// `CROSS_PUZZLES` is fifty-two hand-written crosses and it is still the DAILY —
// one authored puzzle a day, the same one for everybody, with clues somebody
// actually wrote. What it could not be is a machine you come back to twice in
// an afternoon: fifty-two puzzles on a `dayNumber % N` rotation is the same
// cross every fifty-two days and, worse, the SAME cross every time you re-open
// the screen inside one day. This file is the other half — given a verse, find
// two words in it that will stand as a cross, and clue them from the verse
// itself.
//
// The three rules `data/crossword.ts` states hold here too, and they are why
// this can be generated rather than written:
//
//  1. **The shape must read as a cross.** `fitsCross` below re-derives the same
//     geometry the authored data is checked against — crossbar in the upper
//     third of the upright, crossing near the crossbar's own middle — so a
//     generated puzzle can never be a plus sign or a T.
//  2. **The verse is the source of truth.** Both words are lifted OUT of the
//     verse's own text, so "both words appear in the verse" is true by
//     construction rather than by assertion. The reveal always lands.
//  3. **A clue never contains its own answer.** The clue is a window of the
//     verse with the answer blanked — and the OTHER answer blanked too, or the
//     upright's clue would hand you the crossbar for free.
//
// The trade this makes, stated plainly: a fill-in-the-blank clue shows four or
// five words of the verse before the reveal. That is a smaller payoff than an
// authored clue's "oh — THAT's where those words live", which is exactly why
// the authored puzzle stays the daily and these are what you get afterwards.
// It is also the only clue style that is honestly generatable: the pool's
// speaker/theme/keyword metadata describes the VERSE, not a word in it, so a
// metadata clue reads the same for both halves of every cross.

import { VERSE_POOL, type VerseSeed } from './bible/pool'
import type { CrossPuzzle } from './crossword'

/** Upright length, matching the authored data's own bounds. */
const DOWN_MIN = 5
const DOWN_MAX = 9
/** Crossbar length, likewise. */
const ACROSS_MIN = 3
const ACROSS_MAX = 8
/** How many words of the verse a clue shows on either side of the blank. */
const CLUE_CONTEXT = 4

/**
 * Words that make a dull answer.
 *
 * Not a spell-checker and not a stop-list for search — the only question here
 * is "would blanking this word out of a sentence be a puzzle?". "STILL",
 * "LIGHT" and "REFUGE" all stay, because they carry the verse; "SHALL",
 * "THEIR" and "BECAUSE" go, because a blank where they stand is grammar rather
 * than scripture.
 */
const DULL = new Set([
  'THE', 'AND', 'BUT', 'FOR', 'NOR', 'YET', 'SO', 'THAT', 'THIS', 'THESE',
  'THOSE', 'THERE', 'THEIR', 'THEIRS', 'THEY', 'THEM', 'THEN', 'THAN',
  'WITH', 'WITHIN', 'WITHOUT', 'FROM', 'INTO', 'ONTO', 'UNTO', 'UPON',
  'OUT', 'OFF', 'OVER', 'UNDER', 'ABOUT', 'ABOVE', 'AMONG', 'AGAINST',
  'BETWEEN', 'THROUGH', 'TOWARD', 'TOWARDS', 'UNTIL', 'BEFORE', 'AFTER',
  'AGAIN', 'ALSO', 'EVER', 'NEVER', 'EVERY', 'EACH', 'ALL', 'ANY', 'SOME',
  'SUCH', 'ONLY', 'JUST', 'VERY', 'MORE', 'MOST', 'MUCH', 'MANY',
  'YOU', 'YOUR', 'YOURS', 'YOURSELF', 'HIS', 'HER', 'HERS', 'HIM', 'ITS',
  'OUR', 'OURS', 'WHO', 'WHOM', 'WHOSE', 'WHAT', 'WHEN', 'WHERE', 'WHICH',
  'WHILE', 'BECAUSE', 'THEREFORE', 'HOWEVER',
  'WAS', 'WERE', 'ARE', 'BEEN', 'BEING', 'HAVE', 'HAS', 'HAD', 'HAVING',
  'WILL', 'SHALL', 'WOULD', 'SHOULD', 'MAY', 'MIGHT', 'CAN', 'COULD',
  'MUST', 'NOT', 'ONE', 'OWN', 'ITSELF', 'HIMSELF', 'HERSELF', 'THEMSELVES',
  'DOES', 'DID', 'DONE', 'SAID', 'SAYS', 'SAYING',
])

/** A word of the verse, and which whitespace-token of it carries it. */
interface Candidate {
  word: string
  /** Index into the display tokens, so a clue can blank exactly this word. */
  at: number
}

/**
 * A token's letters, normalised the way `checkCrossPuzzles` normalises the
 * verse before testing `\bWORD\b` against it: apostrophes dissolve ("God's" is
 * GODS, one word), everything else that isn't a letter is a boundary.
 *
 * A token that breaks into more than one run ("well-being") yields nothing —
 * blanking half of a hyphenated word makes a clue that reads like a typo, and
 * the words worth using are never the hyphenated ones.
 */
function wordRuns(token: string): string[] {
  return token.replace(/['’‘]/g, '').toUpperCase().match(/[A-Z]+/g) ?? []
}

function soleWord(token: string): string | null {
  const runs = wordRuns(token)
  return runs.length === 1 ? runs[0] : null
}

/** Does a crossbar of this length, crossed here, read as a cross? */
export function fitsCross(down: string, downIndex: number, across: string, acrossIndex: number): boolean {
  if (down === across) return false
  if (down.length < DOWN_MIN || down.length > DOWN_MAX) return false
  if (across.length < ACROSS_MIN || across.length > ACROSS_MAX) return false
  // The crossbar sits in the upper third of the upright — lower and it is a
  // plus sign rather than a cross.
  if (downIndex < 1 || downIndex >= down.length) return false
  if (downIndex > Math.ceil(down.length / 3)) return false
  // ...and near the crossbar's own middle, or the arms are lopsided.
  if (acrossIndex < 0 || acrossIndex >= across.length) return false
  if (Math.abs(acrossIndex - (across.length - 1) / 2) > 1) return false
  return down[downIndex] === across[acrossIndex]
}

/**
 * A window of the verse with the answer blanked out — or null if the partner
 * word is standing in that window too.
 *
 * The null is the interesting half. Blanking BOTH answers in both clues was the
 * first cut of this, and driving it showed why it doesn't work: two adjacent
 * words give you "… have ____ from the ____ that you must walk …" as the clue
 * for each of them, and no way to tell which blank you are being asked for. So
 * a window has to hold exactly one of the two, and a pair standing too close
 * together in the verse is simply not a pair — there are fifteen thousand
 * others.
 *
 * Every occurrence of the answer in the window is blanked, not just the one at
 * `at`: a repeated word is the same word, and leaving the second copy showing
 * hands it over.
 */
function clueFor(tokens: string[], at: number, answer: string, partner: string): string | null {
  const from = Math.max(0, at - CLUE_CONTEXT)
  const to = Math.min(tokens.length, at + CLUE_CONTEXT + 1)
  const body: string[] = []
  for (const t of tokens.slice(from, to)) {
    // By RUN, not by whole token: an answer of GOD hiding inside "God-given"
    // would otherwise stand there in plain sight, because that token is not a
    // candidate itself and so never compared.
    const runs = wordRuns(t)
    if (runs.includes(partner)) return null
    body.push(runs.includes(answer) ? '____' : t)
  }
  return `${from > 0 ? '… ' : ''}${body.join(' ')}${to < tokens.length ? ' …' : ''}`
}

/**
 * Would either clue hand its answer over?
 *
 * The same SUBSTRING test `checkCrossPuzzles` applies to the authored data, not
 * a word-boundary one, and that strictness is the point: a clue reading
 * "sitting" under an answer of SIT is most of the way to free. Blanking already
 * removes the word itself, so what this catches is the answer hiding inside a
 * longer neighbouring word.
 *
 * It also drops a pair whose two clues are the same window of the verse. Those
 * are legal and solvable, and they read as one clue printed twice.
 */
function cluesGiveItAway(p: CrossPuzzle): boolean {
  const down = p.down.clue.toUpperCase()
  const across = p.across.clue.toUpperCase()
  // Its own answer, hiding inside a longer neighbouring word.
  if (down.includes(p.down.word) || across.includes(p.across.word)) return true
  // ...and the PARTNER's, the same way. `clueFor` already refuses a window that
  // holds the other answer as a word of its own; this is the rest of it —
  // "a ransom for many" under an upright of MAN, or "perfected" under PERFECT.
  if (down.includes(p.across.word) || across.includes(p.down.word)) return true
  return p.down.clue === p.across.clue
}

/** Every cross that could be cut from this verse. */
export function crossOptions(verse: VerseSeed): CrossPuzzle[] {
  const tokens = verse.text.split(/\s+/).filter(Boolean)
  const words: Candidate[] = []
  const seen = new Set<string>()
  tokens.forEach((t, at) => {
    const w = soleWord(t)
    // First occurrence only: a word repeated in a verse gets one clue window,
    // and the blanking below hides every copy of it anyway.
    if (!w || seen.has(w) || DULL.has(w)) return
    seen.add(w)
    words.push({ word: w, at })
  })

  const out: CrossPuzzle[] = []
  for (const d of words) {
    if (d.word.length < DOWN_MIN || d.word.length > DOWN_MAX) continue
    for (const a of words) {
      if (a.word === d.word) continue
      if (a.word.length < ACROSS_MIN || a.word.length > ACROSS_MAX) continue
      for (let di = 1; di <= Math.ceil(d.word.length / 3); di++) {
        for (let ai = 0; ai < a.word.length; ai++) {
          if (!fitsCross(d.word, di, a.word, ai)) continue
          const downClue = clueFor(tokens, d.at, d.word, a.word)
          const acrossClue = clueFor(tokens, a.at, a.word, d.word)
          if (!downClue || !acrossClue) continue
          const puzzle: CrossPuzzle = {
            // Stable and unique per shape, so the solved set keys on it the way
            // it keys on an authored id. The `x:` prefix is what tells the two
            // apart — an authored id is a slug and can never collide with this.
            id: `x:${verse.reference}:${d.word}${di}-${a.word}${ai}`,
            reference: verse.reference,
            down: { word: d.word, clue: downClue },
            downIndex: di,
            across: { word: a.word, clue: acrossClue },
            acrossIndex: ai,
          }
          if (cluesGiveItAway(puzzle)) continue
          out.push(puzzle)
        }
      }
    }
  }
  return out
}

/** True for an id this file made, rather than one somebody wrote. */
export function isGeneratedCross(id: string): boolean {
  return id.startsWith('x:')
}

/**
 * A cross cut from a random verse, avoiding ids you already have.
 *
 * It walks the pool in a random order rather than picking one verse and hoping:
 * a short verse of long words can yield no legal cross at all, and a machine
 * that answers "Build another" with nothing is worse than one that repeats.
 * Returns null only if the whole pool is exhausted, which the caller treats as
 * "fall back to an authored puzzle" rather than as an error.
 */
export function randomCross(
  rand: () => number = Math.random,
  skip: (p: CrossPuzzle) => boolean = () => false,
): CrossPuzzle | null {
  const order = VERSE_POOL.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  let fallback: CrossPuzzle | null = null
  for (const i of order) {
    const options = crossOptions(VERSE_POOL[i])
    if (!options.length) continue
    const fresh = options.filter((p) => !skip(p))
    if (fresh.length) return fresh[Math.floor(rand() * fresh.length)]
    // Every cross this verse can make is one you've already built. Remember one
    // in case the whole pool turns out that way, and keep looking.
    fallback ??= options[Math.floor(rand() * options.length)]
  }
  return fallback
}

// --- dev-time integrity check -----------------------------------------------
// The mirror of `checkCrossPuzzles`, for the crosses nobody wrote.
//
// The authored data gets two checkers (that one, plus scripts/check-cross.mjs,
// which re-derives the rules in plain JS so a mistake in the checker can't pass
// the build). A generator gets one, and deliberately: re-deriving a GENERATOR
// in a build script would just be a second copy of it to keep in sync, which is
// the drift those two exist to prevent. What makes one enough is that this runs
// the real output through the real predicate — every cross the pool can make,
// not a sample — so there is nothing left to disagree about.
//
// Both failures it guards are quiet ones. A cross that breaks the geometry
// still renders, as a plus sign. And if the rules and the pool's vocabulary
// ever drifted far apart, `randomCross` would still return SOMETHING — it walks
// the whole pool — and the machine would simply serve crosses out of a handful
// of verses forever, which looks like nothing at all going wrong.

/** No lower than this, or "Build another" is drawing from too small a shelf. */
const MIN_VERSE_COVERAGE = 0.8

export function checkCrossGen(): string[] {
  const problems: string[] = []
  const ids = new Set<string>()
  let withCross = 0

  for (const verse of VERSE_POOL) {
    const options = crossOptions(verse)
    if (options.length) withCross++

    for (const p of options) {
      const at = `generated ${p.id}`
      if (ids.has(p.id)) problems.push(`${at}: duplicate id`)
      ids.add(p.id)

      const down = p.down.word
      const across = p.across.word
      // The geometry, re-stated rather than re-using fitsCross: this asks
      // whether the OUTPUT is a cross, not whether the filter agrees with
      // itself.
      if (!/^[A-Z]{5,9}$/.test(down)) problems.push(`${at}: the upright must be 5–9 letters, A–Z`)
      if (!/^[A-Z]{3,8}$/.test(across)) problems.push(`${at}: the crossbar must be 3–8 letters, A–Z`)
      if (down === across) problems.push(`${at}: the same word twice`)
      if (p.downIndex < 1 || p.downIndex >= down.length) {
        problems.push(`${at}: downIndex out of range`)
      } else if (p.downIndex > Math.ceil(down.length / 3)) {
        problems.push(`${at}: the crossbar sits too low on the upright`)
      }
      if (p.acrossIndex < 0 || p.acrossIndex >= across.length) {
        problems.push(`${at}: acrossIndex out of range`)
      } else if (Math.abs(p.acrossIndex - (across.length - 1) / 2) > 1) {
        problems.push(`${at}: the arms are lopsided`)
      }
      if (down[p.downIndex] !== across[p.acrossIndex]) {
        problems.push(`${at}: the words don't share a letter where they cross`)
      }

      // The verse is the source of truth — the same test the authored data
      // gets, even though both words were lifted out of the verse to begin
      // with. That's the point: it's what proves the lifting is honest.
      const text = verse.text.replace(/[‘’']/g, '').toUpperCase()
      for (const w of [down, across]) {
        if (!new RegExp(`\\b${w}\\b`).test(text)) {
          problems.push(`${at}: "${w}" does not appear in ${p.reference}`)
        }
      }

      // ...and no clue gives away either answer, or shows no blank at all.
      for (const side of [p.down, p.across]) {
        if (!side.clue.includes('____')) problems.push(`${at}: the clue for "${side.word}" has no blank`)
        if (side.clue.toUpperCase().includes(side.word)) {
          problems.push(`${at}: the clue for "${side.word}" gives the answer away`)
        }
      }
      if (p.down.clue.toUpperCase().includes(across)) problems.push(`${at}: the upright's clue leaks the crossbar`)
      if (p.across.clue.toUpperCase().includes(down)) problems.push(`${at}: the crossbar's clue leaks the upright`)
      if (p.down.clue === p.across.clue) problems.push(`${at}: one clue, printed twice`)
    }
  }

  const coverage = withCross / VERSE_POOL.length
  if (coverage < MIN_VERSE_COVERAGE) {
    problems.push(
      `only ${withCross}/${VERSE_POOL.length} pool verses can carry a cross — ` +
        'the geometry rules and the pool have drifted apart',
    )
  }
  return problems
}

if (import.meta.env?.DEV) {
  const problems = checkCrossGen()
  if (problems.length) {
    console.error(
      `[crossGen] ${problems.length} problem(s):\n` + problems.slice(0, 20).join('\n'),
    )
  }
}
