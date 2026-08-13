// Fetches a full Bible chapter from the configured translation's REST endpoint
// (bible-api.com by default — see config.ts). Used by the chapter reader so a
// player can read the day's verse in its surrounding context.
//
// The app works offline for guests and when the network is down, so callers
// must handle a thrown error gracefully (the reader falls back to the single
// verse + the before/after context prose it already has).

import { TRANSLATIONS, DEFAULT_TRANSLATION } from './config'

export interface ChapterVerse {
  verse: number
  text: string
}

export interface Chapter {
  /** e.g. "John 3" */
  reference: string
  translationName: string
  verses: ChapterVerse[]
}

// In-memory cache: re-opening the same chapter in a session is instant and
// costs no extra request.
const cache = new Map<string, Chapter>()

const keyFor = (book: string, chapter: number, code: string) => `${code}:${book} ${chapter}`

export async function fetchChapter(
  book: string,
  chapter: number,
  translationCode: string = DEFAULT_TRANSLATION,
  signal?: AbortSignal,
): Promise<Chapter> {
  const key = keyFor(book, chapter, translationCode)
  const cached = cache.get(key)
  if (cached) return cached

  const def = TRANSLATIONS[translationCode] ?? TRANSLATIONS[DEFAULT_TRANSLATION]
  // Premium translations have no live source yet — fall back to the default
  // public-domain endpoint so the reader always has something to show.
  const template = def.apiTemplate ?? TRANSLATIONS[DEFAULT_TRANSLATION].apiTemplate ?? TRANSLATIONS.BSB.apiTemplate!
  const url = template.replace('{ref}', encodeURIComponent(`${book} ${chapter}`))

  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Bible API responded ${res.status}`)
  const data: unknown = await res.json()

  const rawVerses = (data as { verses?: unknown }).verses
  const verses: ChapterVerse[] = (Array.isArray(rawVerses) ? rawVerses : [])
    .map((v) => {
      const o = v as { verse?: unknown; text?: unknown }
      return { verse: Number(o.verse), text: String(o.text ?? '').trim() }
    })
    .filter((v) => Number.isFinite(v.verse) && v.text.length > 0)

  if (!verses.length) throw new Error('No verses returned')

  const d = data as { reference?: unknown; translation_name?: unknown }
  const result: Chapter = {
    reference: typeof d.reference === 'string' ? d.reference : `${book} ${chapter}`,
    translationName: typeof d.translation_name === 'string' ? d.translation_name : def.name,
    verses,
  }
  cache.set(key, result)
  return result
}
