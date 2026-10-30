import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { addDays, todayLocalDate } from '@/lib/date'
import { useAuth } from './auth'
import { parseReference } from '@/lib/bibleProgress'
import { fetchChapter } from '@/lib/bible'
import { verseFromReference } from '@/data/bible/questions'
import type { Question } from '@/types'
import type { ChurchParticipation } from '@/types/churchPackages'
import { isLeaderLookId, type LeaderLookId } from '@/features/church/pricing'
import { freeTopic, topicByLabel } from '@/data/studyTopics'

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

// ---------------------------------------------------------------------------
// The content engine (`church-draft`). Every call sends `api: 2`, which makes
// the function answer a failure with a real HTTP status (0142) — and
// `functions.invoke` then hides the body behind `error.context`, so this is the
// one place that reads it back. A reply we never got (the connection dropped,
// the phone suspended the tab) is `lost`, which is NOT the same as a failure:
// the week mode may have saved its drafts anyway, and the panels go and look.
// ---------------------------------------------------------------------------
type Invoked = { kind: 'reply'; data: Record<string, any> } | { kind: 'lost' }

async function invokeDraft(churchId: string, body: Record<string, unknown>): Promise<Invoked> {
  const { data, error } = await supabase!.functions.invoke('church-draft', { body: { ...body, church_id: churchId, api: 2 } })
  let reply: Record<string, any> | null = null
  if (!error) reply = data && typeof data === 'object' ? (data as Record<string, any>) : null
  else {
    // A non-2xx answer: FunctionsHttpError carries the Response itself.
    const ctx = (error as { context?: unknown }).context
    if (ctx instanceof Response) {
      try { const j = await ctx.json(); if (j && typeof j === 'object') reply = j as Record<string, any> } catch { /* no body */ }
    }
  }
  if (!reply) return { kind: 'lost' }
  if (Number.isFinite(reply.left)) useDraftAllowance.getState().note(churchId, Number(reply.left))
  return { kind: 'reply', data: reply }
}

/**
 * How many of today's drafts this church has left, as the engine last said —
 * per church, in memory, null until a call has answered. The three drafting
 * panels read it so none of them has to restate the cap.
 */
export const useDraftAllowance = create<{ left: Record<string, number>; note: (churchId: string, left: number) => void }>((set) => ({
  left: {},
  note: (churchId, left) => set((st) => ({ left: { ...st.left, [churchId]: Math.max(0, left) } })),
}))

async function call<T = any>(fn: string, args: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; reason: AdminFail }> {
  if (!online()) return { ok: false, reason: 'unavailable' }
  const { data, error } = await supabase!.rpc(fn, args)
  if (error) return { ok: false, reason: 'unavailable' }
  const d = data as any
  if (d && d.ok === false) return { ok: false, reason: String(d.reason ?? 'unavailable') }
  return { ok: true, data: d as T }
}

// ---------------------------------------------------------------------------
// Entitlements (0127): two levels, and the second only stands on the first.
//
//   * `churchLeader` — the BASE tier: leadership of a verified church. Every
//     leadership tool (verse, questions, series, notes, congregation numbers,
//     approving a draft) is behind it.
//   * `contentGeneration` — the ADD-ON. The content engine (drafting from a
//     passage, a focus line or a sermon transcript) is behind it AND the base
//     tier; the server reports it false whenever the base is missing, so the
//     client never has to combine the two itself.
//
// Presentation only — `church_gen_can` / `church_admin_can` decide on the server.
// ---------------------------------------------------------------------------
export interface Entitlements {
  churchLeader: boolean
  contentGeneration: boolean
  /** The add-on is on the church's record but inert, because the base tier isn't. */
  contentGenerationHeld: boolean
  /** The Custom Leader Avatar add-on (0136): one request, base tier required. */
  customLeaderAvatar: boolean
  customLeaderAvatarHeld: boolean
  /** The CALLER's own look as leadership of this church; null = not chosen yet. */
  leaderLook: LeaderLookId | null
  /** The art delivered for the caller's custom avatar (https only, server-checked). */
  customArtUrl: string | null
}

/** Null on a server without 0127, which reads as "no add-on" — fail closed. */
export async function fetchEntitlements(churchId: string): Promise<Res<Entitlements> | null> {
  if (!online()) return { ok: false, reason: 'unavailable' }
  const { data, error } = await supabase!.rpc('church_entitlements', { p_church_id: churchId })
  if (error) return null
  const d = data as any
  if (d?.ok === false) return { ok: false, reason: String(d.reason ?? 'unavailable') }
  return {
    ok: true,
    data: {
      churchLeader: !!d?.church_leader,
      contentGeneration: !!d?.church_leader && !!d?.content_generation,
      contentGenerationHeld: !!d?.content_generation_held,
      // Absent on a server without 0136, which reads as "no add-on, no look".
      customLeaderAvatar: !!d?.church_leader && !!d?.custom_leader_avatar,
      customLeaderAvatarHeld: !!d?.custom_leader_avatar_held,
      leaderLook: isLeaderLookId(d?.leader_look) ? d.leader_look : null,
      customArtUrl: typeof d?.custom_art_url === 'string' && d.custom_art_url.startsWith('https://') ? d.custom_art_url : null,
    },
  }
}

// ---------------------------------------------------------------------------
// Leader looks and the Custom Leader Avatar request (0136). The server decides
// every gate: the base tier to pick a look, the add-on to submit, a delivered
// request of YOUR OWN before 'custom' is accepted.
// ---------------------------------------------------------------------------
export async function saveLeaderLook(churchId: string, look: LeaderLookId) {
  return call<{ leader_look: LeaderLookId }>('set_my_leader_look', { p_church_id: churchId, p_look: look })
}

export type AvatarRequestStatus = 'submitted' | 'in_progress' | 'delivered' | 'declined'

export interface AvatarRequest {
  /** Whether the caller sent it. Another leader's request shows only its status. */
  mine: boolean
  status: AvatarRequestStatus
  notes: string | null
  photoCount: number | null
  operatorNote: string | null
  createdAt: string
}

/** The church's live request (or the caller's last declined one); null = none. */
export async function fetchAvatarRequest(churchId: string): Promise<Res<AvatarRequest | null>> {
  const r = await call<{ request: any }>('church_avatar_request', { p_church_id: churchId })
  if (!r.ok) return r
  const q = r.data.request
  if (!q) return { ok: true, data: null }
  return {
    ok: true,
    data: {
      mine: !!q.mine,
      status: (['submitted', 'in_progress', 'delivered', 'declined'].includes(q.status) ? q.status : 'submitted') as AvatarRequestStatus,
      notes: typeof q.notes === 'string' ? q.notes : null,
      photoCount: typeof q.photo_count === 'number' ? q.photo_count : null,
      operatorNote: typeof q.operator_note === 'string' ? q.operator_note : null,
      createdAt: String(q.created_at ?? ''),
    },
  }
}

/** `photos` are base64 JPEG bodies (no data: prefix) — see `photoToJpegBase64`. */
export async function submitAvatarRequest(churchId: string, photos: string[], notes: string) {
  return call<{ replaced: boolean }>('submit_church_avatar_request', { p_church_id: churchId, p_photos: photos, p_notes: notes })
}

/**
 * A picked photo → a JPEG of at most `max` px on its long side, as base64 with
 * no prefix. The server refuses anything that isn't a JPEG by its first bytes
 * or is over 600KB decoded, so every photo is re-encoded here whatever it was
 * (a HEIC from an iPhone included, wherever the browser can decode it).
 */
export async function photoToJpegBase64(file: File, max = 1024): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('decode'))
      i.src = url
    })
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    for (const q of [0.85, 0.7, 0.55]) {
      const data = canvas.toDataURL('image/jpeg', q).split(',')[1] ?? ''
      // base64 is 4/3 of the bytes; stay well under the server's 600KB.
      if (data.length * 0.75 < 550_000) return data
    }
    throw new Error('too_big')
  } finally {
    URL.revokeObjectURL(url)
  }
}

// ---------------------------------------------------------------------------
// Billing: what the church's Stripe subscription says, and the portal (0135)
// ---------------------------------------------------------------------------
// `subscribed` is true only for a live subscription with a Stripe customer, so
// a church verified by hand reads false and its dashboard shows nothing new.
// The customer id never reaches the client: the portal session is opened by
// the church-billing function, which checks the caller's leadership itself.
export interface ChurchBilling {
  subscribed: boolean
  status: string | null
  interval: 'month' | 'year' | null
  addon: boolean
  invoiced: boolean
  periodEnd: string | null
  /** The church's Apple subscription (0139), or null. `mine` = this caller's Apple ID pays. */
  apple: { active: boolean; interval: 'month' | 'year' | null; expiresAt: string | null; mine: boolean } | null
}

export async function fetchChurchBilling(churchId: string): Promise<ChurchBilling | null> {
  const r = await call('my_church_billing', { p_church_id: churchId })
  if (!r.ok) return null
  const d = r.data as any
  return {
    subscribed: !!d?.subscribed,
    status: d?.status ?? null,
    interval: d?.interval === 'year' || d?.interval === 'month' ? d.interval : null,
    addon: !!d?.addon,
    invoiced: d?.collection_method === 'send_invoice',
    periodEnd: d?.period_end ?? null,
    // A server without 0139 sends no `apple` key, which reads as no Apple plan.
    apple: d?.apple
      ? {
          active: !!d.apple.active,
          interval: d.apple.interval === 'year' || d.apple.interval === 'month' ? d.apple.interval : null,
          expiresAt: d.apple.expires_at ?? null,
          mine: !!d.apple.mine,
        }
      : null,
  }
}

