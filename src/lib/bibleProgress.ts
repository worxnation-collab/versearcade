// Your Bible — how a player's history colors the text.
//
// The whole Bible is on the page (data/bible/structure.ts). What changes is how
// each verse *looks*, and there are exactly four states, brightest to faintest:
//
//   saved   — you kept this verse. A highlighter stripe, like a real Bible.
//   studied — you answered questions on it in a challenge. A clear tint.
//   read    — you opened its chapter in the app. A faint wash.
//   unread  — you haven't been here yet. Plain page.
//
// Nothing here is a score and nothing is comparable to another player: the four
// states are a map of where you've been, not a grade. "Unread" is the invitation,
// which is why it renders as open space rather than a gap you failed to fill.
//
// Orthogonal to all four: whether a verse is in the quiz pool. Most of the Bible
// isn't — the pool is a few hundred curated verses with the metadata the question
// generator needs — so a verse that CAN be played carries a small spark you can
// tap to play it. Everything else is there to read. That's the difference the
// reader shows: not "this part doesn't count", but "this part has a quiz waiting".

import { VERSE_POOL, type VerseSeed } from '@/data/bible/pool'
import {
  BIBLE_SHAPE,
  canonBook,
  chapterKey,
  effectiveVerseCount,
  verseCount,
  verseReference,
  type BookShape,
} from '@/data/bible/structure'

export type VerseTier = 'saved' | 'studied' | 'read' | 'unread'

/** The four tiers brightest-first — the order legends and rollups read in. */
export const TIERS: VerseTier[] = ['saved', 'studied', 'read', 'unread']

export const TIER_LABEL: Record<VerseTier, string> = {
  saved: 'Saved',
  studied: 'Studied',
  read: 'Read',
  unread: 'Not yet opened',
}

// Colors ride a single lightness ramp (gold → mint → ink) rather than a hue
// wheel, so the four tiers stay separable for every kind of color vision — and
// each one is spelled out in text besides, so meaning never rides on color
// alone. See the note about the Study chart in CLAUDE.md.
export const TIER_COLOR: Record<VerseTier, string> = {
  saved: 'var(--gold)',
  studied: 'var(--mint)',
  read: 'var(--ink-dim)',
  unread: 'var(--ink-faint)',
}

/** Background wash for a verse row at each tier. Unread is deliberately bare. */
export const TIER_WASH: Record<VerseTier, string> = {
  saved: 'linear-gradient(90deg, rgba(255,210,63,0.26), rgba(255,210,63,0.10))',
  studied: 'linear-gradient(90deg, rgba(78,205,196,0.18), rgba(78,205,196,0.05))',
  read: 'linear-gradient(90deg, rgba(184,169,224,0.10), rgba(184,169,224,0.02))',
  unread: 'transparent',
}

// ——————————————————————————— what the player has done ———————————————————————

/** reference -> ISO, for both saved and studied. `Book|chapter` -> ISO for read. */
export type MarkMap = Record<string, string>

export interface BibleMarks {
  /** Kept verses — the favorites map, unchanged. */
  saved: MarkMap
  /** Verses answered in any challenge. */
  studied: MarkMap
  /** Chapters opened in a reader, keyed `Book|chapter`. */
  chapters: MarkMap
}

export const EMPTY_MARKS: BibleMarks = { saved: {}, studied: {}, chapters: {} }

// A ceiling no real reader approaches — the Bible has 1,189 chapters and the
// quiz pool a few hundred verses, so a legitimate player tops out around 2,000
// marks. It exists so a stuck client can't write unbounded rows. Keep in sync
// with the same cap in mark_bible_progress (migration 0048), which enforces it
// for online accounts the way this does for guests.
export const BIBLE_MARKS_CAP = 40000

// ——————————————————————————————— references —————————————————————————————————

export interface ParsedRef {
  book: string
  chapter: number
  start: number
  end: number
}

// "1 John 4:7-8" -> { book: '1 John', chapter: 4, start: 7, end: 8 }. Book names
// contain spaces and digits, so anchor on the last space before the chapter.
//
// The book comes back under the name the shelf uses, not the one the citation
// used — "Psalm 23:1" is a verse in Psalms — so a reference written anywhere in
// the app finds its place in the Bible.
export function parseReference(reference: string): ParsedRef | null {
  const m = /^(.+)\s+(\d+):(\d+)(?:[-–](\d+))?$/.exec(reference.trim())
  if (!m) return null
  const chapter = Number(m[2])
  const start = Number(m[3])
  const end = m[4] ? Number(m[4]) : start
  if (!chapter || !start || end < start) return null
  return { book: canonBook(m[1]), chapter, start, end }
}

