import { create } from 'zustand'
import { useAuth } from './auth'
import { isSupabaseConfigured } from '@/lib/config'

// "Save this" — the account ask, made at the moment there is something to save.
//
// The account wall fires when a guest taps a locked tab, which is the worst
// moment to ask: they wanted something and were told no. This asks instead the
// first time a guest EARNS something — a stamp from the chest, a machine's
// welcome — when the thing on screen is theirs and the honest line is "this is
// on this phone only". Same pitch as the wall (the streak, the character, every
// device), different moment.
//
// Three rules keep it from becoming a nag:
//
//  - **Once per device, ever.** `va.saveNudge` is written the first time it is
//    shown, whatever the answer. A second ask is the wall's job, and the wall
//    already never scolds.
//  - **Only when an account is OBTAINABLE** — the same `isSupabaseConfigured &&
//    mode === 'local'` rule `useAccountLocked` uses, so a keyless LOCAL build
//    never sees it (there is nothing to sign up to).
//  - **It says what would be saved, in the words of the thing just earned.**
//    Never "sign up for more features".

const KEY = 'va.saveNudge'

export interface SaveNudge {
  /** What was just earned, for the headline: "That stamp", "That +5 XP". */
  thing: string
  /** Where it lives now, in one line. */
  line: string
}

interface SaveNudgeState {
  pending: SaveNudge | null
  /** Offer once, if this is a guest who could get an account. No-op otherwise. */
  offer: (nudge: SaveNudge) => void
  dismiss: () => void
}

function shown(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return true
  }
}

function markShown() {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    /* fine: shown again next time, which is survivable */
  }
}

export const useSaveNudge = create<SaveNudgeState>((set, get) => ({
  pending: null,

  offer(nudge) {
    if (get().pending) return
    if (!isSupabaseConfigured) return
    if (useAuth.getState().mode !== 'local') return
    if (shown()) return
    markShown()
    set({ pending: nudge })
  },

  dismiss() {
    set({ pending: null })
  },
}))
