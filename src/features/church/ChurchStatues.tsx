import { GENERATED_ART } from '@/data/generatedArt'
import { SceneRemoveButton } from '@/components/SceneRemoveBadge'
import { percentSpace, useSceneDrag } from '@/lib/sceneDrag'
import {
  PLINTHS,
  PLINTH_BAND,
  STATUES,
  plinthById,
  plinthHeight,
  raisedId,
  statueAt,
  statueById,
  type Statues,
} from './rivalry'

/** The yard's coordinate system for monuments — fixed, so it is built once. */
const PLINTH_SPACE = percentSpace(PLINTH_BAND)

// The churchyard's monuments — the prize a weekly rivalry win buys.
//
// Same constraints as ChurchArt, ChurchFlora and KeepArt, and for the same
// reason: flat fills, no <defs>, no gradients or filters. Several of these
// render at once inside a scene that itself renders inside a sheet over a board
// of rows, and shared <defs> ids across SVG instances are a classic way to get
// one instance silently painting another's colours.
//
// Every statue is drawn in a 40x48 box around its GROUND POINT (20,48), exactly
// like a plant, so a figure never needs to know which plinth it is on — the
// layer places it. That shared box is also why a statue and a flower can be
// laid out by the same rules on the same lawn.
//
// The layer sits with the flora: BETWEEN the building and the crowd. A statue
// is a thing in the yard, and people walk in front of it.
//
// STONE, NOT GOLD. Every figure here is carved out of the same four greys with
// a single warm accent, and that is a rule rather than a palette note: a statue
// that glittered would read as loot, and this app's church surfaces have to
// keep looking like places somebody actually attends. It is also what keeps
// eight different figures reading as one commissioned set rather than as eight
// trophies from eight games.

const STONE = '#b9b3a6'
const STONE_LIT = '#d6d0c2'
const STONE_DARK = '#7d786d'
const STONE_DEEP = '#5b574f'
const PLINTH_TOP = '#8f8a7e'
const PLINTH_FACE = '#6d685f'
const MOSS = '#5f7d5a'
const ACCENT = '#e2c98f'

/**
 * The block every figure stands on, so the set shares a footing.
 *
 * Deliberately NARROW and low. The first cut of this had a wide, tall plinth
 * and every statue read as a small doll on a big cake at the size it actually
 * renders — the figure gets 30 of the box's 48 units and the base gets the
 * rest, which is roughly the proportion real garden statuary uses. The top
 * surface is y=34, and every figure below is drawn standing on it.
 */
const Plinth = (
  <g>
    <ellipse cx="20" cy="46.6" rx="10.5" ry="2.4" fill="rgba(0,0,0,0.32)" />
    <path d="M10.6 46.4 h18.8 l-1.4 -4 h-16 z" fill={PLINTH_FACE} />
    <rect x="11.4" y="40.4" width="17.2" height="2.2" rx="0.6" fill={PLINTH_TOP} />
    <rect x="13.4" y="35.6" width="13.2" height="5" fill={PLINTH_FACE} />
    <rect x="12.4" y="34" width="15.2" height="1.8" rx="0.6" fill={PLINTH_TOP} />
    {/* A little moss at the base. Nothing here is new — a churchyard monument
        has been standing a while, and a spotless plinth reads as a game asset. */}
    <path d="M11.4 45.8 q2.6 -1.4 4.6 0.2" stroke={MOSS} strokeWidth="1.3" fill="none" strokeLinecap="round" />
    <path d="M24.4 46 q2.2 -1.2 4 0" stroke={MOSS} strokeWidth="1.1" fill="none" strokeLinecap="round" />
  </g>
)

/**
 * One statue, drawn around its ground point at (20,48), plinth included.
 *
 * These were drawn, rendered at 37px and 58px against the real lawn colour, and
 * redrawn — which is the only way to do it, because an SVG that is obviously a
 * shepherd in the source can read as a mushroom at the size the yard uses. Two
 * failures worth not repeating: a lamb drawn ACROSS the shoulders has to go
 * behind the head in paint order or it becomes a hat, and a lion with two eyes
 * and a mouth reads as a ghost at 37px — the mane and muzzle silhouette carries
 * it and the face has to go.
 */
