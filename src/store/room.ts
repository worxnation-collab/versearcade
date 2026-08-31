import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth'
import { useSeason } from './season'
import { planRoomMove, planRoomMoveToPoint, planRoomPlacement, planRoomResize } from '@/data/room'
import type { AvatarSpec } from '@/types'

// The Upper Room — where your own furnishings sit.
//
// House two-mode shape (store/reviews.ts): private isOnline(), a load() that
// reads whichever source is authoritative, optimistic writers.
//
// Ownership is DERIVED from six lifetime numbers (data/room.ts FURNISHINGS via
// lib/roomProgress), so there is no unlock list to sync and nothing to revoke.
// This store only knows WHERE things are.
//
// Unlike the keep, nothing here is pooled: a room is one person's, and the only
// thing another player can do with it is look (loadVisitedRoom below).

/** anchor id -> packed value (`room_reed_mat`, `room_reed_mat.2`). */
export type RoomPlacements = Record<string, string>

export interface RoomPlaceResult {
  /** The anchor that actually changed — not always the one that was tapped. */
  anchor: string
  tier: number
  value: string | null
  /** The server refused or was unreachable; state has been re-read from it. */
  failed?: boolean
}

export interface RoomMoveResult {
  swapped: boolean
  tier: number
  anchor: string
}

function localKey(): string {
  const uid = useAuth.getState().profile?.id
  return uid ? `va.room.${uid}` : 'va.room.guest'
}

function readLocal(): RoomPlacements {
  try {
    return (JSON.parse(localStorage.getItem(localKey()) || '{}') as RoomPlacements) ?? {}
  } catch {
    return {}
  }
}

function writeLocal(next: RoomPlacements) {
  try {
    localStorage.setItem(localKey(), JSON.stringify(next))
  } catch {
    /* private mode / storage full — in-memory only */
  }
}

function isOnline(): boolean {
  const a = useAuth.getState()
  return !!supabase && a.mode === 'online' && a.isAuthed
}

interface RoomState {
  loaded: boolean
  placements: RoomPlacements
  load: () => Promise<void>
  /**
   * Put a furnishing on an anchor (null clears it). A duplicate MERGES rather
   * than standing twice — the planner (data/placement, through data/room)
   * decides which anchor actually moves, so the guest path and the RPC path
   * cannot disagree about what a second stool means.
   */
  place: (anchor: string, id: string | null) => Promise<RoomPlaceResult>
  /** Move a placed piece to another anchor of the same mount. */
  move: (from: string, to: string) => Promise<RoomMoveResult | null>
  /** Apply pre-planned writes (moveTo/resize) through the usual two paths. */
  arrange: (writes: { anchor: string; value: string | null }[]) => Promise<boolean>
  /** Stand the furnishing on `from` at a free point inside its mount's band. */
  moveTo: (from: string, x: number, y: number) => Promise<boolean>
  /** Resize the furnishing on `anchor`, clamped to SCALE_MIN..SCALE_MAX. */
  resize: (anchor: string, scale: number) => Promise<boolean>
}

