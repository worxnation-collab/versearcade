import type { CabinetScreen } from './ArcadeCabinet'

// What's in the arcade.
//
// One list, and every surface that mentions the arcade reads it: the lobby
// draws a cabinet per entry, and adding a game is a row here plus a route.
// Same choke-point habit as `QuizRunner` and the little worlds — two places
// listing the machines would disagree the first time one was added.
//
// **Pure data, deliberately: this file imports no screens.** It used to hold
// each game's component, which put it in an import cycle with `ArcadeShell`
// (the shell needs the share copy that lives here, and every game renders the
// shell). Module cycles happen to work until the day one of them is read at
// import time and comes back undefined. `gameScreens.ts` holds the components
// instead, keyed by the id union below so the compiler makes the two agree.
//
// **Nothing in here may rank anybody**, which is the whole reason an arcade can
// exist in this app at all. A game may be one a player gets better at, but its
// result has to be private and uncomparable: your own two numbers against your
// own bar, never a board, a percentile or a shareable score.

/** Every machine, as a type — `gameScreens.ts` must cover all of them. */
export type ArcadeGameId = 'manna' | 'cross'

export interface ArcadeGame {
  id: ArcadeGameId
  title: string
  /** The caption under the cabinet — what a minute of it is like. */
  tagline: string
  /** Route the cabinet opens. */
  to: string
  /**
   * The line a share carries. **No score, ever** — the arcade's whole safety
   * argument is that a result here can't be set beside anybody else's, and
   * "I got 47, beat me" is exactly the comparison this app doesn't build. A
   * share invites somebody to the machine, it doesn't challenge them.
   */
  shareLine: string
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
    shareLine: 'Seven days in the wilderness — gather the fresh manna, leave yesterday’s, and rest on the seventh.',
    screen: 'manna',
  },
  {
    id: 'cross',
    title: 'Cross Word',
    tagline: 'Two words, one shared letter · finish it and it turns to wood',
    to: '/arcade/cross',
    shareLine: 'Two words that share a letter, standing as a cross. Finish it and it turns to wood, with the verse underneath.',
    screen: 'cross',
    // It marks its verse studied on your Bible, which is a record rather than a
    // round — so this one asks for an account where Manna Rush doesn't.
    needsAccount: true,
  },
]

export function arcadeGameById(id: string | undefined): ArcadeGame | null {
  return ARCADE_GAMES.find((g) => g.id === id) ?? null
}

/** The link a share hands out: one free go on this machine, account or not. */
export function arcadeInvitePath(gameId: string): string {
  return `/arcade/${gameId}/invite`
}