const CARVINGS: Record<string, JSX.Element> = {
  // A shepherd with a lamb across his shoulders.
  statue_shepherd: (
    <g>
      {Plinth}
      {/* The lamb first, so the head and shoulders sit in FRONT of it. Drawn
          after, it is a hat. */}
      <ellipse cx="20" cy="17.4" rx="7.8" ry="2.6" fill={STONE_LIT} />
      <circle cx="27.2" cy="18.4" r="2.1" fill={STONE_LIT} />
      <path d="M28.8 17.2 q1.6 -0.6 1.8 0.9" stroke={STONE_DARK} strokeWidth="0.8" fill="none" strokeLinecap="round" />
      <path d="M15.4 19.4 v2.6 M17.6 19.8 v2.2" stroke={STONE} strokeWidth="1.1" strokeLinecap="round" />
      <path d="M14.6 34 q0 -11 2 -15.6 h6.8 q2 4.6 2 15.6 z" fill={STONE} />
      <path d="M20 34 v-15.6 h3.4 q2 4.6 2 15.6 z" fill={STONE_DARK} />
      <path d="M17.4 34 v-8.6 M22.6 34 v-8.6" stroke={STONE_DEEP} strokeWidth="0.45" />
      <circle cx="20" cy="13.6" r="3.3" fill={STONE_LIT} />
      <path d="M16.8 12.4 q3.2 -3.4 6.4 0 q-3.2 -1.4 -6.4 0 z" fill={STONE_DARK} />
      <path d="M17.4 15.4 q2.6 3.4 5.2 0 q-1 3 -2.6 3.2 q-1.6 -0.2 -2.6 -3.2 z" fill={STONE} />
      {/* Crook on the LEFT: the lamb's head takes the right side. */}
      <path d="M11.4 34 v-19 q0 -3.2 2.8 -3.2 q2.4 0 2.4 2.6" stroke={STONE_DARK} strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </g>
  ),

  // Mary: veiled, hands open at her waist.
  statue_mary: (
    <g>
      {Plinth}
      <path d="M14 34 q0 -12 2.2 -17 h7.6 q2.2 5 2.2 17 z" fill={STONE} />
      <path d="M20 34 v-17 h3.8 q2.2 5 2.2 17 z" fill={STONE_DARK} />
      {/* The veil is a SHELL with the face showing through it. Drawn as one
          closed path whose inner edge stops short of the head — filled solid it
          swallows the face and the whole figure becomes a hooded blob. */}
      <path d="M13.2 30 q0 -18 6.8 -18 q6.8 0 6.8 18 q-2.4 -12 -6.8 -12 q-4.4 0 -6.8 12 z" fill={STONE_LIT} />
      <circle cx="20" cy="15.4" r="3.1" fill={STONE} />
      <path d="M17.8 16.9 q2.2 2.4 4.4 0" stroke={STONE_DARK} strokeWidth="0.7" fill="none" />
      <path d="M16.8 27 q3.2 2.6 6.4 0" stroke={STONE_LIT} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <circle cx="16.9" cy="26.8" r="1.1" fill={STONE_LIT} />
      <circle cx="23.1" cy="26.8" r="1.1" fill={STONE_LIT} />
    </g>
  ),

  // Moses, the tablets held out at his side.
  statue_moses: (
    <g>
      {Plinth}
      <path d="M14.4 34 q0 -11.6 2.2 -16.4 h7.4 q2.2 4.8 2.2 16.4 z" fill={STONE} />
      <path d="M20 34 v-16.4 h3.7 q2.2 4.8 2.2 16.4 z" fill={STONE_DARK} />
      <circle cx="19.4" cy="12.4" r="3.2" fill={STONE_LIT} />
      <path d="M15.6 9.6 q3.8 -3.6 7.6 0 q-3.8 -1.6 -7.6 0 z" fill={STONE_DARK} />
      {/* The beard is in the LIGHT stone against the mid-stone robe: the whole
          read at 37px is this one shape. */}
      <path d="M16.2 13.6 q3.2 8 6.4 0 q-0.6 8.4 -3.2 9.4 q-2.6 -1 -3.2 -9.4 z" fill={STONE_LIT} />
      <path d="M23.2 20.4 q3.4 1.6 3.4 4.4" stroke={STONE_DARK} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {/* Two round-topped tablets, held out to one side rather than flat against
          the chest, where they read as lapels. */}
      <path d="M23.4 31 v-6.6 q0 -2.2 2.1 -2.2 q2.1 0 2.1 2.2 v6.6 z" fill={STONE_LIT} />
      <path d="M27.9 31 v-6.6 q0 -2.2 2.1 -2.2 q2.1 0 2.1 2.2 v6.6 z" fill={STONE} />
      <path d="M24.2 26 h2.6 M24.2 27.8 h2.6 M28.7 26 h2.6 M28.7 27.8 h2.6"
        stroke={STONE_DEEP} strokeWidth="0.6" strokeLinecap="round" />
    </g>
  ),

  // An angel standing watch, wings folded down its back.
  statue_angel: (
    <g>
      {Plinth}
      {/* Wings first, so the body sits in front of them. */}
      <path d="M15 31 q-7 -6 -5.6 -17.4 q3.8 4.6 6.4 9.8 z" fill={STONE_DARK} />
      <path d="M25 31 q7 -6 5.6 -17.4 q-3.8 4.6 -6.4 9.8 z" fill={STONE_DARK} />
      <path d="M15.2 34 q0 -11.4 2.1 -16 h5.4 q2.1 4.6 2.1 16 z" fill={STONE} />
      <path d="M20 34 v-16 h2.7 q2.1 4.6 2.1 16 z" fill={STONE_DARK} />
      <circle cx="20" cy="13.4" r="3.1" fill={STONE_LIT} />
      <path d="M16.9 12.4 q3.1 -3.4 6.2 0" stroke={STONE_DARK} strokeWidth="1" fill="none" />
      {/* Hands folded on the hilt of a DOWNTURNED sword — watch, not battle. */}
      <path d="M20 21.6 v11.4" stroke={STONE_LIT} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M17.2 22 h5.6" stroke={STONE_LIT} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="20" cy="20" r="1.2" fill={ACCENT} />
    </g>
  ),

  // David: a boy, a sling, and no armour.
  statue_david: (
    <g>
      {Plinth}
      <path d="M18.1 34 v-7" stroke={STONE} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M22 34 v-7" stroke={STONE_DARK} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M16.4 28 q0 -8 1.6 -10.6 h4.4 q1.6 2.6 1.6 10.6 z" fill={STONE_LIT} />
      <path d="M20 28 v-10.6 h2.4 q1.6 2.6 1.6 10.6 z" fill={STONE} />
      <circle cx="19.6" cy="14" r="2.9" fill={STONE_LIT} />
      <path d="M16.9 12.6 q2.7 -3 5.4 0 q-2.7 -1.2 -5.4 0 z" fill={STONE_DARK} />
      {/* The sling, swung up and back — the one figure in the set with motion,
          which is also what stops a plain robed silhouette reading as a saint. */}
      <path d="M22.6 18.6 q4.6 -1.4 5.6 -6.6" stroke={STONE_LIT} strokeWidth="1.7" fill="none" strokeLinecap="round" />
      <path d="M28.2 12 q2.4 -2.6 1.2 -5.4" stroke={STONE_DARK} strokeWidth="0.9" fill="none" strokeLinecap="round" />
      <ellipse cx="29.2" cy="6" rx="2.1" ry="1.4" fill={STONE_LIT} />
      <circle cx="14.2" cy="33" r="1" fill={STONE_DEEP} />
      <circle cx="16.2" cy="33.4" r="0.9" fill={STONE_DEEP} />
      <circle cx="25.2" cy="33.4" r="0.9" fill={STONE_DEEP} />
    </g>
  ),

  // A column with the Spirit coming down on it.
  statue_dove: (
    <g>
      {Plinth}
      <rect x="17.2" y="16" width="5.6" height="18" fill={STONE} />
      <rect x="20" y="16" width="2.8" height="18" fill={STONE_DARK} />
      {/* Fluting, which is what stops the column reading as a fence post. */}
      <path d="M18.4 18 v14 M20 18 v14 M21.6 18 v14" stroke={STONE_DEEP} strokeWidth="0.45" />
      <rect x="15.6" y="13.6" width="8.8" height="2.6" rx="0.7" fill={STONE_LIT} />
      <ellipse cx="20" cy="9.6" rx="3.7" ry="2.2" fill={STONE_LIT} />
      <circle cx="23" cy="8.4" r="1.6" fill={STONE_LIT} />
      <path d="M24.4 7.8 q1.5 -0.4 1.7 0.9" stroke={STONE_DARK} strokeWidth="0.7" fill="none" strokeLinecap="round" />
      <path d="M18.6 8.2 q-2.6 -4 -5.6 -3.6 q2.2 2.8 3.8 4.8 z" fill={STONE_LIT} />
      <path d="M17.4 11 l-5.2 2.4 l4.8 0.2 z" fill={STONE} />
      <circle cx="23.6" cy="8" r="0.5" fill={ACCENT} />
    </g>
  ),

  // The stone rolled back off an open door.
  statue_tomb: (
    <g>
      {Plinth}
      <path d="M9.6 34 q0 -15 10.4 -15 q10.4 0 10.4 15 z" fill={STONE} />
      <path d="M20 19 q10.4 0 10.4 15 h-10.4 z" fill={STONE_DARK} />
      {/* The doorway, black and empty — the whole point of the piece. */}
      <path d="M15.2 34 v-7.4 q0 -4.6 4.4 -4.6 q4.4 0 4.4 4.6 v7.4 z" fill="#241f1b" />
      <path d="M17.2 34 v-6.4 q0 -2.4 2.2 -2.4 v8.8 z" fill={ACCENT} opacity="0.45" />
      {/* The stone, rolled clear and standing on its edge against the rock. */}
      <circle cx="27.4" cy="29" r="4.3" fill={STONE_LIT} />
      <circle cx="27.4" cy="29" r="2" fill={STONE_DARK} />
    </g>
  ),

  // Lying down together, the way it was promised.
  statue_lion_lamb: (
    <g>
      {Plinth}
      <path d="M11 34 q0 -6.6 7.4 -6.6 h7.6 q1.8 0 1.8 2.2 v4.4 z" fill={STONE} />
      <path d="M20 34 h8.8 v-4.4 q0 -2.2 -1.8 -2.2 h-7 z" fill={STONE_DARK} />
      <path d="M12.4 33.2 h6.6" stroke={STONE_LIT} strokeWidth="2.1" strokeLinecap="round" />
      {/* Mane, then muzzle, and NO FACE: two eyes and a mouth at 37px read as a
          ghost. The silhouette does all of the work. */}
      <circle cx="13.4" cy="24.6" r="4.8" fill={STONE_LIT} />
      <circle cx="13.4" cy="24.6" r="2.9" fill={STONE} />
      <path d="M10.6 25.6 q-2.4 0.4 -2.4 2.2 q1.8 0.8 3.2 -0.6 z" fill={STONE} />
      <path d="M28.6 31.4 q3.2 0.4 3.4 -3.4" stroke={STONE_DARK} strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <ellipse cx="24.6" cy="29.8" rx="4.6" ry="3.1" fill={STONE_LIT} />
      <circle cx="28.4" cy="27.6" r="2.2" fill={STONE} />
      <path d="M30 26.4 q1.6 -0.6 1.8 0.8" stroke={STONE_DARK} strokeWidth="0.8" fill="none" strokeLinecap="round" />
    </g>
  ),
}

