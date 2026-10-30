// firstStop — where a sign-in lands (2026-10-30).
//
// Every sign-in used to land on the Play tab. Production said that cost the
// newest accounts the most: of 30 accounts that signed up and never finished
// a verse, 24 never opened the run at all — they reached the tab, met the
// tutorial over it, and left. So an account that has NEVER played goes
// straight to today's verse (`/play/run`, whose start gate still shows the
// verse before the clock starts), and everybody else lands on Play as before.
//
// Two cases keep the old landing on purpose: a guest whose progress is being
// carried into the account (its plays arrive with the claim, and the run
// screen would read "not played" before they land), and anyone whose profile
// has a play on it. The resume doors (a battle invite, a church page, a claim)
// still win: they navigate after this does, exactly as they did over /play.

import { localdb } from './localdb'
import type { Profile } from '@/types'

export function firstStop(profile: Profile | null | undefined): '/play' | '/play/run' {
  if (!profile || (profile.totalPlays ?? 0) > 0) return '/play'
  try {
    if ((localdb.getPendingClaim()?.plays?.length ?? 0) > 0) return '/play'
  } catch { /* storage unavailable — fall through */ }
  return '/play/run'
}
