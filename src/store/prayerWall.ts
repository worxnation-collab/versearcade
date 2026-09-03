import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { todayLocalDate } from '@/lib/date'
import { useAuth } from './auth'
import { useSeason } from './season'
import {
  PRAY_FOR_DAILY_CAP,
  prayForMilestoneReached,
  type PrayerCategory,
  type PrayForMilestone,
} from '@/data/prayerWall'
import type { AvatarSpec } from '@/data/avatar'

// The Prayer Wall — your note in it, and the notes it hands you.
//
// ONLINE-ONLY, and inherited rather than chosen — the same break with the
// two-mode invariant that store/washing.ts makes, for the same reason. A note
// needs somebody else to kneel at it and a candle needs somebody else's note:
// a guest has neither, and a local wall would be a person praying over their
// own requests, which is what the Upper Room's prayer sheet already is.
//
// If this ever should work offline, the shape is the keep's: a `va.wall` blob
// keyed per account. It isn't wanted, and the reason is worth writing down —
// the XP would then be client-granted, and this store's whole safety argument
// is that the server counts the rows and pays the one point.
//
// The XP lands in profiles.xp server-side (0099). We fold the returned xp/level
// back into the auth profile rather than re-fetching — the numbers are the
// SERVER'S, not a guess, so there is nothing to roll back.

function isOnline(): boolean {
  const a = useAuth.getState()
  return !!supabase && a.mode === 'online' && a.isAuthed
}

/** A note as a STRANGER is handed it. No count, and no name unless signed. */
export interface DealtNote {
  id: string
  category: PrayerCategory
  signed: boolean
  createdAt: string
  /** Only for church-mates and buddies of the requester; null otherwise. */
  line: string | null
  username?: string
  avatarEmoji?: string
  avatarCharacter?: AvatarSpec | null
  denomination?: string | null
  /** Set on the answered notices and the wall's stars. */
  answeredAt?: string
}

/** Your own note, as only you see it. The one place a tally exists. */
export interface MyNote {
  id: string
  category: PrayerCategory
  line: string | null
  signed: boolean
  createdAt: string
  expiresAt: string
  renewed: boolean
  answeredAt: string | null
  withdrawnAt: string | null
  reported: boolean
  open: boolean
  /** Kneelings over this note, lifetime. Yours to see and nobody else's. */
  prayedTotal: number
  /** Somebody knelt in the last day. "Today, yes" or nothing — the lamp's shape. */
  lit: boolean
}

export type PrayResult = {
  ok: boolean
  reason?: 'offline' | 'not_found' | 'self' | 'closed' | 'already' | 'failed'
  awarded?: number
  milestone?: PrayForMilestone | null
  leveledUp?: boolean
}

export type PostResult = {
  ok: boolean
  reason?: 'offline' | 'bad_category' | 'active' | 'failed'
}

interface PrayerWallState {
  loaded: boolean
  /** The server has 0099. False against an older backend, which draws nothing. */
  available: boolean
  cap: number
  /** Kneelings today, against PRAY_FOR_DAILY_CAP. */
  today: number
  /** Kneelings lifetime — the ladder's currency and the Journal's number. */
  lifetime: number
  /** Notes in the wall tonight. A number about the room, never about a person. */
  wallCount: number
  mine: MyNote | null
  /** Notes you knelt at that have since been answered. */
  answered: DealtNote[]
  /** Answered this week, shining on the wall. */
  stars: DealtNote[]
  /** The note the wall has handed you this sitting, if any. */
  current: DealtNote | null
  /** True once a draw came back empty — the wall has nothing for you tonight. */
  quiet: boolean
  drawing: boolean

  load: () => Promise<void>
  post: (category: PrayerCategory, line: string, signed: boolean) => Promise<PostResult>
  withdraw: () => Promise<void>
  renew: () => Promise<void>
  markAnswered: () => Promise<void>
  /** Ask the wall for a note. `skip` passes on the one in hand. */
  draw: (skip?: boolean) => Promise<DealtNote | null>
  pray: () => Promise<PrayResult>
  report: () => Promise<void>
  /** Kneelings left today. */
  remaining: () => number
}

function toNote(raw: Record<string, unknown>): DealtNote {
  return {
    id: String(raw.id),
    category: raw.category as PrayerCategory,
    signed: raw.signed === true,
    createdAt: String(raw.created_at ?? ''),
    line: typeof raw.line === 'string' && raw.line ? raw.line : null,
    username: typeof raw.username === 'string' ? raw.username : undefined,
    avatarEmoji: typeof raw.avatar_emoji === 'string' ? raw.avatar_emoji : undefined,
    avatarCharacter: (raw.avatar_character as AvatarSpec | null | undefined) ?? null,
    denomination: (raw.denomination as string | null | undefined) ?? null,
    answeredAt: typeof raw.answered_at === 'string' ? raw.answered_at : undefined,
  }
}

function toMine(raw: Record<string, unknown> | null): MyNote | null {
  if (!raw || !raw.id) return null
  return {
    id: String(raw.id),
    category: raw.category as PrayerCategory,
    line: typeof raw.line === 'string' && raw.line ? raw.line : null,
    signed: raw.signed === true,
    createdAt: String(raw.created_at ?? ''),
    expiresAt: String(raw.expires_at ?? ''),
    renewed: raw.renewed === true,
    answeredAt: typeof raw.answered_at === 'string' ? raw.answered_at : null,
    withdrawnAt: typeof raw.withdrawn_at === 'string' ? raw.withdrawn_at : null,
    reported: raw.reported === true,
    open: raw.open === true,
    prayedTotal: Number(raw.prayed_total ?? 0),
    lit: raw.lit === true,
  }
}

