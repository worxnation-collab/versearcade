import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth'
import { useSeason } from './season'
import {
  plinthsEarned,
  statueById,
  weekIndex,
  type RivalryOutcome,
  type Statues,
} from '@/features/church/rivalry'
import type { Church } from '@/types'

// The weekly rivalry, and the statues a win buys.
//
// Follows the house shape: a private isOnline(), a load() that reads whichever
// source is authoritative, and a writer that updates in-memory state first so
// the UI is instant. See store/churchYard.ts, which this is modelled on.
//
// ONLINE-ONLY, inherited rather than chosen — the same break with the two-mode
// invariant store/churchYard.ts makes. The whole church feature is online-only
// because a church is a pooled, shared thing (see store/church.ts), and a
// rivalry additionally needs a second real congregation on the other end of it:
// a local weekly matchup is a church playing itself, and a locally-granted
// statue is a trophy you awarded yourself. If it is ever wanted, the shape is
// the keep's — a `va.rivalry` blob keyed per account — but the argument against
// it is the same one the Basin makes: offline, the prize would be self-granted,
// which is the one thing this feature's safety argument rests on not happening.
//
// Nothing in this store writes a score. The server sums three ledgers it wrote
// itself; the client only ever asks. Same rule as wash_feet and record_prayer.

function isOnline(): boolean {
  const a = useAuth.getState()
  return !!supabase && a.mode === 'online' && a.isAuthed
}

/** Last week's result, as the card reads it out. */
export interface RivalryResult {
  week: number
  outcome: RivalryOutcome
  mine: number
  theirs: number
  opponentName: string | null
}

export interface StatueResult {
  ok: boolean
  reason?: 'offline' | 'locked' | 'no_church' | 'failed'
}

interface RivalryState {
  loaded: boolean
  loading: boolean
  /** The current UTC rivalry week, as the server counted it. */
  week: number
  weekEndsAt: string | null
  /** Size band the church was paired in. */
  band: number
  /** This week, live. Two numbers — there is no breakdown of either, ever. */
  mine: number
  theirs: number
  /** Null on a bye: nobody in range to play this week, which is not a loss. */
  opponent: Church | null
  /** The most recent settled week, or null before a church's first one ends. */
  last: RivalryResult | null
  /** Lifetime wins. Only ever goes up — there is no revoke and no loss column. */
  wins: number
  /** What is standing in our own yard. */
  statues: Statues
  /** A visited church's yard: its statues and the wins that earned them. */
  pageStatues: Statues
  pageWins: number
  pageChurchId: string | null

  load: () => Promise<void>
  /** Raise, change or clear (statueId null) a statue. Any member may. */
  raise: (plinth: string, statueId: string | null) => Promise<StatueResult>
  /** How many plinths the congregation has earned the right to fill. */
  earned: () => number
  loadPageStatues: (churchId: string | null) => Promise<void>
}

const EMPTY = {
  week: weekIndex(),
  weekEndsAt: null,
  band: 0,
  mine: 0,
  theirs: 0,
  opponent: null,
  last: null,
  wins: 0,
  statues: {} as Statues,
}

// The RPCs speak snake_case; the app speaks camelCase. Mirrors toChurch() in
// store/church.ts — the opponent comes back through the same church_json the
// board uses, so the card draws the same building the row would.
function toChurch(raw: any): Church | null {
  if (!raw) return null
  return {
    id: raw.id,
    name: raw.name,
    address: raw.address ?? null,
    city: raw.city ?? null,
    region: raw.region ?? null,
    lat: Number(raw.lat),
    lng: Number(raw.lng),
    xp: Number(raw.xp ?? 0),
    level: Number(raw.level ?? 1),
    members: Number(raw.members ?? 0),
    skin: raw.skin ?? null,
  }
}

const OUTCOMES: RivalryOutcome[] = ['won', 'drew', 'lost', 'quiet', 'bye']

