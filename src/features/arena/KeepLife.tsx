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

/** Depth cue: further up the floor = smaller. b 1.7..20.7% -> 44..26px. */
const sizeFor = (b: number) =>
  Math.round(44 - ((Math.min(Math.max(b, 1.7), 20.7) - 1.7) / 19) * 18)

export function KeepLife({
  members,
  inert = false,
  waypoints,
}: {
  members: KeepMember[]
  inert?: boolean
  /** The painting's own open floor (keepBackdrop.ts). */
  waypoints: CrowdWaypoint[]
}) {
  return <CrowdLife members={members} waypoints={waypoints} sizeFor={sizeFor} max={6} inert={inert} />
}
