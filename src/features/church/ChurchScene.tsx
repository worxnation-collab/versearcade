import { useState } from 'react'
import { ChurchArt } from './ChurchArt'
import { churchSceneArt } from './sceneArt'
import { ChurchFlora } from './ChurchFlora'
import { ChurchStatues } from './ChurchStatues'
import { CrowdLife, type CrowdWaypoint } from '@/components/CrowdLife'
import type { Plantings } from './yard'
import type { Statues } from './rivalry'
import type { ChurchMember } from '@/types'
import { GENERATED_ART } from '@/data/generatedArt'
import { LeaderLookFigure } from './leaderLooks'
import type { ChurchLeaderLook } from '@/store/churchLeaderLook'
import { useSettings } from '@/store/settings'

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

// Where the church's leader stands (0146): just right of the path, below the
// door — in front of the building's footprint (which starts at b 20%), clear
// of the path the crowd walks up, and in the same depth band as the
// "by the door" waypoint so the scale matches the people around them.
const LEADER_SPOT = { x: 59, b: 17 }

export function ChurchScene({
  level,
  members,
  skin,
  flora,
  statues,
  floraEditing,
  statueEditing,
  arranging = false,
  onBackgroundTap,
  emptyNote = true,
  leader = null,
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
   * What the congregation has raised out front — the monuments a weekly
   * rivalry win buys (features/church/rivalry.ts). Unlike the flora this is
   * NOT sampled per viewer: a statue belongs to the church rather than to a
   * giver, so everybody who visits sees the same one standing there.
   */
  statues?: Statues
  /**
   * Arranging the plantings — tap to lift, drag to place, ✕ to take out. Only
   * your own church tab passes this: a bed you can move in somebody else's yard
   * is exactly the thing the church-page rule forbids. See ChurchFlora.
   */
  floraEditing?: {
    picked: string | null
    onPick: (plot: string) => void
    onDrop: (plot: string) => void
    /** Where a dragged plant was let go, in percent across / up. */
    onDropAt?: (x: number, b: number) => void
    onRemove?: (plot: string) => void
  }
  /**
   * The same, for the congregation's monuments. Also your own tab only — but
   * unlike the flora these rows are the CHURCH'S, so any member arranging them
   * is arranging them for everybody, exactly as any member may already change
   * which statue stands there. See ChurchStatues.
   */
  statueEditing?: {
    picked: string | null
    onPick: (plinth: string) => void
    onDropAt: (x: number, b: number) => void
    onRemove: (plinth: string) => void
  }
  /**
   * The yard is being arranged, so taps belong to the YARD rather than to the
   * people standing in it: the congregation goes inert and a tap reaches the
   * plant behind whoever wandered in front of it.
   *
   * The crowd is drawn at 27-42px and moves on its own, so a figure over a
   * flower bed is not a rare miss — it is most of the yard, most of the time,
   * and every one of those taps opened somebody's player card instead. The
   * cards come back the moment the shelf is closed and nothing is held.
   */
  arranging?: boolean
  /**
   * Tapping the lawn itself while holding something: put it down where it
   * stands. Same gesture as the two rooms, for the same reason — "click away
   * to stop holding it" is what a selection is expected to do, and without it
   * the only way to let go was to find the thing again.
   */
  onBackgroundTap?: () => void
  /**
   * Whether an empty crowd says so. False on your own church tab, where the
   * scene is a preview of your own yard and "nobody's playing for this one
   * yet" would be talking about you.
   */
  emptyNote?: boolean
  /**
   * The church's leadership, as its leader chose to appear (0146,
   * `store/churchLeaderLook.ts`). Stands by the door, still and untappable —
   * a role rather than a player, so it opens no card and wanders nowhere.
   * Null (no look chosen, unverified, no keys) draws nobody there.
   */
  leader?: ChurchLeaderLook | null
}) {
  const reduceMotion = useSettings((s) => s.reduceMotion)
  // The painted backdrop, layered OVER the drawn one rather than instead of it
  // — the house rule every other render follows. The gradients below are the
  // fallback, and the pieces it supersedes (the sky and the grass) both ask
  // this same question, so the scene is never half painted.
  //
  // A LATE-AFTERNOON lawn since 2026-10-16, keyed `churchyard_day`. The scene
  // used to be a violet night over a blue-green lawn (`churchyard`), and the
  // building's shadow sat on the app's own lampblack — so on /church/:id the
  // church read as a sticker on the game rather than a place in a town. The
  // night painting is not read any more; `art/church-scene.json` carries the
  // daytime prompt, and until it is generated the drawn sky and grass below
  // are the scene.
  //
  // Since 2026-10-21 the owner's illustrated set comes first: one fixed
  // painting per skin (features/church/sceneArt.ts), and every one is an EMPTY
  // churchyard — no building in it. That is deliberate: the first cut of this
  // set had the church painted in, which froze the yard at one building and
  // hid the level ladder. So the drawn path and ChurchArt stand on top of the
  // painting exactly as they did on the drawn lawn, and the building still
  // grows tier by tier. Flora, statues and the crowd are unchanged. If the
  // painting fails to load, the scene falls back to the generated lawn.
  const scene = churchSceneArt(level, skin)
  const [failed, setFailed] = useState<string | null>(null)
  const painted = failed !== scene
  const backdrop = painted ? scene : GENERATED_ART['churchyard_day']

  const holding = !!floraEditing?.picked || !!statueEditing?.picked

  return (
    <div
      // Everything that IS something — a plant, a monument, a target ring, a
      // ✕ — stops propagation, so this only ever fires for the lawn itself.
      onClick={holding ? onBackgroundTap : undefined}
      style={{
        position: 'relative',
        height: CANVAS_H,
        borderRadius: 'var(--r-md)',
        overflow: 'hidden',
        border: '1px solid var(--stroke)',
        // A low warm sky: pale at the top, gold toward the horizon, where a
        // late sun sits behind the building.
        background:
          'radial-gradient(70% 55% at 50% 64%, rgba(255,214,140,0.85) 0%, rgba(255,214,140,0) 70%),' +
          'linear-gradient(180deg, #a9c6d6 0%, #e9d3a8 58%, #f2c58a 72%)',
        cursor: holding && onBackgroundTap ? 'pointer' : undefined,
      }}
    >
      {/* The churchyard painting: sky, horizon treeline and lawn in one image,
          under everything the scene draws on top of it. It deliberately carries
          no building, no path, no stars and nobody standing on it — those are
          all drawn above, and a painted one would sit under the real thing. */}
      {backdrop && (
        <img
          src={backdrop}
          alt=""
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            // Nudged up so the painted horizon lands on GROUND rather than a
            // few pixels below it, where the figures would stand in the sky.
            objectPosition: 'center 42%',
          }}
          onError={painted ? () => setFailed(scene) : undefined}
        />
      )}

      {/* A low line of distant trees on the horizon, either side of the
          building and thinning toward the middle, so the lawn has an edge. */}
      {!backdrop && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: GROUND + 4,
            height: 16,
            background: 'linear-gradient(90deg, #6d7a3f 0%, #7d8748 30%, rgba(125,135,72,0) 44%, rgba(125,135,72,0) 56%, #7d8748 70%, #6d7a3f 100%)',
            borderRadius: '50% 50% 0 0 / 100% 100% 0 0',
            opacity: 0.85,
          }}
        />
      )}

      {/* Grass. The building's own shadow ellipse sits right on this line.
          Skipped when the painting is present, which carries its own lawn and
          its own horizon — drawing this over it would cover the treeline with
          a flat wash and put a second horizon line a few pixels off the first. */}
      {!backdrop && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: GROUND + 6,
            // Warm grass in late sun: lighter at the horizon, deeper at your feet.
            background: 'linear-gradient(180deg, #9db35a 0%, #7f9a43 45%, #637d33 100%)',
            borderTop: '1px solid rgba(255,236,170,0.45)',
          }}
        />
      )}
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
          background: 'linear-gradient(0deg, rgba(236,214,168,0.75), rgba(236,214,168,0.35))',
          clipPath: 'polygon(0% 100%, 100% 100%, 60% 0%, 40% 0%)',
        }}
      />

      {/* The painted buildings carry ~8px of empty viewBox below their
          bottom-anchored render, so GROUND - 8 put the visible foundation
          exactly on the horizon — the very back edge of the lawn, floating.
          Dropped so the building clearly stands ON the grass; the path is
          drawn before this div, so it still runs up to the door. */}
      <div style={{ position: 'absolute', left: '50%', bottom: GROUND - 26, transform: 'translateX(-50%)' }}>
        <ChurchArt level={level} skin={skin} size={CHURCH_W} ground="#3f5420" />
      </div>

      {/* Planted in front of the wall, behind the people: flowers earned by
          giving, drawn by ChurchFlora. Non-interactive — planting happens on
          your own church tab and never in somebody else's yard. */}
      {flora && (
        <ChurchFlora
          plantings={flora}
          editable={!!floraEditing}
          picked={floraEditing?.picked ?? null}
          onPick={floraEditing?.onPick}
          onDrop={floraEditing?.onDrop}
          onDropAt={floraEditing?.onDropAt}
          onRemove={floraEditing?.onRemove}
        />
      )}

      {/* The monuments, in the same band as the flora and for the same reason:
          they are things standing in the yard, and people walk in front of
          them. Read-only everywhere except your own church tab, which passes
          statueEditing — a statue is the congregation's, and moving one is
          shared the way choosing one already is (see ChurchStatues). */}
      {statues && <ChurchStatues statues={statues} editing={statueEditing} />}

      {/* Leadership, standing at the door. Drawn before the crowd so the
          congregation walks in front of them, and pointer-events off so a tap
          on the lawn (or a plant behind them) still lands. Adults: a touch
          taller than the starter figures at the same depth, which are drawn
          at a younger proportion. The figure's own viewBox is 120x170, so
          `size` is its width and the height follows. */}
      {leader && (
        <div
          aria-label="Church leadership"
          data-leader-look={leader.look}
          style={{
            position: 'absolute',
            left: `${LEADER_SPOT.x}%`,
            bottom: `${LEADER_SPOT.b}%`,
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              animation: reduceMotion ? 'none' : 'va-keep-breathe 2.6s ease-in-out infinite alternate',
              transformOrigin: 'bottom center',
            }}
          >
            <LeaderLookFigure
              look={leader.look}
              spec={leader.spec}
              customArtUrl={leader.customArtUrl}
              size={Math.round((sizeFor(LEADER_SPOT.b) * 1.2 * 120) / 170)}
              title="Church leadership"
            />
          </div>
        </div>
      )}

      {/* The congregation, alive: figures drift between the lawn, the path
          and the door on seeded schedules (CrowdLife sorts you to the front
          of the cut and caps the crowd — a picture of the place, not a
          census, same as ever). */}
      <CrowdLife
        members={members}
        waypoints={WAYPOINTS}
        sizeFor={sizeFor}
        max={9}
        showYouTag
        inert={arranging || holding}
      />

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
