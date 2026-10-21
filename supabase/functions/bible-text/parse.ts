// Pure helpers for bible-text, split out so they can be exercised without
// Deno or a network (bundle this file with esbuild and call it from node).

/** One verse of a chapter or passage, as plain text. */
export interface PlainVerse {
  verse: number
  text: string
}

interface Node {
  type?: string
  name?: string
  text?: string
  attrs?: Record<string, unknown>
  items?: Node[]
}

/**
 * Flattens API.Bible's `content-type=json` tree into plain verses.
 *
 * Every text run carries `attrs.verseId` ("PSA.23.1"), which is what makes this
 * safe: a poetry line split across two paragraphs still lands on its verse, and
 * the verse-number markers themselves (`name: 'verse'`) and any footnote or
 * cross-reference (`name: 'note'`) are skipped rather than read as scripture.
 * Section titles have no verseId and fall out the same way.
 */
export function flattenVerses(content: unknown): PlainVerse[] {
  const byVerse = new Map<number, string[]>()
  // Text runs already carry their own spaces ("The ", "Lord", " is my
  // shepherd;"), so they join with nothing — a space there would split
  // "Lord" from "’s". A paragraph or poetry line ending is the one place a
  // space has to be put back.
  let last = NaN
  const walk = (nodes: unknown) => {
    if (!Array.isArray(nodes)) return
    for (const raw of nodes) {
      const n = raw as Node
      if (!n || typeof n !== 'object') continue
      if (n.type === 'tag' && (n.name === 'verse' || n.name === 'note')) continue
      if (n.type === 'text' && typeof n.text === 'string') {
        const id = n.attrs?.verseId
        const num = typeof id === 'string' ? Number(id.split('.').pop()) : NaN
        if (Number.isFinite(num)) {
          const parts = byVerse.get(num) ?? []
          parts.push(n.text)
          byVerse.set(num, parts)
          last = num
        }
      }
      walk(n.items)
      if (n.type === 'tag' && n.name === 'para' && Number.isFinite(last)) byVerse.get(last)?.push(' ')
    }
  }
  walk(content)
  return [...byVerse.entries()]
    .sort((a, b) => a[0] - b[0])
    // The KJV marks paragraph starts with a pilcrow inside the text itself;
    // it is typesetting, not scripture, and on a card it reads as a stray glyph.
    .map(([verse, parts]) => ({ verse, text: tidy(parts.join('').replace(/¶/g, ' ')) }))
    .filter((v) => v.text.length > 0)
}

/** Collapses the whitespace runs that joining lines leaves behind. Never
 *  touches the words. */
export function tidy(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .trim()
}

/** USFM book code: three characters, a leading digit allowed (1SA, 2CO). */
export const BOOK_RE = /^[1-3A-Z][A-Z0-9]{2}$/

export function chapterId(book: string, chapter: number): string | null {
  if (!BOOK_RE.test(book) || !Number.isInteger(chapter) || chapter < 1 || chapter > 150) return null
  return `${book}.${chapter}`
}

export function passageId(book: string, chapter: number, start: number, end?: number): string | null {
  const ch = chapterId(book, chapter)
  if (!ch || !Number.isInteger(start) || start < 1 || start > 200) return null
  const last = end && Number.isInteger(end) && end > start && end <= 200 ? end : start
  return last === start ? `${ch}.${start}` : `${ch}.${start}-${ch}.${last}`
}

/** Strips the HTML API.Bible wraps a copyright notice in. */
export function plainCopyright(s: unknown): string {
  return typeof s === 'string' ? tidy(s.replace(/<[^>]+>/g, ' ')) : ''
}
