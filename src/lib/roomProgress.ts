import { useAuth } from '@/store/auth'
import { useBible } from '@/store/bible'
import { useCollection } from '@/store/collection'
import { EMPTY_ROOM_PROGRESS, type RoomProgress } from '@/data/room'

// The six numbers the Upper Room's furnishings are earned against, gathered
// from wherever each one lives.
//
// A function rather than a hook, and it reads stores with getState(), for the
// same import-graph reason lib/petProgress.ts is: `data/room.ts` must not
// import stores, and `store/auth.ts` must not import the bible and collection
// stores. So the caller collects the numbers and hands them to pure functions.
//
// THE SCREEN THAT SHOWS THE ROOM HAS TO load() the bible and collection stores,
// or it quietly reports 0 for three requirements — the exact trap petProgress
// documents. RoomSection does it.
//
// Both modes give the same answer by construction: level, longest streak and
// plays come off the profile (localdb keeps it for guests), and marks and
// stamps are two-mode stores already.
export function roomProgress(): RoomProgress {
  const profile = useAuth.getState().profile
  if (!profile) return EMPTY_ROOM_PROGRESS
  return {
    level: profile.level,
    // Longest, never current — a requirement you can lose by missing a day is a
    // punishment, and nothing in this app takes something back.
    streak: profile.longestStreak,
    plays: profile.totalPlays,
    studied: Object.keys(useBible.getState().studied).length,
    read: Object.keys(useBible.getState().chapters).length,
    cards: useCollection.getState().owned.length,
  }
}
