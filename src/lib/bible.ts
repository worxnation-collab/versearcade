// Scripture text in the player's chosen translation: a chapter for the
// reader, or a verse (or short range) for everywhere a verse is quoted.
//
// Sources, in order, for a translation (lib/translations.ts says which apply):
//   1. the device cache — chapters and passages, kept 30 days;
//   2. API.Bible through the `bible-text` Edge Function (the key is there);
//   3. bible-api.com, keyless and public domain.
// A verse that none of them can produce is the CALLER's to fall back on — the
// bundled pool text is always in hand (`useVerseText` does exactly that), so a
// thrown error here never leaves a screen empty.
//
// The 30 days is API.Bible's rule ("all cached content ... must be updated at
// least once every 30 days"), so an expired LICENSED entry is never shown —
// offline past that, the screen falls back to the bundled text instead. Public
// domain text has no such clock and may be served stale when offline.

import { supabase } from './supabase'
import {
  apiBibleReachable, availableIsFresh, readAvailable, translationById, usfmFor, writeAvailable,
  type AvailableBible, type TranslationOption,
} from './translations'

const BIBLE_API = 'https://bible-api.com'
const FALLBACK_CODE = 'web'

export interface ChapterVerse {
  verse: number
  text: string
}

export interface Chapter {
  /** e.g. "John 3" */
  reference: string
  translationName: string
  abbr: string
  copyright: string
  licensed: boolean
  /** API.Bible fair-use token; report it when the text is shown. */
  fumsToken?: string
  verses: ChapterVerse[]
}

export interface VerseText {
  text: string
  translationName: string
  abbr: string
  copyright: string
  licensed: boolean
  fumsToken?: string
}

export interface VerseRef {
  book: string
  chapter: number
  start: number
  end?: number
}

// ———————————————————————————————— cache ————————————————————————————————

const PREFIX = 'va.scripture.v1:'
const INDEX = 'va.scripture.v1.idx'
const TTL_MS = 30 * 24 * 60 * 60 * 1000
const MAX_ENTRIES = 160
const memory = new Map<string, { at: number; data: unknown }>()

function readIndex(): string[] {
  try { return JSON.parse(localStorage.getItem(INDEX) ?? '[]') as string[] } catch { return [] }
}

function cacheGet<T>(key: string, licensed: boolean, allowStale: boolean): T | null {
  let hit = memory.get(key)
  if (!hit) {
    try {
      const raw = localStorage.getItem(PREFIX + key)
      if (raw) hit = JSON.parse(raw) as { at: number; data: unknown }
    } catch { /* storage blocked */ }
  }
  if (!hit) return null
  const expired = Date.now() - hit.at > TTL_MS
  if (expired && (licensed || !allowStale)) return null
  memory.set(key, hit)
  return hit.data as T
}

function cachePut(key: string, data: unknown) {
  const entry = { at: Date.now(), data }
  memory.set(key, entry)
  try {
    const idx = readIndex().filter((k) => k !== key)
    idx.push(key)
    while (idx.length > MAX_ENTRIES) {
      const old = idx.shift()!
      localStorage.removeItem(PREFIX + old)
    }
    localStorage.setItem(PREFIX + key, JSON.stringify(entry))
    localStorage.setItem(INDEX, JSON.stringify(idx))
  } catch { /* quota or private mode: memory still has it */ }
}

const chapterKey = (t: string, book: string, chapter: number) => `${t}|${book} ${chapter}`
const passageKey = (t: string, r: VerseRef) => `${t}|${r.book} ${r.chapter}:${r.start}-${r.end ?? r.start}`

// —————————————————————————————— transport ——————————————————————————————

// A request that never answers is worse than one that fails: the reader sits on
// a spinner forever instead of falling back to what it can show offline. A
// captive network or a stalled connection does exactly that, so every fetch gets
// a deadline of its own on top of the caller's signal.
const REQUEST_TIMEOUT_MS = 12000

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

interface FnPayload {
  reference?: string
  verses?: ChapterVerse[]
  copyright?: string
  fumsToken?: string
  error?: string
}

