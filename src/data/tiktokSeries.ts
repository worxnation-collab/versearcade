// The evening STORY as a five-night series: one book, Monday to Friday.
//
// The owner's call (2026-10-21): a series must not ADD posts. The engine is
// two voiced posts a day on purpose (YouTube and Meta judge a whole channel
// for volume), so a series is the evening story re-pointed, never a third
// post. Monday to Friday the story walks through ONE book in five parts,
// "Part X of 5" on screen, and the operator's recorded introduction says
// where tonight sits and what tomorrow brings. Weekends are the ordinary
// story behind the day's verse, which is also the breather between books.
//
// Everything here is a pure function of the date, like `getVerseForDate`, so
// the hub and the morning runner compute the same arc for a date with
// nothing stored and nothing to keep in sync.
//
// Two things are load-bearing:
//
//  - The ORDER seed. `SERIES_SEED` shuffles the books once; changing it (or
//    `SERIES_BOOKS`) re-deals every week from `SERIES_FROM` on, including
//    weeks whose intros may already be recorded. Append to the book list;
//    never reorder it.
//  - The KEY. A night's story, intro draft and caption are cached in the
//    bucket by DATE, and a date that held an ordinary story before it was a
//    series night would otherwise be served the old telling about a
//    different verse. Every series call carries `seriesKey`, and the
//    function regenerates anything parked under a different key (or none).

import { VERSE_POOL, type VerseSeed } from '@/data/bible/pool'
import { getVerseForDate } from '@/data/bible/questions'

/** The first Monday a series runs. Before it, every evening is the ordinary story. */
export const SERIES_FROM = '2026-10-26'
export const SERIES_PARTS = 5
const SERIES_SEED = 'story-series-v1'

/**
 * Books a five-night arc can be told through: the NARRATIVE books, where the
 * story behind one verse leads somewhere the next night can pick up. Every
 * book in the pool carries ten verses, so all of these can fill five parts.
 * Append only — see the header.
 */
export const SERIES_BOOKS = [
  'Genesis', 'Exodus', 'Numbers', 'Joshua', 'Judges', 'Ruth', '1 Samuel', '2 Samuel',
  '1 Kings', '2 Kings', 'Nehemiah', 'Esther', 'Daniel', 'Jonah', 'Job',
  'Matthew', 'Mark', 'Luke', 'John', 'Acts',
]

export interface SeriesNight {
  book: string
  /** 1-based. */
  part: number
  of: number
  /** The verse tonight's story is told behind. */
  verse: VerseSeed
  /** What the next night is about, for the tease; absent on the last night. */
  next?: { reference: string; theme: string }
  /** The nights already told, oldest first, so the telling can say where we are. */
  earlier: Array<{ reference: string; theme: string }>
  /** What the bucket caches tonight's story, intro and caption under. */
  key: string
}

const DAY_MS = 86_400_000
const dayNum = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / DAY_MS)

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

// One fixed shuffle of the books, cycled week by week so no book repeats
// until every one has had its week.
let order: string[] | null = null
function bookOrder(): string[] {
  if (order) return order
  const books = SERIES_BOOKS.filter((b) => VERSE_POOL.filter((v) => v.book === b).length >= SERIES_PARTS)
  let s = hash(SERIES_SEED)
  const rnd = () => { s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return s / 2 ** 32 }
  for (let i = books.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [books[i], books[j]] = [books[j], books[i]] }
  order = books
  return books
}

/** Five verses spread through the book in reading order, so the week travels. */
export function seriesVerses(book: string): VerseSeed[] {
  const vs = VERSE_POOL.filter((v) => v.book === book)
    .slice()
    .sort((a, b) => a.chapter - b.chapter || a.verseStart - b.verseStart)
  if (vs.length < SERIES_PARTS) return []
  return Array.from({ length: SERIES_PARTS }, (_, i) => vs[Math.round((i * (vs.length - 1)) / (SERIES_PARTS - 1))])
}

/** The series night for a date, or null on a weekend, before `SERIES_FROM`, or if a book cannot fill one. */
export function seriesFor(date: string): SeriesNight | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < SERIES_FROM) return null
  const n = dayNum(date) - dayNum(SERIES_FROM)
  const week = Math.floor(n / 7)
  const part = (n % 7) + 1
  if (part > SERIES_PARTS) return null
  const books = bookOrder()
  if (!books.length) return null
  const book = books[week % books.length]
  const vs = seriesVerses(book)
  if (vs.length < SERIES_PARTS) return null
  const brief = (v: VerseSeed) => ({ reference: v.reference, theme: v.theme })
  return {
    book, part, of: SERIES_PARTS,
    verse: vs[part - 1],
    next: part < SERIES_PARTS ? brief(vs[part]) : undefined,
    earlier: vs.slice(0, part - 1).map(brief),
    key: `series:${book}:${part}:${vs[part - 1].reference}`,
  }
}

/**
 * The verse the evening story is told behind: tonight's part on a series
 * night, the day's verse on any other. The MORNING post is never affected —
 * it is always `getVerseForDate`.
 */
export function storyVerseFor(date: string): VerseSeed | ReturnType<typeof getVerseForDate> {
  return seriesFor(date)?.verse ?? getVerseForDate(date)
}

/** What travels to the function with every story-shaped call on a series night. */
export function seriesPayload(date: string): { seriesKey: string; series: Omit<SeriesNight, 'verse' | 'key'> } | Record<string, never> {
  const s = seriesFor(date)
  if (!s) return {}
  const { verse: _v, key, ...rest } = s
  void _v
  return { seriesKey: key, series: rest }
}

/** The on-screen label: "PART 2 OF 5 · GENESIS". */
export const seriesLabel = (s: SeriesNight) => `PART ${s.part} OF ${s.of} · ${s.book.toUpperCase()}`
