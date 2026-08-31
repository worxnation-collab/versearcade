// First light — the day's lantern.
//
// The first person to open a day's verse holds it, and every account that
// opens the same verse after them is worth ONE XP to them. Nothing is taken
// from the follower: the point is minted by the server, and their own XP,
// score, streak and standing are byte-identical to what they'd have been.
//
// WHY THIS ISN'T A LEADERBOARD, which is the only reason it can exist here.
// One person is named per day and NOBODY has a position — there is no second
// place, no "you were 400th", and no RPC that could build an ordering (0081
// reads daily_opens as a count and a primary key, never as a sorted list).
// Being late is invisible. And the lantern is a DAY rather than a ladder: it
// resets at midnight, nothing accumulates, and there is deliberately no
// lifetime "dawns held" number and no Journal rung — the same argument
// record_prayer makes for having no streak. A rung you climb by getting up
// earlier is a rung people would get up earlier to climb.
//
// KEEP IN SYNC with supabase/migrations/0081_first_light.sql — the ceiling is
// enforced there, and this copy is only what draws the line about it. Same
// client/server mirror as data/washing.ts and lib/practice.ts.

/**
 * The most XP a day's lantern can pay, however many people follow you in.
 *
 * About one daily drop (submit_play pays 30-60), which is the whole bound on
 * this: `profiles.xp` IS the worldwide leaderboard (0006), so holding the
 * lantern in front of ten thousand people has to be worth an extra run and not
 * a rank. The server still counts every follower honestly — the card can say
 * "1,400 opened it after you" while the XP stops at the ceiling.
 */
export const FIRST_LIGHT_XP_CAP = 60

/** What one follower pays the holder. */
export const FIRST_LIGHT_XP = 1

/**
 * The line under the lantern, for whoever is reading it.
 *
 * Never says a position, a rank or a time to beat, and never addresses anybody
 * as late — a follower reads a fact about the day, not a fact about
 * themselves.
 */
export function firstLightLine(o: {
  claimed: boolean
  mine: boolean
  holder: string | null
  followers: number
  iOpened: boolean
  canHold: boolean
}): string {
  if (!o.claimed) {
    return o.canHold
      ? 'Nobody has opened today’s verse yet — whoever gets there first holds it today.'
      : 'Nobody has opened today’s verse yet.'
  }
  if (o.mine) {
    const n = o.followers
    if (n === 0) return 'You opened today’s verse first. Today’s first light is yours.'
    return `You lit it first today — ${n.toLocaleString()} ${n === 1 ? 'player has' : 'players have'} followed you in since.`
  }
  if (!o.holder) return 'Someone has already opened today’s verse.'
  return o.iOpened
    ? `@${o.holder} opened today’s verse first — you were one of the ones who followed them in.`
    : `@${o.holder} opened today’s verse first today.`
}
