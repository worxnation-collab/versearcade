// The keep's backdrop rotator. Five painted halls (src/assets/keeps/), and one
// of them is drawn behind the room each time the Keep is opened or the app
// comes back to the foreground.
//
// It is BACKGROUND ONLY: every scene is a bare hall with no figure and nothing
// to tap. The drawn tier hall is still underneath as the loading/offline
// fallback.
//
// The pick is module state rather than per-component, so the hall on the Battle
// tab and the hall in the sheet are the same room at the same moment.
//
// **Each painting carries its own layout.** The five halls put their tables,
// hearths, windows and bare walls in five different places, and none of them
// where hall.jpg did — so a piece on the shared ANCHORS stood on air (a lamp
// floating over the table, the destrier ON the table, the gonfalon over a
// window). The anchor IDS and mounts are unchanged; only where each one stands
// and how large it is drawn. Spots are in the hall's 560x300 viewBox, measured
// off each painting as it is `slice`d into it (1168x784 scaled to 560 wide
// loses ~38 units top and bottom). Re-measure if a painting is replaced.

import { useEffect, useSyncExternalStore } from 'react'
import type { CrowdWaypoint } from '@/components/CrowdLife'
import keep1 from '@/assets/keeps/keep1.jpg'
import keep2 from '@/assets/keeps/keep2.jpg'
import keep3 from '@/assets/keeps/keep3.jpg'
import keep4 from '@/assets/keeps/keep4.jpg'
import keep5 from '@/assets/keeps/keep5.jpg'

export interface SceneSpot {
  x: number
  y: number
  /** Drawn size relative to the prop's own; the paintings' camera is closer. */
  s?: number
}

export interface KeepBackdrop {
  src: string
  /** Where each anchor stands over this painting, by anchor id. */
  spots: Record<string, SceneSpot>
  /** The faction gonfalon's top-centre — on bare stone, never a window. */
  gonfalon: { x: number; y: number }
  /** Open floor the crowd walks, clear of the painted table and hearth. */
  waypoints: CrowdWaypoint[]
}