/** Every verse number a reference covers — a range counts for all of it. */
function versesOf(ref: ParsedRef): number[] {
  const out: number[] = []
  for (let v = ref.start; v <= ref.end; v++) out.push(v)
  return out
}

// ————————————————————————————— quizzable verses ——————————————————————————————

// `Book|chapter` -> the pool entries sitting in that chapter. Built once: the
// reader asks per verse, and scanning 700-odd pool entries per verse would make
// a long chapter crawl.
const poolIndex: Map<string, { ref: ParsedRef; seed: VerseSeed }[]> = (() => {
  const map = new Map<string, { ref: ParsedRef; seed: VerseSeed }[]>()
  for (const seed of VERSE_POOL) {
    const ref: ParsedRef = {
      book: seed.book,
      chapter: seed.chapter,
      start: seed.verseStart,
      end: seed.verseEnd ?? seed.verseStart,
    }
    const key = chapterKey(seed.book, seed.chapter)
    const list = map.get(key)
    if (list) list.push({ ref, seed })
    else map.set(key, [{ ref, seed }])
  }
  return map
})()

/** The pool verse covering this slot, if the quiz can play it. */
export function quizSeedAt(book: string, chapter: number, verse: number): VerseSeed | undefined {
  const list = poolIndex.get(chapterKey(book, chapter))
  if (!list) return undefined
  return list.find((e) => verse >= e.ref.start && verse <= e.ref.end)?.seed
}

/** How many verses of a chapter the quiz can play — 0 for most chapters. */
export function quizzableInChapter(book: string, chapter: number): number {
  const list = poolIndex.get(chapterKey(book, chapter))
  if (!list) return 0
  const slots = new Set<number>()
  for (const e of list) for (const v of versesOf(e.ref)) slots.add(v)
  return slots.size
}

const quizzableByBook: Record<string, number> = (() => {
  const slots: Record<string, Set<string>> = {}
  for (const [key, list] of poolIndex) {
    const book = key.slice(0, key.lastIndexOf('|'))
    const set = (slots[book] ??= new Set<string>())
    for (const e of list) for (const v of versesOf(e.ref)) set.add(`${e.ref.chapter}:${v}`)
  }
  return Object.fromEntries(Object.entries(slots).map(([book, set]) => [book, set.size]))
})()

export function quizzableInBook(book: string): number {
  return quizzableByBook[book] ?? 0
}

// ————————————————————————————————— tiers ————————————————————————————————————

export function tierAt(book: string, chapter: number, verse: number, marks: BibleMarks): VerseTier {
  const ref = verseReference(book, chapter, verse)
  if (marks.saved[ref]) return 'saved'
  if (marks.studied[ref]) return 'studied'
  if (marks.chapters[chapterKey(book, chapter)]) return 'read'
  return 'unread'
}

// A saved/studied mark on a range ("Romans 8:38-39") colors both verses, so the
// per-verse lookup above needs those expanded. Done once per render pass rather
// than per verse.
export function expandRanges(map: MarkMap): MarkMap {
  const out: MarkMap = {}
  for (const [reference, at] of Object.entries(map)) {
    out[reference] = at
    const ref = parseReference(reference)
    if (!ref || ref.end === ref.start) continue
    for (const v of versesOf(ref)) out[verseReference(ref.book, ref.chapter, v)] = at
  }
  return out
}

/** Marks with every range mark expanded to the individual verses it covers. */
export function expandMarks(marks: BibleMarks): BibleMarks {
  return {
    saved: expandRanges(marks.saved),
    studied: expandRanges(marks.studied),
    chapters: marks.chapters,
  }
}

// ———————————————————————————————— rollups ———————————————————————————————————

export type TierCounts = Record<VerseTier, number>

function emptyCounts(): TierCounts {
  return { saved: 0, studied: 0, read: 0, unread: 0 }
}

/**
 * Tier totals without walking every verse: chapters contribute their whole
 * verse count as `read`, and the (few hundred) saved/studied marks are bucketed
 * on top with saved > studied > read precedence.
 */
