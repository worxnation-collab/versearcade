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
  /** The series this day belongs to ("John 15–17", "Advent"), 0123. Optional. */
  series?: string | null
  /** A line from the pastor shown with the verse on members' Play tab, 0123. */
  note?: string | null
}

export const SERIES_MAX = 60
export const NOTE_MAX = 280

/**
 * The client half of `church_clean_line` (0123) — keep them in sync. One line
 * of plain text: control characters become a space, trimmed, capped; empty is
 * null.
 */
export function cleanLine(s: string | null | undefined, max: number): string | null {
  const t = (s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max).trim()
  return t || null
}

function toDayVerse(v: any): DayVerse {
  return {
    reference: String(v.reference),
    text: String(v.text),
    questions: (v.questions ?? []) as Question[],
    series: typeof v.series === 'string' && v.series ? v.series : null,
    note: typeof v.note === 'string' && v.note ? v.note : null,
  }
}

/** What leadership already set for a date, or null — so the form edits rather than overwrites blind. */
export async function fetchDayVerse(churchId: string, date: string) {
  const r = await call('church_verse_for', { p_church_id: churchId, p_drop_date: date })
  if (!r.ok) return r
  const v = r.data.verse
  return { ok: true as const, data: v ? toDayVerse(v) : null }
}

/**
 * Idempotent per (church, date): saving the same day again replaces it.
 *
 * The verse goes through `set_church_verse` (0119) exactly as before; a series
 * or note rides a SECOND call, `set_church_verse_extras` (0123), sent only when
 * the caller passed one (undefined = leave it, '' or null = clear it). The
 * verse is the thing that must land; `extras` says whether the rest did, so a
 * server without 0123 saves the verse and the form says the note didn't.
 */
export async function saveDayVerse(churchId: string, date: string, v: DayVerse) {
  const r = await call<{ drop_date: string }>('set_church_verse', {
    p_church_id: churchId,
    p_drop_date: date,
    p_reference: v.reference,
    p_text: v.text,
    p_questions: cleanQuestions(v.questions),
  })
  if (!r.ok) return r
  if (v.series === undefined && v.note === undefined) return { ok: true as const, data: { drop_date: date, extras: true } }
  const x = await call('set_church_verse_extras', {
    p_church_id: churchId,
    p_drop_date: date,
    p_series: v.series === undefined ? null : (cleanLine(v.series, SERIES_MAX) ?? ''),
    p_note: v.note === undefined ? null : (cleanLine(v.note, NOTE_MAX) ?? ''),
  })
  return { ok: true as const, data: { drop_date: date, extras: x.ok } }
}

/** A run of days in one read (0123), set days only. Null when the server has no 0123. */
async function fetchRange(churchId: string, from: string, days: number): Promise<Res<Record<string, DayVerse>> | null> {
  if (!online()) return { ok: false, reason: 'unavailable' }
  const { data, error } = await supabase!.rpc('church_verses_range', { p_church_id: churchId, p_from: from, p_days: days })
  if (error) return null
  const d = data as any
  if (d?.ok === false) return { ok: false, reason: String(d.reason ?? 'unavailable') }
  const out: Record<string, DayVerse> = {}
  for (const row of d?.days ?? []) out[String(row.drop_date)] = toDayVerse(row)
  return { ok: true, data: out }
}

/** Only the church page's "This week" line (0123) — '' clears it. */
export async function saveThisWeek(churchId: string, line: string) {
  return call<{ this_week: string | null }>('set_church_this_week', { p_church_id: churchId, p_this_week: line })
}

// ---------------------------------------------------------------------------
// Where the leadership form reads and writes a day. The server is the only real
// one; `memoryVerseBackend` exists for the public demo (/churches/try), so a
// pastor can use the REAL form before their church is set up, with nothing
// leaving the page. Same result shapes, so the form cannot tell them apart.
// ---------------------------------------------------------------------------
type Res<T> = { ok: true; data: T } | { ok: false; reason: AdminFail }
export interface VerseBackend {
  get: (churchId: string, date: string) => Promise<Res<DayVerse | null>>
  /** `extras` is false when the verse saved but its series/note did not. */
  save: (churchId: string, date: string, v: DayVerse) => Promise<Res<{ extras?: boolean }>>
  /** Set days in [from, from + days), keyed by date; null = not supported here. */
  range?: (churchId: string, from: string, days: number) => Promise<Res<Record<string, DayVerse>> | null>
  /** The church page's "This week" line. */
  setThisWeek?: (churchId: string, line: string) => Promise<Res<unknown>>
}

