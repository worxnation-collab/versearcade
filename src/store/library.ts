import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { todayLocalDate } from '@/lib/date'
import { useAuth } from './auth'
import { useSeason } from './season'
import { levelInfo } from '@/components/XpBar'
import { LIBRARY_XP } from '@/data/library'

// The first book you borrow each day, and what it was worth.
//
// House two-mode shape — a private isOnline(), a load() that reads whichever
// source is authoritative, and a writer that updates in-memory state first so
// the sheet is instant. Copied from store/prayer.ts, which is the closest
// relative: a small server-granted daily XP payout with its cap in SQL.
//
// It genuinely has both paths rather than inheriting an online-only break.
// Borrowing a book needs nobody on the other end of it, and a keyless LOCAL
// build — the documented way to work on this app — IS the Study tab, so a dead
// librarian there would be a dead tab.
//
// THE CLIENT NEVER SENDS AN AMOUNT. `xp` is the worldwide leaderboard (0006),
// so online the RPC decides what the day's first book is worth and this store
// only reports what came back. `LIBRARY_XP` is the guest mirror and the number
// the sheet draws after the fact — it is never sent to the server.
//
// KEEP IN SYNC with checkout_library_book (0083): one paid checkout per local
// day, 5 XP, and every checkout after it is a SUCCESS that pays nothing rather
// than a refusal. She never turns anybody away from the desk.
//
// AND NOTHING HERE COUNTS DAYS. `borrowedToday` is a boolean, not a tally, and
// there is no stored history on either path — a streak on this would turn a
// small welcome into something you can fall behind on.

export interface CheckoutResult {
  ok: boolean
  /** XP actually granted — 0 on every checkout after the day's first. */
  awarded: number
  /** Whether this was the day's first, i.e. whether the welcome just fired. */
  firstToday: boolean
  leveledUp: boolean
}

function isOnline(): boolean {
  const a = useAuth.getState()
  return !!supabase && a.mode === 'online' && a.isAuthed
}

function localKey(): string {
  const uid = useAuth.getState().profile?.id
  return uid ? `va.library.${uid}` : 'va.library.guest'
}

/** The last day this device was paid for a book, or null. */
function readLocal(): string | null {
  try {
    return localStorage.getItem(localKey())
  } catch {
    return null
  }
}

function writeLocal(day: string) {
  try {
    localStorage.setItem(localKey(), day)
  } catch {
    /* private mode / storage full — in-memory only */
  }
}

interface LibraryState {
  loaded: boolean
  /** Whether today's welcome has already been paid, so nothing is owed. */
  borrowedToday: boolean
  load: () => Promise<void>
  /** Borrow a book. Safe to call again — it simply pays nothing. */
  checkout: () => Promise<CheckoutResult>
  /**
   * A study run counts as borrowing the day's book. Every study surface —
   * the trivia rounds, a replay, a drill, the Cross Word, a review — is a
   * book Tabitha would have lent, and somebody who studied has done the thing
   * "Tabitha has a book for you" was inviting them to do. Without this the
   * compass kept the invitation open all day for anyone who reached Study by
   * any door but her desk (the Play tab's trivia box, the map, /review), which
   * read as an errand nobody could figure out how to run.
   *
   * No-ops once the day's book is borrowed, so the desk's own checkout is not
   * paid twice and the `book_borrowed` verb fires once. Reads the store's
   * loaded state first: a run can finish before anything called load().
   */
  borrowIfNeeded: () => Promise<void>
}

export const useLibrary = create<LibraryState>((set, get) => ({
  loaded: false,
  borrowedToday: false,

  async load() {
    if (isOnline()) {
      const { data, error } = await supabase!.rpc('my_library_card', {
        p_local_date: todayLocalDate(),
      })
      if (!error && data) {
        const raw = data as { borrowed_today?: boolean }
        set({ loaded: true, borrowedToday: !!raw.borrowed_today })
        return
      }
      // A missing RPC (0083 not applied yet) must not make the librarian
      // unreachable — this tab IS the library. Fail to "nothing known", never
      // to a broken room.
      set({ loaded: true })
      return
    }
    // A stored day that isn't today is not today's. Rolling over on READ rather
    // than on write is what makes this reset at the player's own midnight
    // without anything having to fire at midnight (same as store/prayer.ts).
    set({ loaded: true, borrowedToday: readLocal() === todayLocalDate() })
  },

  async borrowIfNeeded() {
    if (!get().loaded) await get().load()
    if (get().borrowedToday) return
    await get().checkout()
  },

  async checkout() {
    if (isOnline()) {
      // Awaited, and `error` checked. A postgrest-js builder is lazy — a `void`
      // here would report a payout for a call that never left the device.
      const { data, error } = await supabase!.rpc('checkout_library_book', {
        p_local_date: todayLocalDate(),
      })
      if (error || !data) {
        return { ok: false, awarded: 0, firstToday: false, leveledUp: false }
      }
      const raw = data as { awarded?: number; first_today?: boolean; leveled_up?: boolean }
      const awarded = Number(raw.awarded ?? 0)
      set({ borrowedToday: true })
      // The server moved xp and level on the profile; pull them rather than
      // guessing, so every XP bar in the app is right immediately.
      if (awarded > 0) await useAuth.getState().refreshProfile()
      void useSeason.getState().track('book_borrowed')
      return {
        ok: true,
        awarded,
        firstToday: !!raw.first_today,
        leveledUp: !!raw.leveled_up,
      }
    }

    // Guest: read what is on DISK rather than trusting in-memory state — the
    // room can be the first thing a session renders, and a store that has never
    // load()ed says "not borrowed" about a day that has been. Same trap as
    // store/bookAccuracy.ts:record.
    const day = todayLocalDate()
    const paidOn = readLocal()
    set({ borrowedToday: true })
    void useSeason.getState().track('book_borrowed')
    if (paidOn === day) return { ok: true, awarded: 0, firstToday: false, leveledUp: false }

    const auth = useAuth.getState()
    const prof = auth.profile
    // No profile to pay into — so don't SPEND THE DAY either. `RequireProfile`
    // wraps the Study tab, so this should be unreachable; writing the day
    // anyway would burn the welcome on nothing. She hands the book over either
    // way.
    if (!prof) return { ok: false, awarded: 0, firstToday: false, leveledUp: false }

    writeLocal(day)

    const xp = prof.xp + LIBRARY_XP
    // `levelInfo` is the client's existing mirror of the server's level_from_xp
    // curve. Reusing it rather than writing a third copy is the whole point of
    // the keep-in-sync rule.
    const level = levelInfo(xp).level
    const leveledUp = level > prof.level
    auth.setProfileLocal({ ...prof, xp, level })
    return { ok: true, awarded: LIBRARY_XP, firstToday: true, leveledUp }
  },
}))
