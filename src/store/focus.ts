import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { localdb } from '@/lib/localdb'
import { todayLocalDate } from '@/lib/date'
import { levelInfo } from '@/components/XpBar'
import { useAuth } from './auth'

// Focus practice: the book a player has chosen to drill. Persisted to the device
// so the choice sticks across sessions "until the user changes it". `book === null`
// means Any book (random from the whole pool); `chosen` distinguishes a real pick
// from the never-picked default so the picker can show a first-run state.

const KEY = 'va_focus_book_v1'

// A completed focus session pays a small flat reward, every session, with no
// daily ceiling — practice as long as you like and keep earning. Mirrors
// submit_focus_practice / 0043 — keep the two in sync.
//
// This XP is ordinary XP: it counts toward level and the worldwide leaderboard
// as well as your church giving budget (which is lifetime XP minus what you've
// already given). Uncapping it was the point — players wanted to farm small
// amounts to give to their church for events.
export const FOCUS_XP_PER_SESSION = 5

export interface FocusXpOutcome {
  xpEarned: number
  /** Running total of focus XP earned today — a tally for the recap, not a limit. */
  dayTotal: number
}

interface Saved {
  book: string | null
  chosen: boolean
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { book: null, chosen: false }
    const p = JSON.parse(raw) as Partial<Saved>
    return { book: typeof p.book === 'string' ? p.book : null, chosen: !!p.chosen }
  } catch {
    return { book: null, chosen: false }
  }
}

function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* private mode / storage disabled — in-memory only */
  }
}

interface FocusState extends Saved {
  setBook: (book: string | null) => void
  /** Award XP for one completed focus session (a flat 5, no daily limit). */
  awardXp: () => Promise<FocusXpOutcome>
}

export const useFocus = create<FocusState>((set) => ({
  ...load(),
  setBook(book) {
    const next = { book, chosen: true }
    save(next)
    set(next)
  },

  async awardXp() {
    const auth = useAuth.getState()
    const today = todayLocalDate()
    const empty: FocusXpOutcome = { xpEarned: 0, dayTotal: 0 }

    // ONLINE: the server awards and updates XP/level authoritatively.
    if (supabase && auth.mode === 'online' && auth.isAuthed) {
      const { data, error } = await supabase.rpc('submit_focus_practice', { p_day: today })
      if (error || !data) return empty
      const d = data as Record<string, unknown>
      const out: FocusXpOutcome = {
        xpEarned: Number(d.xp_earned ?? 0),
        dayTotal: Number(d.day_total ?? 0),
      }
      if (out.xpEarned > 0) await auth.refreshProfile()
      return out
    }

    // LOCAL / guest: mirror the server's award on-device.
    const prof = auth.profile
    if (!prof) return empty
    // Read the day's tally off disk, not from memory — see the merge note in
    // store/bookAccuracy.ts. addFocusXp does the same on the write side.
    const prior = localdb.getFocusXpDay(today)
    const award = FOCUS_XP_PER_SESSION

    localdb.addFocusXp(today, award)
    const newXp = prof.xp + award
    const updated = { ...prof, xp: newXp, level: levelInfo(newXp).level }
    auth.setProfileLocal(updated)
    // Keep the guest's cumulative XP on the worldwide leaderboard in step.
    if (supabase) {
      supabase
        .rpc('record_guest_open', {
          p_drop_date: today,
          p_guest_id: localdb.getGuestId(),
          p_username: updated.username,
          p_emoji: updated.avatarEmoji,
          p_score: 0,
          p_xp: updated.xp,
          p_level: updated.level,
        })
        .then(() => {}, () => {})
    }
    return { xpEarned: award, dayTotal: prior + award }
  },
}))
