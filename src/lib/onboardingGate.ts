// onboardingGate — the building stays hidden until somebody has played three
// times.
//
// A new player's first screen used to be five tabs, a compass, a road, two
// daily boxes and a wardrobe, and every one of them is something this app is
// proud of. Together they are a map of a place somebody has no reason to care
// about yet: the thing they came for is one verse and five questions, and
// everything else is an answer to a question they have not asked. So Play and
// You are the whole app until the third run is done, and the rest arrives once
// there is a habit to hang it on.
//
// **It HIDES, it never locks.** There is no padlock, no "unlocks at 3", no
// progress bar toward it and nothing anywhere that says a tab is being
// withheld — a counter you are behind on is the one shape this app doesn't put
// in front of anybody, and it would turn a quiet first week into a checklist.
// That is the opposite of `WALL`/`RequireAccount`, whose padlocks are
// deliberately visible because there the locked thing IS the pitch for an
// account. Here there is nothing to pitch: the tabs simply are not part of the
// app yet, and then they are.
//
// **Nothing is deleted and no screen changes.** Every route still exists and
// every component is untouched; a gated route redirects to `/play` and a gated
// tab is not rendered. Lifting the gate is deleting a condition, exactly as
// lifting an account wall is deleting a wrapper.

import { useAuth } from '@/store/auth'

/**
 * How many daily runs this player has finished.
 *
 * `profile.totalPlays` is the both-mode answer BY CONSTRUCTION and is why this
 * needs no storage of its own: `submit_play` writes it for an account and
 * `localdb` keeps it for a guest, which is the same pair `roomProgress()` and
 * `petProgress()` already lean on. It also survives the upgrade — a guest's
 * plays are folded into the new account by `claim_guest_progress` — so three
 * runs as a guest do not have to be played again after signing up.
 *
 * It counts RUNS, never days and never sign-up age: somebody who plays three
 * times in one afternoon has done the thing, and somebody who installed a
 * month ago and never played has not.
 */
export function runsDone(): number {
  return useAuth.getState().profile?.totalPlays ?? 0
}

/** Three runs. A first visit, a second visit, and one more — then the app opens out. */
export const RUNS_TO_OPEN = 3

/**
 * Is the rest of the app still folded away?
 *
 * **Unknown reads as OPEN, not as hidden**, and that direction is the whole
 * safety argument. The profile is null for a beat on every cold start while
 * the session resolves, and a gate that defaulted to hidden would blink three
 * tabs out from under a long-time player on every launch — and redirect them
 * off `/church` while they were looking at it. A player with no profile at all
 * is on Landing, which this never reaches.
 */
export function buildingHidden(): boolean {
  const p = useAuth.getState().profile
  if (!p) return false
  return (p.totalPlays ?? 0) < RUNS_TO_OPEN
}

/**
 * The hook form, for the surfaces that have to re-render the moment the third
 * run lands. `submit_play` updates the profile in the auth store, so the tabs
 * and the compass appear on the result screen without a reload — which is what
 * "without a reinstall" has to mean on a phone.
 */
export function useBuildingHidden(): boolean {
  return useAuth((s) => {
    const p = s.profile
    if (!p) return false
    return (p.totalPlays ?? 0) < RUNS_TO_OPEN
  })
}

/** The routes that are not part of the app yet. Deep links to these land on /play. */
export const GATED_ROUTES = ['/battle', '/study', '/church', '/wardrobe'] as const