/**
 * Which door a leader took toward a plan (0141): "Subscribe with Apple" or the
 * web billing link. Fire-and-forget by design — the caller never awaits it, so
 * the Apple sheet or the browser opens on the same tap whether this lands,
 * fails, or the server has no 0141. `.then()` is what sends a postgrest call
 * (a bare `void rpc()` sends nothing — CLAUDE.md), so it is kept even though
 * nothing reads the answer. `interval` is null for the web, where the plan's
 * period is chosen on the page rather than in the app.
 */
export function noteChurchPlanTap(churchId: string, path: 'apple' | 'web', interval: 'month' | 'year' | null): void {
  if (!online()) return
  try {
    void supabase!
      .rpc('note_church_plan_tap', { p_church_id: churchId, p_path: path, p_interval: interval })
      .then(() => {}, () => {})
  } catch { /* never let counting a tap get in the way of the tap */ }
}

/**
 * A Stripe customer-portal URL for this church, or null with a reason.
 * `flow: 'plan'` opens straight on the plan picker ("Manage plan").
 */
export async function openBillingPortal(churchId: string, flow?: 'plan'): Promise<{ url: string } | { error: string }> {
  return billingUrl({ action: 'portal', church: churchId, flow })
}

/**
 * "Unlock with Church Suite": a Suite Checkout for a church with no live
 * subscription (a free claim), or a portal session on the confirm step of
 * Verified → Suite for a card subscription. The function decides which from
 * the church's own billing row; the client only names the church.
 */
export async function startSuiteUpgrade(churchId: string): Promise<{ url: string } | { error: string }> {
  return billingUrl({ action: 'upgrade', church: churchId })
}

/**
 * The one-time Custom Leader Avatar (0145): a Stripe Checkout Session in
 * payment mode. The function checks leadership, a verified church and that the
 * add-on isn't held; the client only names the church.
 */
export async function startAvatarCheckout(churchId: string): Promise<{ url: string } | { error: string }> {
  return billingUrl({ action: 'avatar', church: churchId })
}

async function billingUrl(body: Record<string, unknown>): Promise<{ url: string } | { error: string }> {
  if (!online()) return { error: 'unavailable' }
  const { data, error } = await supabase!.functions.invoke('church-billing', { body })
  if (error || typeof (data as any)?.url !== 'string') return { error: String((data as any)?.error ?? 'failed') }
  return { url: (data as any).url }
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
  /**
   * 0127. 'draft' is generated and not yet approved — members never see it.
   * 'approved' is live on its date; 'published' is an approved day whose date
   * has come. Absent on writes and on a server without 0127.
   */
  status?: VerseStatus
  /** Whether the content engine drafted it (kept after hand edits). */
  generated?: boolean
}

export type VerseStatus = 'draft' | 'approved' | 'published'

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
    status: v.status === 'draft' || v.status === 'approved' || v.status === 'published' ? v.status : undefined,
    generated: v.generated === true,
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

/**
 * A GENERATED day, saved for review (0127, Content Generation only). Members
 * never see it until `approveDayVerse`. Over a day that is already live the
 * server refuses (`day_is_set`) unless `replace` — replacing takes that day off
 * members' screens until the draft is approved, so the form asks first.
 */
export async function saveDraftVerse(churchId: string, date: string, v: DayVerse, replace = false) {
  return call<{ drop_date: string; status: VerseStatus }>('save_church_verse_draft', {
    p_church_id: churchId,
    p_drop_date: date,
    p_reference: v.reference,
    p_text: v.text,
    p_questions: cleanQuestions(v.questions),
    p_series: v.series === undefined ? null : (cleanLine(v.series, SERIES_MAX) ?? ''),
    p_note: v.note === undefined ? null : (cleanLine(v.note, NOTE_MAX) ?? ''),
    p_replace: replace,
  })
}

/** The explicit approval that makes a draft live (0127). Base tier is enough. */
export async function approveDayVerse(churchId: string, date: string) {
  return call<{ drop_date: string; status: VerseStatus }>('approve_church_verse', { p_church_id: churchId, p_drop_date: date })
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
  /**
   * The content engine: five questions (and maybe a note) drafted for a
   * passage, or a reason. ABSENT ⇒ the church doesn't hold the Content
   * Generation package, and the form draws the locked state instead.
   */
  draft?: (churchId: string, reference: string, text: string, steer?: DraftSteer) => Promise<Res<DraftResult>>
  /** Save a generated day as a draft. Present exactly when `draft` is. */
  saveDraft?: (churchId: string, date: string, v: DayVerse, replace: boolean) => Promise<Res<unknown>>
  /** Approve a draft. Base tier — present whenever leadership can save. */
  approve?: (churchId: string, date: string) => Promise<Res<{ status?: VerseStatus }>>
  /** Approve exactly these dates (drafts only). Base tier (0129). */
  approveMany?: (churchId: string, dates: string[]) => Promise<Res<{ approved: string[]; flagged?: string[] }>>
  /** Throw a draft away; the day reads as empty again. Base tier (0129). */
  discard?: (churchId: string, date: string) => Promise<Res<unknown>>
  /**
   * The content engine's WEEK: one sermon → several days of drafts (0129).
   * Present exactly when `draft` is — the Content Generation package.
   */
  draftWeek?: (churchId: string, input: WeekDraftInput) => Promise<Res<WeekDraftResult>>
  /** Which passages a study topic means — references only (Content Generation). */
  planTopic?: (churchId: string, topic: string, book?: string) => Promise<Res<TopicPlan>>
  /** A recorded sermon → a transcript for the leader to edit (0144). Content Generation only. */
  memo?: MemoBackend
  /** Queue "record Sunday, review Monday": the uploaded memo drafts its own week on the server (0148). */
  autoWeek?: (churchId: string, input: AutoWeekInput) => Promise<Res<{ job: string }>>
  /** A day's open discussion questions for small groups (0151). Base tier; absent in the demo. */
  discussion?: {
    get: (churchId: string, date: string) => Promise<Res<string[]>>
    save: (churchId: string, date: string, questions: string[], generated: boolean) => Promise<Res<string[]>>
  }
}

export const serverVerseBackend: VerseBackend = {
  get: (c, d) => fetchDayVerse(c, d),
  save: (c, d, v) => saveDayVerse(c, d, v),
  range: (c, f, n) => fetchRange(c, f, n),
  setThisWeek: (c, l) => saveThisWeek(c, l),
  approve: (c, d) => approveDayVerse(c, d),
  approveMany: (c, ds) => approveDays(c, ds),
  discard: (c, d) => discardDraft(c, d),
  discussion: { get: (c, d) => fetchDiscussion(c, d), save: (c, d, q, g) => saveDiscussion(c, d, q, g) },
}

/** The same, plus the content engine — only for a church holding the add-on. */
export const serverGenerationBackend: VerseBackend = {
  ...serverVerseBackend,
  draft: (c, r, t, steer) => draftQuestions(c, r, t, steer),
  saveDraft: (c, d, v, replace) => saveDraftVerse(c, d, v, replace),
  draftWeek: (c, input) => draftWeek(c, input),
  planTopic: (c, t, b) => planTopic(c, t, b),
  memo: { upload: uploadMemo, transcribe: transcribeMemo },
  autoWeek: (c, input) => queueAutoWeek(c, input),
}

// ---------------------------------------------------------------------------
// A week from one sermon (0129, Content Generation only).
//
// The SCRIPTURE never comes from the model: `resolvePassage` fetches each
// passage's verses here (the BSB — the app's own unlicensed text, so storing
// it on a church's day breaks no licence), the function is handed them, and it
// builds each day's text from those verses. The model only chooses which verse
// a day focuses on, inside the passages the leader named.
// ---------------------------------------------------------------------------
export const WEEK_DAYS_MIN = 2
export const WEEK_DAYS_MAX = 7
export const WEEK_PASSAGES_MAX = 3
/** Mirrors the function's 40-verse and 6,000-character caps. */
const PASSAGE_VERSES_MAX = 40
const SCRIPTURE_MAX = 6_000

export interface WeekPassage {
  reference: string
  verses: { n: number; text: string }[]
}

export interface WeekDraftInput {
  series: string
  days: number
  passages: WeekPassage[]
  transcript?: string
  guidance?: string
  /**
   * The planned dates, in order (1..days). Day k of the engine's plan is saved
   * on dates[k] and nowhere else — by the FUNCTION, as the leader (0142), so a
   * phone that backgrounds mid-draft loses nothing.
   */
  dates: string[]
  /** Also write 2-3 open discussion questions for each day's small groups (0151). */
  discussion?: boolean
}

