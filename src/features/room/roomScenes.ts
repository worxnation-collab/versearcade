import room1 from '@/assets/rooms/room1.jpg'
import room2 from '@/assets/rooms/room2.jpg'
import room3 from '@/assets/rooms/room3.jpg'
import room4 from '@/assets/rooms/room4.jpg'
import room5 from '@/assets/rooms/room5.jpg'
import { useEffect, useState } from 'react'
import { DEFAULT_ROOM_SKIN } from './skins'

// Five owner-supplied paintings of the Upper Room (2026-10-21), one picked at
// random each time the room is opened and again each time the app comes back
// to the foreground, so the room is never quite the same twice.
//
// They are the DEFAULT material's (Clay) paintings only, by the owner's call:
// Limestone, Cedar and Dusk keep their own tiered renders, so choosing a
// material still changes how the room looks. Every scene has the arcade on the
// left, the table in the centre and open floor — but not where the drawn
// chamber put them, so the scenes carry their own anchor spots and walking
// path (below). The anchor IDS are unchanged; only where each one stands.
export const ROOM_SCENES = [room1, room2, room3, room4, room5]

type Spot = { x: number; y: number }

// Measured off the five paintings cropped to the room's 560x300 viewBox (the
// images are `slice`d, losing ~38 units top and bottom). Common ground:
// the cabinet fills x 0..170, every tabletop sits at y ~165..180 between
// x ~225 and ~390, bare wall runs x ~190..400 above y ~140, and open floor is
// y ~220..295 right of the cabinet. Nothing stands over the cabinet.
const SCENE_SPOTS: Record<string, Spot> = {
  // Two more pieces on the tabletop's ends — no scene paints a shelf.
  shelf_1: { x: 240, y: 172 },
  shelf_2: { x: 372, y: 172 },
  table_1: { x: 290, y: 170 },
  table_2: { x: 330, y: 170 },
  wall_1: { x: 222, y: 92 },
  wall_2: { x: 290, y: 78 },
  wall_3: { x: 362, y: 92 },
  sill_1: { x: 440, y: 205 },
  floor_1: { x: 205, y: 272 },
  floor_2: { x: 330, y: 288 },
  floor_3: { x: 440, y: 270 },
  nook_1: { x: 515, y: 255 },
}

// The sill is the one spot that differs by painting: a real ledge where one is
// painted (the sideboard in 1, the window sills in 3, 4 and 5), the floor by
// the back wall where none is (2).
const SILL_BY_SCENE: Record<string, Spot> = {
  [room1]: { x: 470, y: 145 },
  [room3]: { x: 432, y: 152 },
  [room4]: { x: 500, y: 128 },
  [room5]: { x: 438, y: 157 },
}

/** Where an anchor stands over one of the random scenes, if it is moved. */
export const sceneSpot = (scene: string, id: string): Spot | undefined =>
  (id === 'sill_1' ? SILL_BY_SCENE[scene] : undefined) ?? SCENE_SPOTS[id]

/** The walking path over the scenes: open floor only, clear of the cabinet. */
export const SCENE_WAYPOINTS = [
  { x: 42, b: 6 },
  { x: 56, b: 3 },
  { x: 70, b: 10 },
  { x: 84, b: 5 },
  { x: 62, b: 16 },
]

const pick = (not?: string | null): string => {
  const pool = ROOM_SCENES.length > 1 && not ? ROOM_SCENES.filter((s) => s !== not) : ROOM_SCENES
  return pool[Math.floor(Math.random() * pool.length)]
}

/** Whether a room in this material takes the random scenes. */
export const takesRandomScene = (skin?: string | null): boolean => (skin ?? DEFAULT_ROOM_SKIN) === DEFAULT_ROOM_SKIN

/**
 * The scene for one mounted room: chosen on mount (opening the room), and
 * re-chosen when the page becomes visible again (returning to the app). It
 * avoids repeating the one just shown, so a return always reads as a change.
 */
export function useRoomScene(): string {
  const [scene, setScene] = useState(() => pick())
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setScene((s) => pick(s))
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])
  return scene
}
