import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth'
import { useSeason } from './season'
import { planRoomPlacement } from '@/data/room'
import { DEFAULT_ROOM_SKIN, ROOM_SKINS, type RoomSkinId } from '@/features/room/skins'
import { ARRANGEMENTS, DEFAULT_ARRANGEMENT } from '@/data/layouts'
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


function localKey(): string {
  const uid = useAuth.getState().profile?.id
  return uid ? `va.room.${uid}` : 'va.room.guest'
}

/** The chosen material. A separate key from the placements so a guest's skin
 *  survives a room being cleared, and so the two writers can't clobber. */
function skinKey(): string {
  const uid = useAuth.getState().profile?.id
  return uid ? `va.room.skin.${uid}` : 'va.room.skin.guest'
}

/** The chosen arrangement — its own key, for the same two reasons. */
function layoutKey(): string {
  const uid = useAuth.getState().profile?.id
  return uid ? `va.room.layout.${uid}` : 'va.room.layout.guest'
}

function readLocalLayout(): string {
  try {
    const raw = localStorage.getItem(layoutKey())
    return ARRANGEMENTS.some((a) => a.id === raw) ? (raw as string) : DEFAULT_ARRANGEMENT
  } catch {
    return DEFAULT_ARRANGEMENT
  }
}

function readLocalSkin(): RoomSkinId {
  try {
    const raw = localStorage.getItem(skinKey())
    return ROOM_SKINS.some((s) => s.id === raw) ? (raw as RoomSkinId) : DEFAULT_ROOM_SKIN
  } catch {
    return DEFAULT_ROOM_SKIN
  }
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
  /** What the room is made of. Free, chosen, and never a number — see
   *  features/room/skins.ts. */
  skin: RoomSkinId
  /** How the room lays itself out (`data/layouts.ts`, 0112). */
  layout: string
  load: () => Promise<void>
  /**
   * Put a furnishing on an anchor (null clears it). A duplicate MERGES rather
   * than standing twice — the planner (data/placement, through data/room)
   * decides which anchor actually moves, so the guest path and the RPC path
   * cannot disagree about what a second stool means.
   */
  place: (anchor: string, id: string | null) => Promise<RoomPlaceResult>
  /** Repaint the room. Optimistic, then persisted on whichever path applies. */
  setSkin: (id: RoomSkinId) => Promise<boolean>
  setLayout: (id: string) => Promise<boolean>
}

export const useRoom = create<RoomState>((set, get) => ({
  loaded: false,
  placements: {},
  skin: DEFAULT_ROOM_SKIN,
  layout: DEFAULT_ARRANGEMENT,

  async load() {
    if (isOnline()) {
      const { data, error } = await supabase!.rpc('my_room')
      if (!error && data) {
        const raw = data as { placements?: RoomPlacements; skin?: string; layout?: string }
        // A server without 0110 simply omits `skin`, and the room is clay —
        // which is what it has always looked like. One without 0112 omits
        // `layout`, and the room is `settled`, which is how it has always been
        // laid out. Fails closed on both.
        set({
          loaded: true,
          placements: raw.placements ?? {},
          skin: ROOM_SKINS.some((s) => s.id === raw.skin) ? (raw.skin as RoomSkinId) : DEFAULT_ROOM_SKIN,
          layout: ARRANGEMENTS.some((a) => a.id === raw.layout) ? (raw.layout as string) : DEFAULT_ARRANGEMENT,
        })
        return
      }
      set({ loaded: true })
      return
    }
    set({ loaded: true, placements: readLocal(), skin: readLocalSkin(), layout: readLocalLayout() })
  },

  async setLayout(id) {
    if (!ARRANGEMENTS.some((a) => a.id === id)) return false
    const before = get().layout
    set({ layout: id })
    if (isOnline()) {
      // Awaited and checked, the postgrest-js rule — and on a refusal the old
      // arrangement goes back rather than leaving an optimistic lie on screen.
      const { error } = await supabase!.rpc('set_room_layout', { p_layout: id })
      if (error) {
        set({ layout: before })
        return false
      }
    } else {
      try {
        localStorage.setItem(layoutKey(), id)
      } catch {
        /* private mode: re-arranged for this session only */
      }
    }
    return true
  },

  async setSkin(id) {
    if (!ROOM_SKINS.some((s) => s.id === id)) return false
    const before = get().skin
    set({ skin: id })
    if (isOnline()) {
      // Awaited and checked, the postgrest-js rule. On a refusal put the old
      // material back rather than leaving an optimistic lie on the wall.
      const { error } = await supabase!.rpc('set_room_skin', { p_skin: id })
      if (error) {
        set({ skin: before })
        return false
      }
    } else {
      try {
        localStorage.setItem(skinKey(), id)
      } catch {
        /* private mode: the room is repainted for this session only */
      }
    }
    return true
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
  /** What their room is made of — a look, exactly like their skin or pet. */
  skin: RoomSkinId
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
    skin?: string
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
    // An unknown id, a null and a server without 0110 all land on clay, which
    // is what every room looked like before this existed.
    skin: ROOM_SKINS.some((s) => s.id === raw.skin) ? (raw.skin as RoomSkinId) : DEFAULT_ROOM_SKIN,
    placements: raw.placements ?? {},
  }
}
