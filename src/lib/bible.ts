// Fetches a full Bible chapter from the configured translation's REST endpoint
// (bible-api.com by default — see config.ts). Used by the chapter reader so a
// player can read the day's verse in its surrounding context.
//
// The app works offline for guests and when the network is down, so callers
// must handle a thrown error gracefully (the reader falls back to the single
// verse + the before/after context prose it already has).

import { DEFAULT_TRANSLATION } from './config'

// bible-api.com base + the translations it actually serves. Notably it does NOT
// serve the BSB (our quiz text) — its default is the World English Bible — so a
// verse whose translation isn't on this list is read in WEB for the chapter view
// (the reader header shows whatever translation actually came back). WEB is
// public-domain and reads very close to the BSB.
const BIBLE_API = 'https://bible-api.com'
const BIBLE_API_TRANSLATIONS = new Set([
  'web', 'kjv', 'bbe', 'oeb-cw', 'oeb-us', 'webbe', 'clementine', 'almeida', 'rccv', 'cherokee',
])
const FALLBACK_TRANSLATION = 'web'

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

// A request that never answers is worse than one that fails: the reader sits on
// a spinner forever instead of falling back to what it can show offline. A
// captive network or a stalled connection does exactly that, so every fetch gets
// a deadline of its own on top of the caller's signal.
const REQUEST_TIMEOUT_MS = 12000

export async function fetchChapter(
  book: string,
  chapter: number,
  translationCode: string = DEFAULT_TRANSLATION,
  signal?: AbortSignal,
): Promise<Chapter> {
  const key = keyFor(book, chapter, translationCode)
  const cached = cache.get(key)
  if (cached) return cached

  // Ask for the verse's own translation only if bible-api.com serves it;
  // otherwise read the chapter in WEB (its default). This is why the previous
  // ?translation=bsb request always failed — bsb isn't a bible-api translation.
  const wanted = (translationCode || '').toLowerCase()
  const code = BIBLE_API_TRANSLATIONS.has(wanted) ? wanted : FALLBACK_TRANSLATION
  const ref = encodeURIComponent(`${book} ${chapter}`)

  const result = await tryFetch(`${BIBLE_API}/${ref}?translation=${code}`, book, chapter, signal)
    // Belt and suspenders: if that specific translation hiccups, take the default.
    .catch(() => tryFetch(`${BIBLE_API}/${ref}`, book, chapter, signal))

  cache.set(key, result)
  return result
}

// The caller's signal (a closed reader, a changed chapter) plus our own
// deadline, whichever comes first.
function withTimeout(signal?: AbortSignal): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  const relay = () => ctrl.abort()
  signal?.addEventListener('abort', relay)
  if (signal?.aborted) ctrl.abort()
  return {
    signal: ctrl.signal,
    done: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', relay)
    },
  }
}

async function tryFetch(url: string, book: string, chapter: number, signal?: AbortSignal): Promise<Chapter> {
  const deadline = withTimeout(signal)
  let data: unknown
  try {
    const res = await fetch(url, { signal: deadline.signal })
    if (!res.ok) throw new Error(`Bible API responded ${res.status}`)
    data = await res.json()
  } finally {
    deadline.done()
  }

  const rawVerses = (data as { verses?: unknown }).verses
  const verses: ChapterVerse[] = (Array.isArray(rawVerses) ? rawVerses : [])
    .map((v) => {
      const o = v as { verse?: unknown; text?: unknown }
      return { verse: Number(o.verse), text: String(o.text ?? '').trim() }
    })
    .filter((v) => Number.isFinite(v.verse) && v.text.length > 0)

  if (!verses.length) throw new Error('No verses returned')

  const d = data as { reference?: unknown; translation_name?: unknown }
  return {
    reference: typeof d.reference === 'string' ? d.reference : `${book} ${chapter}`,
    translationName: typeof d.translation_name === 'string' ? d.translation_name : 'World English Bible',
    verses,
  }
}