export interface WeekDraftResult {
  /** Dates that now hold one of this run's drafts. Never empty on success. */
  saved: string[]
  /** Dates the server would not write, with why (`day_is_set`: it went live meanwhile). */
  refused: { date: string; reason: string }[]
  /** Planned dates whose day came back unusable — left empty, not slid. */
  missing: string[]
  /** How many days were asked of the engine. */
  asked: number
  /** What became of the transcript, when one was sent and the function says (see TranscriptUse). */
  transcriptUse?: TranscriptUse
  /** Characters of the pasted transcript the draft drew on. */
  transcriptRead?: number
  /** Saved days that also got discussion questions (0151), when they were asked for. */
  discussed?: string[]
}

/** Fetch a passage's verses. Null reason says why it can't be used. */
export async function resolvePassage(reference: string): Promise<{ ok: true; data: WeekPassage } | { ok: false; reason: string }> {
  const ref = parseReference(reference.trim())
  if (!ref) return { ok: false, reason: 'bad_reference' }
  if (ref.end - ref.start + 1 > PASSAGE_VERSES_MAX) return { ok: false, reason: 'passage_too_long' }
  try {
    const ch = await fetchChapter(ref.book, ref.chapter, 'bsb')
    const verses = ch.verses
      .filter((v) => v.verse >= ref.start && v.verse <= ref.end)
      .map((v) => ({ n: v.verse, text: v.text.replace(/\s+/g, ' ').trim() }))
      .filter((v) => v.text)
    if (verses.length) return { ok: true, data: { reference: reference.trim(), verses } }
  } catch {
    /* offline or not served — the library below may still have it */
  }
  // Offline: a single verse the arcade's library carries.
  const lib = ref.start === ref.end ? verseFromReference(reference.trim()) : null
  if (lib) return { ok: true, data: { reference: reference.trim(), verses: [{ n: ref.start, text: lib.text }] } }
  return { ok: false, reason: 'passage_unavailable' }
}

export function scriptureChars(ps: WeekPassage[]): number {
  return ps.reduce((n, p) => n + p.verses.reduce((m, v) => m + v.text.length, 0), 0)
}
export const SCRIPTURE_CHARS_MAX = SCRIPTURE_MAX

export async function draftWeek(churchId: string, input: WeekDraftInput): Promise<Res<WeekDraftResult>> {
  if (!online()) return { ok: false, reason: 'unavailable' }
  const r = await invokeDraft(churchId, {
    mode: 'week',
    series: cleanLine(input.series, SERIES_MAX) ?? '',
    days: input.days,
    passages: input.passages,
    guidance: cleanLine(input.guidance, GUIDANCE_MAX) ?? undefined,
    transcript: input.transcript?.trim().slice(0, TRANSCRIPT_SEND_MAX) || undefined,
    dates: input.dates,
    discussion: input.discussion || undefined,
  })
  // No answer at all: the panel re-reads the planned dates before saying anything.
  if (r.kind === 'lost') return { ok: false, reason: 'no_reply' }
  const d = r.data
  const refusals = (x: unknown) => (Array.isArray(x) ? x : [])
    .map((y: any) => ({ date: String(y?.date ?? ''), reason: String(y?.reason ?? 'unavailable') }))
    .filter((y) => input.dates.includes(y.date))
  if (!d.ok) return { ok: false, reason: String(d.reason ?? 'unavailable') }

  // 0142 and later: the function saved the days itself.
  if (Array.isArray(d.saved)) {
    const saved = (d.saved as unknown[]).map(String).filter((x) => input.dates.includes(x))
    if (!saved.length) return { ok: false, reason: 'not_saved' }
    const missing = (Array.isArray(d.missing) ? d.missing : []).map(String).filter((x: string) => input.dates.includes(x))
    const discussed = Array.isArray(d.discussed) ? (d.discussed as unknown[]).map(String).filter((x) => saved.includes(x)) : undefined
    return { ok: true, data: { saved, refused: refusals(d.refused), missing, asked: Number(d.asked) || input.days, discussed, ...transcriptOf(d) } }
  }

  // A function from before 0142 ignores `dates` and hands the days back, so
  // they are saved here, positionally, exactly as the panels used to — this
  // only matters in the minutes between a client and a function deploy.
  const saved: string[] = []
  const refused: { date: string; reason: string }[] = []
  const days = Array.isArray(d.days) ? d.days : []
  for (let i = 0; i < days.length && i < input.dates.length; i++) {
    const x = days[i]
    const questions = cleanQuestions(x?.questions ?? [])
    const date = input.dates[i]
    if (!questions || typeof x?.reference !== 'string' || !parseReference(x.reference) || typeof x?.text !== 'string' || !x.text.trim()) continue
    const s = await saveDraftVerse(churchId, date, {
      reference: x.reference,
      text: x.text.trim().slice(0, 1000),
      questions,
      series: input.series,
      note: cleanLine(typeof x.note === 'string' ? x.note : null, NOTE_MAX) ?? '',
    }, false)
    if (s.ok) saved.push(date)
    else refused.push({ date, reason: String(s.reason) })
  }
  if (!saved.length) return { ok: false, reason: refused.length ? 'not_saved' : 'draft_failed' }
  const missing = input.dates.filter((x) => !saved.includes(x) && !refused.some((y) => y.date === x))
  return { ok: true, data: { saved, refused, missing, asked: Number(d.asked) || input.days, ...transcriptOf(d) } }
}

// ---------------------------------------------------------------------------
// "What is your congregation studying this week?" (Content Generation only).
//
// A topic the catalog (`data/studyTopics.ts`) anchors needs no call: its
// passages are known. Anything else asks `church-draft`'s `topic` mode which
// passages it means — REFERENCES ONLY, one of the church's thirty daily units —
// and the week is then drafted by `draftWeek` exactly as from a sermon, with
// the words fetched here by `resolvePassage`. No second generator.
// ---------------------------------------------------------------------------
export const TOPIC_MAX = 80

export interface TopicPlan {
  series: string
  passages: string[]
}

export async function planTopic(churchId: string, topic: string, book?: string): Promise<Res<TopicPlan>> {
  if (!online()) return { ok: false, reason: 'unavailable' }
  const t = cleanLine(topic, TOPIC_MAX)
  if (!t) return { ok: false, reason: 'needs_topic' }
  const r = await invokeDraft(churchId, { mode: 'topic', topic: t, book: book || undefined })
  if (r.kind === 'lost') return { ok: false, reason: 'unavailable' }
  const d = r.data as { ok?: boolean; reason?: string; series?: unknown; passages?: unknown }
  if (!d.ok) return { ok: false, reason: String(d.reason ?? 'unavailable') }
  const passages = (Array.isArray(d.passages) ? d.passages : [])
    .map((x) => String(x ?? '').trim())
    .filter((x) => !!parseReference(x))
    .slice(0, WEEK_PASSAGES_MAX)
  if (!passages.length) return { ok: false, reason: 'topic_unclear' }
  return { ok: true, data: { series: cleanLine(typeof d.series === 'string' ? d.series : null, SERIES_MAX) ?? t.slice(0, SERIES_MAX), passages } }
}

/**
 * The series names this church has used, newest first — the autocomplete's
 * "used before" rows. Read from the schedule itself (the last twelve weeks and
 * the next six), two of `church_verses_range`'s 42-day windows at a time, so
 * there is no new RPC and nothing stored. Fails to [] — an autocomplete
 * without history is still an autocomplete.
 */
export async function fetchPastSeries(churchId: string, today: string, be: VerseBackend = serverVerseBackend): Promise<string[]> {
  if (!be.range) return []
  const starts = [addDays(today, -84), addDays(today, -42), today]
  const reads = await Promise.all(starts.map((s) => be.range!(churchId, s, 42).catch(() => null)))
  const byDate: [string, string][] = []
  for (const r of reads) {
    if (!r || !r.ok) continue
    for (const [date, v] of Object.entries(r.data)) if (v.series && v.status !== 'draft') byDate.push([date, v.series])
  }
  byDate.sort((a, b) => (a[0] < b[0] ? 1 : -1))
  const seen = new Set<string>()
  const out: string[] = []
  for (const [, name] of byDate) {
    const k = name.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(name)
  }
  return out.slice(0, 12)
}

/** Approve exactly the dates the leader was shown (0129). */
export async function approveDays(churchId: string, dates: string[]) {
  const r = await call<{ approved: string[]; flagged?: string[] }>('approve_church_verses', { p_church_id: churchId, p_dates: dates })
  if (!r.ok) return r
  // `flagged` (0143): days the server would not approve because a ⚠ is still on them.
  return { ok: true as const, data: { approved: (r.data.approved ?? []).map(String), flagged: (r.data.flagged ?? []).map(String) } }
}

/** Throw a draft away (0129). The row is stamped, not deleted. */
export async function discardDraft(churchId: string, date: string) {
  return call('discard_church_verse_draft', { p_church_id: churchId, p_drop_date: date })
}

/** What steers a draft. Both optional; the passage is always required. */
export interface DraftSteer {
  /** A short focus line from the pastor. */
  guidance?: string
  /** Sermon notes or a voice-memo transcript. */
  transcript?: string
  /** Also write 2-3 open discussion questions for small groups (0151). */
  discussion?: boolean
}

export interface DraftResult {
  questions: Question[]
  /** A suggested note for members, when the engine wrote one. */
  note?: string
  /** Open discussion questions for small groups, when asked for (0151). */
  discussion?: string[]
  /** What became of the transcript, when one was sent and the function says. */
  transcriptUse?: TranscriptUse
  /** Characters of the pasted transcript the draft drew on. */
  transcriptRead?: number
}