async function callFunction(body: Record<string, unknown>, signal?: AbortSignal): Promise<FnPayload> {
  if (!supabase) throw new Error('no backend')
  const deadline = withTimeout(signal)
  try {
    const { data, error } = await supabase.functions.invoke('bible-text', { body, signal: deadline.signal })
    if (error) throw error
    const d = data as FnPayload
    if (!d || d.error || !Array.isArray(d.verses) || !d.verses.length) throw new Error(d?.error ?? 'empty')
    // Belt and braces for the KJV's pilcrows (the function strips them too).
    return { ...d, verses: d.verses.map((v) => ({ verse: v.verse, text: v.text.replace(/¶/g, ' ').replace(/\s+/g, ' ').trim() })) }
  } finally {
    deadline.done()
  }
}

async function bibleApi(ref: string, code: string, signal?: AbortSignal) {
  const deadline = withTimeout(signal)
  let data: unknown
  try {
    const res = await fetch(`${BIBLE_API}/${encodeURIComponent(ref)}?translation=${code}`, { signal: deadline.signal })
    if (!res.ok) throw new Error(`Bible API responded ${res.status}`)
    data = await res.json()
  } finally {
    deadline.done()
  }
  const rawVerses = (data as { verses?: unknown }).verses
  const verses: ChapterVerse[] = (Array.isArray(rawVerses) ? rawVerses : [])
    .map((v) => {
      const o = v as { verse?: unknown; text?: unknown }
      return { verse: Number(o.verse), text: String(o.text ?? '').replace(/\s+/g, ' ').trim() }
    })
    .filter((v) => Number.isFinite(v.verse) && v.text.length > 0)
  if (!verses.length) throw new Error('No verses returned')
  const d = data as { reference?: unknown; translation_name?: unknown; translation_id?: unknown }
  return {
    reference: typeof d.reference === 'string' ? d.reference : ref,
    translationName: typeof d.translation_name === 'string' ? d.translation_name : 'World English Bible',
    abbr: typeof d.translation_id === 'string' ? d.translation_id.toUpperCase() : 'WEB',
    verses,
  }
}

const isAbort = (e: unknown, signal?: AbortSignal) => signal?.aborted || (e as Error)?.name === 'AbortError'

// ———————————————————————————————— chapter ————————————————————————————————

export async function fetchChapter(
  book: string,
  chapter: number,
  translationId?: string,
  signal?: AbortSignal,
): Promise<Chapter> {
  const t = translationById(translationId)
  const key = chapterKey(t.id, book, chapter)
  const fresh = cacheGet<Chapter>(key, t.licensed, false)
  if (fresh) return fresh

  const usfm = usfmFor(book)
  if (t.apiBibleId && apiBibleReachable && usfm) {
    try {
      const d = await callFunction({ action: 'chapter', bibleId: t.apiBibleId, book: usfm, chapter }, signal)
      const out: Chapter = {
        reference: `${book} ${chapter}`,
        translationName: t.name,
        abbr: t.abbr,
        copyright: d.copyright || t.name,
        licensed: t.licensed,
        fumsToken: d.fumsToken,
        verses: d.verses!,
      }
      cachePut(key, out)
      return out
    } catch (e) {
      if (isAbort(e, signal)) throw e
      // fall through to the keyless source
    }
  }

  // Offline with a stale public-domain copy beats a fallback translation.
  const stale = cacheGet<Chapter>(key, t.licensed, true)
  if (stale) return stale

  const code = t.bibleApiCode ?? FALLBACK_CODE
  const r = await bibleApi(`${book} ${chapter}`, code, signal)
    // Belt and suspenders: if that specific translation hiccups, take the default.
    .catch((e) => { if (isAbort(e, signal)) throw e; return bibleApi(`${book} ${chapter}`, FALLBACK_CODE, signal) })
  const out: Chapter = {
    reference: r.reference,
    translationName: r.translationName,
    abbr: r.abbr,
    copyright: `${r.translationName} — public domain.`,
    licensed: false,
    verses: r.verses,
  }
  // Only cache it under this translation when it IS this translation, or a
  // reader who chose the NLT would be handed WEB from the cache forever.
  if (code === t.bibleApiCode && r.abbr.toLowerCase() === code) cachePut(key, out)
  return out
}

// ————————————————————————————————— verse —————————————————————————————————

function joinRange(verses: ChapterVerse[], r: VerseRef): string {
  const end = r.end ?? r.start
  return verses.filter((v) => v.verse >= r.start && v.verse <= end).map((v) => v.text).join(' ')
}