export const KEEP_BACKDROPS: readonly KeepBackdrop[] = [
  {
    // Hearth on the left, the long table running back from the front centre,
    // the arcade of arches receding on the right.
    src: keep1,
    gonfalon: { x: 122, y: 18 },
    spots: {
      banner_l: { x: 272, y: 34, s: 1.1 },
      banner_r: { x: 520, y: 40, s: 1.1 },
      wall_1: { x: 270, y: 120 },
      wall_2: { x: 345, y: 125 },
      wall_3: { x: 430, y: 110 },
      rafters_1: { x: 330, y: 10 },
      rafters_2: { x: 450, y: 24 },
      table_1: { x: 290, y: 246, s: 1.4 },
      table_2: { x: 372, y: 246, s: 1.4 },
      floor_1: { x: 175, y: 278, s: 1.3 },
      floor_2: { x: 488, y: 296, s: 1.4 },
      stable_1: { x: 508, y: 234, s: 1.0 },
    },
    waypoints: [
      { x: 10, b: 10 }, { x: 22, b: 4 }, { x: 34, b: 6 }, { x: 66, b: 9 },
      { x: 78, b: 3 }, { x: 86, b: 12 }, { x: 46, b: 1 },
    ],
  },
  {
    // A great arch on the left, stair beyond it, the table across the front
    // right and a second arch to the far right.
    src: keep2,
    gonfalon: { x: 300, y: 18 },
    spots: {
      banner_l: { x: 345, y: 82, s: 1.1 },
      banner_r: { x: 410, y: 40, s: 1.1 },
      wall_1: { x: 180, y: 150 },
      wall_2: { x: 395, y: 150 },
      wall_3: { x: 538, y: 150 },
      rafters_1: { x: 230, y: 10 },
      rafters_2: { x: 395, y: 20 },
      table_1: { x: 300, y: 230, s: 1.4 },
      table_2: { x: 410, y: 216, s: 1.4 },
      floor_1: { x: 120, y: 268, s: 1.3 },
      floor_2: { x: 520, y: 292, s: 1.4 },
      stable_1: { x: 160, y: 228, s: 1.1 },
    },
    waypoints: [
      { x: 8, b: 8 }, { x: 18, b: 3 }, { x: 28, b: 14 }, { x: 40, b: 18 },
      { x: 12, b: 16 }, { x: 88, b: 8 }, { x: 32, b: 2 },
    ],
  },
  {
    // Sunlit windows down the left, the table and hearth on the right.
    src: keep3,
    gonfalon: { x: 452, y: 24 },
    spots: {
      banner_l: { x: 340, y: 20, s: 1.1 },
      banner_r: { x: 275, y: 20, s: 1.1 },
      wall_1: { x: 300, y: 120 },
      wall_2: { x: 352, y: 150 },
      wall_3: { x: 192, y: 110 },
      rafters_1: { x: 390, y: 8 },
      rafters_2: { x: 200, y: 8 },
      table_1: { x: 335, y: 206, s: 1.3 },
      table_2: { x: 440, y: 204, s: 1.3 },
      floor_1: { x: 70, y: 262, s: 1.3 },
      floor_2: { x: 300, y: 292, s: 1.4 },
      stable_1: { x: 190, y: 250, s: 1.1 },
    },
    waypoints: [
      { x: 8, b: 6 }, { x: 22, b: 14 }, { x: 40, b: 16 }, { x: 46, b: 4 },
      { x: 26, b: 2 }, { x: 58, b: 1 }, { x: 14, b: 20 },
    ],
  },
  {
    // Night: tall windows on the left, the table and hearth along the right.
    src: keep4,
    gonfalon: { x: 238, y: 18 },
    spots: {
      banner_l: { x: 275, y: 30, s: 1.1 },
      banner_r: { x: 490, y: 26, s: 1.0 },
      wall_1: { x: 245, y: 130 },
      wall_2: { x: 395, y: 135 },
      wall_3: { x: 536, y: 88 },
      rafters_1: { x: 320, y: 8 },
      rafters_2: { x: 440, y: 8 },
      table_1: { x: 330, y: 186, s: 1.2 },
      table_2: { x: 420, y: 190, s: 1.2 },
      floor_1: { x: 180, y: 250, s: 1.3 },
      floor_2: { x: 460, y: 292, s: 1.4 },
      stable_1: { x: 80, y: 258, s: 1.1 },
    },
    waypoints: [
      { x: 30, b: 10 }, { x: 44, b: 4 }, { x: 56, b: 12 }, { x: 22, b: 2 },
      { x: 66, b: 5 }, { x: 38, b: 18 }, { x: 52, b: 1 },
    ],
  },
  {
    // Gothic windows on the left, chandeliers and banners over the table on
    // the right.
    src: keep5,
    gonfalon: { x: 255, y: 30 },
    spots: {
      banner_l: { x: 330, y: 24, s: 1.1 },
      banner_r: { x: 395, y: 72, s: 1.0 },
      wall_1: { x: 146, y: 120 },
      wall_2: { x: 300, y: 150 },
      wall_3: { x: 238, y: 112 },
      rafters_1: { x: 190, y: 6 },
      rafters_2: { x: 320, y: 6 },
      table_1: { x: 330, y: 212, s: 1.3 },
      table_2: { x: 470, y: 215, s: 1.3 },
      floor_1: { x: 90, y: 262, s: 1.3 },
      floor_2: { x: 230, y: 292, s: 1.4 },
      stable_1: { x: 380, y: 292, s: 1.1 },
    },
    waypoints: [
      { x: 8, b: 6 }, { x: 22, b: 14 }, { x: 34, b: 4 }, { x: 46, b: 12 },
      { x: 56, b: 2 }, { x: 14, b: 20 }, { x: 28, b: 1 },
    ],
  },
]

let current = Math.floor(Math.random() * KEEP_BACKDROPS.length)
// The import-time pick IS the first opening's pick; re-rolling on that first
// mount too would swap the painting a frame after it appeared.
let fresh = true
const listeners = new Set<() => void>()

/** Pick a new backdrop — never the one already showing, so a re-roll is seen. */
export function rerollKeepBackdrop() {
  const n = KEEP_BACKDROPS.length
  fresh = false
  if (n < 2) return
  current = (current + 1 + Math.floor(Math.random() * (n - 1))) % n
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

// Returning to the app re-rolls too. One listener for the whole app, attached
// once at import.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') rerollKeepBackdrop()
  })
}

/** The current backdrop, re-rolled when the calling hall mounts. */
export function useKeepBackdrop(): KeepBackdrop {
  useEffect(() => {
    if (fresh) fresh = false
    else rerollKeepBackdrop()
  }, [])
  const i = useSyncExternalStore(subscribe, () => current, () => current)
  return KEEP_BACKDROPS[i]
}
