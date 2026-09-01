// Deterministic daily verse + question generation.
// The same date always yields the same verse AND the same questions/distractors
// for every player — that's what makes the "daily drop" a shared ritual and lets
// score cards be comparable. Seeded from the date string, no server needed.

import type { DailyVerse, Question } from '@/types'
import { VERSE_POOL, BIBLE_BOOKS, type VerseSeed } from './pool'
import { bonusTriviaFor, triviaRoundFor } from './trivia'
import { DEFAULT_TRANSLATION } from '@/lib/config'

// --- seeded RNG (mulberry32) ------------------------------------------------
function mulberry32(seed: number) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr))
}

// Common words we never want to blank out for a fill-in-the-blank question —
// they'd make a weak, guessable prompt.
const STOP_WORDS = new Set([
  'which', 'where', 'these', 'there', 'their', 'would', 'could', 'should',
  'because', 'before', 'after', 'about', 'through', 'against', 'everyone',
  'whatever', 'themselves', 'yourselves', 'another', 'things', 'people',
  'shall', 'those', 'while', 'every', 'himself', 'therefore',
])

// Pick a second, distinctive content word from the verse text (>= 5 letters,
// not the primary keyword, not a filler word) so a verse can offer a fresh
// fill-in-the-blank on replay.
function pickBlankWord(text: string, avoid: string, rng: () => number): string | null {
  const words = (text.match(/\b[A-Za-z]{5,}\b/g) || []).filter(
    (w) => w.toLowerCase() !== avoid.toLowerCase() && !STOP_WORDS.has(w.toLowerCase()),
  )
  if (!words.length) return null
  return words[Math.floor(rng() * words.length)]
}

// Build one multiple-choice question with plausible distractors.
function buildMC(
  prompt: string,
  correct: string,
  candidatePool: string[],
  rng: () => number,
  teach: string,
  n = 4,
): Question | null {
  const distractors = shuffle(
    uniq(candidatePool).filter((c) => c && c !== correct),
    rng,
  ).slice(0, n - 1)
  if (distractors.length < 1) return null
  const options = shuffle([correct, ...distractors], rng)
  return { prompt, options, answerIndex: options.indexOf(correct), teach }
}