export const GUIDANCE_MAX = 300
/**
 * Transcripts (the function's caps, both modes). Up to TRANSCRIPT_DIRECT_MAX
 * is read word for word; a longer one is condensed to an ordered outline of
 * its key points before drafting, so the whole sermon steers it. The forms
 * carry no maxLength: a paste is never cut silently, and anything past
 * TRANSCRIPT_SEND_MAX (about an hour of speech) is named on screen first.
 */
export const TRANSCRIPT_DIRECT_MAX = 12_000
export const TRANSCRIPT_SEND_MAX = 60_000
/**
 * 'full' — read word for word; 'condensed' — condensed first, then drafted
 * from; 'clipped' — the condense failed, so only the first
 * TRANSCRIPT_DIRECT_MAX characters steered it. A function from before this
 * says nothing, and the field stays undefined.
 */
export type TranscriptUse = 'full' | 'condensed' | 'clipped'

function transcriptOf(d: Record<string, unknown>): { transcriptUse?: TranscriptUse; transcriptRead?: number } {
  const use = d.transcript_use
  if (use !== 'full' && use !== 'condensed' && use !== 'clipped') return {}
  const read = Number(d.transcript_read)
  return { transcriptUse: use, transcriptRead: Number.isFinite(read) && read > 0 ? read : undefined }
}

/**
 * Ask `church-draft` (0122) for five questions about a passage. Leadership of
 * a verified church only, capped per church per day server-side; the result is
 * a DRAFT that fills the form and saves nothing. Re-checked with
 * `cleanQuestions` here as well, so the form never holds something
 * `set_church_verse` would refuse.
 */
export async function draftQuestions(churchId: string, reference: string, text: string, steer: DraftSteer = {}): Promise<Res<DraftResult>> {
  if (!online()) return { ok: false, reason: 'unavailable' }
  const r = await invokeDraft(churchId, {
    reference,
    text,
    guidance: cleanLine(steer.guidance, GUIDANCE_MAX) ?? undefined,
    transcript: steer.transcript?.trim().slice(0, TRANSCRIPT_SEND_MAX) || undefined,
    discussion: steer.discussion || undefined,
  })
  if (r.kind === 'lost') return { ok: false, reason: 'unavailable' }
  const d = r.data as { ok?: boolean; reason?: string; questions?: Question[]; note?: unknown; discussion?: unknown }
  if (!d.ok) return { ok: false, reason: String(d.reason ?? 'unavailable') }
  const qs = cleanQuestions(d.questions ?? [])
  if (!qs) return { ok: false, reason: 'draft_failed' }
  const discussion = cleanDiscussion(d.discussion)
  return {
    ok: true,
    data: {
      questions: qs,
      note: cleanLine(typeof d.note === 'string' ? d.note : null, NOTE_MAX) ?? undefined,
      ...(discussion.length ? { discussion } : {}),
      ...transcriptOf(d as Record<string, unknown>),
    },
  }
}

/** In-memory days, seeded with `initial`. Validates exactly as the server does. */
export function memoryVerseBackend(
  initial: Record<string, DayVerse> = {},
  draft?: VerseBackend['draft'],
): VerseBackend & { thisWeek: () => string | null } {
  const days = new Map(Object.entries(initial))
  let thisWeek: string | null = null
  // The same status rules as 0127: a save is an approval, a draft is not live.
  const statusFor = (date: string): VerseStatus => (date <= todayLocalDate() ? 'published' : 'approved')
  const put = (d: string, v: DayVerse, status: VerseStatus, generated: boolean) => {
    const cleaned = cleanQuestions(v.questions)
    if (!cleaned) return false
    // As on the server (0143): only a draft keeps the check's ⚠; going live strips it.
    const questions = status === 'draft' ? cleaned : cleaned.map(({ check: _c, checkPick: _p, ...q }) => q)
    const prev = days.get(d)
    days.set(d, {
      ...v,
      questions,
      series: v.series === undefined ? (prev?.series ?? null) : cleanLine(v.series, SERIES_MAX),
      note: v.note === undefined ? (prev?.note ?? null) : cleanLine(v.note, NOTE_MAX),
      status,
      generated,
    })
    return true
  }
  return {
    draft,
    ...(draft
      ? {
          saveDraft: async (_c: string, d: string, v: DayVerse, replace: boolean): Promise<Res<unknown>> => {
            const cur = days.get(d)
            if (cur && cur.status !== 'draft' && !replace) return { ok: false, reason: 'day_is_set' }
            return put(d, v, 'draft', true) ? { ok: true, data: { status: 'draft' } } : { ok: false, reason: 'bad_questions' }
          },
        }
      : {}),
    approveMany: async (_c, ds) => {
      const approved: string[] = []
      const flagged: string[] = []
      for (const d of ds) {
        const cur = days.get(d)
        if (cur?.status !== 'draft') continue
        // The server's rule (0143): a day still carrying a ⚠ is not approved in a set.
        if (flaggedCount(cur.questions)) { flagged.push(d); continue }
        days.set(d, { ...cur, status: statusFor(d) }); approved.push(d)
      }
      return { ok: true, data: { approved, flagged } }
    },
    discard: async (_c, d) => {
      if (days.get(d)?.status !== 'draft') return { ok: false, reason: 'no_draft' }
      days.delete(d)
      return { ok: true, data: null }
    },
    approve: async (_c, d) => {
      const cur = days.get(d)
      if (!cur || cur.status !== 'draft') return { ok: false, reason: 'no_draft' }
      days.set(d, { ...cur, status: statusFor(d), questions: cur.questions.map(({ check: _c, checkPick: _p, ...q }) => q) })
      return { ok: true, data: { status: statusFor(d) } }
    },
    get: async (_c, d) => ({ ok: true, data: days.get(d) ?? null }),
    save: async (_c, d, v) => {
      const generated = days.get(d)?.generated ?? false
      return put(d, v, statusFor(d), generated) ? { ok: true, data: { extras: true } } : { ok: false, reason: 'bad_questions' }
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
    // A draft's check flag (0143) rides along, well-formed or not at all —
    // the same rule `church_draft_questions` applies on the server.
    const check = q.check === true
      ? { check: true as const, ...(Number.isInteger(q.checkPick) && q.checkPick! >= -1 && q.checkPick! < options.length ? { checkPick: q.checkPick } : {}) }
      : {}
    out.push({ prompt, options, answerIndex: q.answerIndex, teach, ...check })
  }
  return out
}

/** How many of a day's questions carry the blind check's ⚠ (0143). */
export const flaggedCount = (qs: Question[] | undefined | null) => (qs ?? []).filter((q) => q.check === true).length

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

// ---------------------------------------------------------------------------
// The leadership dashboard (0128): congregation numbers WITH names — the
// owner's call, "this is a tool for church leaders, names are important".
// Verified leadership of THIS church only; nothing here reaches a member.
// ---------------------------------------------------------------------------
export interface InsightMember {
  username: string
  avatarEmoji: string | null
  avatarCharacter: import('@/data/avatar').AvatarSpec | null
  joinedAt: string | null
  streak: number
  lastPlayedOn: string | null
  drop7d: number
  church7d: number
  churchAvg: number | null
  leader: boolean
}

export interface InsightSeries {
  series: string
  starts: string
  ends: string
  days: number
  soFar: number
  plays: number
  players: number
  completion: number | null
}

// ---------------------------------------------------------------------------
// The free leader's numbers (0137): ANY leadership of this church, verified or
// not. Three totals and the live notice — no names and no rows of people, by
// construction (`church_leader_summary` returns none to draw).
// ---------------------------------------------------------------------------
export interface LeaderSummary {
  verified: boolean
  members: number
  active7d: number
  activePct: number | null
  avgStreak: number
  notice: { message: string; createdAt: string } | null
}

export async function fetchLeaderSummary(churchId: string) {
  const r = await call('church_leader_summary', { p_church_id: churchId, p_local_date: todayLocalDate() })
  if (!r.ok) return r
  const d = r.data
  const n = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0)
  const data: LeaderSummary = {
    verified: !!d.verified,
    members: n(d.members),
    active7d: n(d.active_7d),
    activePct: num(d.active_pct),
    avgStreak: n(d.avg_streak),
    notice: d.notice?.message ? { message: String(d.notice.message), createdAt: String(d.notice.created_at) } : null,
  }
  return { ok: true as const, data }
}

export interface LeaderInsights {
  today: string
  members: number
  active7d: number
  quiet: number
  days: { date: string; drop: number; church: number; scheduled: boolean }[]
  series: InsightSeries[]
  streaks: { s0: number; s1: number; s2_6: number; s7: number }
  notice: { message: string; createdAt: string; expiresAt: string | null } | null
  roster: InsightMember[]
}

