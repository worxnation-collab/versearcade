import { create } from 'zustand'

// A shared link's one free play.
//
// Every arcade game can be shared, and the link hands whoever opens it ONE go
// on that machine before it asks them to make an account. This store is the
// whole bookkeeping: which game the visitor is currently demoing, who sent
// them, and which machines they've already had their go on.
//
// It lives in a store rather than in props for the reason `store/drops.ts`
// does: the thing that has to react — the sign-up card — renders in
// `ArcadeShell`, which is INSIDE the game the visitor is playing. Threading
// "your go is over" back out of the game and down again through the chrome it
// already rendered is prop-drilling through a component that has no business
// knowing about invites.
//
// **Device-local, and honest about it.** Whoever this is has no account by
// definition, so there is nowhere else to put it. Clearing site data or opening
// the link in another browser is another free go, and that is fine: the demo
// pays NOTHING (see the `demo` prop on the games — no relic, no road step, no
// mark on anybody's Bible), so the only thing a determined visitor can farm is
// more of the game we are trying to give them. Nothing here can be forged into
// anything that ranks a player, because nothing here writes anything at all.

const KEY = 'va.arcade.invite'

/** Usernames arrive in a URL somebody else wrote, so they are not text yet. */
export function sanitizeFrom(raw: string | null | undefined): string | null {
  if (!raw) return null
  return /^[A-Za-z0-9_]{1,20}$/.test(raw) ? raw : null
}

type Spent = Record<string, string>

function read(): Spent {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}') as Spent
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  } catch {
    return {}
  }
}

function write(spent: Spent) {
  try {
    localStorage.setItem(KEY, JSON.stringify(spent))
  } catch {
    /* private mode / storage full — the free go degrades to per-session, which
       is the generous direction to fail in. */
  }
}

interface InviteState {
  /** The game being demoed right now, or null when this is an ordinary visit. */
  demo: string | null
  /** Who shared it, if the link said and the name survived sanitising. */
  from: string | null
  /** True once the current demo's one play is over. */
  played: boolean
  /** game id → the local date that machine's free go was used. */
  spent: Spent

  begin: (gameId: string, from: string | null) => void
  end: () => void
  /** A play just finished. A no-op outside a demo, so games can call it flatly. */
  notePlayEnded: (localDate: string) => void
  isSpent: (gameId: string) => boolean
}

export const useArcadeInvite = create<InviteState>((set, get) => ({
  demo: null,
  from: null,
  played: false,
  spent: read(),

  begin(gameId, from) {
    const spent = read()
    // Re-opening the link after the go is used starts nothing: the route shows
    // the invitation rather than the machine, and `played` says which.
    set({ demo: gameId, from, played: !!spent[gameId], spent })
  },

  end() {
    set({ demo: null, from: null, played: false })
  },

  notePlayEnded(localDate) {
    const gameId = get().demo
    if (!gameId) return
    // Merge onto what's on DISK: a visitor can land on a link, play, and never
    // have loaded anything else, and merging onto an empty in-memory map would
    // hand back a free go on every other machine. Same trap as
    // store/bookAccuracy.ts:record.
    const spent = { ...read(), [gameId]: localDate }
    set({ played: true, spent })
    write(spent)
  },

  isSpent(gameId) {
    return !!read()[gameId]
  },
}))
