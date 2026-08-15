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

// A completed focus session pays a small flat reward, capped per day so it can't
// be farmed. Mirrors submit_focus_practice / 0036 — keep the two in sync.
export const FOCUS_XP_PER_SESSION = 5
export const FOCUS_XP_DAILY_CAP = 20

export interface FocusXpOutcome {
  xpEarned: number
  dayTotal: number
  cap: number
  capped: boolean
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
  /** Award XP for one completed focus session (5, capped 20/day). */
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
    const empty: FocusXpOutcome = { xpEarned: 0, dayTotal: FOCUS_XP_DAILY_CAP, cap: FOCUS_XP_DAILY_CAP, capped: true }

    // ONLINE: server enforces the cap and updates XP/level authoritatively.
    if (supabase && auth.mode === 'online' && auth.isAuthed) {
      const { data, error } = await supabase.rpc('submit_focus_practice', { p_day: today })
      if (error || !data) return { xpEarned: 0, dayTotal: 0, cap: FOCUS_XP_DAILY_CAP, capped: false }
      const d = data as Record<string, unknown>
      const out: FocusXpOutcome = {
        xpEarned: Number(d.xp_earned ?? 0),
        dayTotal: Number(d.day_total ?? 0),
        cap: Number(d.cap ?? FOCUS_XP_DAILY_CAP),
        capped: !!d.capped,
      }
      if (out.xpEarned > 0) await auth.refreshProfile()
      return out
    }

    // LOCAL / guest: mirror the cap on-device.
    const prof = auth.profile
    if (!prof) return empty
    const prior = localdb.getFocusXpDay(today)
    const award = Math.min(FOCUS_XP_PER_SESSION, Math.max(0, FOCUS_XP_DAILY_CAP - prior))
    if (award > 0) {
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
    }
    return { xpEarned: award, dayTotal: prior + award, cap: FOCUS_XP_DAILY_CAP, capped: prior + award >= FOCUS_XP_DAILY_CAP }
  },
}))