export async function fetchLeaderInsights(churchId: string) {
  const r = await call('church_leader_insights', { p_church_id: churchId, p_local_date: todayLocalDate() })
  if (!r.ok) return r
  const d = r.data
  const n = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0)
  const data: LeaderInsights = {
    today: String(d.today),
    members: n(d.members),
    active7d: n(d.active_7d),
    quiet: n(d.quiet),
    days: (Array.isArray(d.days) ? d.days : []).map((x: any) => ({
      date: String(x.date), drop: n(x.drop), church: n(x.church), scheduled: !!x.scheduled,
    })),
    series: (Array.isArray(d.series) ? d.series : []).map((x: any) => ({
      series: String(x.series ?? ''), starts: String(x.starts), ends: String(x.ends), days: n(x.days),
      soFar: n(x.so_far), plays: n(x.plays), players: n(x.players), completion: num(x.completion),
    })),
    streaks: { s0: n(d.streaks?.s0), s1: n(d.streaks?.s1), s2_6: n(d.streaks?.s2_6), s7: n(d.streaks?.s7) },
    notice: d.notice?.message
      ? { message: String(d.notice.message), createdAt: String(d.notice.created_at), expiresAt: d.notice.expires_at ?? null }
      : null,
    roster: (Array.isArray(d.roster) ? d.roster : []).map((m: any) => ({
      username: String(m.username ?? ''),
      avatarEmoji: typeof m.avatar_emoji === 'string' ? m.avatar_emoji : null,
      avatarCharacter: m.avatar_character ?? null,
      joinedAt: m.joined_at ?? null,
      streak: n(m.streak),
      lastPlayedOn: m.last_played_on ?? null,
      drop7d: n(m.drop_7d),
      church7d: n(m.church_7d),
      churchAvg: num(m.church_avg),
      leader: !!m.leader,
    })),
  }
  return { ok: true as const, data }
}

// ---------------------------------------------------------------------------
// Voice memos (0144, Content Generation only): record Sunday's sermon, get the
// transcript back in the box, edit it, then draft exactly as from a paste.
//
// Two steps, so a retry after a busy model needn't upload an hour of audio
// again: `uploadMemo` asks `church-draft` for a signed upload into the private
// `church-memos` bucket and sends the file there; `transcribeMemo` asks the
// function to transcribe that upload. Neither spends a draft unit — a
// transcription has its own allowance (10 a church a day, given back on any
// failure), and the draft made from it afterwards spends what a pasted
// transcript spends. Replies carry `memo_left`, never `left`, so the draft
// allowance on screen is never overwritten by the memo count.
// ---------------------------------------------------------------------------
export const MEMO_BYTES_MAX = 50 * 1024 * 1024
export const MEMO_SECONDS_MAX = 60 * 60
export const MEMO_ACCEPT = 'audio/*,.m4a,.mp3,.wav,.aac,.ogg,.opus,.flac,.webm,.aif,.aiff'
const MEMO_EXTS = new Set(['m4a', 'mp4', 'mp3', 'wav', 'aac', 'ogg', 'oga', 'opus', 'flac', 'webm', 'aiff', 'aif'])
const MEMO_BY_TYPE: Record<string, string> = {
  'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a', 'audio/aac': 'aac', 'audio/x-aac': 'aac',
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav',
  'audio/ogg': 'ogg', 'audio/opus': 'opus', 'audio/flac': 'flac', 'audio/x-flac': 'flac',
  'audio/webm': 'webm', 'audio/aiff': 'aiff', 'audio/x-aiff': 'aiff',
}

export interface MemoUpload { path: string }
export interface MemoTranscript { transcript: string; seconds?: number }
export interface MemoBackend {
  upload: (churchId: string, file: Blob, name?: string) => Promise<Res<MemoUpload>>
  transcribe: (churchId: string, upload: MemoUpload) => Promise<Res<MemoTranscript>>
}

/** The extension the function files a memo under, from its name or its type; null = not a format it takes. */
export function memoExt(file: Blob, name?: string): string | null {
  const fromName = /\.([a-z0-9]{2,5})$/i.exec(name ?? '')?.[1]?.toLowerCase()
  if (fromName && MEMO_EXTS.has(fromName)) return fromName
  const type = (file.type || '').split(';')[0].trim().toLowerCase()
  return MEMO_BY_TYPE[type] ?? null
}

/** A recording's length in seconds as the browser reads it, or null when it can't say. */
export function memoSeconds(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    let url = ''
    const done = (n: number | null) => { if (url) URL.revokeObjectURL(url); resolve(n) }
    try {
      url = URL.createObjectURL(file)
      const a = new Audio()
      a.preload = 'metadata'
      a.onloadedmetadata = () => done(Number.isFinite(a.duration) && a.duration > 0 ? a.duration : null)
      a.onerror = () => done(null)
      setTimeout(() => done(null), 8_000)
      a.src = url
    } catch {
      done(null)
    }
  })
}

export async function uploadMemo(churchId: string, file: Blob, name?: string): Promise<Res<MemoUpload>> {
  if (!online()) return { ok: false, reason: 'unavailable' }
  const ext = memoExt(file, name)
  if (!ext) return { ok: false, reason: 'memo_format' }
  if (file.size > MEMO_BYTES_MAX) return { ok: false, reason: 'memo_too_big' }
  const r = await invokeDraft(churchId, { mode: 'memo_url', ext, bytes: file.size })
  if (r.kind === 'lost') return { ok: false, reason: 'unavailable' }
  const d = r.data
  if (!d.ok || typeof d.path !== 'string' || typeof d.token !== 'string') return { ok: false, reason: String(d.reason ?? 'unavailable') }
  const { error } = await supabase!.storage.from(String(d.bucket ?? 'church-memos'))
    .uploadToSignedUrl(d.path, d.token, file, { contentType: file.type || undefined })
  if (error) return { ok: false, reason: 'upload_failed' }
  return { ok: true, data: { path: d.path } }
}

export async function transcribeMemo(churchId: string, upload: MemoUpload): Promise<Res<MemoTranscript>> {
  if (!online()) return { ok: false, reason: 'unavailable' }
  const r = await invokeDraft(churchId, { mode: 'transcribe', path: upload.path })
  if (r.kind === 'lost') return { ok: false, reason: 'no_reply' }
  const d = r.data
  if (!d.ok) return { ok: false, reason: String(d.reason ?? 'unavailable') }
  if (typeof d.transcript !== 'string' || !d.transcript.trim()) return { ok: false, reason: 'memo_silent' }
  const seconds = Number(d.seconds)
  return { ok: true, data: { transcript: d.transcript.trim(), seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : undefined } }
}

// ---------------------------------------------------------------------------
// Co-leaders (0147). Verified leadership of a church adds and removes its own
// leadership; every call re-checks `church_admin_can` for THAT church on the
// server, so the screen deciding what to draw is presentation only. A grant
// is one row in `church_admins` and nothing else — no skin, no billing, no
// operator power.
// ---------------------------------------------------------------------------
export interface ChurchLeader {
  username: string
  avatarEmoji: string | null
  avatarCharacter: import('@/data/avatar').AvatarSpec | null
  grantedAt: string | null
  /** Who added them; null for an operator grant or a claim. */
  grantedBy: string | null
  isMe: boolean
  /** Plays for this church in the app (staff often have not joined it). */
  member: boolean
  /** Their Apple ID pays for this church (0139) — removal is refused. */
  applePayer: boolean
}

export async function fetchChurchLeaders(churchId: string) {
  const r = await call('church_leaders', { p_church_id: churchId })
  if (!r.ok) return r
  const list = Array.isArray(r.data?.leaders) ? r.data.leaders : []
  const leaders: ChurchLeader[] = list
    .filter((x: any) => x && typeof x.username === 'string')
    .map((x: any) => ({
      username: x.username,
      avatarEmoji: x.avatar_emoji ?? null,
      avatarCharacter: x.avatar_character ?? null,
      grantedAt: x.granted_at ?? null,
      grantedBy: typeof x.granted_by === 'string' ? x.granted_by : null,
      isMe: !!x.is_me,
      member: !!x.member,
      applePayer: !!x.apple_payer,
    }))
  return { ok: true as const, data: leaders }
}

export async function grantCoLeader(churchId: string, username: string) {
  const r = await call<{ username?: string; member?: boolean }>('grant_church_co_leader', {
    p_church_id: churchId,
    p_username: username.trim().replace(/^@/, ''),
  })
  if (!r.ok) return r
  return { ok: true as const, data: { username: String(r.data?.username ?? username), member: !!r.data?.member } }
}

export async function removeCoLeader(churchId: string, username: string) {
  const r = await call<{ self?: boolean }>('remove_church_co_leader', { p_church_id: churchId, p_username: username })
  if (!r.ok) return r
  return { ok: true as const, data: { self: !!r.data?.self } }
}

// ---------------------------------------------------------------------------
// Record Sunday, review Monday (0148). An uploaded sermon memo can ask the
// server to transcribe it AND draft the week, with nobody pressing a button:
// `church-draft` `auto_week` records a job, answers at once, and runs the same
// transcribe and week calls the hand path makes (allowances, refunds, BSB
// scripture, the answer check, drafts only). The leader finds the week waiting
// for approval on Plan, and a row on Home says it is ready (or why it isn't).
// ---------------------------------------------------------------------------
export interface AutoWeekInput {
  path: string
  series: string
  passages: WeekPassage[]
  /** First date to look from; the week goes on the first `days` EMPTY dates. */
  start: string
  days: number
  guidance?: string
  /** Autopilot queued this one (0152): the server refuses it in a skipped week. */
  autopilot?: boolean
}

