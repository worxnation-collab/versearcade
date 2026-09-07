import { create } from 'zustand'
import { useAuth } from './auth'
import { useBible } from './bible'
import { useCollection } from './collection'
import { useChurch } from './church'
import { useKeep } from './keep'
import { todayLocalDate, addDays } from '@/lib/date'
import { deriveRecap, type Snapshot, type WeekNumbers, type WeekRecap } from '@/lib/weekRecap'

export type { WeekNumbers, WeekRecap } from '@/lib/weekRecap'

// "Your week" — a recap of what YOU did, and nothing about anybody else.
//
// Churches get a week (the rivalry); players had no weekly beat at all, and a
// weekly personal recap is the one retention lever that works WITHOUT ranking
// anyone — Strava's and Spotify's summaries are read because they are about
// you. So this is the Journal's rule applied to seven days: your own numbers,
// never a comparison, never a percentile, never "most players…".
//
// How it is built, and why it is device-local in both modes:
//
//  - The numbers are DIFFERENCES between two snapshots of lifetime counters the
//    app already keeps (XP, plays, verses studied, chapters read, relics, keep
//    counters, given to church). No new table, no RPC, no server round-trip:
//    every app open records today's snapshot here (`va.week.<uid>`), and the
//    recap is last Sunday's snapshot against the one before it.
//  - Nothing is granted by it and nothing is stored that could rank anybody,
//    which is what makes it safe to keep on the device (the `store/looks.ts`
//    break with the two-mode invariant). Switching phones loses the history and
//    costs nothing.
//  - A quiet week says something warm and short. It never says "0" and never
//    compares this week to last.

const HISTORY_DAYS = 28

interface WeeklyState {
  recap: WeekRecap | null
  /** Whether the current recap has been opened on this device. */
  seen: boolean
  /** Record today's numbers and re-derive the recap. Cheap; call on load. */
  snapshot: () => void
  markSeen: () => void
}

function key(uid: string) {
  return `va.week.${uid}`
}

function readHistory(uid: string): Snapshot[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key(uid)) || '[]') as unknown
    return Array.isArray(raw) ? (raw as Snapshot[]).filter((s) => s && typeof s.date === 'string') : []
  } catch {
    return []
  }
}

function writeHistory(uid: string, list: Snapshot[]) {
  try {
    localStorage.setItem(key(uid), JSON.stringify(list))
  } catch {
    /* private mode: no recap this week, which is survivable */
  }
}

function readSeen(uid: string): string | null {
  try {
    return localStorage.getItem(`${key(uid)}.seen`)
  } catch {
    return null
  }
}

/** Today's lifetime numbers, from stores that are loaded app-wide. */
function current(): WeekNumbers | null {
  const p = useAuth.getState().profile
  if (!p) return null
  const bible = useBible.getState()
  const keep = useKeep.getState()
  const c = keep.counters
  return {
    xp: p.xp,
    plays: p.totalPlays,
    studied: Object.keys(bible.studied).length,
    chapters: Object.keys(bible.chapters).length,
    relics: useCollection.getState().owned.length,
    battles: (c.battle_played ?? 0) + (c.cpu_played ?? 0),
    given: useChurch.getState().myGiven,
  }
}

export const useWeekly = create<WeeklyState>((set) => ({
  recap: null,
  seen: true,

  snapshot() {
    const uid = useAuth.getState().profile?.id
    const now = current()
    if (!uid || !now) return
    const today = todayLocalDate()
    // Merge onto DISK, never memory — the usual guest-write rule.
    const history = readHistory(uid).filter((s) => s.date !== today && s.date >= addDays(today, -HISTORY_DAYS))
    history.push({ date: today, ...now })
    writeHistory(uid, history)
    const recap = deriveRecap(history, today)
    set({ recap, seen: !recap || readSeen(uid) === recap.key })
  },

  markSeen() {
    const uid = useAuth.getState().profile?.id
    const recap = useWeekly.getState().recap
    if (!uid || !recap) return
    try {
      localStorage.setItem(`${key(uid)}.seen`, recap.key)
    } catch {
      /* fine */
    }
    set({ seen: true })
  },
}))
