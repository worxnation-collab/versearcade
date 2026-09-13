// The badge a streak earns — a NAME and a painting, and deliberately nothing
// else.
//
// A streak has been the app's biggest ladder since the first migration and its
// reward has always been a 44px ring around an avatar. Nobody sees a ring.
// Bible Path's single best screenshot is a named, framed badge — "15-Day
// Streak · Pathfinder" — and it is the one thing in these competitors that is
// pure upside here, because this app already has the number and the art
// pipeline and simply never drew anything with them.
//
// Four rules, and they are why a badge can exist in an app with no losers:
//
// - **Purely derived.** A badge is `longestStreak` read against this table.
//   No column, no grant, no migration, nothing to revoke — the same bargain
//   `data/seals.ts` makes. And it reads LONGEST rather than current, so a bad
//   week can never take one back.
// - **A number you passed, never a place you hold.** Exactly the sentence
//   `data/washing.ts` is built on. It is not a rank, nobody else's is shown
//   beside it, and there is no ordering of players by badge anywhere.
// - **There is no denominator.** The badge you have, and the one name of the
//   next rung — never a bar filling toward it, never "day 12 of 30". That is
//   the line the Seals page holds against its 66 and the Wardrobe holds
//   absolutely: a gallery of what exists is an invitation, the same gallery
//   with distance on it is a list of what you are behind on.
// - **It grants NOTHING.** No XP, no border, no skin, no odds, no rung on any
//   other ladder. It is a look and a word, which is what lets it hang off the
//   one number in this app people might otherwise chase.
//
// The art is Nano Banana like everything else (`art/streak-badges.json` →
// `public/keep/`), resolved through `GENERATED_ART` with a drawn fallback, so
// a build whose renders have not landed still shows a badge rather than a hole.

export interface StreakBadge {
  /** Also the art id in GENERATED_ART. */
  id: string
  /** Days in a row this is earned at. */
  days: number
  /** A title, not a count — the count is already on screen beside it. */
  name: string
  /** One line. What the day felt like, never an instruction. */
  blurb: string
  /** The drawn fallback's ribbon colour, and the frame tint under the render. */
  hex: string
}

/**
 * Six rungs, matching the ladders that already exist rather than inventing a
 * seventh: 3/7/30/100/365 are the Journal's own streak rungs, and 1000 is where
 * the `halo` border sits. A badge that disagreed with the Journal about what
 * counts as a milestone would be two ladders for one number.
 */
export const STREAK_BADGES: StreakBadge[] = [
  { id: 'streak_3',    days: 3,    name: 'Three Mornings',     blurb: 'Three days running. It has started being a habit.', hex: '#c98a4b' },
  { id: 'streak_7',    days: 7,    name: 'The Full Week',      blurb: 'Seven days. A whole week of showing up.',           hex: '#c9a227' },
  { id: 'streak_30',   days: 30,   name: 'The Steady Month',   blurb: 'A month unbroken.',                                 hex: '#9aa7b4' },
  { id: 'streak_100',  days: 100,  name: 'A Hundred Mornings', blurb: 'A hundred days. Not many people get here.',         hex: '#d4a537' },
  { id: 'streak_365',  days: 365,  name: 'The Year Kept',      blurb: 'A full year of mornings.',                          hex: '#8f7ad6' },
  { id: 'streak_1000', days: 1000, name: 'A Thousand Mornings', blurb: 'A thousand days.',                                 hex: '#e6c65c' },
]

/** The highest badge this streak has passed, or null before the first. */
export function badgeFor(longestStreak: number): StreakBadge | null {
  let hit: StreakBadge | null = null
  for (const b of STREAK_BADGES) if (longestStreak >= b.days) hit = b
  return hit
}

/**
 * The next badge — its NAME only.
 *
 * Deliberately returns no distance and no fraction: the caller has nothing to
 * draw a bar with, which is the cheapest way to make sure nobody draws one.
 */
export function nextBadge(longestStreak: number): StreakBadge | null {
  return STREAK_BADGES.find((b) => longestStreak < b.days) ?? null
}
