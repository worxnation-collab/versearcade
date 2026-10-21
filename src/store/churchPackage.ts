import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { todayLocalDate } from '@/lib/date'
import { useAuth } from './auth'
import type { ChurchDirectoryRow, ChurchExtras, ChurchToday } from '@/types/churchPackages'
import type { DailyVerse, Question } from '@/types'
import { aboutVerseSeed } from '@/data/cardAbout'
import { parseReference } from '@/lib/bibleProgress'

// Church discovery and the verified package, client side (0116, 0117, 0119).
//
// ONLINE-ONLY, inherited from every other church store (`store/church.ts`,
// `store/churchYard.ts`): a church is other people, and a keyless LOCAL build
// has nobody to be a congregation with. Every read FAILS CLOSED — no keys, a
// guest, a server without 0117, a network error — to "nothing to show", never
// to an error card, because every surface that uses this is an optional layer
// on top of the daily verse and must not be able to break it.

function isOnline(): boolean {
  return !!supabase && useAuth.getState().mode === 'online'
}

/** Resolve within `ms` or give up with `fallback` — the drop never waits on a church. */
function withDeadline<T>(p: PromiseLike<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms)
    Promise.resolve(p).then(
      (v) => { clearTimeout(t); resolve(v) },
      () => { clearTimeout(t); resolve(fallback) },
    )
  })
}

// ---------------------------------------------------------------------------
// The public directory — anon-callable, so a guest sees it too.
// ---------------------------------------------------------------------------
export async function fetchChurchDirectory(q: string, limit = 40): Promise<ChurchDirectoryRow[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('church_directory', { p_q: q.trim() || null, p_limit: limit })
  if (error || !Array.isArray(data)) return null
  return (data as any[]).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ''),
    city: r.city ?? null,
    region: r.region ?? null,
    tagline: r.tagline ?? null,
    verified: !!r.verified,
    logo_url: safeHttps(r.logo_url),
    members: Number(r.members ?? 0),
  }))
}

// ---------------------------------------------------------------------------
// What a profile page adds — anon-callable.
// ---------------------------------------------------------------------------
export async function fetchChurchExtras(churchId: string): Promise<ChurchExtras | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('church_extras', { p_church_id: churchId })
  const d = data as any
  if (error || !d?.ok) return null
  return {
    verified: !!d.verified,
    logoUrl: safeHttps(d.logo_url),
    givingUrl: safeHttps(d.giving_url),
    announcement: d.announcement?.message
      ? { id: String(d.announcement.id), message: String(d.announcement.message), createdAt: String(d.announcement.created_at) }
      : null,
    isMember: !!d.is_member,
    isAdmin: !!d.is_admin,
  }
}

/**
 * A URL from the server lands in an `href` or an `<img src>`, so it is checked
 * here as well as by the column's constraint: https only, the catalog's "code
 * is not content" rule. A second reader shouldn't have to trust the first.
 */
export function safeHttps(u: unknown): string | null {
  if (typeof u !== 'string') return null
  try {
    const url = new URL(u)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Today, for a member: the church's banner and its giving link.
// ---------------------------------------------------------------------------
const FRESH_MS = 5 * 60_000
const DEADLINE_MS = 2500

interface ChurchTodayState {
  today: ChurchToday | null
  date: string | null
  loadedAt: number
  /** Fetch (or reuse) today's church payload. Resolves null on any failure. */
  load: (force?: boolean) => Promise<ChurchToday | null>
  clear: () => void
}

export const useChurchToday = create<ChurchTodayState>((set, get) => ({
  today: null,
  date: null,
  loadedAt: 0,

  async load(force = false) {
    if (!isOnline()) {
      if (get().today) set({ today: null, date: null, loadedAt: 0 })
      return null
    }
    const date = todayLocalDate()
    const s = get()
    if (!force && s.date === date && Date.now() - s.loadedAt < FRESH_MS) return s.today

    const call = supabase!
      .rpc('my_church_today', { p_local_date: date })
      .then(({ data, error }) => (error ? null : (data as ChurchToday)))
    const today = await withDeadline(call, DEADLINE_MS, null)
    // A timeout is not an answer: keep whatever we had rather than blanking a
    // banner because one request was slow.
    if (today === null && s.date === date) return s.today
    set({ today, date, loadedAt: Date.now() })
    return today
  },

  clear() {
    set({ today: null, date: null, loadedAt: 0 })
  },
}))

// ---------------------------------------------------------------------------
// The church's verse for a day (0119, made ADDITIVE by 0127), or null. It is a
// box of its own beside the global drop — never the drop itself — and it is
// for the congregation only: `church_verse_today` answers for the caller's own
// verified church, approved days only (a leader's draft is invisible), ±1 day.
// Signed-in only: a guest has no church.
// ---------------------------------------------------------------------------
export interface EffectiveVerse {
  churchId: string
  churchName: string
  reference: string
  text: string
  questions: Question[]
  /** The series leadership put this day in, and their note for it (0123). */
  series?: string
  note?: string
}

export async function fetchEffectiveVerse(date: string): Promise<EffectiveVerse | null> {
  if (!isOnline()) return null
  const call = supabase!
    .rpc('church_verse_today', { p_drop_date: date })
    .then(({ data, error }) => (error ? null : toEffective(data)))
  return withDeadline(call, DEADLINE_MS, null)
}

/** Re-checks the shape the server already validated — a second reader trusts nothing. */
function toEffective(d: any): EffectiveVerse | null {
  if (!d || typeof d.reference !== 'string' || typeof d.text !== 'string' || !d.church_id) return null
  if (!Array.isArray(d.questions) || d.questions.length !== 5) return null
  const questions: Question[] = []
  for (const q of d.questions) {
    if (!q || typeof q.prompt !== 'string' || typeof q.teach !== 'string' || !Array.isArray(q.options)) return null
    const options = q.options.filter((o: unknown): o is string => typeof o === 'string')
    if (options.length < 2 || options.length !== q.options.length) return null
    if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex >= options.length) return null
    questions.push({ prompt: q.prompt, options, answerIndex: q.answerIndex, teach: q.teach })
  }
  return {
    churchId: String(d.church_id),
    churchName: String(d.church_name ?? 'Your church'),
    reference: d.reference,
    text: d.text,
    questions,
    series: line(d.series, 60),
    note: line(d.note, 280),
  }
}

/** Plain text or nothing — a server without 0123 simply omits both keys. */
function line(x: unknown, max: number): string | undefined {
  if (typeof x !== 'string') return undefined
  const t = x.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max)
  return t || undefined
}

