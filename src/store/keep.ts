import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth'
import {
  EMPTY_COUNTERS,
  ownedDecor,
  planMove,
  planPlacement,
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

/** anchor id -> packed decor value (`keep_woven_rug`, `keep_woven_rug.2`). */
export type Placements = Record<string, string>

/** What a `place()` turned out to be, so the UI can chime for a merge. */
export interface PlaceResult {
  /** The anchor that actually changed — not always the one that was tapped. */
  anchor: string
  /** True when this went into a copy already out instead of filling the spot. */
  merged: boolean
  /** The tier the object ended up at. */
  tier: number
  /** The packed value now on that anchor, or null when it was cleared. */
  value: string | null
}

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
  /** Decorations already given to a church — once ever each (0062). */
  offered: string[]

  load: () => Promise<void>
  /**
   * Bump one lifetime counter. `battleId` guards `battle_won`: a completed
   * battle's result screen can be revisited any number of times, and a win
   * must count exactly once.
   */
  track: (counter: KeepCounter, battleId?: string) => Promise<void>
  /**
   * Put a decoration on an anchor (null clears it).
   *
   * A duplicate MERGES rather than standing twice: the planner (data/keep
   * planPlacement) decides which anchor actually moves, and the result says so
   * for the chime and the toast. Everything about merging lives in the planner
   * — this only writes what it was told to write, so the guest path and the RPC
   * path can't disagree about what a second rug means.
   */
  place: (anchor: string, decorId: string | null) => Promise<PlaceResult>
  /**
   * Move a placed piece to another anchor of the same mount. Empty target takes
   * it, same decoration merges, anything else trades places — see planMove.
   * Returns null when the move isn't legal (wrong mount, nothing to move).
   */
  move: (from: string, to: string) => Promise<MoveResult | null>
  /**
   * Give a Grand piece to your church. Online + a church only: the points are
   * banked against a shared congregation, which is not a thing a guest device
   * has (store/church.ts). Once ever per decoration — see 0062.
   */
  offer: (decorId: string) => Promise<OfferResult>
  /** Decor ids the player has earned, derived from the counters. */
  owned: () => string[]
}

export interface MoveResult {
  merged: boolean
  swapped: boolean
  tier: number
  /** Where the moved piece ended up. */
  anchor: string
}

export interface OfferResult {
  ok: boolean
  /** Points the church banked. */
  points: number
  leveledUp: boolean
  reason?: 'offline' | 'no_church' | 'already_offered' | 'not_owned' | 'not_maxed' | 'failed'
}

export const useKeep = create<KeepState>((set, get) => ({
  loaded: false,
  counters: { ...EMPTY_COUNTERS },
  placements: {},
  offered: [],

  async load() {
    if (isOnline()) {
      // Two reads, one round trip: the offering list is a different table and
      // the sheet needs both before it can draw a give button honestly.
      const [keep, offerings] = await Promise.all([
        supabase!.rpc('my_keep'),
        supabase!.rpc('my_keep_offerings'),
      ])
      if (!keep.error && keep.data) {
        const raw = keep.data as { counters?: Partial<KeepCounters>; placements?: Placements }
        set({
          loaded: true,
          counters: { ...EMPTY_COUNTERS, ...(raw.counters ?? {}) },
          placements: raw.placements ?? {},
          offered: Array.isArray(offerings.data) ? (offerings.data as string[]) : [],
        })
        return
      }
      set({ loaded: true })
      return
    }
    const local = readLocal()
    // A guest has no church to give to, so the offering list is empty by
    // construction rather than by storage — same reason store/church.ts is
    // online-only.
    set({ loaded: true, counters: local.counters, placements: local.placements, offered: [] })
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
    // The planner reads what's already out, so a second rug lands in the first
    // one. Only ONE anchor ever changes per call — the merge target when this
    // is a merge, the tapped spot otherwise.
    const plan = planPlacement(get().placements, anchor, decorId)
    if (plan.noop) {
      return { anchor: plan.anchor, merged: false, tier: plan.tier, value: plan.value }
    }

    const next = { ...get().placements }
    if (plan.value) next[plan.anchor] = plan.value
    else delete next[plan.anchor]
    set({ placements: next })

    if (isOnline()) {
      void supabase!.rpc('set_keep_placement', { p_anchor: plan.anchor, p_decor: plan.value })
    } else {
      // Guest: merge onto what's on disk, never onto in-memory state — a hall
      // can be opened before anything called load(). Same trap as
      // store/bookAccuracy.ts:record.
      const disk = readLocal()
      const placements = { ...disk.placements }
      if (plan.value) placements[plan.anchor] = plan.value
      else delete placements[plan.anchor]
      writeLocal({ ...disk, placements })
    }

    return { anchor: plan.anchor, merged: plan.merged, tier: plan.tier, value: plan.value }
  },

  async move(from, to) {
    const plan = planMove(get().placements, from, to)
    if (!plan) return null

    const next = { ...get().placements }
    for (const w of plan.writes) {
      if (w.value) next[w.anchor] = w.value
      else delete next[w.anchor]
    }
    set({ placements: next })

    if (isOnline()) {
      // Two rows move, so two calls. set_keep_placement is per-anchor and
      // idempotent, and a half-applied move is two well-formed placements
      // rather than a lost decoration — which is why the plan never overwrites.
      for (const w of plan.writes) {
        void supabase!.rpc('set_keep_placement', { p_anchor: w.anchor, p_decor: w.value })
      }
    } else {
      const disk = readLocal()
      const placements = { ...disk.placements }
      for (const w of plan.writes) {
        if (w.value) placements[w.anchor] = w.value
        else delete placements[w.anchor]
      }
      writeLocal({ ...disk, placements })
    }

    return { merged: plan.merged, swapped: plan.swapped, tier: plan.tier, anchor: to }
  },

  async offer(decorId) {
    if (!isOnline()) return { ok: false, points: 0, leveledUp: false, reason: 'offline' }

    const { data, error } = await supabase!.rpc('offer_keep_decor', { p_decor: decorId })
    if (error) return { ok: false, points: 0, leveledUp: false, reason: 'failed' }
    const raw = data as { ok?: boolean; reason?: OfferResult['reason']; points?: number; leveled_up?: boolean }
    if (!raw?.ok) return { ok: false, points: 0, leveledUp: false, reason: raw?.reason ?? 'failed' }

    // The Grand piece left the hall; the server cleared its anchor, so re-read
    // rather than guessing which one it was.
    await get().load()
    return { ok: true, points: Number(raw.points ?? 0), leveledUp: !!raw.leveled_up }
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
