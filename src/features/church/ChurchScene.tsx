import { ChurchArt } from './ChurchArt'
import { ChurchFlora } from './ChurchFlora'
import { CrowdLife, type CrowdWaypoint } from '@/components/CrowdLife'
import type { Plantings } from './yard'
import type { ChurchMember } from '@/types'

// The church, pulled back far enough that you can see the people.
//
// The hero on your own church tab is a portrait of the *building*. This is the
// wide shot: the same building, smaller, with the congregation standing outside
// it on the grass. That difference is the whole point — a leaderboard row is a
// number, and this is meant to be the moment it turns into a place with people
// in front of it.
//
// The crowd is drawn in two ranks so it reads as depth rather than a line-up:
// the back rank is smaller, dimmer and higher on the ground plane; the front
// rank is bigger and lower. Nobody is ordered by what they gave, and no figure
// carries a score — see the note on ChurchMember.
//
// It draws at most eleven people and deliberately doesn't say so. This is a
// picture of the place, not a census: the roster underneath it names the
// congregation and carries the head count, and a "+23 more" badge up here only
// argued with the list of names right below it.

const CANVAS_H = 236
/** Where the building's own ground ellipse lands, measured from the bottom. */
const GROUND = 82
const CHURCH_W = 190

// The churchyard's standing spots: the lawn either side, the foot of the
// path, and up the path by the door. The congregation wanders between them on
// the shared CrowdLife engine — the same living figures as the keep's hall,
// so the two scenes can't drift apart. All spots keep clear of the building's
// footprint (roughly x 31-69% above b 20%): nobody walks through a wall.
const WAYPOINTS: CrowdWaypoint[] = [
  { x: 14, b: 8 },  // left lawn, front
  { x: 84, b: 9 },  // right lawn, front
  { x: 50, b: 5 },  // the foot of the path
  { x: 50, b: 24 }, // up the path, by the door
  { x: 27, b: 17 }, // mid-left
  { x: 72, b: 18 }, // mid-right
  { x: 12, b: 25 }, // far back, left of the building
  { x: 88, b: 24 }, // far back, right of the building
]

/** Depth cue: further up the yard = smaller. b 5..26% -> 42..27px. */
const sizeFor = (b: number) =>
  Math.round(42 - ((Math.min(Math.max(b, 5), 26) - 5) / 21) * 15)

export function ChurchScene({
  level,
  members,
  skin,
  flora,
  emptyNote = true,
}: {
  level: number
  members: ChurchMember[]
  /** The church's skin, so the wide shot matches the row you tapped. */
  skin?: string | null
  /**
   * What's planted out front — the viewer's own plantings blended with a
   * sample of the congregation's (see features/church/yard.ts). Absent on a
   * yard nobody has given enough to plant, which is simply a lawn.
   */
  flora?: Plantings
  /**
   * Whether an empty crowd says so. False on your own church tab, where the
   * scene is a preview of your own yard and "nobody's playing for this one
   * yet" would be talking about you.
   */
  emptyNote?: boolean
}) {
  return (
    <div
      style={{
        position: 'relative',
        height: CANVAS_H,
        borderRadius: 'var(--r-md)',
        overflow: 'hidden',
        border: '1px solid var(--stroke)',
        background:
          'radial-gradient(120% 90% at 50% 8%, #35197a 0%, #1b0d43 55%, #120829 100%)',
      }}
    >
      {/* A few stars, fixed so they don't twinkle differently on every render. */}
      {STARS.map((s, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            left: `${s[0]}%`,
            top: `${s[1]}%`,
            width: s[2],
            height: s[2],
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.65)',
          }}
        />
      ))}

      {/* Grass. The building's own shadow ellipse sits right on this line. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: GROUND + 6,
          background: 'linear-gradient(180deg, #24404a 0%, #16262f 100%)',
          borderTop: '1px solid rgba(94,231,223,0.18)',
        }}
      />
      {/* The path up to the door — narrow at the church, wide at the viewer, so
          it reads as ground running away from you rather than a beam of light.
          It's what makes the figures look like they're standing *outside* the
          church rather than floating in front of it. */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 0,
          width: 120,
          height: GROUND + 6,
          transform: 'translateX(-50%)',
          background: 'linear-gradient(0deg, rgba(243,236,221,0.16), rgba(243,236,221,0.05))',
          clipPath: 'polygon(0% 100%, 100% 100%, 60% 0%, 40% 0%)',
        }}
      />

      <div style={{ position: 'absolute', left: '50%', bottom: GROUND - 8, transform: 'translateX(-50%)' }}>
        <ChurchArt level={level} skin={skin} size={CHURCH_W} />
      </div>

      {/* Planted in front of the wall, behind the people: flowers earned by
          giving, drawn by ChurchFlora. Non-interactive — planting happens on
          your own church tab and never in somebody else's yard. */}
      {flora && <ChurchFlora plantings={flora} />}

      {/* The congregation, alive: figures drift between the lawn, the path
          and the door on seeded schedules (CrowdLife sorts you to the front
          of the cut and caps the crowd — a picture of the place, not a
          census, same as ever). */}
      <CrowdLife members={members} waypoints={WAYPOINTS} sizeFor={sizeFor} max={9} showYouTag />

      {emptyNote && members.length === 0 && (
        <p
          className="faint"
          style={{ position: 'absolute', left: 0, right: 0, bottom: 10, margin: 0, fontSize: 12, textAlign: 'center' }}
        >
          The doors are open — nobody's playing for this one yet.
        </p>
      )}
    </div>
  )
}

// Fixed constellation — decorative only, and identical for every church so the
// scene reads as one place rather than a random field.
const STARS: [number, number, number][] = [
  [8, 12, 2], [17, 30, 1.5], [26, 8, 1.5], [38, 20, 2], [47, 6, 1.5],
  [58, 16, 2], [69, 9, 1.5], [78, 26, 2], [88, 14, 1.5], [93, 32, 2],
]