function rollup(
  scope: { book: string; chapters: number[] }[],
  marks: BibleMarks,
): TierCounts {
  const counts = emptyCounts()
  const books = new Set(scope.map((s) => s.book))
  let total = 0
  let readVerses = 0

  for (const { book, chapters } of scope) {
    for (let c = 1; c <= chapters.length; c++) {
      total += chapters[c - 1]
      if (marks.chapters[chapterKey(book, c)]) readVerses += chapters[c - 1]
    }
  }

  // Which verses are saved / studied inside this scope, and how many of those
  // sit in a chapter already counted as read (so they aren't double-counted).
  const seen = new Set<string>()
  let savedInRead = 0
  let studiedInRead = 0

  const take = (map: MarkMap, tier: 'saved' | 'studied') => {
    for (const reference of Object.keys(map)) {
      const ref = parseReference(reference)
      if (!ref || !books.has(ref.book)) continue
      const chapterVerses = verseCount(ref.book, ref.chapter)
      if (!chapterVerses) continue
      const inRead = !!marks.chapters[chapterKey(ref.book, ref.chapter)]
      for (let v = ref.start; v <= Math.min(ref.end, chapterVerses); v++) {
        const key = verseReference(ref.book, ref.chapter, v)
        if (seen.has(key)) continue // saved wins over studied — saved runs first
        seen.add(key)
        counts[tier]++
        if (inRead) tier === 'saved' ? savedInRead++ : studiedInRead++
      }
    }
  }

  take(marks.saved, 'saved')
  take(marks.studied, 'studied')

  counts.read = Math.max(0, readVerses - savedInRead - studiedInRead)
  counts.unread = Math.max(0, total - counts.saved - counts.studied - counts.read)
  return counts
}

export function chapterTiers(book: string, chapter: number, marks: BibleMarks): TierCounts {
  const verses = effectiveVerseCount(book, chapter)
  if (!verses) return emptyCounts()

  const counts = emptyCounts()
  const seen = new Set<number>()
  const take = (map: MarkMap, tier: 'saved' | 'studied') => {
    for (const reference of Object.keys(map)) {
      const ref = parseReference(reference)
      if (!ref || ref.book !== book || ref.chapter !== chapter) continue
      for (let v = ref.start; v <= Math.min(ref.end, verses); v++) {
        if (seen.has(v)) continue // saved runs first, so saved wins the slot
        seen.add(v)
        counts[tier]++
      }
    }
  }
  take(marks.saved, 'saved')
  take(marks.studied, 'studied')

  const opened = !!marks.chapters[chapterKey(book, chapter)]
  counts.read = opened ? Math.max(0, verses - seen.size) : 0
  counts.unread = Math.max(0, verses - counts.saved - counts.studied - counts.read)
  return counts
}

export function bookTiers(book: string, marks: BibleMarks): TierCounts {
  const shape = BIBLE_SHAPE.find((b) => b.book === book)
  if (!shape) return emptyCounts()
  return rollup([{ book: shape.book, chapters: shape.chapters }], marks)
}

export function wholeBibleTiers(marks: BibleMarks): TierCounts {
  return rollup(BIBLE_SHAPE.map((b) => ({ book: b.book, chapters: b.chapters })), marks)
}

/** Everything but `unread` — "you've been here" as a fraction of the whole. */
export function touchedFraction(counts: TierCounts): number {
  const total = counts.saved + counts.studied + counts.read + counts.unread
  if (!total) return 0
  return (total - counts.unread) / total
}

/**
 * "12%" / "0.4%" / "<0.1%" — a percentage that never rounds a real visit down
 * to zero. The Bible is 31,102 verses, so a first chapter is genuinely 0.1% of
 * it, and telling someone who just read one that they've done "0.0%" is the
 * kind of small insult this app doesn't do.
 */
export function percentLabel(fraction: number): string {
  if (fraction <= 0) return '0%'
  const pct = fraction * 100
  if (pct < 0.1) return '<0.1%'
  if (pct < 1) return `${pct.toFixed(1)}%`
  return `${Math.round(pct)}%`
}

/** Books in canonical order, split for the two-part contents page. */
export function shapesByTestament(): { OT: BookShape[]; NT: BookShape[] } {
  return {
    OT: BIBLE_SHAPE.filter((b) => b.testament === 'OT'),
    NT: BIBLE_SHAPE.filter((b) => b.testament === 'NT'),
  }
}