function fromChapter(c: Chapter, r: VerseRef, t: TranslationOption): VerseText | null {
  const text = joinRange(c.verses, r)
  if (!text) return null
  return { text, translationName: c.translationName, abbr: c.abbr || t.abbr, copyright: c.copyright, licensed: c.licensed, fumsToken: c.fumsToken }
}

/**
 * A verse from the device cache alone — no network, no promise. What a quiz
 * uses to start in the player's own Bible on the first frame when the day's
 * verse was already fetched ahead (prefetchScripture), which is the usual case.
 */
export function peekVerse(r: VerseRef, translationId?: string): VerseText | null {
  const t = translationById(translationId)
  const ch = cacheGet<Chapter>(chapterKey(t.id, r.book, r.chapter), t.licensed, true)
  const viaChapter = ch && ch.abbr === t.abbr ? fromChapter(ch, r, t) : null
  return viaChapter ?? cacheGet<VerseText>(passageKey(t.id, r), t.licensed, true)
}

/**
 * One verse or a short range in the chosen translation. Throws when nothing
 * can produce it in THAT translation — callers keep the bundled text rather
 * than quietly showing a third version under the player's chosen label.
 */
export async function fetchVerse(r: VerseRef, translationId?: string, signal?: AbortSignal): Promise<VerseText> {
  const t = translationById(translationId)

  // A chapter already read covers its verses, at no request.
  const ch = cacheGet<Chapter>(chapterKey(t.id, r.book, r.chapter), t.licensed, true)
  const viaChapter = ch && (ch.abbr === t.abbr) ? fromChapter(ch, r, t) : null
  if (viaChapter) return viaChapter

  const key = passageKey(t.id, r)
  const fresh = cacheGet<VerseText>(key, t.licensed, false)
  if (fresh) return fresh

  const usfm = usfmFor(r.book)
  if (t.apiBibleId && apiBibleReachable && usfm) {
    try {
      const d = await callFunction({ action: 'passage', bibleId: t.apiBibleId, book: usfm, chapter: r.chapter, start: r.start, end: r.end }, signal)
      // A paraphrase (MSG) tags a span by its LAST verse, so a passage request
      // can come back numbered outside the range asked for — take all of it.
      const out: VerseText = {
        text: d.verses!.map((v) => v.text).join(' '),
        translationName: t.name,
        abbr: t.abbr,
        copyright: d.copyright || t.name,
        licensed: t.licensed,
        fumsToken: d.fumsToken,
      }
      cachePut(key, out)
      return out
    } catch (e) {
      if (isAbort(e, signal)) throw e
    }
  }

  const stale = cacheGet<VerseText>(key, t.licensed, true)
  if (stale) return stale

  if (!t.bibleApiCode) throw new Error(`${t.abbr} unavailable`)
  const end = r.end && r.end > r.start ? `-${r.end}` : ''
  const res = await bibleApi(`${r.book} ${r.chapter}:${r.start}${end}`, t.bibleApiCode, signal)
  const out: VerseText = {
    text: res.verses.map((v) => v.text).join(' '),
    translationName: res.translationName,
    abbr: t.abbr,
    copyright: `${res.translationName} — public domain.`,
    licensed: false,
  }
  cachePut(key, out)
  return out
}

/**
 * Warm the cache for a verse a player is about to meet — the day's drop — so
 * it reads offline later. One chapter request covers the verse and its
 * context; quiet on every failure.
 */
export function prefetchScripture(r: VerseRef, translationId?: string) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  void fetchChapter(r.book, r.chapter, translationId).catch(() => {})
}

/**
 * Ask the function which of the offered Bibles this API key actually serves,
 * and remember the answer for a week. Called once at startup and whenever the
 * picker opens; any failure keeps whatever was remembered (or nothing, which
 * the picker reads as "only the keyless versions").
 */
let inflight: Promise<AvailableBible[] | null> | null = null
export function refreshAvailableBibles(force = false): Promise<AvailableBible[] | null> {
  if (!apiBibleReachable || !supabase) return Promise.resolve(null)
  if (!force && availableIsFresh()) return Promise.resolve(readAvailable())
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const { data, error } = await supabase!.functions.invoke('bible-text', { body: { action: 'bibles' } })
      const list = (data as { bibles?: AvailableBible[] } | null)?.bibles
      if (error || !Array.isArray(list)) return readAvailable()
      writeAvailable(list)
      return list
    } catch {
      return readAvailable()
    } finally {
      inflight = null
    }
  })()
  return inflight
}
