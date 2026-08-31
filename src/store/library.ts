import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth'
import { useSeason } from './season'
import { levelInfo } from '@/components/XpBar'
import { LIBRARY_XP } from '@/data/library'

// The library card the Study tab's librarian stamps, once.
//
// House two-mode shape — a private isOnline(), a load() that reads whichever
// source is authoritative, and a writer that updates in-memory state first so
// the sheet is instant. Copied from store/prayer.ts, which is the closest
// relative: a small server-granted XP payout with its cap in SQL.
//
// It genuinely has both paths rather than inheriting an online-only break.
// Checking a book out needs nobody on the other end of it, so a guest can do
// it, and a keyless LOCAL build — the documented way to work on this app —
// reaches the Study tab and must not find a dead librarian standing there.
//
// THE CLIENT NEVER SENDS AN AMOUNT. `xp` is the worldwide leaderboard (0006),
// so online the RPC decides what a first checkout is worth and this store only
// reports what came back. `LIBRARY_XP` is the guest mirror and the number the
// sheet draws after the fact — it is never sent to the server.
//
// KEEP IN SYNC with checkout_library_book (0081): once ever, 5 XP, and a
// SECOND checkout is a success that pays nothing rather than a refusal. She
// never turns anybody away from the desk.

export interface CheckoutResult {
  ok: boolean
  /** XP actually granted — 0 on every checkout after the first. */
  awarded: number
  /** Whether this was the stamp, i.e. whether the Easter egg just fired. */
  firstTime: boolean
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

function readLocal(): boolean {
  try {
    return localStorage.getItem(localKey()) === '1'
  } catch {
    return false
  }
}

function writeLocal() {
  try {
    localStorage.setItem(localKey(), '1')
  } catch {
    /* private mode / storage full — in-memory only */
  }
}

interface LibraryState {
  loaded: boolean
  /** Whether the card has already been stamped, so nothing is owed. */
  hasCard: boolean
  load: () => Promise<void>
  /** Check a book out. Safe to call again — it simply pays nothing. */
  checkout: () => Promise<CheckoutResult>
}

export const useLibrary = create<LibraryState>((set, get) => ({
  loaded: false,
  hasCard: false,

  async load() {
    if (isOnline()) {
      const { data, error } = await supabase!.rpc('my_library_card')
      if (!error && data) {
        const raw = data as { has_card?: boolean }
        set({ loaded: true, hasCard: !!raw.has_card })
        return
      }
      // A missing RPC (0081 not applied yet) must not make the librarian
      // unreachable — she still hands books over, the stamp just can't be
      // read. Fail to "no card known", never to a broken sheet.
      set({ loaded: true })
      return
    }
    set({ loaded: true, hasCard: readLocal() })
  },

  async checkout() {
    if (isOnline()) {
      // Awaited, and `error` checked. A postgrest-js builder is lazy — a `void`
      // here would report a payout for a call that never left the device.
      const { data, error } = await supabase!.rpc('checkout_library_book')
      if (error || !data) {
        return { ok: false, awarded: 0, firstTime: false, leveledUp: false }
      }
      const raw = data as { awarded?: number; first_time?: boolean; leveled_up?: boolean }
      const awarded = Number(raw.awarded ?? 0)
      set({ hasCard: true })
      // The server moved xp and level on the profile; pull them rather than
      // guessing, so every XP bar in the app is right immediately.
      if (awarded > 0) await useAuth.getState().refreshProfile()
      void useSeason.getState().track('book_borrowed')
      return {
        ok: true,
        awarded,
        firstTime: !!raw.first_time,
        leveledUp: !!raw.leveled_up,
      }
    }

    // Guest: read what is on DISK rather than trusting in-memory state — the
    // sheet can be the first thing a session renders, and a store that has
    // never load()ed says hasCard:false about an account that has one. Same
    // trap as store/bookAccuracy.ts:record.
    const had = readLocal()
    set({ hasCard: true })
    void useSeason.getState().track('book_borrowed')
    if (had) return { ok: true, awarded: 0, firstTime: false, leveledUp: false }

    const auth = useAuth.getState()
    const prof = auth.profile
    // No profile to pay into — so don't STAMP THE CARD either. `RequireProfile`
    // wraps the Study tab, so this should be unreachable; writing the flag
    // anyway would spend the one-time Easter egg on nothing and there would be
    // no way to give it back. She still hands the book over either way.
    if (!prof) return { ok: false, awarded: 0, firstTime: false, leveledUp: false }

    writeLocal()

    const xp = prof.xp + LIBRARY_XP
    // `levelInfo` is the client's existing mirror of the server's level_from_xp
    // curve. Reusing it rather than writing a third copy is the whole point of
    // the keep-in-sync rule.
    const level = levelInfo(xp).level
    const leveledUp = level > prof.level
    auth.setProfileLocal({ ...prof, xp, level })
    return { ok: true, awarded: LIBRARY_XP, firstTime: true, leveledUp }
  },
}))

/** For the sheet's copy: whether there is still a surprise waiting. */
export function libraryCardPending(): boolean {
  return !useLibrary.getState().hasCard
}
