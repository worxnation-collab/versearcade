import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { todayLocalDate } from '@/lib/date'
import { useAuth } from './auth'
import { useSeason } from './season'
import { WASH_DAILY_CAP, washMilestoneReached, type WashMilestone } from '@/data/washing'
import type { BuddyCard } from './buddies'

// The Basin — washing another player's feet, and what's been washed for you.
//
// ONLINE-ONLY, and inherited rather than chosen — the same break with the
// two-mode invariant that store/churchYard.ts makes, for the same reason. The
// gesture needs a second real account on the other end of it: a guest has
// nobody's feet to wash, and a local basin would be a person washing their own
// (which is a different thing entirely, and not a feature). Guests get the
// account card the rest of the social surfaces show, not a half-working basin.
//
// If this ever should work offline, the shape is the keep's: a `va.wash` blob
// keyed per account. It isn't wanted, and the reason is worth writing down —
// the XP would then be client-granted, and this store's whole safety argument
// is that the server counts the rows and pays the one point.
//
// The XP lands in profiles.xp server-side (0068). We fold the returned xp/level
// back into the auth profile rather than re-fetching, the same optimistic shape
// the rest of the stores use — except the numbers here are the SERVER'S, not a
// guess, so there is nothing to roll back.

function isOnline(): boolean {
  const a = useAuth.getState()
  return !!supabase && a.mode === 'online' && a.isAuthed
}

export interface WashResult {
  ok: boolean
  reason?: 'offline' | 'not_found' | 'self' | 'already' | 'cap' | 'failed'
  /** The rung this washing reached, if it reached one. */
  milestone?: WashMilestone | null
  /** The single point tipped the player over a level. Rare, and worth a noise. */
  leveledUp?: boolean
}

interface WashingState {
  loaded: boolean
  /** Lifetime feet washed by me. The ladder's currency. */
  lifetime: number
  /** How many I've washed today, against WASH_DAILY_CAP. */
  today: number
  /** Usernames I've already washed today — their buttons draw as done. */
  washedToday: string[]
  /** How many washings I've RECEIVED. Mine to see and nobody else's. */
  received: number
  /** Who washed mine, most recent first. */
  recent: BuddyCard[]

  load: () => Promise<void>
  wash: (username: string) => Promise<WashResult>
  /** Have I already washed this player today? */
  didToday: (username: string) => boolean
  /** Washings left today. */
  remaining: () => number
}

const lower = (u: string) => u.replace(/^@/, '').trim().toLowerCase()

export const useWashing = create<WashingState>((set, get) => ({
  loaded: false,
  lifetime: 0,
  today: 0,
  washedToday: [],
  received: 0,
  recent: [],

  async load() {
    if (!isOnline() || !supabase) { set({ loaded: true }); return }
    const { data, error } = await supabase.rpc('my_washings', {
      p_local_date: todayLocalDate(),
      p_limit: 8,
    })
    if (error || !data) { set({ loaded: true }); return }
    const r = data as Record<string, unknown>
    set({
      loaded: true,
      lifetime: Number(r.lifetime ?? 0),
      today: Number(r.today ?? 0),
      washedToday: ((r.washed_today as string[]) ?? []).map(lower),
      received: Number(r.received ?? 0),
      recent: (r.recent as BuddyCard[]) ?? [],
    })
  },

  async wash(username) {
    const handle = lower(username)
    if (!isOnline() || !supabase) return { ok: false, reason: 'offline' }
    if (get().didToday(handle)) return { ok: false, reason: 'already' }
    if (get().remaining() <= 0) return { ok: false, reason: 'cap' }

    // Awaited, and the error checked — a bare `void supabase.rpc(...)` builds a
    // request and never sends it (see CLAUDE.md). The server is also the only
    // thing that may pay the XP, so there is no optimistic write here to undo.
    const { data, error } = await supabase.rpc('wash_feet', {
      p_username: handle,
      p_local_date: todayLocalDate(),
    })
    if (error || !data) return { ok: false, reason: 'failed' }
    const r = data as Record<string, unknown>

    if (!r.ok) {
      const reason = (r.reason as WashResult['reason']) ?? 'failed'
      // The server knows better than we do: fold its tallies back in so a
      // second device's washings stop being invisible here.
      if (reason === 'already' || reason === 'cap') {
        set({ today: Number(r.today ?? get().today) })
        if (reason === 'already') {
          const seen = get().washedToday
          if (!seen.includes(handle)) set({ washedToday: [...seen, handle] })
        }
      }
      return { ok: false, reason }
    }

    const lifetime = Number(r.lifetime ?? get().lifetime + 1)
    set({
      lifetime,
      today: Number(r.today ?? get().today + 1),
      washedToday: [...get().washedToday, handle],
    })

    // The XP is real and it's the server's number, so the profile can take it
    // straight — no refetch, no guess.
    const auth = useAuth.getState()
    if (auth.profile) {
      auth.setProfileLocal({
        ...auth.profile,
        xp: Number(r.xp ?? auth.profile.xp),
        level: Number(r.level ?? auth.profile.level),
      })
    }

    // A quest may be watching. Prepacked verb — no bundled road uses it yet.
    void useSeason.getState().track('feet_washed')

    return {
      ok: true,
      milestone: washMilestoneReached(lifetime),
      leveledUp: r.leveled_up === true,
    }
  },

  didToday(username) {
    return get().washedToday.includes(lower(username))
  },

  remaining() {
    return Math.max(0, WASH_DAILY_CAP - get().today)
  },
}))
