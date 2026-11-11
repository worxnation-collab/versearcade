import { useEffect } from 'react'
import { useSettings } from '@/store/settings'
import { ArcadeShell } from './ArcadeShell'
import { ARCADE_GAMES } from './games'
import { ArcadeCover } from './ArcadeCover'
import { useArcadeXp } from '@/store/arcadeXp'

// The arcade: three painted covers, and you pick one. Its home is the Study
// tab's Arcade row; the cabinet in your Upper Room and the compass open it too.
//
// The cabinet standing in the hall, the churchyard and the Upper Room used to
// open a game directly. It opens this instead, because there is more than one
// game in there now and a door that always led to the same machine would be
// lying about what the arcade is.
//
// Two things it deliberately doesn't do. There is **no score on any cover** —
// no high score, no last run, no "best today", because a list of games with
// your numbers on it is a scoreboard with a coin slot. And there is **no
// ordering that means anything**: the list is the order they were built, not a
// ranking, a popularity chart or a difficulty ladder.

export default function ArcadeLobby() {
  const loadXp = useArcadeXp((s) => s.load)

  // Warm from the room rather than only when a run ends, so the state is known
  // before anybody taps a machine (same reason StudyScreen loads the library
  // card). It deliberately draws NOTHING here: a machine carrying "+5 today"
  // would be a to-do list, and the first run teaches the reward by paying it.
  useEffect(() => {
    void loadXp()
  }, [loadXp])
  // The Play tab's one-time "the arcade is open" cue retires once the lobby
  // has actually been seen.
  useEffect(() => {
    if (!useSettings.getState().arcadeLobbySeen) useSettings.getState().set({ arcadeLobbySeen: true })
  }, [])

  return (
    <ArcadeShell
      title="The arcade"
      tagline={`${ARCADE_GAMES.length} games · nothing in here touches your rank`}
      home="/study"
    >
      <div style={{ display: 'grid', gap: 14 }}>
        {ARCADE_GAMES.map((game, i) => (
          <ArcadeCover key={game.id} game={game} shape="wide" delay={0.05 * i} />
        ))}
      </div>
    </ArcadeShell>
  )
}