export const serverVerseBackend: VerseBackend = {
  get: (c, d) => fetchDayVerse(c, d),
  save: (c, d, v) => saveDayVerse(c, d, v),
  range: (c, f, n) => fetchRange(c, f, n),
  setThisWeek: (c, l) => saveThisWeek(c, l),
}

/** In-memory days, seeded with `initial`. Validates exactly as the server does. */
export function memoryVerseBackend(initial: Record<string, DayVerse> = {}): VerseBackend & { thisWeek: () => string | null } {
  const days = new Map(Object.entries(initial))
  let thisWeek: string | null = null
  return {
    get: async (_c, d) => ({ ok: true, data: days.get(d) ?? null }),
    save: async (_c, d, v) => {
      const questions = cleanQuestions(v.questions)
      if (!questions) return { ok: false, reason: 'bad_questions' }
      const prev = days.get(d)
      days.set(d, {
        ...v,
        questions,
        series: v.series === undefined ? (prev?.series ?? null) : cleanLine(v.series, SERIES_MAX),
        note: v.note === undefined ? (prev?.note ?? null) : cleanLine(v.note, NOTE_MAX),
      })
      return { ok: true, data: { extras: true } }
    },
    range: async (_c, from, n) => {
      const out: Record<string, DayVerse> = {}
      for (let i = 0; i < n; i++) {
        const d = addDays(from, i)
        const v = days.get(d)
        if (v) out[d] = v
      }
      return { ok: true, data: out }
    },
    setThisWeek: async (_c, line) => {
      thisWeek = cleanLine(line, 140)
      return { ok: true, data: { this_week: thisWeek } }
    },
    thisWeek: () => thisWeek,
  }
}

// ---------------------------------------------------------------------------
// The planner's window: a run of dates at once, because a pastor prepares by
// the week and preaches by the series.
// ---------------------------------------------------------------------------
export interface WeekDay {
  date: string
  verse: DayVerse | null
}

/** `n` consecutive dates from `start`, each with what is set for it. Fails
 *  whole rather than half-drawn: a strip with holes would read as unset days.
 *  One range read where the backend has it (0123), one read per day where it
 *  doesn't — a server without 0123 still draws the strip. */
export async function fetchDays(churchId: string, start: string, n: number, be: VerseBackend = serverVerseBackend) {
  const dates = Array.from({ length: n }, (_, i) => addDays(start, i))
  const ranged = be.range ? await be.range(churchId, start, n) : null
  if (ranged) {
    if (!ranged.ok) return { ok: false as const, reason: ranged.reason }
    return { ok: true as const, data: dates.map((date) => ({ date, verse: ranged.data[date] ?? null })) }
  }
  const rows = await Promise.all(dates.map((d) => be.get(churchId, d)))
  const bad = rows.find((r) => !r.ok)
  if (bad && !bad.ok) return { ok: false as const, reason: bad.reason }
  return { ok: true as const, data: dates.map((date, i) => ({ date, verse: (rows[i] as { ok: true; data: DayVerse | null }).data })) }
}

export const fetchWeek = (churchId: string, start: string, be: VerseBackend = serverVerseBackend) => fetchDays(churchId, start, 7, be)

/**
 * Copy `v` onto `dates`. A day is written only if it is STILL what the leader
 * was shown: empty, or — when the leader explicitly ticked it in `replace` —
 * still holding the reference they were shown (`replace[date]`). Each day is
 * re-read right before writing, since another leader may have changed one
 * meanwhile; anything that moved is skipped, never overwritten.
 *
 * Copies carry the series and CLEAR the note: a note is about the day it was
 * written for. With `mix`, each day's copy deals its questions and their
 * options in a different order, seeded by the date — the same verse all week,
 * but not the same five taps in the same five places every morning.
 */
export async function fillDays(
  churchId: string,
  dates: string[],
  v: DayVerse,
  mix: boolean,
  be: VerseBackend = serverVerseBackend,
  replace: Record<string, string> = {},
) {
  const filled: string[] = []
  const skipped: string[] = []
  const copy: DayVerse = { ...v, series: v.series ?? '', note: '' }
  for (const date of dates) {
    const cur = await be.get(churchId, date)
    const ok = cur.ok && (cur.data === null || (date in replace && cur.data.reference === replace[date]))
    if (!ok) { skipped.push(date); continue }
    const r = await be.save(churchId, date, mix ? mixForDate(copy, date) : copy)
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
