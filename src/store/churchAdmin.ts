import { supabase } from '@/lib/supabase'
import { todayLocalDate } from '@/lib/date'
import { useAuth } from './auth'

// Church leadership's reads and writes (0118). Every call is a security-definer
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
// The shared verse
// ---------------------------------------------------------------------------
export interface ScheduledVerse {
  id: string
  reference: string
  text: string
  pastorNote: string | null
  startsOn: string
  endsOn: string | null
}

export async function listScheduledVerses(churchId: string) {
  const r = await call('list_church_verses', { p_church_id: churchId, p_local_date: todayLocalDate() })
  if (!r.ok) return r
  const verses: ScheduledVerse[] = ((r.data.verses ?? []) as any[]).map((v) => ({
    id: String(v.id),
    reference: String(v.reference),
    text: String(v.text),
    pastorNote: v.pastor_note ?? null,
    startsOn: String(v.starts_on),
    endsOn: v.ends_on ?? null,
  }))
  return { ok: true as const, data: verses }
}

export async function scheduleVerse(
  churchId: string,
  v: { reference: string; text: string; pastorNote: string; startsOn: string; endsOn: string | null },
) {
  return call<{ id: string }>('schedule_church_verse', {
    p_church_id: churchId,
    p_reference: v.reference,
    p_text: v.text,
    p_note: v.pastorNote || null,
    p_starts_on: v.startsOn,
    p_ends_on: v.endsOn || null,
  })
}

export async function deleteScheduledVerse(verseId: string) {
  return call('delete_church_verse', { p_verse_id: verseId })
}

// ---------------------------------------------------------------------------
// Participation — aggregates, floored server-side
// ---------------------------------------------------------------------------
export interface Overview {
  from: string
  to: string
  members: number
  /** Null below the floor (fewer than five members). */
  played7d: number | null
  streaks: { s1_3: number; s4_6: number; s7_29: number; s30: number; none: number } | null
  floored: boolean
}

export async function fetchOverview(churchId: string) {
  const r = await call('church_admin_overview', { p_church_id: churchId, p_local_date: todayLocalDate() })
  if (!r.ok) return r
  const d = r.data
  const ov: Overview = {
    from: String(d.from),
    to: String(d.to),
    members: Number(d.members ?? 0),
    played7d: d.played_7d == null ? null : Number(d.played_7d),
    streaks: d.streaks
      ? {
          s1_3: Number(d.streaks.s1_3 ?? 0),
          s4_6: Number(d.streaks.s4_6 ?? 0),
          s7_29: Number(d.streaks.s7_29 ?? 0),
          s30: Number(d.streaks.s30 ?? 0),
          none: Number(d.streaks.none ?? 0),
        }
      : null,
    floored: !!d.floored,
  }
  return { ok: true as const, data: ov }
}

/** Members who CHOSE to be on it (`church_care_optin`) and have been away 3+ days. */
export interface CareRow {
  username: string
  lastActive: string | null
}

export async function fetchCareList(churchId: string) {
  const r = await call('church_care_list', { p_church_id: churchId, p_local_date: todayLocalDate() })
  if (!r.ok) return r
  const rows: CareRow[] = ((r.data.rows ?? []) as any[]).map((x) => ({
    username: String(x.username ?? ''),
    lastActive: x.last_active ?? null,
  }))
  return { ok: true as const, data: rows }
}

// ---------------------------------------------------------------------------
// The MEMBER's own switch — the only way onto the care list.
// ---------------------------------------------------------------------------
export async function fetchMyCareOptin(): Promise<boolean | null> {
  if (!online()) return null
  const uid = useAuth.getState().profile?.id
  if (!uid) return null
  const { data, error } = await supabase!.from('profiles').select('church_care_optin').eq('id', uid).maybeSingle()
  if (error || !data) return null
  return !!(data as any).church_care_optin
}

export async function setMyCareOptin(on: boolean) {
  return call<{ on: boolean }>('set_church_care_optin', { p_on: on })
}
