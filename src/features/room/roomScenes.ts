import room1 from '@/assets/rooms/room1.jpg'
import room2 from '@/assets/rooms/room2.jpg'
import room3 from '@/assets/rooms/room3.jpg'
import room4 from '@/assets/rooms/room4.jpg'
import room5 from '@/assets/rooms/room5.jpg'
import { dailySceneIndex, useToday } from '@/lib/dailyScene'
import { DEFAULT_ROOM_SKIN } from './skins'

// Five owner-supplied paintings of the Upper Room (2026-10-21), one per day:
// the same scene for everybody on a local date (lib/dailyScene.ts), so a
// visitor sees the room as its owner does today, moving on at midnight.
//
// They are the DEFAULT material's (Clay) paintings only, by the owner's call:
// Limestone, Cedar and Dusk keep their own tiered renders, so choosing a
// material still changes how the room looks. Every scene has the arcade on the
// left, the table in the centre and open floor — but not where the drawn
// chamber put them, so each scene carries its own anchor spots and sizes
// (below). The anchor IDS are unchanged; only where each one stands.
export const ROOM_SCENES = [room1, room2, room3, room4, room5]

type Spot = { x: number; y: number; s?: number }

// Measured off each painting cropped to the room's 560x300 viewBox (the
// images are `slice`d, losing ~38 units top and bottom). The five scenes share
// a plan — cabinet in the left corner, a table in the centre, open floor in
// front — but not its numbers: the tabletops sit at different heights, the
// windows, shelves and sideboards are in different places, and a shared table
// left a lamp hovering over the table in one painting and sunk into it in
// another. So every scene carries its own spot per anchor, plus a size: the
// paintings' camera is closer than the drawn chamber's, and a stool drawn at
// the chamber's size stood knee-high to the table. Nothing stands over the
// cabinet. Re-measure if a painting is replaced.
const SCENE_LAYOUTS: Record<string, Record<string, Spot>> = {
  // Warm lamplight: window behind the cabinet, a sideboard and a wall shelf
  // on the right, the lamp painted on the tabletop.
  [room1]: {
    shelf_1: { x: 528, y: 112, s: 1.2 },
    shelf_2: { x: 448, y: 146, s: 1.3 },
    sill_1: { x: 162, y: 138, s: 1.1 },
    table_1: { x: 292, y: 182, s: 1.5 },
    table_2: { x: 412, y: 178, s: 1.5 },
    wall_1: { x: 370, y: 62, s: 1.3 },
    wall_2: { x: 424, y: 100, s: 1.3 },
    wall_3: { x: 470, y: 50, s: 1.3 },
    floor_1: { x: 200, y: 268, s: 1.5 },
    floor_2: { x: 318, y: 296, s: 1.6 },
    floor_3: { x: 480, y: 270, s: 1.5 },
    nook_1: { x: 520, y: 232, s: 1.4 },
  },
  // Grey daylight: one high window, a bare wall, a bench on the right.
  [room2]: {
    shelf_1: { x: 492, y: 188, s: 1.2 },
    shelf_2: { x: 522, y: 188, s: 1.2 },
    sill_1: { x: 460, y: 64, s: 1.1 },
    table_1: { x: 256, y: 168, s: 1.5 },
    table_2: { x: 372, y: 168, s: 1.5 },
    wall_1: { x: 210, y: 80, s: 1.4 },
    wall_2: { x: 300, y: 64, s: 1.4 },
    wall_3: { x: 388, y: 84, s: 1.4 },
    floor_1: { x: 200, y: 270, s: 1.5 },
    floor_2: { x: 330, y: 294, s: 1.6 },
    floor_3: { x: 440, y: 276, s: 1.5 },
    nook_1: { x: 512, y: 246, s: 1.4 },
  },
  // Golden afternoon: the big arched window on the right, a shelf of jars on
  // the left wall, a barrel in the corner.
  [room3]: {
    shelf_1: { x: 226, y: 63, s: 1.1 },
    shelf_2: { x: 262, y: 63, s: 1.1 },
    sill_1: { x: 455, y: 149, s: 1.1 },
    table_1: { x: 248, y: 170, s: 1.5 },
    table_2: { x: 382, y: 168, s: 1.5 },
    wall_1: { x: 300, y: 100, s: 1.3 },
    wall_2: { x: 350, y: 60, s: 1.3 },
    wall_3: { x: 385, y: 118, s: 1.2 },
    floor_1: { x: 190, y: 266, s: 1.5 },
    floor_2: { x: 330, y: 294, s: 1.6 },
    floor_3: { x: 440, y: 280, s: 1.5 },
    nook_1: { x: 520, y: 252, s: 1.4 },
  },
  // Night: a lantern on the table, a niche of shelves, a pillar and a narrow
  // window on the right.
  [room4]: {
    shelf_1: { x: 372, y: 117, s: 1.1 },
    shelf_2: { x: 372, y: 92, s: 1.1 },
    sill_1: { x: 525, y: 128, s: 1.1 },
    table_1: { x: 226, y: 160, s: 1.4 },
    table_2: { x: 340, y: 160, s: 1.4 },
    wall_1: { x: 245, y: 105, s: 1.3 },
    wall_2: { x: 418, y: 92, s: 1.3 },
    wall_3: { x: 300, y: 40, s: 1.2 },
    floor_1: { x: 200, y: 266, s: 1.5 },
    floor_2: { x: 330, y: 292, s: 1.6 },
    floor_3: { x: 440, y: 254, s: 1.5 },
    nook_1: { x: 512, y: 240, s: 1.4 },
  },
  // Morning: the open window with a pot on its sill, a shelf on the back
  // wall, a chest under the window.
  [room5]: {
    shelf_1: { x: 332, y: 92, s: 1.1 },
    shelf_2: { x: 372, y: 92, s: 1.1 },
    sill_1: { x: 502, y: 156, s: 1.1 },
    table_1: { x: 268, y: 165, s: 1.5 },
    table_2: { x: 378, y: 163, s: 1.5 },
    wall_1: { x: 185, y: 95, s: 1.3 },
    wall_2: { x: 240, y: 68, s: 1.3 },
    wall_3: { x: 292, y: 104, s: 1.2 },
    floor_1: { x: 190, y: 266, s: 1.5 },
    floor_2: { x: 320, y: 294, s: 1.6 },
    floor_3: { x: 446, y: 272, s: 1.5 },
    nook_1: { x: 520, y: 248, s: 1.4 },
  },
}

/** Where an anchor stands over one of the daily scenes, and how large. */
export const sceneSpot = (scene: string, id: string): Spot | undefined => SCENE_LAYOUTS[scene]?.[id]

/** The walking path over the scenes: open floor only, clear of the cabinet
 *  and the table's legs. */
export const SCENE_WAYPOINTS = [
  { x: 42, b: 6 },
  { x: 56, b: 3 },
  { x: 70, b: 10 },
  { x: 84, b: 5 },
  { x: 62, b: 16 },
]

/** Whether a room in this material takes the five daily scenes. */
export const takesRandomScene = (skin?: string | null): boolean => (skin ?? DEFAULT_ROOM_SKIN) === DEFAULT_ROOM_SKIN

/** Today's scene. Offset by two so it doesn't step in lockstep with the keep. */
export function useRoomScene(): string {
  const today = useToday()
  return ROOM_SCENES[dailySceneIndex(today, ROOM_SCENES.length, 2)]
}
