import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { todayLocalDate } from '@/lib/date'
import { useAuth } from './auth'
import { levelInfo } from '@/components/XpBar'
import { ARCADE_XP } from '@/data/arcade'

// The day's first run of a machine, and what it was worth.
//
// House two-mode shape — a private isOnline(), a load() that reads whichever
// source is authoritative, and a writer that updates in-memory state first so
// the result screen is instant. Copied from store/library.ts, which is the
// closest relative: a small server-granted daily XP payout with its cap in SQL
// and its ceiling held by a primary key.
//
// It genuinely has both paths rather than inheriting an online-only break. The
// arcade is guest-open by design, and a keyless LOCAL build — the documented
// way to work on this app — has machines in it that must still pay.
//
// WHAT IT PAYS FOR IS TURNING UP, NOT DOING WELL. Nothing on this path sees a
// score, and that is the whole reason an XP grant is allowed to exist next to
// the arcade's rank-free rule: forty flakes and four flakes are worth exactly
// the same, so no run can be behind any other run.
//
// THE CLIENT NEVER SENDS AN AMOUNT. Online the RPC decides what the day's first
// run is worth and this store only reports what came back. `ARCADE_XP` is the
// guest mirror; it never leaves the device.
//
// KEEP IN SYNC with record_arcade_play (0084): one paid run per machine per
// local day, 5 XP, and every run after it is a SUCCESS that pays nothing rather
// than a refusal. The arcade never turns anybody away from a machine.
//
// AND NOTHING HERE COUNTS RUNS OR DAYS. `paidToday` is a set of machine ids for
// today and nothing else — no history on either path, because a streak on this
// would turn a small welcome into something you can fall behind on.

export interface ArcadePlayResult {
  ok: boolean
  /** XP actually granted — 0 on every run after the day's first. */
  awarded: number
  /** Whether this was the day's first on this machine. */
  firstToday: boolean
  leveledUp: boolean
}

const NOTHING: ArcadePlayResult = { ok: false, awarded: 0, firstToday: false, leveledUp: false }

function isOnline(): boolean {
  const a = useAuth.getState()
  return !!supabase && a.mode === 'online' && a.isAuthed
}

function localKey(): string {
  const uid = useAuth.getState().profile?.id
  return uid ? `va.arcade.${uid}` : 'va.arcade.guest'
}

interface LocalCard {
  day: string
  games: string[]
}

/** What's on DISK for today — an older day reads as nothing paid. */
function readLocal(): LocalCard {
  try {
    const raw = localStorage.getItem(localKey())
    if (!raw) return { day: todayLocalDate(), games: [] }
    const parsed = JSON.parse(raw) as Partial<LocalCard>
    if (parsed.day !== todayLocalDate()) return { day: todayLocalDate(), games: [] }
    return { day: todayLocalDate(), games: Array.isArray(parsed.games) ? parsed.games : [] }
  } catch {
    return { day: todayLocalDate(), games: [] }
  }
}

function writeLocal(card: LocalCard) {
  try {
    localStorage.setItem(localKey(), JSON.stringify(card))
  } catch {
    /* private mode / storage full — in-memory only */
  }
}

interface ArcadeXpState {
  loaded: boolean
  /** Machine ids already paid for today. Not a tally, and never a history. */
  paidToday: string[]
  load: () => Promise<void>
  /** Finish a run. Safe to call again — it simply pays nothing. */
  record: (gameId: string) => Promise<ArcadePlayResult>
}

export const useArcadeXp = create<ArcadeXpState>((set, get) => ({
  loaded: false,
  paidToday: [],

  async load() {
    if (isOnline()) {
      const { data, error } = await supabase!.rpc('my_arcade_card', {
        p_local_date: todayLocalDate(),
      })
      if (!error && data) {
        const raw = data as { paid_today?: unknown }
        const games = Array.isArray(raw.paid_today) ? (raw.paid_today as string[]) : []
        set({ loaded: true, paidToday: games })
        return
      }
      // A missing RPC (0084 not applied yet) must not break a machine. Fail to
      // "nothing known" — the run still plays and still finishes.
      set({ loaded: true })
      return
    }
    // Rolling over on READ rather than on write is what resets this at the
    // player's own midnight without anything having to fire at midnight (same
    // as store/library.ts).
    set({ loaded: true, paidToday: readLocal().games })
  },

  async record(gameId) {
    if (isOnline()) {
      // Awaited, and `error` checked. A postgrest-js builder is lazy — a `void`
      // here would report a payout for a call that never left the device.
      const { data, error } = await supabase!.rpc('record_arcade_play', {
        p_game: gameId,
        p_local_date: todayLocalDate(),
      })
      if (error || !data) return NOTHING
      const raw = data as { awarded?: number; first_today?: boolean; leveled_up?: boolean }
      const awarded = Number(raw.awarded ?? 0)
      set({ paidToday: [...new Set([...get().paidToday, gameId])] })
      // The server moved xp and level on the profile; pull them rather than
      // guessing, so every XP bar in the app is right immediately.
      if (awarded > 0) await useAuth.getState().refreshProfile()
      return {
        ok: true,
        awarded,
        firstToday: !!raw.first_today,
        leveledUp: !!raw.leveled_up,
      }
    }

    // Guest: MERGE ONTO WHAT IS ON DISK rather than onto in-memory state. A run
    // can finish before anything called load() (a deep link straight into a
    // machine), and writing an in-memory set back would silently erase the
    // other machines' days. Same trap as store/bookAccuracy.ts:record.
    const card = readLocal()
    set({ paidToday: [...new Set([...card.games, gameId])] })
    if (card.games.includes(gameId)) {
      return { ok: true, awarded: 0, firstToday: false, leveledUp: false }
    }

    const auth = useAuth.getState()
    const prof = auth.profile
    // No profile to pay into — so don't SPEND THE DAY either. The machine
    // finishes either way.
    if (!prof) return NOTHING

    writeLocal({ day: card.day, games: [...card.games, gameId] })

    const xp = prof.xp + ARCADE_XP
    // `levelInfo` is the client's existing mirror of the server's level_from_xp
    // curve. Reusing it rather than writing a third copy is the whole point of
    // the keep-in-sync rule.
    const level = levelInfo(xp).level
    const leveledUp = level > prof.level
    auth.setProfileLocal({ ...prof, xp, level })
    return { ok: true, awarded: ARCADE_XP, firstToday: true, leveledUp }
  },
}))
