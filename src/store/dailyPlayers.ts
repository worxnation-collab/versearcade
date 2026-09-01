import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { AvatarSpec } from '@/data/avatar'

// Who has played today, fetched on demand when somebody taps the count.
//
// **There is deliberately no score in this type**, and that is the whole design
// rather than an omission — read the header on `0093_daily_players.sql`. A
// roster the client could sort by points is a leaderboard with a different
// name, so the guarantee lives in the payload shape: the RPC never selects a
// score, so there is nothing here for a future screen to rank by.
//
// **It is loaded by the sheet, not by the page.** The count on the Play tab
// comes from the pulse that was already being fetched (`useGame().pulse`), so
// the busiest screen in the app costs no extra round trip until somebody
// actually asks to see the people. `available` starts false and only a
// successful read flips it.
export interface DailyPlayer {
  username: string
  avatarEmoji: string
  avatarCharacter: AvatarSpec | null
  avatarBorder: string
  avatarBadge: string | null
  denomination: string | null
  isMe: boolean
}

interface DailyPlayersState {
  date: string | null
  players: DailyPlayer[]
  /** How many came back, against how many there are. Never a position. */
  shown: number
  accounts: number
  guests: number
  total: number
  loading: boolean
  /** A read has succeeded. False on a server without 0093, and in LOCAL. */
  available: boolean
  load: (localDate: string) => Promise<void>
}

const EMPTY = { players: [], shown: 0, accounts: 0, guests: 0, total: 0 }

export const useDailyPlayers = create<DailyPlayersState>((set, get) => ({
  date: null,
  ...EMPTY,
  loading: false,
  available: false,

  async load(localDate) {
    // No keys at all (a keyless LOCAL build): the day's count on that build is
    // `synthPulse()`'s invented ambience, and a list to go with it would have to
    // invent NAMES. A named player who doesn't exist is a lie you can tap — the
    // same reason `FirstLight` renders nothing rather than drawing its
    // unclaimed state with no server behind it. So this stays unavailable and
    // the count stays a plain number.
    if (!supabase) {
      set({ ...EMPTY, date: localDate, available: false, loading: false })
      return
    }
    // Already have this day and nothing is in flight — reopening the sheet
    // should not be a second round trip.
    if (get().date === localDate && get().available) return
    if (get().loading) return

    set({ loading: true })
    const { data, error } = await supabase.rpc('daily_players', {
      p_drop_date: localDate,
      p_limit: 100,
    })
    // Fail closed and quiet, the house pattern: a server without 0093 applied
    // simply has no such function, and the count goes back to being a number
    // you cannot tap rather than a button that errors.
    if (error || !data) {
      set({ ...EMPTY, date: localDate, available: false, loading: false })
      return
    }
    const raw = data as {
      players: Record<string, unknown>[]
      shown: number
      accounts: number
      guests: number
      total: number
    }
    set({
      date: localDate,
      players: (raw.players ?? []).map((p) => ({
        username: String(p.username ?? ''),
        avatarEmoji: String(p.avatar_emoji ?? '📖'),
        avatarCharacter: (p.avatar_character as AvatarSpec | null) ?? null,
        avatarBorder: String(p.avatar_border ?? 'default'),
        avatarBadge: (p.avatar_badge as string | null) ?? null,
        denomination: (p.denomination as string | null) ?? null,
        isMe: !!p.is_me,
      })),
      shown: Number(raw.shown ?? 0),
      accounts: Number(raw.accounts ?? 0),
      guests: Number(raw.guests ?? 0),
      total: Number(raw.total ?? 0),
      available: true,
      loading: false,
    })
  },
}))
