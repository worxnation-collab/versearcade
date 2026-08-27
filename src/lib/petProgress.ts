import { useAuth } from '@/store/auth'
import { useBible } from '@/store/bible'
import { useKeep } from '@/store/keep'
import { EMPTY_PET_PROGRESS, type PetProgress } from '@/data/pets'

// Everything a pet requirement asks about, gathered from wherever it lives.
//
// It's a function rather than a hook, and it reads stores with getState(), for
// one reason: `data/pets.ts` must not import stores (the reward math on both
// sides depends on it) and `store/auth.ts` must not import the bible and keep
// stores (they already import auth — that's a cycle). So the caller collects
// the numbers and hands them to the pure functions.
//
// The numbers are the same in both modes by construction: level and plays come
// off the profile, which localdb keeps for guests; studied marks and the keep's
// counters are two-mode stores already. Online, the server re-derives all of
// this itself in `pet_requirements_met` (0064) and its answer is the one that
// counts — this copy is what draws progress bars and gates the guest write.
export function petProgress(): PetProgress {
  const profile = useAuth.getState().profile
  if (!profile) return EMPTY_PET_PROGRESS
  return {
    level: profile.level,
    // Longest, never current: a requirement you can lose by missing a day is a
    // punishment, and nothing in this app takes something back.
    streak: profile.longestStreak,
    plays: profile.totalPlays,
    studied: Object.keys(useBible.getState().studied).length,
    cpuWon: useKeep.getState().counters.cpu_won,
  }
}
