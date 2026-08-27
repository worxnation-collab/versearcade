import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth'
import {
  EMPTY_COUNTERS,
  ownedDecor,
  type KeepCounter,
  type KeepCounters,
} from '@/data/keep'

// The Keep — battle challenge counters and where your decorations hang.
//
// House two-mode shape (see store/reviews.ts): private isOnline(), a load()
// that reads whichever source is authoritative, optimistic writers.
//
// Ownership is DERIVED from the six counters (data/keep CHALLENGES), so there
// is no unlock list to sync and nothing to revoke — the counters are the whole
// truth. The counters are lifetime and only ever go up.
//
// Placements are per-player: you furnish your own view of your faction's hall,
// and the hall shows other members a deterministic sample (see keep_json,
// migration 0059). Nothing here writes shared faction state, and nothing in a
// hall is ever counted — see the header of data/keep.ts.

/** anchor id -> decor id. */
export type Placements = Record<string, string>

interface LocalKeep {
  counters: KeepCounters
  placements: Placements
  /** Real-battle ids already counted as wins, so a revisit can't double-count. */
  countedBattles: string[]
}

const EMPTY: LocalKeep = { counters: { ...EMPTY_COUNTERS }, placements: {}, countedBattles: [] }

function localKey(): string {
  const uid = useAuth.getState().profile?.id
  return uid ? `va.keep.${uid}` : 'va.keep.guest'
}

function readLocal(): LocalKeep {
  try {
    const raw = JSON.parse(localStorage.getItem(localKey()) || 'null') as LocalKeep | null
    if (raw && raw.counters) {
      return {
        counters: { ...EMPTY_COUNTERS, ...raw.counters },
        placements: raw.placements ?? {},
        countedBattles: raw.countedBattles ?? [],
      }
    }
  } catch {
    /* fall through */
  }
  return { counters: { ...EMPTY_COUNTERS }, placements: {}, countedBattles: [] }
}

function writeLocal(next: LocalKeep) {
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

interface KeepState {
  loaded: boolean
  counters: KeepCounters
  placements: Placements

  load: () => Promise<void>
  /**
   * Bump one lifetime counter. `battleId` guards `battle_won`: a completed
   * battle's result screen can be revisited any number of times, and a win
   * must count exactly once.
   */
  track: (counter: KeepCounter, battleId?: string) => Promise<void>
  /** Put a decoration on an anchor (null clears it). */
  place: (anchor: string, decorId: string | null) => Promise<void>
  /** Decor ids the player has earned, derived from the counters. */
  owned: () => string[]
}

export const useKeep = create<KeepState>((set, get) => ({
  loaded: false,
  counters: { ...EMPTY_COUNTERS },
  placements: {},

  async load() {
    if (isOnline()) {
      const { data, error } = await supabase!.rpc('my_keep')
      if (!error && data) {
        const raw = data as { counters?: Partial<KeepCounters>; placements?: Placements }
        set({
          loaded: true,
          counters: { ...EMPTY_COUNTERS, ...(raw.counters ?? {}) },
          placements: raw.placements ?? {},
        })
        return
      }
      set({ loaded: true })
      return
    }
    const local = readLocal()
    set({ loaded: true, counters: local.counters, placements: local.placements })
  },

  async track(counter, battleId) {
    // Wins are per-battle facts: read the counted list off DISK, not memory —
    // a result screen can be the first thing a session renders (deep link),
    // and an empty in-memory list would count the same win twice across
    // reloads. Same trap as store/bookAccuracy.ts:record.
    const disk = readLocal()
    if (counter === 'battle_won' && battleId) {
      if (disk.countedBattles.includes(battleId)) return
      disk.countedBattles = [...disk.countedBattles, battleId].slice(-200)
    }

    const next: KeepCounters = { ...get().counters, [counter]: (get().counters[counter] ?? 0) + 1 }
    set({ counters: next })

    if (isOnline()) {
      // The counted-battles guard still lives on this device's disk; the server
      // clamps the delta so a replayed call is worth at most one step of a
      // cosmetic ladder — the 0058 doctrine, nothing rankable to protect.
      writeLocal({ ...disk, counters: next })
      const { data } = await supabase!.rpc('bump_keep_counter', { p_counter: counter, p_delta: 1 })
      const raw = data as { counters?: Partial<KeepCounters> } | null
      if (raw?.counters) set({ counters: { ...EMPTY_COUNTERS, ...raw.counters } })
      return
    }

    // Guest: merge onto what's on disk, never onto in-memory state.
    writeLocal({
      ...disk,
      counters: { ...disk.counters, [counter]: (disk.counters[counter] ?? 0) + 1 },
    })
  },

  async place(anchor, decorId) {
    const next = { ...get().placements }
    if (decorId) next[anchor] = decorId
    else delete next[anchor]
    set({ placements: next })

    if (isOnline()) {
      void supabase!.rpc('set_keep_placement', { p_anchor: anchor, p_decor: decorId })
      return
    }
    const disk = readLocal()
    const placements = { ...disk.placements }
    if (decorId) placements[anchor] = decorId
    else delete placements[anchor]
    writeLocal({ ...disk, placements })
  },

  owned() {
    return ownedDecor(get().counters)
  },
}))

// ── The faction hall, for the sheet ─────────────────────────────────────────

export interface KeepMember {
  username: string
  avatarEmoji: string
  avatarCharacter?: import('@/types').AvatarSpec | null
  isMe: boolean
}

export interface FactionKeep {
  wins: number
  members: KeepMember[]
  memberTotal: number
  /** anchor -> decor id: the viewer's own placements where they have them,
   *  backfilled with a stable sample of other members'. Never counted. */
  placements: Placements
}

/** Load a faction's hall. Online only — a guest has no faction, and their own
 *  keep renders straight from the store. */
export async function loadFactionKeep(denomination: string): Promise<FactionKeep | null> {
  if (!isOnline()) return null
  const { data, error } = await supabase!.rpc('keep_json', { p_denomination: denomination })
  if (error || !data) return null
  const raw = data as {
    wins?: number
    member_total?: number
    members?: { username: string; avatar_emoji?: string; avatar_character?: unknown; is_me?: boolean }[]
    placements?: Placements
  }
  return {
    wins: raw.wins ?? 0,
    memberTotal: raw.member_total ?? 0,
    members: (raw.members ?? []).map((m) => ({
      username: m.username,
      avatarEmoji: m.avatar_emoji ?? '😇',
      avatarCharacter: (m.avatar_character as KeepMember['avatarCharacter']) ?? null,
      isMe: !!m.is_me,
    })),
    placements: raw.placements ?? {},
  }
}