// The dealt notes this sitting has passed on, so "another one" never hands the
// same note straight back. Session-only on purpose: tomorrow the wall may hand
// it to you again, and should.
const skipped: string[] = []

export const usePrayerWall = create<PrayerWallState>((set, get) => ({
  loaded: false,
  available: false,
  cap: PRAY_FOR_DAILY_CAP,
  today: 0,
  lifetime: 0,
  wallCount: 0,
  mine: null,
  answered: [],
  stars: [],
  current: null,
  quiet: false,
  drawing: false,

  async load() {
    if (!isOnline() || !supabase) { set({ loaded: true, available: false }); return }
    const { data, error } = await supabase.rpc('my_prayer_wall', { p_local_date: todayLocalDate() })
    if (error || !data) { set({ loaded: true, available: false }); return }
    const r = data as Record<string, unknown>
    set({
      loaded: true,
      available: true,
      cap: Number(r.cap ?? PRAY_FOR_DAILY_CAP),
      today: Number(r.today ?? 0),
      lifetime: Number(r.lifetime ?? 0),
      wallCount: Number(r.wall_count ?? 0),
      mine: toMine((r.mine as Record<string, unknown> | null) ?? null),
      answered: ((r.answered as Record<string, unknown>[]) ?? []).map(toNote),
      stars: ((r.stars as Record<string, unknown>[]) ?? []).map(toNote),
    })
  },

  async post(category, line, signed) {
    if (!isOnline() || !supabase) return { ok: false, reason: 'offline' }
    // Awaited, and the error checked — a bare `void supabase.rpc(...)` builds a
    // request and never sends it (see CLAUDE.md).
    const { data, error } = await supabase.rpc('post_prayer_request', {
      p_category: category,
      p_line: line.trim() || null,
      p_signed: signed,
    })
    if (error || !data) return { ok: false, reason: 'failed' }
    const r = data as Record<string, unknown>
    if (!r.ok) {
      const reason = (r.reason as PostResult['reason']) ?? 'failed'
      // Another device already tucked one in: read it back rather than lie.
      if (reason === 'active') void get().load()
      return { ok: false, reason }
    }
    set({
      mine: toMine((r.note as Record<string, unknown>) ?? null),
      wallCount: get().wallCount + 1,
    })
    return { ok: true }
  },

  async withdraw() {
    const mine = get().mine
    if (!mine || !isOnline() || !supabase) return
    // Optimistic: the note is yours and the server only refuses what is
    // already closed.
    set({ mine: { ...mine, withdrawnAt: new Date().toISOString(), open: false }, wallCount: Math.max(0, get().wallCount - 1) })
    const { error } = await supabase.rpc('withdraw_prayer_request', { p_id: mine.id })
    if (error) void get().load()
  },

  async renew() {
    const mine = get().mine
    if (!mine || !isOnline() || !supabase) return
    const { data, error } = await supabase.rpc('renew_prayer_request', { p_id: mine.id })
    if (error || !(data as { ok?: boolean })?.ok) return
    void get().load()
  },

  async markAnswered() {
    const mine = get().mine
    if (!mine || !isOnline() || !supabase) return
    set({ mine: { ...mine, answeredAt: new Date().toISOString(), open: false }, wallCount: Math.max(0, get().wallCount - 1) })
    const { error } = await supabase.rpc('answer_prayer_request', { p_id: mine.id })
    if (error) void get().load()
  },

  async draw(skip = false) {
    if (!isOnline() || !supabase) return null
    const held = get().current
    if (skip && held) skipped.push(held.id)
    set({ drawing: true, current: null })
    const { data, error } = await supabase.rpc('draw_prayer_request', {
      p_local_date: todayLocalDate(),
      p_skip: skipped,
    })
    if (error) { set({ drawing: false, quiet: true }); return null }
    if (!data) { set({ drawing: false, quiet: true }); return null }
    const note = toNote(data as Record<string, unknown>)
    set({ drawing: false, current: note, quiet: false })
    return note
  },

  async pray() {
    const note = get().current
    if (!note) return { ok: false, reason: 'not_found' }
    if (!isOnline() || !supabase) return { ok: false, reason: 'offline' }

    const { data, error } = await supabase.rpc('pray_for_request', {
      p_id: note.id,
      p_local_date: todayLocalDate(),
    })
    if (error || !data) return { ok: false, reason: 'failed' }
    const r = data as Record<string, unknown>

    if (!r.ok) {
      const reason = (r.reason as PrayResult['reason']) ?? 'failed'
      if (reason === 'already') set({ today: Number(r.today ?? get().today) })
      return { ok: false, reason }
    }

    const lifetime = Number(r.lifetime ?? get().lifetime + 1)
    // A note you knelt at is not dealt again today, so it leaves your hand.
    skipped.push(note.id)
    set({ lifetime, today: Number(r.today ?? get().today + 1) })

    // The XP is real and it's the server's number, so the profile can take it
    // straight — no refetch, no guess.
    const auth = useAuth.getState()
    if (auth.profile && r.xp != null) {
      auth.setProfileLocal({
        ...auth.profile,
        xp: Number(r.xp ?? auth.profile.xp),
        level: Number(r.level ?? auth.profile.level),
      })
    }

    // A quest may be watching. Prepacked verb — no bundled road uses it yet.
    void useSeason.getState().track('prayed_for')

    return {
      ok: true,
      awarded: Number(r.awarded ?? 0),
      milestone: prayForMilestoneReached(lifetime),
      leveledUp: r.leveled_up === true,
    }
  },

  async report() {
    const note = get().current
    if (!note || !isOnline() || !supabase) return
    skipped.push(note.id)
    set({ current: null })
    await supabase.rpc('report_prayer_request', { p_id: note.id })
  },

  remaining() {
    return Math.max(0, get().cap - get().today)
  },
}))
