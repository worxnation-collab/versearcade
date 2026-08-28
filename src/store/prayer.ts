import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { todayLocalDate } from '@/lib/date'
import { useAuth } from './auth'
import { useSeason } from './season'
import { levelInfo } from '@/components/XpBar'
import { PRAYER_DAILY_CAP, PRAYER_XP } from '@/data/prayers'

// Prayers said today, and what they were worth.
//
// House two-mode shape, and this one genuinely has both paths rather than
// inheriting an online-only break: praying needs nobody else on the other end,
// so a guest can do it. Online the server counts and pays (record_prayer,
// 0073); offline the same cap and the same 10 XP are applied here, against the
// local profile — which ranks nobody, because a guest is not on any board.
//
// THE CLIENT NEVER SENDS AN AMOUNT. `xp` is the worldwide leaderboard (0006),
// so online the RPC decides what a prayer is worth and this store only reports
// what came back. The `PRAYER_XP` constant below is the guest mirror and the
// number the sheet draws — it is never sent to the server.
//
// KEEP IN SYNC with record_prayer (0073): the cap, the payout, and the fact
// that going over the cap is a success with nothing awarded rather than a
// refusal. A prayer is never an error.

export interface PrayerResult {
  ok: boolean
  /** XP actually granted — 0 once the daily cap is reached. */
  awarded: number
  today: number
  cap: number
  leveledUp: boolean
}

function isOnline(): boolean {
  const a = useAuth.getState()
  return !!supabase && a.mode === 'online' && a.isAuthed
}

function localKey(): string {
  const uid = useAuth.getState().profile?.id
  return uid ? `va.prayers.${uid}` : 'va.prayers.guest'
}

interface LocalPrayers {
  date: string
  count: number
}

function readLocal(): LocalPrayers {
  try {
    const raw = JSON.parse(localStorage.getItem(localKey()) || 'null') as LocalPrayers | null
    if (raw && typeof raw.date === 'string') return { date: raw.date, count: Number(raw.count) || 0 }
  } catch {
    /* fall through */
  }
  return { date: todayLocalDate(), count: 0 }
}

function writeLocal(next: LocalPrayers) {
  try {
    localStorage.setItem(localKey(), JSON.stringify(next))
  } catch {
    /* private mode / storage full — in-memory only */
  }
}

interface PrayerState {
  loaded: boolean
  today: number
  cap: number
  load: () => Promise<void>
  /** Record one prayer. Safe to call over the cap — it simply pays nothing. */
  record: () => Promise<PrayerResult>
}

export const usePrayer = create<PrayerState>((set, get) => ({
  loaded: false,
  today: 0,
  cap: PRAYER_DAILY_CAP,

  async load() {
    if (isOnline()) {
      const { data, error } = await supabase!.rpc('my_prayers', { p_local_date: todayLocalDate() })
      if (!error && data) {
        const raw = data as { today?: number; cap?: number }
        set({ loaded: true, today: Number(raw.today ?? 0), cap: Number(raw.cap ?? PRAYER_DAILY_CAP) })
        return
      }
      set({ loaded: true })
      return
    }
    const disk = readLocal()
    // A stored count from yesterday is not today's count. Rolling over on read
    // rather than on write is what makes the cap reset at the player's own
    // midnight without anything having to fire at midnight.
    const today = disk.date === todayLocalDate() ? disk.count : 0
    set({ loaded: true, today, cap: PRAYER_DAILY_CAP })
  },

  async record() {
    if (isOnline()) {
      // Awaited, and `error` checked. A postgrest-js builder is lazy — a `void`
      // here would report a payout for a call that never left the device.
      const { data, error } = await supabase!.rpc('record_prayer', {
        p_local_date: todayLocalDate(),
      })
      if (error || !data) return { ok: false, awarded: 0, today: get().today, cap: get().cap, leveledUp: false }
      const raw = data as { awarded?: number; today?: number; cap?: number; leveled_up?: boolean }
      const today = Number(raw.today ?? get().today)
      set({ today, cap: Number(raw.cap ?? get().cap) })
      // The server moved xp and level on the profile; pull them rather than
      // guessing, so the XP bar under the room is right immediately.
      if (Number(raw.awarded ?? 0) > 0) await useAuth.getState().refreshProfile()
      void useSeason.getState().track('prayed') // prepacked verb
      return {
        ok: true,
        awarded: Number(raw.awarded ?? 0),
        today,
        cap: Number(raw.cap ?? get().cap),
        leveledUp: !!raw.leveled_up,
      }
    }

    // Guest: merge onto what's on DISK, never onto in-memory state — the sheet
    // can be the first thing a session renders. Same trap as
    // store/bookAccuracy.ts:record.
    const disk = readLocal()
    const day = todayLocalDate()
    const today = disk.date === day ? disk.count : 0
    if (today >= PRAYER_DAILY_CAP) {
      set({ today })
      writeLocal({ date: day, count: today })
      return { ok: true, awarded: 0, today, cap: PRAYER_DAILY_CAP, leveledUp: false }
    }

    writeLocal({ date: day, count: today + 1 })
    set({ today: today + 1 })

    const auth = useAuth.getState()
    const prof = auth.profile
    let leveledUp = false
    if (prof) {
      const xp = prof.xp + PRAYER_XP
      // `levelInfo` is the client's existing mirror of the server's
      // level_from_xp curve (an escalating threshold, not a square root) and is
      // what lib/progress.ts already uses for guest rewards. Reusing it rather
      // than writing a second copy is the whole point of the keep-in-sync rule
      // — I got the curve wrong writing it from memory first.
      const level = levelInfo(xp).level
      leveledUp = level > prof.level
      auth.setProfileLocal({ ...prof, xp, level })
    }
    void useSeason.getState().track('prayed')
    return { ok: true, awarded: PRAYER_XP, today: today + 1, cap: PRAYER_DAILY_CAP, leveledUp }
  },
}))
