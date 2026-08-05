// "Keep it" — spaced-repetition review of verses you've already played.
// The daily drop is recognition; memory needs the verse resurfaced days apart.
// This is deliberately review-only (no new content): it reuses verses the player
// has already seen, so it delivers the app's core promise — "actually remember
// it" — at zero content cost and gives a low-pressure reason to return between
// drops.

import { VERSE_POOL, type VerseSeed } from '@/data/bible/pool'
import { todayLocalDate } from '@/lib/date'

// Days until the next review, indexed by the mastery level you're leaving.
// Nail a card at mastery 0 -> due in 1 day; at 1 -> 3 days; and so on.
export const SRS_INTERVALS = [1, 3, 7, 21, 60]
export const MASTERY_MAX = SRS_INTERVALS.length // 5 spaced wins = "mastered"
export const SESSION_CAP = 5 // a snack, never a grind

export interface ReviewEntry {
  mastery: number
  due: string // local date (YYYY-MM-DD)
  last: string
}
export type ReviewSchedule = Record<string, ReviewEntry>

export interface ReviewChallenge {
  reference: string
  book: string
  translation: string
  blanked: string // verse text with the key word hidden
  fullText: string
  answer: string
  options: string[]
  mastery: number
}

export function seedByReference(reference: string): VerseSeed | undefined {
  return VERSE_POOL.find((v) => v.reference === reference)
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + days)
  return todayLocalDate(dt)
}

// A played verse with no schedule yet is due immediately; otherwise honor `due`.
export function isDue(entry: ReviewEntry | undefined, today = todayLocalDate()): boolean {
  if (!entry) return true
  return entry.due <= today
}

// Advance (correct) or gently knock back (miss) a card after a graded review.
export function nextEntry(
  prev: ReviewEntry | undefined,
  correct: boolean,
  today = todayLocalDate(),
): ReviewEntry {
  const cur = prev?.mastery ?? 0
  if (!correct) {
    return { mastery: Math.max(0, cur - 1), due: addDays(today, 1), last: today }
  }
  const interval = SRS_INTERVALS[Math.min(cur, SRS_INTERVALS.length - 1)]
  return { mastery: Math.min(MASTERY_MAX, cur + 1), due: addDays(today, interval), last: today }
}

export function masteredCount(schedule: ReviewSchedule): number {
  return Object.values(schedule).filter((e) => e.mastery >= MASTERY_MAX).length
}

function sample<T>(arr: T[], n: number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, n)
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Build a fill-in-the-blank recall challenge from a verse the player has seen.
export function buildChallenge(
  reference: string,
  mastery: number,
  translation: string,
): ReviewChallenge | null {
  const seed = seedByReference(reference)
  if (!seed) return null

  let answer = seed.keyword
  let blanked: string
  const re = new RegExp(`\\b${escapeRe(seed.keyword)}\\b`, 'i')
  if (re.test(seed.text)) {
    blanked = seed.text.replace(re, '_____')
  } else {
    // Fallback: hide the longest word so the challenge still works.
    const longest = seed.text
      .split(/\s+/)
      .map((w) => w.replace(/[^A-Za-z']/g, ''))
      .reduce((a, b) => (b.length > a.length ? b : a), '')
    if (!longest) return null
    answer = longest
    blanked = seed.text.replace(new RegExp(`\\b${escapeRe(longest)}\\b`), '_____')
  }

  const distractors = sample(
    Array.from(
      new Set(
        VERSE_POOL.filter((v) => v.reference !== reference)
          .map((v) => v.keyword)
          .filter((k) => k.toLowerCase() !== answer.toLowerCase()),
      ),
    ),
    3,
  )
  if (distractors.length < 3) return null

  return {
    reference,
    book: seed.book,
    translation,
    blanked,
    fullText: seed.text,
    answer,
    options: sample([answer, ...distractors], 4),
    mastery,
  }
}
