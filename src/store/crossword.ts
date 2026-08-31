import { create } from 'zustand'
import { useAuth } from './auth'

// Which crosses you've built.
//
// DEVICE-LOCAL, in BOTH modes, and that is a deliberate break with the two-mode
// invariant — the same one store/looks.ts and store/music.ts make, for the same
// kind of reason. What's stored here is a bookmark, not a possession:
//
//  - It grants NOTHING. A solved cross pays what any study run pays (a relic
//    roll, a step on the road) and those go through their own capped,
//    server-verified paths — the drop store and the season store. Re-solving a
//    puzzle on a second phone can't mint anything, because this set isn't what
//    pays.
//  - The part of a solve that's actually a record of your study — the verse —
//    IS saved to the account: solving marks it studied through `store/bible.ts`
//    (`bible_marks` online, `va.bible.*` for guests), so it lights up on your
//    own Bible from any device, which is where a footprint belongs.
//
// So all this decides is which cross "Build another" offers you next. Syncing
// it would mean a table, an RPC and a hand-applied migration for that.
//
// If it ever should follow the account, the shape to use is the house one: a
// `cross_solves(user_id, puzzle_id, solved_on)` table plus a security-definer
// `record_cross_solve` taking `todayLocalDate()` and clamping it ±1, with this
// map as the local mirror — `store/bible.ts` is the store to copy.

function key(): string {
  const uid = useAuth.getState().profile?.id
  return uid ? `va.cross.${uid}` : 'va.cross.guest'
}

/** puzzle id → the local date it was first finished. */
type Solved = Record<string, string>

function read(): Solved {
  try {
    const raw = JSON.parse(localStorage.getItem(key()) || '{}') as Solved
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  } catch {
    return {}
  }
}

function write(solved: Solved) {
  try {
    localStorage.setItem(key(), JSON.stringify(solved))
  } catch {
    /* private mode / storage full — in-memory only, and nothing is lost that
       matters: the verse mark went to the account either way. */
  }
}

interface CrossState {
  solved: Solved
  loaded: boolean
  load: () => void
  markSolved: (id: string, localDate: string) => void
}

export const useCrossword = create<CrossState>((set, get) => ({
  solved: {},
  loaded: false,

  load() {
    set({ solved: read(), loaded: true })
  },

  markSolved(id, localDate) {
    if (!id) return
    // Merge onto what's on DISK, not onto in-memory state. A puzzle can be
    // finished before anything called load() (a deep link straight to
    // /study/cross, or a reload mid-puzzle), and merging onto an empty map
    // would write that back and erase every other solve. Same trap as
    // store/bookAccuracy.ts:record.
    const base = get().loaded ? get().solved : read()
    if (base[id]) return
    const next = { ...base, [id]: localDate }
    set({ solved: next, loaded: true })
    write(next)
  },
}))