// Generated art layers OVER the drawing, never instead of it (CLAUDE.md). The
// wiring is automatic: scripts/gen-art.mjs writes src/data/generatedArt.ts, so a
// render reaches the yard the moment it exists and no id can point at a 404.
// Until then every statue is a real carving. See art/church-statues.json.
export function StatueIcon({ id, size = 40 }: { id: string; size?: number }) {
  const raster = GENERATED_ART[id]
  if (raster) {
    return (
      <img
        src={raster}
        alt=""
        // See the note in ChurchFlora's PlantArt: a draggable <img> cancels the
        // pointer stream and a monument can never be dragged anywhere.
        draggable={false}
        width={size * (40 / 48)}
        height={size}
        style={{ display: 'block', objectFit: 'contain' }}
      />
    )
  }
  const carving = CARVINGS[id]
  if (!carving) return null
  return (
    <svg width={size * (40 / 48)} height={size} viewBox="0 0 40 48" aria-hidden>
      {carving}
    </svg>
  )
}

/**
 * The monuments standing in a churchyard.
 *
 * Read-only on every surface but ONE: your own church tab, which passes
 * `editing` so a member can drag a monument across the lawn and take it down
 * with its ✕. Everywhere else — a visited church's page, a leaderboard row's
 * sheet — there is no editing prop at all, so a stranger's yard is inert
 * because the layer was never handed the ability to change, not because a
 * handler decided to say no. Same construction as a visited Upper Room.
 *
 * A STATUE IS THE CONGREGATION'S, AND MOVING ONE IS SHARED THE WAY RAISING ONE
 * ALREADY IS. This layer used to refuse editing outright, on the grounds that
 * two members dragging the same trophy around each other's screens is a fight
 * over a shared object. What that argument missed is that any member may
 * already swap or take down any statue (0075, and it is deliberate: a monument
 * carries no name and belongs to the church, not to whoever won the week), so
 * where it stands is a smaller version of a decision the congregation already
 * shares. Nothing new is exposed: no name, no count, no who-moved-it. `set_by`
 * stays forensics that never leaves the server.
 */
