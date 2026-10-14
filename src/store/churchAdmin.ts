import { supabase } from '@/lib/supabase'
import { todayLocalDate } from '@/lib/date'
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
