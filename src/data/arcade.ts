// What a run on an arcade machine is worth.
//
// Kept here rather than in `features/arcade/games.ts` for an import-graph
// reason: that file pulls in a component type, and `store/arcadeXp.ts` has no
// business importing a screen to learn a number.
//
// KEEP IN SYNC with `record_arcade_play` (0084), which is the authority. This
// constant is the GUEST mirror and the number a result screen draws after the
// fact — it is never sent to the server, because `xp` is the worldwide
// leaderboard (0006) and no client may say what it earned.
export const ARCADE_XP = 5
