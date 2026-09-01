import { create } from 'zustand'
import { useAuth } from './auth'

// Which days' trivia rounds you've finished.
//
// DEVICE-LOCAL, in BOTH modes — the deliberate break with the two-mode
// invariant that `store/crossword.ts` and `store/looks.ts` make, for the same
// reason and with the same argument:
//
//  - It grants NOTHING. A finished round pays exactly what a study run pays —
//    a relic roll and a step on the road — and both of those go through their
//    own capped, server-verified paths (`store/drops.ts`, `store/season.ts`).
//    Playing the round again on a second phone cannot mint anything, because
//    this flag is not what pays. There is no XP here at all, deliberately: the
//    round sits next to the daily drop and `xp` is the one number in this app
//    that ranks people (0006), so a second daily XP source beside the verse is
//    a decision that needs a migration and its own argument.
//  - The half of a round that IS a record of your study — the verse it was read
//    on — already follows the account: `QuizRunner` marks it studied through
//    `store/bible.ts` (`bible_marks` online, `va.bible.*` for a guest).
//
// So all this decides is whether today's box says "play" or "done". Syncing it
// would mean a table, an RPC and a hand-applied migration for that.
//
// If it ever should follow the account, the shape to use is the house one: a
// `daily_trivia(user_id, played_on)` table plus a security-definer
// `record_daily_trivia` taking `todayLocalDate()` and clamping it ±1, with this
// map as the local mirror — `store/bible.ts` is the store to copy.

function key(): string {
  const uid = useAuth.getState().profile?.id
  return uid ? `va.dailytrivia.${uid}` : 'va.dailytrivia.guest'
}

/** local date → the round for that date is finished. */
type Done = Record<string, true>

function read(): Done {
  try {
    const raw = JSON.parse(localStorage.getItem(key()) || '{}') as Done
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  } catch {
    return {}
  }
}

function write(done: Done) {
  try {
    localStorage.setItem(key(), JSON.stringify(done))
  } catch {
    /* private mode / storage full — in-memory only, and nothing that matters is
       lost: the verse mark and the relic went to the account either way. */
  }
}

interface DailyTriviaState {
  done: Done
  loaded: boolean
  load: () => void
  markPlayed: (localDate: string) => void
  playedOn: (localDate: string) => boolean
}

export const useDailyTrivia = create<DailyTriviaState>((set, get) => ({
  done: {},
  loaded: false,

  load() {
    set({ done: read(), loaded: true })
  },

  markPlayed(localDate) {
    if (!localDate) return
    // Merge onto what's on DISK, not onto in-memory state. A round can finish
    // before anything called load() (a deep link straight to /play/trivia, or a
    // reload mid-run), and merging onto an empty map would write that back and
    // erase every other day. Same trap as store/bookAccuracy.ts:record.
    const base = get().loaded ? get().done : read()
    if (base[localDate]) return
    const next = { ...base, [localDate]: true as const }
    set({ done: next, loaded: true })
    write(next)
  },

  playedOn(localDate) {
    return !!get().done[localDate]
  },
}))