export const useRoom = create<RoomState>((set, get) => ({
  loaded: false,
  placements: {},

  async load() {
    if (isOnline()) {
      const { data, error } = await supabase!.rpc('my_room')
      if (!error && data) {
        const raw = data as { placements?: RoomPlacements }
        set({ loaded: true, placements: raw.placements ?? {} })
        return
      }
      set({ loaded: true })
      return
    }
    set({ loaded: true, placements: readLocal() })
  },

  async place(anchor, id) {
    const plan = planRoomPlacement(get().placements, anchor, id)
    if (plan.noop) {
      return { anchor: plan.anchor, merged: false, tier: plan.tier, value: plan.value }
    }

    const next = { ...get().placements }
    if (plan.value) next[plan.anchor] = plan.value
    else delete next[plan.anchor]
    set({ placements: next })

    // Prepacked verb — a road can score furnishing your own room without a
    // release. Only an actual placement counts; a clear is a removal.
    if (plan.value) void useSeason.getState().track('room_placed')

    if (isOnline()) {
      // AWAIT, and check `error`. A postgrest-js builder is lazy: the request is
      // sent inside its then(), so `void supabase.rpc(...)` builds the call,
      // throws it away and never talks to the server. That shipped once and left
      // keep_placements at zero rows in production.
      const { error } = await supabase!.rpc('set_room_placement', {
        p_anchor: plan.anchor,
        p_item: plan.value,
      })
      if (error) {
        await get().load()
        return { anchor: plan.anchor, tier: 1, value: null, failed: true }
      }
    } else {
      // Guest: merge onto what's on DISK, never onto in-memory state — a room
      // can be opened before anything called load(). Same trap as
      // store/bookAccuracy.ts:record.
      const disk = readLocal()
      if (plan.value) disk[plan.anchor] = plan.value
      else delete disk[plan.anchor]
      writeLocal(disk)
    }

    return { anchor: plan.anchor, tier: plan.tier, value: plan.value }
  },

  async move(from, to) {
    const plan = planRoomMove(get().placements, from, to)
    if (!plan) return null

    const next = { ...get().placements }
    for (const w of plan.writes) {
      if (w.value) next[w.anchor] = w.value
      else delete next[w.anchor]
    }
    set({ placements: next })

    if (isOnline()) {
      // Two rows move, so two calls — awaited, for the reason in place(). The
      // RPC is per-anchor and idempotent, and a half-applied move is two
      // well-formed placements rather than a lost piece, which is why the
      // planner never overwrites.
      const results = await Promise.all(
        plan.writes.map((w) =>
          supabase!.rpc('set_room_placement', { p_anchor: w.anchor, p_item: w.value }),
        ),
      )
      if (results.some((r) => r.error)) {
        await get().load()
        return null
      }
    } else {
      const disk = readLocal()
      for (const w of plan.writes) {
        if (w.value) disk[w.anchor] = w.value
        else delete disk[w.anchor]
      }
      writeLocal(disk)
    }

    return { swapped: plan.swapped, tier: plan.tier, anchor: to }
  },

  // Free position and size — see store/keep.ts arrange() for why this does not
  // go through place().
  async arrange(writes) {
    if (!writes.length) return true
    const next = { ...get().placements }
    for (const w of writes) {
      if (w.value) next[w.anchor] = w.value
      else delete next[w.anchor]
    }
    set({ placements: next })
    if (isOnline()) {
      const results = await Promise.all(
        writes.map((w) => supabase!.rpc('set_room_placement', { p_anchor: w.anchor, p_item: w.value })),
      )
      if (results.some((r) => r.error)) {
        await get().load()
        return false
      }
    } else {
      const disk = readLocal()
      for (const w of writes) {
        if (w.value) disk[w.anchor] = w.value
        else delete disk[w.anchor]
      }
      writeLocal(disk)
    }
    return true
  },

  async moveTo(from, x, y) {
    const plan = planRoomMoveToPoint(get().placements, from, x, y)
    if (!plan) return false
    return get().arrange(plan.writes)
  },

  async resize(anchor, scale) {
    const plan = planRoomResize(get().placements, anchor, scale)
    if (!plan) return false
    return get().arrange(plan.writes)
  },
}))

// ── Visiting ────────────────────────────────────────────────────────────────
// The only thing anyone can do to somebody else's room. Read-only by
// construction: room_json (0069) has no write sibling, returns no numbers, and
// records nothing about the visit — there is no visitor log to build a "12
// people looked at your room" out of later.

export interface VisitedRoom {
  username: string
  avatarEmoji: string
  avatarCharacter?: AvatarSpec | null
  /** Equipped pet id — the companion standing in the room with them (0072). */
  pet?: string | null
  isMe: boolean
  /** 0-4 — the room's architecture, NOT the owner's level. */
  tier: number
  placements: RoomPlacements
}

export async function loadVisitedRoom(username: string): Promise<VisitedRoom | null> {
  if (!isOnline()) return null
  const { data, error } = await supabase!.rpc('room_json', { p_username: username })
  if (error || !data) return null
  const raw = data as {
    username?: string
    avatar_emoji?: string
    avatar_character?: unknown
    pet?: string | null
    is_me?: boolean
    tier?: number
    placements?: RoomPlacements
  }
  if (!raw.username) return null
  return {
    username: raw.username,
    avatarEmoji: raw.avatar_emoji ?? '😇',
    avatarCharacter: (raw.avatar_character as AvatarSpec | null) ?? null,
    pet: raw.pet ?? null,
    isMe: !!raw.is_me,
    tier: Math.min(4, Math.max(0, Number(raw.tier ?? 0))),
    placements: raw.placements ?? {},
  }
}