export function generateQuestions(seed: VerseSeed, rng: () => number): Question[] {
  const others = VERSE_POOL.filter((v) => v.reference !== seed.reference)
  const books = others.map((v) => v.book)
  const speakers = others.map((v) => v.speaker)
  const audiences = others.map((v) => v.audience)
  const events = others.flatMap((v) => [v.before, v.after])
  const themes = others.map((v) => v.theme)
  const keywords = others.map((v) => v.keyword)
  const references = others.map((v) => v.reference)

  const candidates: (Question | null)[] = []

  candidates.push(
    buildMC(
      'Which book of the Bible is this verse from?',
      seed.book,
      books,
      rng,
      `This verse is ${seed.reference}, from the book of ${seed.book}.`,
    ),
  )

  candidates.push(
    buildMC(
      'Who is speaking in this verse?',
      seed.speaker,
      speakers,
      rng,
      `Here the words come from ${seed.speaker}.`,
    ),
  )

  candidates.push(
    buildMC(
      'Who is being addressed?',
      seed.audience,
      audiences,
      rng,
      `These words are directed to ${seed.audience}.`,
    ),
  )

  candidates.push(
    buildMC(
      'What happens just before this verse?',
      seed.before,
      events,
      rng,
      `Just before: ${seed.before}`,
    ),
  )

  candidates.push(
    buildMC(
      'What comes right after this verse?',
      seed.after,
      events,
      rng,
      `Right after: ${seed.after}`,
    ),
  )

  // Fill-in-the-blank from the verse text itself.
  const re = new RegExp(`\\b${seed.keyword}\\b`, 'i')
  if (re.test(seed.text)) {
    const blanked = seed.text.replace(re, '_____')
    const q = buildMC(
      `Fill the blank: "${blanked}"`,
      seed.keyword,
      keywords,
      rng,
      `The missing word is "${seed.keyword}."`,
    )
    if (q) candidates.push(q)
  }

  candidates.push(
    buildMC(
      'What is the main theme of this verse?',
      seed.theme,
      themes,
      rng,
      `The heart of this verse is: ${seed.theme}.`,
    ),
  )

  // Reference recall — which citation is this verse?
  candidates.push(
    buildMC(
      'What is the reference for this verse?',
      seed.reference,
      references,
      rng,
      `This verse is ${seed.reference}.`,
    ),
  )

  // A second fill-in-the-blank on a different word, so the same verse can feel
  // fresh across replays.
  const blank2 = pickBlankWord(seed.text, seed.keyword, rng)
  if (blank2) {
    const re2 = new RegExp(`\\b${blank2}\\b`, 'g')
    const blanked2 = seed.text.replace(re2, '_____')
    const q = buildMC(
      `Fill the blank: "${blanked2}"`,
      blank2,
      [...keywords, ...others.map((v) => v.keyword)],
      rng,
      `The missing word is "${blank2}."`,
    )
    if (q) candidates.push(q)
  }

  // Keep a deterministic set of valid questions.
  const verseQuestions = shuffle(candidates.filter((q): q is Question => q !== null), rng)

  // BONUS TRIVIA takes the last slot — four questions about this verse, then one
  // about the whole book it comes from. See `./trivia.ts` for why that question
  // can't be generated from a VerseSeed, and `Question.bonus` for why the last
  // slot is the one that makes "bonus" true without touching any scoring.
  //
  // The rng is consumed AFTER the verse questions are drawn, deliberately: the
  // first four of any run are exactly the ones this generator produced before
  // trivia existed, so a replay of a past day is as close to unchanged as a
  // content addition can be.
  //
  // A book with no trivia in this build falls back to five verse questions —
  // the run the app has always had. Nothing here can leave a run short.
  const bonus = bonusTriviaFor(seed.book, rng)
  return bonus ? [...verseQuestions.slice(0, 4), bonus] : verseQuestions.slice(0, 5)
}

/**
 * Just the questions for a trivia round, with no verse attached.
 *
 * The battle engine supplies its own anchor verse (`battleVerse`), so that a
 * trivia battle and a verse battle built from the SAME seed open on the same
 * verse and differ only in what they ask. That is what makes an old client's
 * fallback graceful: handed a trivia battle it cannot read, it shows the very
 * verse the other player is looking at, with its own questions about it.
 *
 * Drawn across all 66 books — `triviaRoundFor(null, …)`.
 */
export function triviaQuestionsForSeed(seed: number, n = 5): Question[] {
  return triviaRoundFor(null, mulberry32(seed >>> 0), n)
}

/**
 * A whole round of bonus trivia about one book, as a `DailyVerse` the shared
 * `QuizRunner` can run — what the library lends.
 *
 * It is ANCHORED ON A REAL VERSE from that book rather than being five bare
 * questions, for the reason every arcade machine hands its verse back: a round
 * of Bible facts with no scripture on the screen is a pub quiz. The verse is
 * read first, gets marked studied like any other study run, and is there to
 * keep at the end.
 *
 * `book` null draws across all 66.
 */
export function triviaVerseFromBook(book: string | null, seed: number): DailyVerse {
  const rng = mulberry32(seed >>> 0)
  const scoped = book ? VERSE_POOL.filter((v) => v.book === book) : VERSE_POOL
  const pool = scoped.length ? scoped : VERSE_POOL
  const pick = pool[Math.floor(rng() * pool.length)]
  const questions = triviaRoundFor(book, rng)
  // Fail closed the same way `generateQuestions` does: a build with no trivia
  // for this book gives an ordinary practice run rather than an empty screen.
  if (!questions.length) return buildDailyVerse(pick, rng, `trivia-${book ?? 'any'}`)
  return { ...buildDailyVerse(pick, rng, `trivia-${book ?? 'any'}`), questions }
}