export type AutoWeekStatus = 'queued' | 'transcribing' | 'drafting' | 'done' | 'failed'
export interface AutoWeekJob {
  id: string
  status: AutoWeekStatus
  reason: string | null
  /** 'memo' — a sermon recording (0148); 'fallback' — Autopilot's saved topic or passage (0152). */
  source: 'memo' | 'fallback'
  /** Autopilot made it (a memo it queued, or its fallback). */
  autopilot: boolean
  series: string
  references: string[]
  startDate: string
  days: number
  saved: string[]
  flagged: number
  seen: boolean
  retryable: boolean
  /** Still "running" long after it should have finished: the server lost it. */
  stale: boolean
  createdAt: string
}
/** Running from the leader's point of view: not finished, and not lost. */
export const autoWeekRunning = (j: AutoWeekJob) => !j.stale && j.status !== 'done' && j.status !== 'failed'
/** Needs the leader: failed, or lost mid-run. */
export const autoWeekFailed = (j: AutoWeekJob) => j.status === 'failed' || (j.stale && j.status !== 'done')

export async function queueAutoWeek(churchId: string, input: AutoWeekInput): Promise<Res<{ job: string }>> {
  if (!online()) return { ok: false, reason: 'unavailable' }
  const r = await invokeDraft(churchId, {
    mode: 'auto_week', path: input.path, series: cleanLine(input.series, SERIES_MAX) ?? '',
    passages: input.passages, start: input.start, days: input.days, guidance: input.guidance?.trim() || undefined,
    autopilot: input.autopilot || undefined,
  })
  if (r.kind === 'lost') return { ok: false, reason: 'no_reply' }
  const d = r.data
  if (!d.ok || typeof d.job !== 'string') return { ok: false, reason: String(d.reason ?? 'unavailable') }
  return { ok: true, data: { job: d.job } }
}

export async function retryAutoWeek(churchId: string, job: string): Promise<Res<{ job: string }>> {
  if (!online()) return { ok: false, reason: 'unavailable' }
  const r = await invokeDraft(churchId, { mode: 'auto_week_retry', job })
  if (r.kind === 'lost') return { ok: false, reason: 'no_reply' }
  const d = r.data
  if (!d.ok) return { ok: false, reason: String(d.reason ?? 'unavailable') }
  return { ok: true, data: { job } }
}

export async function fetchAutoWeeks(churchId: string): Promise<Res<AutoWeekJob[]>> {
  const r = await call<{ jobs?: Array<Record<string, any>> }>('church_auto_weeks', { p_church_id: churchId })
  if (!r.ok) return r
  return {
    ok: true,
    data: (r.data.jobs ?? []).map((j) => ({
      id: String(j.id),
      status: j.status as AutoWeekStatus,
      reason: j.reason ? String(j.reason) : null,
      source: j.source === 'fallback' ? 'fallback' : 'memo',
      autopilot: j.autopilot === true,
      series: String(j.series ?? ''),
      references: Array.isArray(j.references) ? j.references.map(String) : [],
      startDate: String(j.start_date ?? ''),
      days: Number(j.days) || 0,
      saved: Array.isArray(j.saved) ? j.saved.map(String) : [],
      flagged: Number(j.flagged) || 0,
      seen: j.seen === true,
      retryable: j.retryable === true,
      stale: j.stale === true,
      createdAt: String(j.created_at ?? ''),
    })),
  }
}

export const dismissAutoWeek = (jobId: string) => call('dismiss_church_auto_week', { p_job_id: jobId })

// ---------------------------------------------------------------------------
// Players asking about the church from a leader's player card (0149). The
// church's verified leadership reads them as a plain list, newest first, and
// dismisses them. Since 0155 leadership can answer each one ONCE
// (`replyJoinInquiry`); the answer reaches the asker's mailbox and nobody else.
// ---------------------------------------------------------------------------
export interface JoinInquiry {
  username: string
  avatarEmoji: string | null
  avatarCharacter: import('@/data/avatar').AvatarSpec | null
  note: string
  at: string
  /** They have since joined this church, or another one. */
  joinedHere: boolean
  joinedElsewhere: boolean
  /** The church's one reply (0155), and when it was sent. */
  reply: string | null
  repliedAt: string | null
}

/** KEEP IN SYNC with `church_clean_line(..., 280)` in reply_church_join_inquiry (0155). */
export const INQUIRY_REPLY_MAX = 280

export async function fetchJoinInquiries(churchId: string): Promise<Res<JoinInquiry[]>> {
  const r = await call<{ inquiries?: Array<Record<string, any>> }>('church_join_inquiry_list', { p_church_id: churchId })
  if (!r.ok) return r
  return {
    ok: true,
    data: (r.data.inquiries ?? []).map((i) => ({
      username: String(i.username ?? ''),
      avatarEmoji: i.avatar_emoji ?? null,
      avatarCharacter: i.avatar_character ?? null,
      note: String(i.note ?? ''),
      at: String(i.at ?? ''),
      joinedHere: i.joined_here === true,
      joinedElsewhere: i.joined_elsewhere === true,
      reply: typeof i.reply === 'string' && i.reply ? i.reply : null,
      repliedAt: typeof i.replied_at === 'string' ? i.replied_at : null,
    })),
  }
}

/** Answer one inquiry, once. `joined` says where the asker has gone since, if anywhere. */
export async function replyJoinInquiry(churchId: string, username: string, message: string): Promise<Res<{ joined: 'here' | 'elsewhere' | null }>> {
  const text = message.replace(/\s+/g, ' ').trim().slice(0, INQUIRY_REPLY_MAX)
  if (text.length < 2) return { ok: false, reason: 'bad_note' }
  const r = await call<{ joined?: string | null }>('reply_church_join_inquiry', { p_church_id: churchId, p_username: username, p_message: text })
  if (!r.ok) return r
  return { ok: true, data: { joined: r.data.joined === 'here' || r.data.joined === 'elsewhere' ? r.data.joined : null } }
}

export const dismissJoinInquiry = (churchId: string, username: string) =>
  call('dismiss_church_join_inquiry', { p_church_id: churchId, p_username: username })

// Is a series landing? (0150) Counts and percentages about the congregation,
// per series the church has run: how many current members played at least one
// live day ("engaged") and how many played every live day ("completed" — "kept
// up so far" while it runs). Never a name, never a per-person number.
// docs/CHURCH-PACKAGES.md → "Series numbers".
// ---------------------------------------------------------------------------
export interface SeriesLanding {
  name: string
  startDate: string
  endDate: string
  days: number
  liveDays: number
  status: 'upcoming' | 'running' | 'finished'
  engaged: number
  completed: number
  /** Out of the church's CURRENT members; null before any day is live. */
  engagedPct: number | null
  completedPct: number | null
}

export async function fetchSeriesLanding(churchId: string): Promise<Res<{ members: number; series: SeriesLanding[] }>> {
  const r = await call<{ members?: number; series?: Array<Record<string, any>> }>('church_series_landing', {
    p_church_id: churchId,
    p_local_date: todayLocalDate(),
  })
  if (!r.ok) return r
  return {
    ok: true,
    data: {
      members: Number(r.data.members) || 0,
      series: (r.data.series ?? []).map((s) => ({
        name: String(s.name ?? ''),
        startDate: String(s.start_date ?? ''),
        endDate: String(s.end_date ?? ''),
        days: Number(s.days) || 0,
        liveDays: Number(s.live_days) || 0,
        status: s.status === 'finished' || s.status === 'running' ? s.status : 'upcoming',
        engaged: Number(s.engaged) || 0,
        completed: Number(s.completed) || 0,
        engagedPct: s.engaged_pct == null ? null : Number(s.engaged_pct),
        completedPct: s.completed_pct == null ? null : Number(s.completed_pct),
      })),
    },
  }
}

/**
 * The series in focus for the quiet fold (0156, `church_quiet_series`): the
 * running one, else one that finished in the last two weeks, and the current
 * members who have not played a single live day of it — 0150's "not engaged".
 * Verified leadership only; shown only inside the folded quiet section.
 */
export interface QuietSeries {
  series: { name: string; status: 'running' | 'finished'; startDate: string; endDate: string } | null
  notEngaged: Set<string>
}
export async function fetchQuietSeries(churchId: string): Promise<Res<QuietSeries>> {
  const r = await call<{ series?: Record<string, any> | null; not_engaged?: string[] }>('church_quiet_series', {
    p_church_id: churchId,
    p_local_date: todayLocalDate(),
  })
  if (!r.ok) return r
  const s = r.data.series
  return {
    ok: true,
    data: {
      series: s && s.name ? {
        name: String(s.name),
        status: s.status === 'finished' ? 'finished' : 'running',
        startDate: String(s.start_date ?? ''),
        endDate: String(s.end_date ?? ''),
      } : null,
      notEngaged: new Set((r.data.not_engaged ?? []).map((u) => String(u).toLowerCase())),
    },
  }
}

// ---------------------------------------------------------------------------
// Small groups (0151). Verified leadership sorts members into groups and marks
// group leaders; a group leader reads their own group and the week's
// discussion questions. Names and faces only — no score reaches either read.
// docs/CHURCH-GROUPS.md.
// ---------------------------------------------------------------------------
export const GROUP_NAME_MAX = 60
export const GROUP_DESC_MAX = 240
export const DISCUSSION_MAX = 3
export const DISCUSSION_LINE_MAX = 240

