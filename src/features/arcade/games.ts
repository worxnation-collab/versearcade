import type { CabinetScreen } from './ArcadeCabinet'

// What's in the arcade.
//
// One list, and every surface that mentions the arcade reads it: the lobby
// draws a cabinet per entry, and adding a game is a row here plus a route.
// Same choke-point habit as `QuizRunner` and the little worlds — two places
// listing the machines would disagree the first time one was added.
//
// **Nothing in here may rank anybody**, which is the whole reason an arcade can
// exist in this app at all. A game may be one a player gets better at, but its
// result has to be private and uncomparable: your own two numbers against your
// own bar, never a board, a percentile or a shareable score.

export interface ArcadeGame {
  id: string
  title: string
  /** The caption under the cabinet — what a minute of it is like. */
  tagline: string
  /** Route the cabinet opens. */
  to: string
  /** What plays on the cabinet's little screen in the lobby. */
  screen: CabinetScreen
  /**
   * True where the game writes something to the player's own record, so the
   * lobby can show the padlock rather than let a guest walk into a wall with
   * no warning. The gate itself is still the route's `RequireAccount` — this
   * is only what the machine looks like from across the room.
   */
  needsAccount?: boolean
}

export const ARCADE_GAMES: ArcadeGame[] = [
  {
    id: 'manna',
    title: 'Manna Rush',
    tagline: 'Seven days in the wilderness · gather the fresh flakes, leave the old',
    to: '/arcade/manna',
    screen: 'manna',
  },
  {
    id: 'cross',
    title: 'Cross Word',
    tagline: 'Two words, one shared letter · finish it and it turns to wood',
    to: '/arcade/cross',
    screen: 'cross',
    // It marks its verse studied on your Bible, which is a record rather than a
    // round — so this one asks for an account where Manna Rush doesn't.
    needsAccount: true,
  },
]

export function arcadeGameByPath(pathname: string): ArcadeGame | null {
  return ARCADE_GAMES.find((g) => pathname.toLowerCase().startsWith(g.to)) ?? null
}
