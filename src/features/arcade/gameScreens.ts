import type { ComponentType } from 'react'
import type { ArcadeGameId } from './games'
import MannaScreen from './MannaScreen'
import WordCatchScreen from './WordCatchScreen'
import CrossWordScreen from './CrossWordScreen'

// Which component is which machine, so a shared link can mount a game without
// a second switch statement to keep in step with `ARCADE_GAMES`.
//
// It's a `Record<ArcadeGameId, …>` rather than a field on the game rows for a
// concrete reason: the rows have to stay pure data (see the header in
// `games.ts` — components there put that file in an import cycle with
// `ArcadeShell`). Keying by the id union buys back what the field gave away —
// adding a machine to the union fails to compile until it has a row AND a
// screen, so the two lists cannot drift.
//
// `demo` is the free go a shared link hands out: the game runs exactly as it
// does anywhere else, but pays nothing and offers no "again".
export const GAME_SCREENS: Record<ArcadeGameId, ComponentType<{ demo?: boolean }>> = {
  manna: MannaScreen,
  'word-catch': WordCatchScreen,
  cross: CrossWordScreen,
}
