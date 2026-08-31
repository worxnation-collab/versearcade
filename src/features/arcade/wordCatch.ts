import type { TapContext, TapGameDef, TapPlot, TapRoundDef, TapVerdict } from '@/lib/tapGame'

// Word Catch — today's verse, come loose from the page, put back a word at a
// time.
//
// The second game on the cabinet, and the one that is actually memorisation
// rather than judgement. Manna Rush asks "should you take this"; Word Catch
// asks "what comes next", which is the question somebody is answering when
// they try to recall a verse without looking.
//
// It is built per-verse rather than declared as a constant, because the rounds
// ARE the verse: chunk it into lines, one round each. That is why this file
// exports a factory and manna.ts exports an object.
//
// Two things it deliberately does not do:
//
//   - It never blanks a word you have not reached. The line at the top shows
//     every word you have placed and a dash for every one you have not, so the
//     shape of the sentence is visible from the first second. Hiding the length
//     of what is coming makes it a guessing game rather than a recall one.
//   - It never takes a placed word back. A wrong tap is the word declining to
//     go in yet, not a penalty — same rule as the kept-over manna.

/** At most this many lines, so a long verse is still a run of about a minute. */
const MAX_LINES = 4
/** The comfortable number of words to hold in the head at once. */
const TARGET_PER_LINE = 5
/**
 * At or under this many words, the verse is not chunked at all — it is drilled.
 *
 * "Do everything in love." is four words, and one round of it is a fifteen
 * second game that teaches nothing. Three passes at the whole verse, each a
 * little quicker, is what somebody learning a short verse would actually do,
 * and it is the same shape as the line rounds so nothing else changes.
 */
const DRILL_AT_MOST = 6
/** How long a word waits, per pass of a drilled verse. */
const DRILL_LIVES = [2400, 2000, 1700]

export interface WordCatch {
  game: TapGameDef
  /** Every word of the verse, in order. A target's `kind` is its index. */
  words: string[]
  /** Index of the first word of each round. */
  lineStarts: number[]
  /** Index just past the last word of each round. */
  lineEnds: number[]
  reference: string
}

/**
 * Split a verse into the words a player will tap.
 *
 * Punctuation rides along with its word ("love." not "love" + ".") so the line
 * reassembles into something readable rather than into tokens.
 */
export function splitWords(text: string): string[] {
  return text
    .replace(/[“”"]/g, '')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
}

/**
 * Lines of roughly TARGET_PER_LINE words, but never more than MAX_LINES of
 * them.
 *
 * A long verse gets longer lines rather than more rounds, and the round clock
 * scales with the line, so the whole verse always ships — truncating scripture
 * to fit a minute is not a trade this app gets to make.
 */
function chunk(count: number): { starts: number[]; ends: number[] } {
  const lines = Math.max(1, Math.min(MAX_LINES, Math.ceil(count / TARGET_PER_LINE)))
  const per = Math.ceil(count / lines)
  const starts: number[] = []
  const ends: number[] = []
  for (let i = 0; i < count; i += per) {
    starts.push(i)
    ends.push(Math.min(count, i + per))
  }
  return { starts, ends }
}

export function buildWordCatch(verse: { text: string; reference: string }): WordCatch {
  const words = splitWords(verse.text)
  const drilled = words.length <= DRILL_AT_MOST

  const starts: number[] = []
  const ends: number[] = []
  if (drilled) {
    for (let i = 0; i < DRILL_LIVES.length; i++) {
      starts.push(0)
      ends.push(words.length)
    }
  } else {
    const c = chunk(words.length)
    starts.push(...c.starts)
    ends.push(...c.ends)
  }

  const notes = drilled
    ? ['Tap the words in order', 'Again, a little quicker', 'Once more']
    : ['Tap the words in order', 'Keep going', 'Keep going', 'Last one']

  const rounds: TapRoundDef[] = starts.map((start, i) => {
    const len = ends[i] - start
    return {
      key: drilled ? `pass-${i + 1}` : `line-${i + 1}`,
      title: `${drilled ? 'Pass' : 'Line'} ${i + 1} of ${starts.length}`,
      note: notes[Math.min(i, notes.length - 1)],
      quota: len,
      // Long enough that reading is the limit, not reaction: about three
      // seconds a word, plus a beat to find the first one.
      durationMs: 4000 + len * 3000,
      spawnEveryMs: 620,
      // A word has to stay long enough to be READ, which is much longer than a
      // flake needs to be seen. Under about a second this stops being recall
      // and becomes an eye test.
      lifeMs: drilled ? DRILL_LIVES[i] : 2100,
      // Unused — `plan` and `verdictOf` below decide everything. Left empty
      // rather than filled with a lie about fixed weights.
      kinds: [],
    }
  })

  /** The word this round is waiting for, as a global index. */
  const nextIndex = (ctx: TapContext) => starts[ctx.round] + ctx.taken

  const game: TapGameDef = {
    id: 'word-catch',
    name: 'Word Catch',
    rounds,

    plan(ctx, _round) {
      const want = nextIndex(ctx)
      const end = ends[ctx.round]
      if (want >= end) return null // the line is finished; the round is about to end

      // Keep the next word on the field most of the time. Not always: hunting
      // for it is the moment the verse is actually being recalled, and a next
      // word that is guaranteed present turns the game into "spot the newest".
      if (!ctx.live.includes(String(want)) && Math.random() < 0.62) {
        return { kind: String(want), verdict: 'take' }
      }

      // Decoys are the words still to come — this line's remainder, plus a
      // glimpse of the next. Drawing them from elsewhere in the Bible would
      // make this a vocabulary test; drawing them from what is coming makes it
      // a test of ORDER, which is what reciting a verse actually is.
      const pool: number[] = []
      for (let i = want; i < end; i++) if (!ctx.live.includes(String(i))) pool.push(i)
      const nextLineEnd = Math.min(words.length, end + 3)
      for (let i = end; i < nextLineEnd; i++) if (!ctx.live.includes(String(i))) pool.push(i)
      if (!pool.length) return null

      const pick = pool[Math.floor(Math.random() * pool.length)]
      return { kind: String(pick), verdict: pick === want ? 'take' : 'leave' }
    },

    verdictOf(kind, ctx): TapVerdict {
      return Number(kind) === nextIndex(ctx) ? 'take' : 'leave'
    },

    teach: {
      wrong: { text: 'That one comes later. The line so far is at the top.' },
      // Deliberately no `missed` line. A word drifting off is not a mistake —
      // it comes round again, and saying something every time one did would
      // turn the game's own rhythm into nagging.
      quota: { text: 'That is the line.' },
    },
    labels: {
      taken: 'words',
      clean: drilled ? 'passes clean' : 'lines clean',
      restKept: '',
      restBroken: '',
    },
  }

  return { game, words, lineStarts: starts, lineEnds: ends, reference: verse.reference }
}

/**
 * Where loose words land.
 *
 * Six plots, scattered rather than gridded, and all at scale 1: a word is read
 * rather than seen, and shrinking the far ones to sell depth would just make
 * half of them harder to read. Depth is what the sand needed; paper is flat.
 */
export const WORD_PLOTS: TapPlot[] = [
  { x: 30, y: 12, scale: 1 },
  { x: 72, y: 22, scale: 1 },
  { x: 24, y: 45, scale: 1 },
  { x: 74, y: 54, scale: 1 },
  { x: 36, y: 78, scale: 1 },
  { x: 70, y: 86, scale: 1 },
]
