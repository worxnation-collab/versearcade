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
// left, the table in the centre and open floor, which is what lets the anchors
// in data/room.ts and the crowd's waypoints stay exactly as they were.
export const ROOM_SCENES = [room1, room2, room3, room4, room5]

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
