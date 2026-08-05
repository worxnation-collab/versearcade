// Deterministic daily verse + question generation.
// The same date always yields the same verse AND the same questions/distractors
// for every player — that's what makes the "daily drop" a shared ritual and lets
// score cards be comparable. Seeded from the date string, no server needed.

import type { DailyVerse, Question } from '@/types'
import { VERSE_POOL, type VerseSeed } from './pool'
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

  // Keep a deterministic set of 5 valid questions.
  return shuffle(candidates.filter((q): q is Question => q !== null), rng).slice(0, 5)
}

// Pick the verse for a given date and build its full DailyVerse payload.
export function getVerseForDate(dateStr: string): DailyVerse {
  const seedNum = hashString(dateStr)
  const rng = mulberry32(seedNum)
  // Deterministic index into the pool from the date.
  const seed = VERSE_POOL[seedNum % VERSE_POOL.length]
  const questions = generateQuestions(seed, rng)
  return {
    dropDate: dateStr,
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
  }
}
