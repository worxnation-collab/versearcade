// Washing feet — the gesture, its ceiling, and the ladder it draws.
//
// "If I then, your Lord and Master, have washed your feet; ye also ought to
// wash one another's feet." — John 13:14
//
// This is the app's poke, and it is deliberately the opposite of one. A poke
// costs nothing and asks for attention. This costs a kneel: you spend one of
// your twelve, and the person on the other end owes you nothing back. It is
// the one social gesture here that CANNOT be turned into a comparison — there
// is no wash-back, no streak of washes, no "you're their #1", and the count of
// washings you've RECEIVED is visible to nobody but you.
//
// KEEP IN SYNC with supabase/migrations/0068 — the cap is enforced there (the
// client copy is what draws "3 of 12 left"), and the milestone goals are what
// the section's ladder reads. Same client/server mirror as lib/practice.ts and
// store/focus.ts.

/**
 * Twelve a day, one for each disciple — the cap IS the theme, which is why it
 * can be this generous. Each one has to land on a different real account, so
 * reaching twelve means knowing twelve people who play. Worth 12 XP against a
 * daily drop's 30-60.
 */
export const WASH_DAILY_CAP = 12

/** What one washing pays the person who did it. */
export const WASH_XP = 1

export interface WashMilestone {
  id: string
  /** Lifetime washings needed. */
  goal: number
  name: string
  blurb: string
  emoji: string
}

// A ladder, not a leaderboard: every rung is a number you reached, never a
// place you hold. Nothing expires, nothing resets, and there is no rung for
// being washed — receiving isn't an achievement, it's a gift.
export const WASH_MILESTONES: WashMilestone[] = [
  { id: 'wash_basin', goal: 1, name: 'The Basin', emoji: '🪣', blurb: 'You knelt down once.' },
  { id: 'wash_upper_room', goal: 12, name: 'The Upper Room', emoji: '🕯️', blurb: 'Twelve pairs of feet — a whole room of them.' },
  { id: 'wash_as_jesus', goal: 25, name: 'As Jesus Did', emoji: '🫗', blurb: 'Twenty-five, and not one of them owed you anything.' },
  { id: 'wash_towel', goal: 100, name: 'Towel and Water', emoji: '🧺', blurb: 'A hundred. You keep the towel over your arm now.' },
  { id: 'wash_servant', goal: 500, name: 'Servant of All', emoji: '👑', blurb: '“The greatest among you shall be your servant.”' },
]

/** The highest rung reached, or null before the first washing. */
export function washRank(lifetime: number): WashMilestone | null {
  let best: WashMilestone | null = null
  for (const m of WASH_MILESTONES) if (lifetime >= m.goal) best = m
  return best
}

/** The rung being climbed, or null once every one is behind you. */
export function nextWashMilestone(lifetime: number): WashMilestone | null {
  return WASH_MILESTONES.find((m) => lifetime < m.goal) ?? null
}

/** True when this washing was the one that reached a rung — worth a celebration. */
export function washMilestoneReached(lifetime: number): WashMilestone | null {
  return WASH_MILESTONES.find((m) => m.goal === lifetime) ?? null
}