export function ChurchStatues({
  statues,
  editing,
}: {
  statues: Statues
  editing?: {
    picked: string | null
    onPick: (plinth: string) => void
    /** Where a dragged monument was let go, in percent. */
    onDropAt: (x: number, b: number) => void
    /** The ✕ on the lifted monument. */
    onRemove: (plinth: string) => void
  }
}) {
  const picked = editing?.picked ?? null
  const drag = useSceneDrag({
    space: PLINTH_SPACE,
    picked,
    enabled: !!editing,
    onCommit: (_plinth, x, b) => editing?.onDropAt(x, b),
  })

  const standing = PLINTHS
    // Back to front, so a nearer monument draws over a further one — the same
    // depth sort the crowd and the flora use.
    .slice()
    .sort((a, b) => b.b - a.b)
    .filter((p) => {
      const id = raisedId(statues[p.id])
      return !!id && (!!CARVINGS[id] || !!GENERATED_ART[id])
    })

  const pickedPlinth = picked ? plinthById(picked) : undefined
  const pickedStatue = picked ? statueById(statues[picked]) : undefined

  return (
    // The layer is a real element rather than a fragment because the drag needs
    // one: it is what a position is measured against, and — since a touchmove
    // is only cancellable on an ANCESTOR of the element the touch started on —
    // it has to be the monuments' parent, not a sibling overlay. It draws
    // nothing and takes no pointer events of its own.
    <div ref={drag.sceneRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {standing.map((plinth) => {
        const value = statues[plinth.id]
        const lifted = picked === plinth.id
        const dragging = !!drag.live && drag.live.anchor === plinth.id
        const at = dragging ? { x: drag.live!.x, b: drag.live!.y } : statueAt(value, plinth)
        // Sized by where it STANDS: a monument dragged to the front of the yard
        // is nearer the viewer, so it has to be bigger.
        const h = plinthHeight(at.b) * (statueById(value)?.scale ?? 1)
        const Tag = editing ? 'button' : 'div'
        return (
          <Tag
            key={plinth.id}
            {...(editing
              ? {
                  onClick: () => {
                    // The click a finished drag fires is not a tap.
                    if (drag.consumeClick()) return
                    editing.onPick(plinth.id)
                  },
                  'aria-label': `${statueById(value)?.name ?? 'Monument'}, ${plinth.label}`,
                  ...drag.bind(plinth.id, 'yard', at.x, at.b),
                }
              : {})}
            style={{
              position: 'absolute',
              left: `${at.x}%`,
              bottom: `${at.b}%`,
              lineHeight: 0,
              padding: 0,
              background: 'transparent',
              border: lifted ? '1px dashed var(--gold)' : 'none',
              borderRadius: 8,
              transform: `translateX(-50%)${lifted && !dragging ? ' translateY(-6px) scale(1.06)' : ''}`,
              transition: dragging ? 'none' : 'transform 160ms ease-out',
              pointerEvents: editing ? 'auto' : 'none',
              cursor: editing ? (dragging ? 'grabbing' : lifted ? 'grab' : 'pointer') : 'default',
              zIndex: lifted ? 3 : undefined,
            }}
          >
            <StatueIcon id={raisedId(value)} size={h} />
          </Tag>
        )
      })}

      {editing && picked && pickedPlinth && pickedStatue && !drag.live && (
        <SceneRemoveButton
          {...statueAt(statues[picked], pickedPlinth)}
          height={plinthHeight(statueAt(statues[picked], pickedPlinth).b) * pickedStatue.scale}
          label={`Take down the ${pickedStatue.name}`}
          onRemove={() => editing.onRemove(picked)}
        />
      )}
    </div>
  )
}

/** Every carving this build can draw — what the picker offers. */
export const drawableStatues = () =>
  STATUES.filter((s) => !!CARVINGS[s.id] || !!GENERATED_ART[s.id])