export interface GroupPerson {
  username: string
  avatarEmoji: string | null
  avatarCharacter: import('@/data/avatar').AvatarSpec | null
  role: 'member' | 'leader'
  isMe?: boolean
}

export interface ChurchGroup {
  id: string
  name: string
  description: string | null
  members: GroupPerson[]
}

export interface GroupDiscussionDay {
  date: string
  reference: string
  series: string | null
  questions: string[]
}

export interface MyGroup extends ChurchGroup {
  today: string
  discussion: GroupDiscussionDay[]
}

/** The server's `church_clean_discussion`: 0-3 lines of 8-240 characters. */
export function cleanDiscussion(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x): x is string => typeof x === 'string')
    .map((x) => cleanLine(x.replace(/\s+/g, ' '), DISCUSSION_LINE_MAX) ?? '')
    .filter((x) => x.length >= 8)
    .slice(0, DISCUSSION_MAX)
}

const person = (m: any): GroupPerson => ({
  username: String(m?.username ?? ''),
  avatarEmoji: m?.avatar_emoji ?? null,
  avatarCharacter: m?.avatar_character ?? null,
  role: m?.role === 'leader' ? 'leader' : 'member',
  ...(m?.is_me ? { isMe: true } : {}),
})
const group = (g: any): ChurchGroup => ({
  id: String(g?.id ?? ''),
  name: String(g?.name ?? ''),
  description: g?.description ? String(g.description) : null,
  members: Array.isArray(g?.members) ? g.members.map(person) : [],
})

export async function fetchChurchGroups(churchId: string): Promise<Res<ChurchGroup[]>> {
  const r = await call<{ groups?: unknown[] }>('church_groups_list', { p_church_id: churchId })
  if (!r.ok) return r
  return { ok: true, data: (r.data.groups ?? []).map(group) }
}

/** Create (no id) or rename a group. */
export async function saveChurchGroup(churchId: string, g: { id?: string; name: string; description?: string | null }): Promise<Res<{ id: string }>> {
  const name = cleanLine(g.name, GROUP_NAME_MAX)
  if (!name) return { ok: false, reason: 'bad_name' }
  const r = await call<{ id?: string }>('save_church_group', {
    p_church_id: churchId,
    p_group_id: g.id ?? null,
    p_name: name,
    p_description: cleanLine(g.description ?? '', GROUP_DESC_MAX) ?? '',
  })
  if (!r.ok) return r
  return { ok: true, data: { id: String(r.data.id ?? g.id ?? '') } }
}

export async function archiveChurchGroup(churchId: string, groupId: string): Promise<Res<unknown>> {
  return call('archive_church_group', { p_church_id: churchId, p_group_id: groupId })
}

/** Put a member in a group (moving them from any other), set their role, or take them out (groupId null). */
export async function setGroupMember(churchId: string, username: string, groupId: string | null, role: 'member' | 'leader' = 'member'): Promise<Res<unknown>> {
  return call('set_church_group_member', { p_church_id: churchId, p_username: username, p_group_id: groupId, p_role: role })
}

/** A day's discussion questions, as leadership sees them (draft or approved). */
export async function fetchDiscussion(churchId: string, date: string): Promise<Res<string[]>> {
  const r = await call<{ questions?: unknown }>('church_discussion_for', { p_church_id: churchId, p_drop_date: date })
  if (!r.ok) return r
  return { ok: true, data: cleanDiscussion(r.data.questions) }
}

/** Save (or, with an empty list, clear) a day's discussion questions. The day must exist. */
export async function saveDiscussion(churchId: string, date: string, questions: string[], generated = false): Promise<Res<string[]>> {
  const r = await call<{ questions?: unknown }>('set_church_discussion', {
    p_church_id: churchId, p_drop_date: date, p_questions: cleanDiscussion(questions), p_generated: generated,
  })
  if (!r.ok) return r
  return { ok: true, data: cleanDiscussion(r.data.questions) }
}

/** The group the caller LEADS, with this week's questions. Null for everybody else. */
export async function fetchMyGroup(): Promise<Res<MyGroup | null>> {
  const r = await call<any>('my_church_group', { p_local_date: todayLocalDate() })
  if (!r.ok) return r
  const g = r.data
  if (!g || !g.id) return { ok: true, data: null }
  return {
    ok: true,
    data: {
      ...group(g),
      today: String(g.today ?? todayLocalDate()),
      discussion: (Array.isArray(g.discussion) ? g.discussion : []).map((d: any) => ({
        date: String(d?.date ?? ''),
        reference: String(d?.reference ?? ''),
        series: d?.series ? String(d.series) : null,
        questions: cleanDiscussion(d?.questions),
      })).filter((d: GroupDiscussionDay) => d.questions.length > 0),
    },
  }
}

/**
 * A group leader's members with no play in seven days (0156,
 * `my_church_group_quiet`) — names and faces only, the leadership fold's rule.
 * null for anybody who leads no group (and for an unverified church).
 */
export async function fetchMyGroupQuiet(): Promise<Res<GroupPerson[] | null>> {
  const r = await call<any>('my_church_group_quiet', { p_local_date: todayLocalDate() })
  if (!r.ok) return r
  if (!r.data || !Array.isArray(r.data.quiet)) return { ok: true, data: null }
  return { ok: true, data: r.data.quiet.map((m: any) => person({ ...m, role: 'member' })) }
}

// ---------------------------------------------------------------------------
// Autopilot (0152). One switch per church: a sermon memo sent through Plan
// drafts its own week, and when none arrives by the cutoff the pastor's saved
// FALLBACK (a topic or one passage) drafts it instead — the same 0148 job and
// the same week call, drafts only. There is no cron, so the cutoff is noticed
// by `autopilotTick`, which the dashboard and the church tab send on load.
// docs/CHURCH-SHARED-VERSE.md → "Autopilot".
// ---------------------------------------------------------------------------
export type AutopilotState = 'off' | 'paused' | 'memo' | 'waiting' | 'due' | 'fallback' | 'no_source' | 'covered'
export interface AutopilotFallback {
  kind: 'topic' | 'passage'
  label: string
  series: string
  references: string[]
}
export interface Autopilot {
  enabled: boolean
  tz: string
  /** 0 = Sunday … 6 = Saturday, in the church's time zone. */
  cutoffDow: number
  /** Minutes after midnight. */
  cutoffMinute: number
  fallback: AutopilotFallback | null
  state: AutopilotState
  weekStart: string
  cutoffAt: string
  windowFrom: string
  windowTo: string
  job: { id: string; status: AutoWeekStatus } | null
}
export const AUTOPILOT_DEFAULT_CUTOFF = { dow: 1, minute: 21 * 60 }

function toAutopilot(d: any): Autopilot {
  const st = d?.settings ?? {}
  const fb = st.fallback
  return {
    enabled: st.enabled === true,
    tz: String(st.tz ?? 'America/New_York'),
    cutoffDow: Number.isInteger(st.cutoff_dow) ? st.cutoff_dow : AUTOPILOT_DEFAULT_CUTOFF.dow,
    cutoffMinute: Number.isInteger(st.cutoff_minute) ? st.cutoff_minute : AUTOPILOT_DEFAULT_CUTOFF.minute,
    fallback: fb && (fb.kind === 'topic' || fb.kind === 'passage')
      ? { kind: fb.kind, label: String(fb.label ?? ''), series: String(fb.series ?? ''), references: Array.isArray(fb.references) ? fb.references.map(String) : [] }
      : null,
    state: (['off', 'paused', 'memo', 'waiting', 'due', 'fallback', 'no_source', 'covered'].includes(d?.state) ? d.state : 'off') as AutopilotState,
    weekStart: String(d?.week_start ?? ''),
    cutoffAt: String(d?.cutoff_at ?? ''),
    windowFrom: String(d?.window_from ?? ''),
    windowTo: String(d?.window_to ?? ''),
    job: d?.job?.id ? { id: String(d.job.id), status: d.job.status as AutoWeekStatus } : null,
  }
}

export async function fetchAutopilot(churchId: string): Promise<Res<Autopilot>> {
  const r = await call<any>('church_autopilot', { p_church_id: churchId })
  return r.ok ? { ok: true, data: toAutopilot(r.data) } : r
}

/**
 * Ask the server whether the week is due and, if it is, to settle it (a
 * fallback job, or "skipped — no source"). Sent on load by the dashboard and
 * the church tab; changes nothing before the cutoff, or when Autopilot is off.
 */
export async function autopilotTick(churchId: string): Promise<Res<Autopilot>> {
  if (!online()) return { ok: false, reason: 'unavailable' }
  const r = await invokeDraft(churchId, { mode: 'autopilot_tick' })
  if (r.kind === 'lost') return { ok: false, reason: 'unavailable' }
  const d = r.data as any
  if (!d.ok) return { ok: false, reason: String(d.reason ?? 'unavailable') }
  return { ok: true, data: toAutopilot(d) }
}

export interface AutopilotFallbackInput {
  kind: 'topic' | 'passage'
  label: string
  series: string
  guidance: string
  passages: WeekPassage[]
}

