import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { todayLocalDate } from '@/lib/date'
import { useAuth } from './auth'
import type { ChurchDirectoryRow, ChurchExtras, ChurchToday } from '@/types/churchPackages'
import type { Question } from '@/types'

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
// The church's verse for a day (0119), or null — and null means the global
// verse. Signed-in only: a guest has no church, and the server answers null
// for anybody without a verified church that set one, so this costs a solo
// player one round trip running beside the ones `loadToday` already makes and
// changes nothing about what they play.
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
    .rpc('get_effective_verse', { p_drop_date: date })
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
