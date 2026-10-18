import { supabase } from '@/lib/supabase'
import { addDays, todayLocalDate } from '@/lib/date'
import { useAuth } from './auth'
import type { Question } from '@/types'
import type { ChurchParticipation } from '@/types/churchPackages'

// Church leadership's reads and writes (0118, 0119). Every call is a security-definer
// RPC that re-checks `is_church_admin` (and, for the paid half, `verified`)
// server-side, so nothing here is a gate — a non-admin calling any of it gets
// `not_leadership` back. The screen uses the answers to decide what to draw.
//
// Online-only, like every church store: a keyless build has no leadership.
// Every reader fails to null rather than throwing, so a server without 0118
// draws "isn't set up yet" instead of an error card.

export type AdminFail = 'not_authenticated' | 'not_leadership' | 'not_verified' | 'unavailable' | string

function online(): boolean {
  return !!supabase && useAuth.getState().mode === 'online'
}

async function call<T = any>(fn: string, args: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; reason: AdminFail }> {
  if (!online()) return { ok: false, reason: 'unavailable' }
  const { data, error } = await supabase!.rpc(fn, args)
  if (error) return { ok: false, reason: 'unavailable' }
  const d = data as any
  if (d && d.ok === false) return { ok: false, reason: String(d.reason ?? 'unavailable') }
  return { ok: true, data: d as T }
}

// ---------------------------------------------------------------------------
// Settings: the live announcement and the giving link
// ---------------------------------------------------------------------------
export interface AdminSettings {
  name: string
  verified: boolean
  givingUrl: string | null
  announcement: { id: string; message: string; expiresAt: string | null } | null
}

export async function fetchAdminSettings(churchId: string) {
  const r = await call('church_admin_settings', { p_church_id: churchId })
  if (!r.ok) return r
  const d = r.data
  const settings: AdminSettings = {
    name: String(d.name ?? ''),
    verified: !!d.verified,
    givingUrl: d.giving_url ?? null,
    announcement: d.announcement?.message
      ? { id: String(d.announcement.id), message: String(d.announcement.message), expiresAt: d.announcement.expires_at ?? null }
      : null,
  }
  return { ok: true as const, data: settings }
}

/** One live line; '' takes it down. `expiresOn` is a local date, end of that day. */
export async function saveAnnouncement(churchId: string, message: string, expiresOn: string | null) {
  const expires = expiresOn ? new Date(`${expiresOn}T23:59:59`).toISOString() : null
  return call('set_church_announcement', { p_church_id: churchId, p_message: message, p_expires_at: expires })
}

export async function saveGivingUrl(churchId: string, url: string) {
  return call<{ giving_url: string | null }>('set_church_giving_url', { p_church_id: churchId, p_url: url })
}

// ---------------------------------------------------------------------------
// The shared verse (0119): one per day, with the church's own five questions.
// ---------------------------------------------------------------------------
export interface DayVerse {
  reference: string
  text: string
  questions: Question[]
}

/** What leadership already set for a date, or null — so the form edits rather than overwrites blind. */
export async function fetchDayVerse(churchId: string, date: string) {
  const r = await call('church_verse_for', { p_church_id: churchId, p_drop_date: date })
  if (!r.ok) return r
  const v = r.data.verse
  const verse: DayVerse | null = v
    ? { reference: String(v.reference), text: String(v.text), questions: (v.questions ?? []) as Question[] }
    : null
  return { ok: true as const, data: verse }
}

/** Idempotent per (church, date): saving the same day again replaces it. */
export async function saveDayVerse(churchId: string, date: string, v: DayVerse) {
  return call<{ drop_date: string }>('set_church_verse', {
    p_church_id: churchId,
    p_drop_date: date,
    p_reference: v.reference,
    p_text: v.text,
    p_questions: cleanQuestions(v.questions),
  })
}

// ---------------------------------------------------------------------------
// The week: seven dates at once, because a pastor prepares weekly.
// ---------------------------------------------------------------------------
export interface WeekDay {
  date: string
  verse: DayVerse | null
}

/** Seven consecutive dates from `start`, each with what is set for it. Fails
 *  whole rather than half-drawn: a strip with holes would read as unset days. */
export async function fetchWeek(churchId: string, start: string) {
  const dates = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const rows = await Promise.all(dates.map((d) => fetchDayVerse(churchId, d)))
  const bad = rows.find((r) => !r.ok)
  if (bad && !bad.ok) return { ok: false as const, reason: bad.reason }
  return { ok: true as const, data: dates.map((date, i) => ({ date, verse: (rows[i] as { ok: true; data: DayVerse | null }).data })) }
}

/**
 * Fill every UNSET date in `dates` with `v`, never touching a day that already
 * has a verse (the caller passes only the empty ones, and this re-checks each
 * right before writing, since another leader may have filled one meanwhile).
 * With `mix`, each day's copy deals its questions and their options in a
 * different order, seeded by the date — the same verse all week, but not the
 * same five taps in the same five places every morning.
 */
export async function fillDays(churchId: string, dates: string[], v: DayVerse, mix: boolean) {
  const filled: string[] = []
  const skipped: string[] = []
  for (const date of dates) {
    const cur = await fetchDayVerse(churchId, date)
    if (!cur.ok || cur.data) { skipped.push(date); continue }
    const r = await saveDayVerse(churchId, date, mix ? mixForDate(v, date) : v)
    if (r.ok) filled.push(date)
    else skipped.push(date)
  }
  return { filled, skipped }
}

/** Deterministic per date: the same date always deals the same order. */
export function mixForDate(v: DayVerse, date: string): DayVerse {
  const rand = rng(date)
  const questions = shuffle(v.questions, rand).map((q) => {
    const order = shuffle(q.options.map((_, i) => i), rand)
    return { ...q, options: order.map((i) => q.options[i]), answerIndex: order.indexOf(q.answerIndex) }
  })
  return { ...v, questions }
}

function rng(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = xs.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * The client half of `church_clean_questions` (0119) — keep them in sync.
 * Trims, drops blank options, and returns null for anything the server would
 * refuse, so the form can say what's wrong before a round trip.
 */
export function cleanQuestions(qs: Question[]): Question[] | null {
  if (qs.length !== 5) return null
  const out: Question[] = []
  for (const q of qs) {
    const prompt = q.prompt.trim()
    const teach = q.teach.trim()
    if (prompt.length < 1 || prompt.length > 300 || teach.length < 1 || teach.length > 400) return null
    const options = q.options.map((o) => o.trim())
    if (options.length < 2 || options.length > 4) return null
    if (options.some((o) => o.length < 1 || o.length > 120)) return null
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return null
    if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex >= options.length) return null
    out.push({ prompt, options, answerIndex: q.answerIndex, teach })
  }
  return out
}

// ---------------------------------------------------------------------------
// Participation — congregation totals, every number under five withheld.
// ---------------------------------------------------------------------------
const num = (x: unknown) => (x == null ? null : Number(x))

export async function fetchParticipation(churchId: string, days = 14) {
  const r = await call('get_church_participation', { p_church_id: churchId, p_days: days, p_local_date: todayLocalDate() })
  if (!r.ok) return r
  const d = r.data
  const p: ChurchParticipation = {
    days: Number(d.days),
    from: String(d.from),
    to: String(d.to),
    members: num(d.members),
    players: num(d.players),
    plays: num(d.plays),
    avg_score: num(d.avg_score),
    pct_played_today: num(d.pct_played_today),
    streaks: { s1: num(d.streaks?.s1), s2_6: num(d.streaks?.s2_6), s7: num(d.streaks?.s7) },
  }
  return { ok: true as const, data: p }
}