// Assemble a full DailyVerse payload from a pool seed. Shared by the daily drop
// and by focus practice, so both produce identically-shaped runs.
function buildDailyVerse(seed: VerseSeed, rng: () => number, dropDate: string): DailyVerse {
  const questions = generateQuestions(seed, rng)
  return {
    dropDate,
    translation: DEFAULT_TRANSLATION,
    reference: seed.reference,
    book: seed.book,
    chapter: seed.chapter,
    verseStart: seed.verseStart,
    verseEnd: seed.verseEnd,
    text: seed.text,
    theme: seed.theme,
    questions,
    facts: seed.facts,
    contextBefore: seed.before,
    contextAfter: seed.after,
  }
}

// Pick the verse for a given date and build its full DailyVerse payload.
export function getVerseForDate(dateStr: string): DailyVerse {
  const rng = mulberry32(hashString(dateStr))
  // No-repeat rotation. One fixed shuffle of the whole pool, indexed by the day
  // number, so the sequence cycles through EVERY verse exactly once before any
  // repeat. Guarantees: a verse repeats only every VERSE_POOL.length days
  // (~8 months at 251 verses), never back-to-back, and every verse appears
  // equally often. The order is stable, which is what makes those guarantees hold.
  const [y, m, d] = dateStr.split('-').map(Number)
  const dayNum = Math.floor(Date.UTC(y || 1970, (m || 1) - 1, d || 1) / 86400000)
  const N = VERSE_POOL.length
  const order = shuffle(
    Array.from({ length: N }, (_, i) => i),
    mulberry32(hashString('verse-order-v1')),
  )
  const seed = VERSE_POOL[order[((dayNum % N) + N) % N]]
  return buildDailyVerse(seed, rng, dateStr)
}

// Distinct books present in the verse pool, in canonical Bible order (Genesis →
// Revelation) rather than the order entries happen to sit in the pool file, so
// the picker reads like a table of contents no matter how the pool grows.
export function poolBooks(): string[] {
  const seen = new Set<string>()
  for (const v of VERSE_POOL) seen.add(v.book)
  const known = BIBLE_BOOKS.filter((b) => seen.has(b))
  // Anything not in the canonical list (a typo, or a naming variant) still shows
  // up rather than vanishing from the picker — just at the end, alphabetically.
  const extra = [...seen].filter((b) => !BIBLE_BOOKS.includes(b)).sort()
  return [...known, ...extra]
}

// How many verses the pool has per book — used to show a book's depth.
export function poolBookCounts(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const v of VERSE_POOL) counts[v.book] = (counts[v.book] ?? 0) + 1
  return counts
}

// A random practice verse drawn from a single book (or any book when `book` is
// null), seeded so the same seed reproduces the same verse + questions.
export function practiceVerseFromBook(book: string | null, seed: number): DailyVerse {
  const rng = mulberry32(seed >>> 0)
  const scoped = book ? VERSE_POOL.filter((v) => v.book === book) : VERSE_POOL
  const pool = scoped.length ? scoped : VERSE_POOL
  const pick = pool[Math.floor(rng() * pool.length)]
  return buildDailyVerse(pick, rng, `focus-${book ?? 'any'}`)
}

// One verse by reference, as a full DailyVerse payload. Used by the favorites
// shelf, where a kept verse needs to open the chapter reader. Seeded off the
// reference so it's deterministic like everything else here, and independent of
// getVerseForDate — reading a favorite never disturbs the daily rotation.
export function verseFromReference(reference: string): DailyVerse | null {
  const seed = VERSE_POOL.find((v) => v.reference === reference)
  if (!seed) return null
  return buildDailyVerse(seed, mulberry32(hashString(`favorite-${reference}`)), `favorite-${reference}`)
}
