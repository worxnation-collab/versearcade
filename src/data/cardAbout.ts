// What a player says about themselves on their card: a favorite verse, a
// favorite book, and the translation they read. Three optional fields on the
// profile (0098), drawn as one slim strip on the player card.
//
// EVERY FIELD IS A PICK FROM A FIXED CATALOG, NEVER A STRING. That is the whole
// safety argument, and it is the same one the crowd's emoji chatter and the
// churchyard make: the card is the one surface in this app where a stranger's
// words reach you, so there is deliberately nowhere on it to type. A verse is a
// reference (the text is rehydrated from VERSE_POOL, exactly as favorites are),
// a book is one of the 66, and a translation is a code from the list below. The
// server (set_card_about) re-checks all three, so a client can't widen any of
// them — see the migration for the mirrored lists.
//
// None of it is a number. No count of verses kept, no "read 12 books", nothing
// that can be summed or put beside somebody else's — a favorite is a taste, and
// tastes don't rank.

import { BIBLE_BOOKS, VERSE_POOL, type VerseSeed } from '@/data/bible/pool'
import { canonBook, chapterCount, citationBook, verseCount } from '@/data/bible/structure'

export interface CardAbout {
  /** A verse reference in the pool's citation form (`John 3:16`), or null. */
  verse: string | null
  /** One of the 66 canon book names, or null. */
  book: string | null
  /** A code from CARD_TRANSLATIONS, or null. */
  translation: string | null
}

export const EMPTY_ABOUT: CardAbout = { verse: null, book: null, translation: null }

/**
 * The translations a player can name as theirs. A DECLARATION, not a data
 * source: nothing here is fetched (the chapter reader's list is
 * READING_TRANSLATIONS in lib/config, and is only what bible-api serves), so
 * the licensed versions people actually read at church belong on this list
 * even though the app can't show a word of them.
 *
 * Keep in sync with the `codes` array in set_card_about (migration 0098).
 */
export interface CardTranslation {
  code: string
  name: string
}

export const CARD_TRANSLATIONS: CardTranslation[] = [
  { code: 'KJV', name: 'King James Version' },
  { code: 'NKJV', name: 'New King James Version' },
  { code: 'NIV', name: 'New International Version' },
  { code: 'ESV', name: 'English Standard Version' },
  { code: 'NLT', name: 'New Living Translation' },
  { code: 'NASB', name: 'New American Standard Bible' },
  { code: 'CSB', name: 'Christian Standard Bible' },
  { code: 'NRSV', name: 'New Revised Standard Version' },
  { code: 'NABRE', name: 'New American Bible, Revised Edition' },
  { code: 'AMP', name: 'Amplified Bible' },
  { code: 'MSG', name: 'The Message' },
  { code: 'GNT', name: 'Good News Translation' },
  { code: 'BSB', name: 'Berean Standard Bible' },
  { code: 'WEB', name: 'World English Bible' },
]

export const translationByCode = (code?: string | null): CardTranslation | undefined =>
  code ? CARD_TRANSLATIONS.find((t) => t.code === code.toUpperCase()) : undefined

/** Longest reference the server accepts — `2 Thessalonians 3:16-18` is 23. */
export const MAX_VERSE_REF_LEN = 40

export interface ParsedReference {
  /** Canon name (`Psalms`), the way the Bible lists it. */
  book: string
  chapter: number
  verseStart: number
  verseEnd?: number
}

// `Book C:V` or `Book C:V-W`. The book may carry a leading number and inner
// spaces; the numbers are capped at three digits so nothing absurd is stored.
const REF_RE = /^([1-3]?\s?[A-Za-z][A-Za-z ]*?)\s+(\d{1,3}):(\d{1,3})(?:-(\d{1,3}))?$/

