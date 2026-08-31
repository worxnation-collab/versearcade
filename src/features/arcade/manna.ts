import { plotGrid, type TapGameDef, type TapPlot } from '@/lib/tapGame'

// Manna Rush — Exodus 16, played with one thumb.
//
// Whack-a-mole where the question is not how fast but whether you should tap at
// all. Fresh manna is taken; manna kept over from yesterday bred worms and is
// left alone; and the seventh day has nothing on the ground, so the best thing
// a player can do in the whole game is keep their hands still for six seconds.
//
// The week IS the difficulty curve. There is no level select and no speed
// slider: leftovers start appearing on the second day, the sixth day asks for
// double, and the seventh asks for nothing. That is the passage, in order.
//
// Nothing here is a punishment. A wrong tap costs no manna and ends nothing —
// the round stops being a clean one, and a verse says why the rule exists.

/** Kept-over manna as a share of spawns, per day. Day one has no yesterday. */
const KEPT = [0, 18, 24, 28, 32, 32]

const day = (
  n: number,
  quota: number,
  durationMs: number,
  spawnEveryMs: number,
  lifeMs: number,
  note: string,
) => ({
  key: `day-${n}`,
  title: `Day ${n}`,
  note,
  quota,
  durationMs,
  spawnEveryMs,
  lifeMs,
  kinds: [
    { kind: 'manna', verdict: 'take' as const, weight: 100 - KEPT[n - 1] },
    { kind: 'kept', verdict: 'leave' as const, weight: KEPT[n - 1] },
  ],
})

export const MANNA_RUSH: TapGameDef = {
  id: 'manna',
  name: 'Manna Rush',
  rounds: [
    day(1, 5, 9000, 700, 1650, 'Gather one omer — five flakes'),
    day(2, 5, 9000, 670, 1570, 'Leave anything kept from yesterday'),
    day(3, 6, 9500, 640, 1490, 'Gather one omer — six flakes'),
    day(4, 6, 9500, 610, 1410, 'Gather one omer — six flakes'),
    day(5, 7, 10000, 580, 1330, 'Gather one omer — seven flakes'),
    day(6, 10, 13000, 520, 1250, 'Two omers. Tomorrow is a rest.'),
    {
      key: 'day-7',
      title: 'Day 7',
      note: 'Nothing falls. Keep still.',
      // Quota zero is what makes this a rest round: nothing spawns, and the
      // whole round is whether the player can leave the screen alone.
      quota: 0,
      durationMs: 6000,
      spawnEveryMs: 0,
      lifeMs: 0,
      kinds: [],
    },
  ],
  teach: {
    wrong: {
      text: 'That one was kept over. It bred worms and stank.',
      cite: 'Exodus 16:20',
    },
    missed: { text: 'When the sun waxed hot, it melted.', cite: 'Exodus 16:21' },
    quota: {
      text: 'Enough. He that gathered much had nothing over, and he that gathered little had no lack.',
      cite: 'Exodus 16:18',
    },
    ground: {
      text: 'There went out some of the people to gather, and they found none.',
      cite: 'Exodus 16:27',
    },
  },
  labels: {
    taken: 'omers',
    clean: 'days clean',
    restKept: 'Rest kept',
    // Warm, never a telling-off. Going out to look on the seventh day is what
    // the people in the passage did.
    restBroken: 'You went out looking. So did they.',
  },
}

/**
 * Where manna can fall: three rows across the sand, smaller further up.
 *
 * The percentages are of TapRunner's field box, which already stops short of
 * the teach line at the bottom — a flake under the toast is one nobody can
 * reach.
 */
export const MANNA_PLOTS: TapPlot[] = plotGrid(
  [15, 38, 62, 86],
  [
    { y: 15, scale: 0.8 },
    { y: 48, scale: 0.96 },
    { y: 83, scale: 1.12 },
  ],
)