export async function saveAutopilot(churchId: string, s: {
  /** null clears the fallback; 'keep' leaves the saved one (no re-resolving, no unit spent). */
  enabled: boolean; tz: string; cutoffDow: number; cutoffMinute: number; fallback: AutopilotFallbackInput | null | 'keep'
}): Promise<Res<Autopilot>> {
  const r = await call<any>('set_church_autopilot', {
    p_church_id: churchId,
    p_enabled: s.enabled,
    p_tz: s.tz,
    p_cutoff_dow: s.cutoffDow,
    p_cutoff_minute: s.cutoffMinute,
    p_fallback: s.fallback,
  })
  return r.ok ? { ok: true, data: toAutopilot(r.data) } : r
}

export async function setAutopilotSkip(churchId: string, skip: boolean): Promise<Res<Autopilot>> {
  const r = await call<any>('set_church_autopilot_skip', { p_church_id: churchId, p_skip: skip })
  return r.ok ? { ok: true, data: toAutopilot(r.data) } : r
}

/**
 * Turn a fallback the pastor typed into what a week is drafted from, exactly
 * as the topic and passage sources do: BSB verses fetched here, a topic
 * anchored by the curated catalog or (one draft unit) by `church-draft`'s
 * topic mode. Done once, when the setting is SAVED, so the server never has
 * to fetch scripture at the cutoff.
 */
export async function resolveAutopilotFallback(
  churchId: string,
  kind: 'topic' | 'passage',
  label: string,
): Promise<Res<AutopilotFallbackInput>> {
  const text = label.trim()
  if (!text) return { ok: false, reason: kind === 'topic' ? 'needs_topic' : 'bad_reference' }
  if (kind === 'passage') {
    const r = await resolvePassage(text)
    if (!r.ok) return r
    return {
      ok: true,
      data: {
        kind, label: text, series: cleanLine(text, SERIES_MAX) ?? text.slice(0, SERIES_MAX),
        guidance: `Stay with ${text} itself — what it says, and what it asks of us this week.`.slice(0, GUIDANCE_MAX),
        passages: [r.data],
      },
    }
  }
  const topic = topicByLabel(text) ?? freeTopic(text)
  let refs = topic.passages
  let series = cleanLine(topic.series ?? topic.label, SERIES_MAX) ?? text.slice(0, SERIES_MAX)
  if (!refs.length) {
    const p = await planTopic(churchId, topic.label, topic.book)
    if (!p.ok) return p
    refs = p.data.passages
    series = cleanLine(p.data.series, SERIES_MAX) ?? series
  }
  const resolved = await Promise.all(refs.map((r) => resolvePassage(r)))
  const passages = resolved.flatMap((r) => (r.ok ? [r.data] : []))
  while (passages.length > 1 && scriptureChars(passages) > SCRIPTURE_CHARS_MAX) passages.pop()
  if (!passages.length || scriptureChars(passages) > SCRIPTURE_CHARS_MAX) return { ok: false, reason: 'passage_unavailable' }
  return {
    ok: true,
    data: {
      kind, label: topic.label.slice(0, 80), series,
      guidance: `This week the congregation is studying “${topic.label}”. Keep every day on that topic.`.slice(0, GUIDANCE_MAX),
      passages,
    },
  }
}

// ---------------------------------------------------------------------------
// The pastoral prayer list (0153). Verified leadership of THIS church sees the
// Prayer Wall notes its current members SIGNED in the last thirty days, newest
// first, with no count about anybody. `prayed` is the caller's own private
// mark — not a kneeling: no XP, no lantern, and nobody else ever sees it.
// ---------------------------------------------------------------------------

export interface PastoralPrayer {
  id: string
  category: string
  line: string | null
  createdAt: string
  state: 'open' | 'answered' | 'ended'
  answeredAt: string | null
  username: string
  avatarEmoji: string | null
  avatarCharacter: any | null
  prayed: boolean
  /** The leader's own private "Followed up" (0156) — seen by nobody else. */
  followedUp: boolean
}

const pastoralPrayer = (n: any): PastoralPrayer => ({
  id: String(n?.id ?? ''),
  category: String(n?.category ?? ''),
  line: n?.line ? String(n.line) : null,
  createdAt: String(n?.created_at ?? ''),
  state: n?.state === 'answered' ? 'answered' : n?.state === 'open' ? 'open' : 'ended',
  answeredAt: n?.answered_at ? String(n.answered_at) : null,
  username: String(n?.username ?? ''),
  avatarEmoji: n?.avatar_emoji ?? null,
  avatarCharacter: n?.avatar_character ?? null,
  prayed: n?.prayed === true,
  followedUp: n?.followed_up === true,
})

export async function fetchChurchPrayerList(churchId: string): Promise<Res<PastoralPrayer[]>> {
  const r = await call<{ notes?: unknown[] }>('church_prayer_list', { p_church_id: churchId })
  if (!r.ok) return r
  return { ok: true, data: (r.data.notes ?? []).map(pastoralPrayer) }
}

export async function markChurchPrayer(churchId: string, requestId: string, prayed: boolean): Promise<Res<{ prayed: boolean }>> {
  const r = await call<{ prayed?: boolean }>('mark_church_prayer', { p_church_id: churchId, p_request_id: requestId, p_prayed: prayed })
  if (!r.ok) return r
  return { ok: true, data: { prayed: r.data.prayed === true } }
}

/** The leader's private "Followed up" on a note (0156). Not a kneeling, not told to anybody. */
export async function followUpChurchPrayer(churchId: string, requestId: string, followed: boolean): Promise<Res<{ followedUp: boolean }>> {
  const r = await call<{ followed_up?: boolean }>('follow_up_church_prayer', { p_church_id: churchId, p_request_id: requestId, p_followed: followed })
  if (!r.ok) return r
  return { ok: true, data: { followedUp: r.data.followed_up === true } }
}

// ---------------------------------------------------------------------------
// The Monday digest (0154, docs/CHURCH-DIGEST.md). PER LEADER: the switch is
// the caller's own inbox for this church, never a co-leader's. Verified
// leadership only; a free claim is refused by the server.
// ---------------------------------------------------------------------------

export async function fetchDigestSetting(churchId: string): Promise<Res<{ enabled: boolean; hasEmail: boolean }>> {
  const r = await call<{ enabled?: boolean; has_email?: boolean }>('church_digest_setting', { p_church_id: churchId })
  if (!r.ok) return r
  return { ok: true, data: { enabled: r.data.enabled === true, hasEmail: r.data.has_email !== false } }
}

export async function setDigest(churchId: string, enabled: boolean): Promise<Res<{ enabled: boolean }>> {
  const r = await call<{ enabled?: boolean }>('set_church_digest', { p_church_id: churchId, p_enabled: enabled })
  if (!r.ok) return r
  return { ok: true, data: { enabled: r.data.enabled === true } }
}

/** Send this week's digest to the caller's own address now (the `church-digest` function). */
export async function sendDigestTest(churchId: string): Promise<Res<{ to: string | null }>> {
  if (!online()) return { ok: false, reason: 'unavailable' }
  const { data, error } = await supabase!.functions.invoke('church-digest', { body: { action: 'test', church_id: churchId } })
  let reply: Record<string, any> | null = !error && data && typeof data === 'object' ? (data as Record<string, any>) : null
  if (error) {
    const ctx = (error as { context?: unknown }).context
    if (ctx instanceof Response) { try { reply = await ctx.json() } catch { /* no body */ } }
  }
  if (!reply) return { ok: false, reason: 'unavailable' }
  if (reply.ok !== true) return { ok: false, reason: String(reply.reason ?? 'unavailable') }
  return { ok: true, data: { to: reply.to ? String(reply.to) : null } }
}

// ---------------------------------------------------------------------------
// Auto-publish (0176). One opt-in switch per church: a draft still waiting at
// 8pm the night before (church time, Autopilot's clock) goes live by itself,
// approved as the leader who turned it on. Only drafts, never a flagged one,
// never an approved day; every day it publishes comes back in `recent` so
// Home can say so. docs/CHURCH-SHARED-VERSE.md → "Auto-publish".
// ---------------------------------------------------------------------------
export interface AutoPublished { date: string; reference: string; publishedAt: string }
export interface AutoPublish { enabled: boolean; hour: number; recent: AutoPublished[] }

function toAutoPublish(d: any): AutoPublish {
  return {
    enabled: d?.enabled === true,
    hour: Number.isInteger(d?.hour) ? d.hour : 20,
    recent: Array.isArray(d?.recent)
      ? d.recent.filter((x: any) => typeof x?.date === 'string' && typeof x?.reference === 'string')
          .map((x: any) => ({ date: x.date, reference: x.reference, publishedAt: String(x.published_at ?? '') }))
      : [],
  }
}

export async function fetchAutoPublish(churchId: string): Promise<Res<AutoPublish>> {
  const r = await call<any>('church_auto_publish', { p_church_id: churchId })
  return r.ok ? { ok: true, data: toAutoPublish(r.data) } : r
}

export async function setAutoPublish(churchId: string, on: boolean): Promise<Res<AutoPublish>> {
  const r = await call<any>('set_church_auto_publish', { p_church_id: churchId, p_on: on })
  return r.ok ? { ok: true, data: toAutoPublish(r.data) } : r
}
