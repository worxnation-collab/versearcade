// What a battle pays, and the ceiling on it.
//
// KEEP IN SYNC WITH `award_battle_xp` (0086) — the usual pair. These two numbers
// exist here so the screens can say what a battle is worth without asking the
// server what its own rules are; the SERVER is what actually counts and pays,
// and no client ever sends an amount.
//
// THE SENTENCE THE WHOLE THING TURNS ON: what is paid for is turning up to a
// battle, not winning one. The winner and the loser are paid the identical 10
// XP, because `xp` IS the worldwide leaderboard (0006) and a battle that moved
// it by its result would turn that board into a battle ladder — which is the
// one thing this app does not build. Losing still costs nothing.

/** XP for a battle you played, win or lose. */
export const BATTLE_XP = 10

/** How many battles pay in a local day. 10 x 3 = 30, a daily drop's worth. */
export const BATTLE_XP_CAP = 3
