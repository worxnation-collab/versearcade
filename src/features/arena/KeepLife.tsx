import { CrowdLife, type CrowdWaypoint } from '@/components/CrowdLife'
import type { KeepMember } from '@/store/keep'

// Life in the hall — the keep's configuration of the shared CrowdLife engine
// (components/CrowdLife): waypoints on the painted hall's open floor, and a
// depth cue tuned to the room. The scheduling, glide, bob/breathe, facing,
// tap-to-player-card and reduce-motion behaviour all live in the engine, so
// the hall and the churchyard can't drift apart.
//
// Static figures were deliberately cut before the engine existed — if these
// ever stop moving, remove them rather than letting them go back to being
// stickers.

// Standing spots on the painted hall's open floor, as percentages of the scene
// (the hall is a 560x300 viewBox rendered edge-to-edge). All are in FRONT of
// the painting — the room is one flat image, so nothing can pass behind the
// table; the spots are chosen so nobody has to.
const WAYPOINTS: CrowdWaypoint[] = [
  { x: 24.1, b: 12.7 }, // warming at the hearth
  { x: 17.0, b: 18.0 }, // back left, by the chimney
  { x: 40.2, b: 10.7 }, // the near end of the table
  { x: 58.9, b: 8.7 },  // the far end of the table
  { x: 48.2, b: 2.7 },  // mid-floor, front
  { x: 36.6, b: 19.3 }, // along the back wall
  { x: 81.3, b: 14.0 }, // looking in at the stable
]

/** Depth cue: further up the floor = smaller. b 1.7..20.7% -> 44..26px. */
const sizeFor = (b: number) =>
  Math.round(44 - ((Math.min(Math.max(b, 1.7), 20.7) - 1.7) / 19) * 18)

export function KeepLife({ members }: { members: KeepMember[] }) {
  return <CrowdLife members={members} waypoints={WAYPOINTS} sizeFor={sizeFor} max={6} />
}