function toResult(raw: any): RivalryResult | null {
  if (!raw) return null
  // An outcome from a newer build degrades to a bye — the one outcome that
  // says nothing about anybody and shows no scoreboard.
  const outcome: RivalryOutcome = OUTCOMES.includes(raw.outcome) ? raw.outcome : 'bye'
  return {
    week: Number(raw.week ?? 0),
    outcome,
    mine: Number(raw.mine ?? 0),
    theirs: Number(raw.theirs ?? 0),
    opponentName: raw.opponent_name ?? null,
  }
}

export const useRivalry = create<RivalryState>((set, get) => ({
  loaded: false,
  loading: false,
  pageStatues: {},
  pageWins: 0,
  pageChurchId: null,
  ...EMPTY,

  async load() {
    if (!isOnline()) {
      set({ loaded: true, loading: false, ...EMPTY })
      return
    }
    set({ loading: true })
    // Awaited, and `error` checked — a postgrest-js builder is lazy and `void
    // supabase.rpc(...)` sends nothing at all (see CLAUDE.md). This call also
    // has SIDE EFFECTS on the server: it settles finished weeks and pairs the
    // current one. Dropping it silently would mean a church that never opens
    // the tab never banks the win it earned.
    const { data, error } = await supabase!.rpc('church_rivalry')
    if (error || !data) {
      set({ loaded: true, loading: false })
      return
    }
    const raw = data as Record<string, any>
    if (!raw.ok) {
      // No church picked yet. Not an error — the tab shows the picker instead.
      set({ loaded: true, loading: false, ...EMPTY })
      return
    }
    set({
      loaded: true,
      loading: false,
      week: Number(raw.week ?? weekIndex()),
      weekEndsAt: raw.week_ends_at ?? null,
      band: Number(raw.band ?? 0),
      mine: Number(raw.mine ?? 0),
      theirs: Number(raw.theirs ?? 0),
      opponent: toChurch(raw.opponent),
      last: toResult(raw.last),
      wins: Number(raw.wins ?? 0),
      statues: (raw.statues ?? {}) as Statues,
    })
  },

  async raise(plinth, statueId) {
    if (!isOnline()) return { ok: false, reason: 'offline' }
    // Mirrors the check in `set_church_statue` (0075) — the server is the one
    // that decides; this is so a locked plinth can't be tapped into a failed
    // round trip. Keep plinthsEarned() and the SQL's `least(v_wins, 3)` in step.
    if (statueId) {
      const after = Object.keys(get().statues).filter((p) => p !== plinth).length + 1
      if (after > get().earned()) return { ok: false, reason: 'locked' }
      if (!statueById(statueId)) return { ok: false, reason: 'failed' }
    }

    const next = { ...get().statues }
    if (statueId) next[plinth] = statueId
    else delete next[plinth]
    set({ statues: next })

    const { data, error } = await supabase!.rpc('set_church_statue', {
      p_plinth: plinth,
      p_statue: statueId,
    })
    if (error) {
      // Put it back: an optimistic yard that lies is worse than a slow one.
      // Same rule as store/churchYard.ts.
      await get().load()
      return { ok: false, reason: 'failed' }
    }
    const res = data as { ok?: boolean; reason?: string } | null
    if (res && res.ok === false) {
      await get().load()
      return { ok: false, reason: (res.reason as StatueResult['reason']) ?? 'failed' }
    }
    // Prepacked verb. Clearing a plinth is taking a statue down, not raising one.
    if (statueId) void useSeason.getState().track('statue_raised')
    return { ok: true }
  },

  earned() {
    return plinthsEarned(get().wins)
  },

  async loadPageStatues(churchId) {
    if (!churchId) {
      set({ pageStatues: {}, pageWins: 0, pageChurchId: null })
      return
    }
    set({ pageChurchId: churchId, pageStatues: {}, pageWins: 0 })
    if (!isOnline()) return
    const { data, error } = await supabase!.rpc('church_statues_json', { p_church_id: churchId })
    // A second row tapped before this landed: whatever came back belongs to a
    // sheet that isn't on screen any more, so drop it (store/church.ts and
    // store/churchYard.ts do the same).
    if (get().pageChurchId !== churchId) return
    if (error || !data) return
    const raw = data as { wins?: number; statues?: Statues }
    set({ pageStatues: raw.statues ?? {}, pageWins: Number(raw.wins ?? 0) })
  },
}))
