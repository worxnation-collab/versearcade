import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { todayLocalDate } from '@/lib/date'
import { useAuth } from './auth'
import { FIRST_LIGHT_XP_CAP } from '@/data/firstLight'
import type { AvatarSpec } from '@/types'

// The day's lantern: who opened today's verse first, and what the day has paid
// them. Design and the whole safety argument: data/firstLight.ts + 0081.
//
// Follows the house shape — a private isOnline(), a load() that reads whichever
// source is authoritative, and a writer that folds the server's own answer back
// into state so the card redraws without a second round trip.
//
// ONLINE-ONLY, and inherited rather than chosen — the same break with the
// two-mode invariant store/washing.ts and store/churchYard.ts make, for the
// same reason. "First" needs everybody else to be first OF: offline there is
// one player, so the lantern would be claimed every single day by the only
// person there, and the XP would be granted by the client — which is the one
// thing this feature's safety argument rests on not happening. A guest can
// still SEE who holds it (first_light is granted to anon) and that is the
// pitch for the account that would let them hold it themselves.
//
// If it ever should work offline, the shape is the keep's — a `va.firstlight`
// blob keyed per account — and the reward would have to become something that
// doesn't rank, because a self-granted point on profiles.xp is standing you
// awarded yourself.

function isOnline(): boolean {
  const a = useAuth.getState()
  return !!supabase && a.mode === 'online' && a.isAuthed
}

/** The public half of the holder — exactly what an Avatar needs to draw them. */
export interface LanternHolder {
  username: string
  avatarEmoji: string
  avatarCharacter: AvatarSpec | null
  avatarBorder: string
  avatarBadge: string | null
  denomination: string | null
}

interface FirstLightState {
  loaded: boolean
  /**
   * Did the day's state actually come back? False with no keys at all, and
   * false on a server without 0081 applied — the card renders NOTHING then
   * rather than the unclaimed state, which would say "nobody has opened
   * today's verse yet" over a day somebody is holding. Fail closed and quiet:
   * an approved build talking to an older schema loses a card, not a screen.
   */
  available: boolean
  /** The local date this state describes, so a midnight rollover can't stick. */
  date: string
  claimed: boolean
  /** Null when nobody holds it yet, AND when a hidden account does (0081). */
  holder: LanternHolder | null
  /** Is the holder me? The only place this store says anything about a player. */
  mine: boolean
  /** Accounts that opened after the holder. A fact about the day, not a rank. */
  followers: number
  /** What the day has actually paid, which stops at the cap. */
  xpAwarded: number
  cap: number
  /** Have I opened today's verse at all? Never rendered as a position. */
  iOpened: boolean

  load: () => Promise<void>
  /** "I just opened today's verse." Claims the lantern if it's going spare. */
  open: (date?: string) => Promise<void>
}

const EMPTY = {
  available: false,
  claimed: false,
  holder: null,
  mine: false,
  followers: 0,
  xpAwarded: 0,
  cap: FIRST_LIGHT_XP_CAP,
  iOpened: false,
}

export const useFirstLight = create<FirstLightState>((set, get) => ({
  loaded: false,
  date: todayLocalDate(),
  ...EMPTY,

  async load() {
    const date = todayLocalDate()
    // No keys at all (a LOCAL build): there is no day to be first in, and the
    // card renders nothing rather than inventing a holder — the pulse strip's
    // synthesized numbers are ambience, but a NAMED player who doesn't exist
    // would be a lie you can tap.
    if (!supabase) {
      set({ ...EMPTY, date, loaded: true })
      return
    }
    const { data, error } = await supabase.rpc('first_light', { p_local_date: date })
    // Fail closed and quiet: an older server without 0081 applied simply has no
    // such function, and the card should disappear rather than shout.
    if (error || !data) {
      set({ ...EMPTY, date, loaded: true })
      return
    }
    set({ ...fromRow(data), available: true, date, loaded: true })
  },

  async open(date = todayLocalDate()) {
    if (!isOnline()) {
      // A guest opening the verse still counts in the day's pulse the way it
      // always did (record_guest_open, called on submit) — it just can't claim
      // a lantern or mint anybody a point. Keep the read fresh so they still
      // see who holds it.
      await get().load()
      return
    }
    const { data, error } = await supabase!.rpc('open_daily_verse', { p_local_date: date })
    if (error || !data) return
    set({ ...fromRow(data), available: true, date, loaded: true })
    // Claiming pays nothing by itself — the day pays as people follow you in —
    // so there is no XP to fold into the profile here. What the holder's own
    // XP does when a follower arrives lands on their next refreshProfile,
    // which every screen already does.
  },
}))

function fromRow(d: any): Omit<FirstLightState, 'loaded' | 'available' | 'date' | 'load' | 'open'> {
  const h = d.holder as Record<string, unknown> | null
  return {
    claimed: !!d.claimed,
    holder: h
      ? {
          username: String(h.username ?? ''),
          avatarCharacter: (h.avatar_character as AvatarSpec | null) ?? null,
          avatarEmoji: (h.avatar_emoji as string) ?? '📖',
          avatarBorder: (h.avatar_border as string) ?? 'default',
          avatarBadge: (h.avatar_badge as string | null) ?? null,
          denomination: (h.denomination as string | null) ?? null,
        }
      : null,
    mine: !!d.mine,
    followers: Number(d.followers ?? 0),
    xpAwarded: Number(d.xp_awarded ?? 0),
    cap: Number(d.cap ?? FIRST_LIGHT_XP_CAP),
    iOpened: !!d.i_opened,
  }
}
