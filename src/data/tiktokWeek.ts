// The week: which FORM the day's second post takes.
//
// The morning verse is the constant — his reading, every day. The second post
// changes shape with the weekday, so a feed that rewards variety sees seven
// forms rather than one repeated. Full design and the whole argument:
// docs/TIKTOK-WEEK.md.
//
// Five things are load-bearing:
//
//   - **`kindForDate` is a pure function of the DATE STRING**, parsed at noon
//     UTC so no offset can land a date on the wrong weekday. The hub and the
//     morning runner both call it, which is what stops them disagreeing about
//     what today is — the same guarantee `autoCast` and `getVerseForDate`
//     give, by the same means.
//   - **Every reading kind carries his voice, and that is the point.** A day
//     with no parked recording does NOT fall back to Gemini here: the whole
//     reason these exist is that a person made them, and a synthetic stand-in
//     on a network that judges the channel is the thing this schedule exists
//     to stop. The morning VERSE keeps its Gemini fallback; the second post
//     of the day skips. A quiet day beats a thin one.
//   - **They are one layout, not six.** Each is `renderStory` with its
//     `audio` absent — his recording IS the telling rather than a half joined
//     to Tabitha's — so the cuts, the settle, the caption clamp, the dark
//     stage and the end card are the ones that already shipped.
//   - **What differs per kind is the BACKDROPS and the BRIEF**, and nothing
//     else. `ReadingDef` is the whole of it.
//   - **Nothing here ranks anybody**, and there is nowhere in it to write a
//     string: a kind is one of seven literals and every backdrop is an id
//     from a list this build carries.

import { STORY_STAGES } from './tiktokStages'

/** The kinds the weekday rotation can choose. `story` is Monday's and is its own generator. */
export type ReadingKind = 'book' | 'moment' | 'before' | 'figure' | 'quiet' | 'prayer'
export const READING_KINDS: ReadingKind[] = ['book', 'moment', 'before', 'figure', 'quiet', 'prayer']
export const isReadingKind = (k: unknown): k is ReadingKind => (READING_KINDS as string[]).includes(String(k))

/**
 * Sunday-first, matching `Date#getUTCDay`.
 *
 * Every day is the STORY now, and the six weekday readings are parked beside
 * the quiz and the challenges (`PARKED` in tiktok-gen/social.ts). They were
 * built to put a second voiced post on every network, and then the numbers
 * came in: the one evening story with analytics against it earned ZERO views
 * on YouTube, which is the only network of the eight with any reach at all.
 * Seven recordings a week were about to go into the slot with the worst
 * evidence in the whole dataset.
 *
 * They are parked rather than deleted for the `bonusTriviaFor` reason —
 * `makeReading`, the stages, the moments and the figures all still work, so
 * bringing one back is an entry in this array rather than a rebuild.
 */
const WEEK = ['story', 'story', 'story', 'story', 'story', 'story', 'story'] as const
export type WeekKind = (typeof WEEK)[number]

/**
 * The form the day's SECOND post takes.
 *
 * Parsed at noon UTC on purpose: the date string is already somebody's local
 * date, and midnight parsing puts a whole timezone's worth of dates on the
 * previous weekday.
 */
export function kindForDate(date: string): WeekKind {
  const d = new Date(`${date}T12:00:00Z`)
  return WEEK[Number.isNaN(d.getTime()) ? 1 : d.getUTCDay()]
}

export interface ReadingDef {
  kind: ReadingKind
  /** What the hub calls it. */
  name: string
  /** The small caps line above the title, in place of the story's "STORY TIME". */
  eyebrow: string
  /** One line telling the operator what he is reading, shown on the card. */
  note: string
  /** Roughly how long his read should run, which the draft prompt is sized from. */
  words: number
}

export const READINGS: Record<ReadingKind, ReadingDef> = {
  book: {
    kind: 'book', name: 'A book in 30 seconds', eyebrow: 'VERSE ARCADE · THE BOOK',
    note: 'The book today’s verse came from: how long it is, what happens, how it ends.',
    words: 75,
  },
  moment: {
    kind: 'moment', name: 'The moment', eyebrow: 'VERSE ARCADE · THE MOMENT',
    note: 'One painted scene and the story it is holding.',
    words: 90,
  },
  before: {
    kind: 'before', name: 'What happened just before', eyebrow: 'VERSE ARCADE · JUST BEFORE',
    note: 'What led to today’s verse, the verse, and what came next.',
    words: 90,
  },
  figure: {
    kind: 'figure', name: 'Who is this?', eyebrow: 'VERSE ARCADE · WHO IS THIS?',
    note: 'Three clues, a held pause, then the name. Leave the pause — it is the guess.',
    words: 70,
  },
  quiet: {
    kind: 'quiet', name: 'A quiet minute', eyebrow: 'VERSE ARCADE · A QUIET MINUTE',
    note: 'One held painting and the verse, read slowly. Mostly silence — do not fill it.',
    words: 45,
  },
  prayer: {
    kind: 'prayer', name: 'A prayer', eyebrow: 'VERSE ARCADE · A PRAYER',
    note: 'A prayer drawn from the day’s verse, read aloud.',
    words: 90,
  },
}

/**
 * The stage a reading stands on when its kind does not bring its own picture.
 *
 * Deterministic per (date, kind) so the hub and the runner agree, and walked
 * off the stage list rather than randomised, so two kinds on the same date
 * cannot land on the same painting.
 */
export function stageForReading(date: string, kind: ReadingKind, offset = 0): string {
  let h = 2166136261
  for (const c of `${date}:${kind}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) }
  h ^= h >>> 16; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16
  const list = STORY_STAGES
  return list[((h >>> 0) + offset) % list.length].id
}