/**
 * The church's verse as a playable `DailyVerse`, for `/play/church`. It carries
 * `church`, which is what keeps `QuizRunner` from translating a pastor's own
 * wording and what the screen labels itself with. When the pool carries the
 * verse its speaker and facts come along for the recap; the questions are
 * still the church's.
 */
export function churchDailyVerse(v: EffectiveVerse, date: string): DailyVerse | null {
  const ref = parseReference(v.reference)
  if (!ref) return null
  const seed = aboutVerseSeed(v.reference)
  return {
    dropDate: date,
    church: { id: v.churchId, name: v.churchName, series: v.series, note: v.note },
    translation: v.churchName,
    reference: v.reference,
    book: ref.book,
    chapter: ref.chapter,
    verseStart: ref.start,
    verseEnd: ref.end !== ref.start ? ref.end : undefined,
    text: v.text,
    speaker: seed?.speaker,
    testament: seed?.testament,
    questions: v.questions,
    facts: seed?.facts ?? [],
  }
}

/** Today's church verse, for the Play tab's church card and `/play/church`. */
interface ChurchVerseState {
  date: string | null
  verse: EffectiveVerse | null
  loaded: boolean
  load: (force?: boolean) => Promise<EffectiveVerse | null>
}

export const useChurchVerse = create<ChurchVerseState>((set, get) => ({
  date: null,
  verse: null,
  loaded: false,
  async load(force = false) {
    const date = todayLocalDate()
    const s = get()
    if (!force && s.loaded && s.date === date) return s.verse
    const verse = await fetchEffectiveVerse(date)
    set({ date, verse, loaded: true })
    return verse
  },
}))

// Which day's church verse this device has played, with its numbers — the
// daily-trivia shape (`store/dailyTrivia.ts`): device-local in both modes,
// today's round only, written once, no best and no history. It grants nothing.
const DONE_KEY = 'va.churchVerse.done'
export interface ChurchVerseDone { s: number; c: number; t: number }

function doneKey(churchId: string, date: string) {
  return `${churchId}:${date}`
}

export function churchVersePlayed(churchId: string, date: string): ChurchVerseDone | null {
  try {
    const m = JSON.parse(localStorage.getItem(DONE_KEY) ?? '{}') as Record<string, ChurchVerseDone>
    return m[doneKey(churchId, date)] ?? null
  } catch {
    return null
  }
}

export function markChurchVersePlayed(churchId: string, date: string, done: ChurchVerseDone): void {
  try {
    const m = JSON.parse(localStorage.getItem(DONE_KEY) ?? '{}') as Record<string, ChurchVerseDone>
    const k = doneKey(churchId, date)
    if (m[k]) return
    // Keep a fortnight; nothing reads further back.
    const keep = Object.fromEntries(Object.entries(m).filter(([key]) => key.slice(-10) >= addDaysIso(date, -14)))
    keep[k] = done
    localStorage.setItem(DONE_KEY, JSON.stringify(keep))
  } catch {
    /* private mode — the card just offers it again */
  }
}

function addDaysIso(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(y, m - 1, d + n)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Which announcement a member has already put away. Device-local and
// per-announcement, so a NEW one shows again — the mailbox's "the dot goes
// because you looked" rule, without a table.
// ---------------------------------------------------------------------------
const SEEN_KEY = 'va.church.bannerSeen'

export function bannerSeen(id: string): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === id
  } catch {
    return false
  }
}

export function markBannerSeen(id: string): void {
  try {
    localStorage.setItem(SEEN_KEY, id)
  } catch {
    /* private mode — it will just show again */
  }
}