/**
 * Parse a typed or stored reference against the real shape of the Bible.
 * Returns null for anything that isn't a verse that exists — an unknown book, a
 * chapter Jude doesn't have, verse 40 of a 31-verse chapter. Case-insensitive
 * on the book name, and forgiving of `Psalm`/`Psalms`, `Song of Songs`.
 */
export function parseVerseReference(raw: string | null | undefined): ParsedReference | null {
  const s = (raw ?? '').trim().replace(/\s+/g, ' ')
  if (!s || s.length > MAX_VERSE_REF_LEN) return null
  const m = REF_RE.exec(s)
  if (!m) return null
  const typed = m[1].trim()
  // Match the book by name, ignoring case — "john 3:16" is a fine thing to type.
  const canonical = BIBLE_BOOKS.find((b) => b.toLowerCase() === canonBook(titleCase(typed)).toLowerCase())
  if (!canonical) return null
  const chapter = Number(m[2])
  const verseStart = Number(m[3])
  const verseEnd = m[4] ? Number(m[4]) : undefined
  if (chapter < 1 || chapter > chapterCount(canonical)) return null
  const max = verseCount(canonical, chapter)
  if (verseStart < 1 || verseStart > max) return null
  if (verseEnd != null && (verseEnd <= verseStart || verseEnd > max)) return null
  return { book: canonical, chapter, verseStart, verseEnd }
}

/** The stored form: the pool's citation style, so text lookups hit. */
export function formatVerseReference(p: ParsedReference): string {
  const base = `${citationBook(p.book)} ${p.chapter}:${p.verseStart}`
  return p.verseEnd != null ? `${base}-${p.verseEnd}` : base
}

/** Normalise a reference for storage, or null if it isn't a real verse. */
export function normalizeVerseReference(raw: string | null | undefined): string | null {
  const p = parseVerseReference(raw)
  return p ? formatVerseReference(p) : null
}

/**
 * The pool entry behind a reference, if the arcade carries that verse. A range
 * (`Proverbs 3:5-6`) finds the seed for its first verse, which is how the pool
 * writes its own ranged entries.
 */
export function aboutVerseSeed(reference: string | null | undefined): VerseSeed | undefined {
  if (!reference) return undefined
  const p = parseVerseReference(reference)
  if (!p) return VERSE_POOL.find((v) => v.reference === reference)
  const key = formatVerseReference({ ...p, verseEnd: undefined })
  return VERSE_POOL.find((v) => v.reference === key)
}

/** A book name the card can show, or null for anything not in the 66. */
export function normalizeBook(raw: string | null | undefined): string | null {
  if (!raw) return null
  const want = canonBook(titleCase(raw.trim())).toLowerCase()
  return BIBLE_BOOKS.find((b) => b.toLowerCase() === want) ?? null
}

/** A translation code the card can show, or null for anything off the list. */
export function normalizeTranslation(raw: string | null | undefined): string | null {
  return translationByCode(raw)?.code ?? null
}

/** True when the strip has anything at all to draw. */
export function hasAbout(a: Partial<CardAbout> | null | undefined): boolean {
  return !!(a && (a.verse || a.book || a.translation))
}

/**
 * Search the pool for the picker: by reference prefix first ("john 3",
 * "ps 23"), then by words in the text. Kept small — the picker shows a handful
 * of rows, not the whole 700.
 */
export function searchPoolVerses(query: string, limit = 8): VerseSeed[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!q) return []
  const byRef: VerseSeed[] = []
  const byText: VerseSeed[] = []
  for (const v of VERSE_POOL) {
    const ref = v.reference.toLowerCase()
    if (ref.startsWith(q) || v.book.toLowerCase().startsWith(q)) byRef.push(v)
    else if (v.text.toLowerCase().includes(q)) byText.push(v)
    if (byRef.length >= limit) break
  }
  return [...byRef, ...byText].slice(0, limit)
}

function titleCase(s: string): string {
  return s
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ')
    // "Song Of Solomon" → the canon spelling.
    .replace(/\bOf\b/g, 'of')
}
