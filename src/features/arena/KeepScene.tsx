import { motion } from 'framer-motion'
import { SceneRemoveBadge } from '@/components/SceneRemoveBadge'
import { ANCHORS, KEEP_SURFACE, anchorById, decorName, unpackDecor } from '@/data/keep'
import { svgSpace, useSceneDrag } from '@/lib/sceneDrag'
import type { Placements } from '@/store/keep'
import type { KeepMember } from '@/store/keep'
import { KeepHall, DecorProp } from './KeepArt'
import { ArcadeCabinet } from '@/features/arcade/ArcadeCabinet'
import { KeepLife } from './KeepLife'

// The hall as a place you can look at — the painted room at its tier, whatever
// is hung in it, and the people living in it.
//
// Extracted from KeepSheet the moment a second surface wanted it (the Battle
// tab shows the hall inline under the new-battle button), which is the same
// rule QuizRunner and CrowdLife follow: the instant two screens want the same
// thing, it becomes one thing. A keep drawn two ways would drift, and the whole
// point of these little worlds is that the one in the sheet and the one on the
// tab are the same room.
//
// Everything interactive is optional. With no `editing` prop this is a picture:
// nothing is tappable, no targets are drawn, and it costs nothing to put on a
// screen that only wants to show the place.
/** The scene's coordinate system — fixed, so it is built once. */
const SPACE = svgSpace(KEEP_SURFACE)

export function KeepScene({
  color,
  level,
  placements,
  members,
  editing,
  onOpen,
  onArcade,
}: {
  /** The faction colour the gonfalon and barding take. */
  color: string
  level: number
  placements: Placements
  members: KeepMember[]
  /**
   * Tap-to-move, for the surfaces that own the furnishing (the sheet). Absent
   * everywhere else — a hall you can rearrange from a summary card would let
   * you redecorate by accident while looking for the button under it.
   */
  editing?: {
    picked: string | null
    mergedAnchor?: string | null
    onPick: (anchor: string) => void
    onDrop: (anchor: string) => void
    /**
     * Tapping open ground while carrying — and, since dragging landed, where a
     * dragged piece is set down: stand it at that exact point, clamped to its
     * mount's band by the planner. Optional so a surface can offer anchor-only
     * moving; passing it is also what turns dragging on.
     */
    onDropAt?: (x: number, y: number) => void
    /** Take the lifted piece back down — the ✕ on its ring. */
    onRemove?: (anchor: string) => void
  }
  /** Makes the whole scene one big button. Only for the non-editing surfaces. */
  onOpen?: () => void
  /**
   * Tapping the arcade machine in the corner of the hall.
   *
   * Present only on the surfaces showing YOUR OWN faction's hall. Absent
   * elsewhere the cabinet is not drawn at all — a stranger's room does not grow
   * an arcade machine because you own one, and the postcard rasteriser has no
   * business serialising a button.
   */
  onArcade?: () => void
}) {
  const picked = editing?.picked ?? null
  const pickedAnchor = picked ? anchorById(picked) : undefined
  const pickedMount = pickedAnchor?.mount

  // Drag the piece you are holding. Only the lifted one moves this way, which
  // is what finally makes dragging safe inside this scrolling sheet — see
  // lib/sceneDrag.ts. Tapping still does everything it did.
  const drag = useSceneDrag({
    space: SPACE,
    picked,
    enabled: !!editing?.onDropAt,
    onCommit: (_anchor, x, y) => editing?.onDropAt?.(x, y),
  })

  // Where the lifted piece is standing, for the ✕ that hangs off its ring. It
  // is drawn as the scene's LAST layer rather than inside the piece's own <g>,
  // because the move targets are drawn after the pieces: a ✕ inside the group
  // sat under the target ring of the next spot along, and tapping it moved the
  // piece there instead of taking it down. Found by driving the real app.
  const pickedValue = picked ? placements[picked] : undefined
  const pickedPos = pickedAnchor && pickedValue ? unpackDecor(pickedValue) : undefined

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 'var(--r-md)',
        overflow: 'hidden',
        border: '1px solid var(--stroke)',
        cursor: onOpen ? 'pointer' : undefined,
      }}
      onClick={onOpen}
    >
      <svg
        ref={drag.sceneRef}
        viewBox="0 0 560 300"
        style={{ display: 'block', width: '100%', height: 'auto' }}
        onClick={(e) => {
          // Carrying + a tap on open ground = stand it right there. Pieces and
          // targets stop propagation, so this only fires for the ground itself,
          // and the planner clamps the point into the piece's own mount band.
          if (!editing?.onDropAt || !picked) return
          const r = e.currentTarget.getBoundingClientRect()
          editing.onDropAt(((e.clientX - r.left) / r.width) * 560, ((e.clientY - r.top) / r.height) * 300)
        }}
      >
        <KeepHall color={color} level={level} />

        {/* Front-left, on the near floor. It has to sit BELOW the hearth
            rather than against the left wall: standing it up there put a games
            machine over the fire, which looks like a bug rather than a joke. */}
        {onArcade && <ArcadeCabinet x={58} y={297} scale={0.8} screen="attract" onOpen={onArcade} />}

        {ANCHORS.map((a) => {
          const value = placements[a.id]
          if (!value) return null
          const lifted = picked === a.id
          const u = unpackDecor(value)
          // Mid-drag the piece follows the finger; otherwise a moved piece
          // stands where its value says and an untouched one stands on its
          // anchor, exactly as every placement written before free positioning
          // existed still should.
          const at = drag.live?.anchor === a.id ? drag.live : null
          const px = at?.x ?? u.x ?? a.x
          const py = at?.y ?? u.y ?? a.y
          const dragging = !!at
          // The spot that just absorbed a duplicate gives one pulse — the eye
          // needs telling where to look when the thing you tapped isn't the
          // thing that changed.
          return (
            <motion.g
              key={a.id}
              initial={false}
              animate={
                editing?.mergedAnchor === a.id
                  ? { scale: [1, 1.22, 1], y: 0 }
                  : lifted
                    ? { scale: 1.08, y: dragging ? 0 : -6 }
                    : { scale: 1, y: 0 }
              }
              // A dragged piece must track the finger, not spring after it.
              transition={{ duration: dragging ? 0 : lifted ? 0.18 : 0.5 }}
              style={{
                transformOrigin: `${px}px ${py}px`,
                cursor: editing ? (dragging ? 'grabbing' : lifted ? 'grab' : 'pointer') : undefined,
              }}
              {...(editing ? drag.bind(a.id, a.mount, u.x ?? a.x, u.y ?? a.y) : {})}
              onClick={
                editing
                  ? (e) => {
                      // The svg behind this drops the carried piece at the tap
                      // point; a tap ON a piece must not also be a tap on the
                      // ground under it.
                      e.stopPropagation()
                      // The click a finished drag fires is not a tap: letting
                      // it through would put down what you just dragged.
                      if (drag.consumeClick()) return
                      if (picked && picked !== a.id) editing.onDrop(a.id)
                      else editing.onPick(a.id)
                    }
                  : undefined
              }
            >
              <DecorProp value={value} x={px} y={py} color={color} mount={a.mount} sizeScale={u.s ?? 1} />
              {lifted && (
                <>
                  {/* A grab area over the whole selection, so dragging doesn't
                      mean hitting the one filled pixel of a candle. */}
                  <circle cx={px} cy={py} r="30" fill="transparent" data-scene-edit="" />
                  <circle
                    cx={px}
                    cy={py}
                    r="30"
                    fill="none"
                    stroke="var(--gold)"
                    strokeWidth="2"
                    strokeDasharray="5 5"
                    opacity="0.9"
                  />
                </>
              )}
            </motion.g>
          )
        })}

        {/* Where the carried piece can go: every OTHER spot of its own kind. A
            rug on a rafter isn't a placement, it's a bug, so the targets are
            the constraint made visible rather than an error after the fact. */}
        {editing && picked &&
          ANCHORS.filter((a) => a.id !== picked && a.mount === pickedMount).map((a) => (
            <g
              key={`t-${a.id}`}
              onClick={(e) => {
                e.stopPropagation()
                editing.onDrop(a.id)
              }}
              style={{ cursor: 'pointer' }}
            >
              {/* A generous invisible hit area — the visible ring is 26 units
                  across, which is a 12px tap on a phone. */}
              <circle cx={a.x} cy={a.y} r="26" fill="transparent" />
              {/* An occupied spot gets a SOLID dark disc, not a wash: a
                  translucent gold ring over a bright tapestry is invisible, and
                  the swap marker is the one that most needs reading. */}
              <circle
                cx={a.x}
                cy={a.y}
                r="13"
                fill={placements[a.id] ? 'rgba(10,5,26,0.86)' : 'rgba(255,210,63,0.16)'}
                stroke="var(--gold)"
                strokeWidth="2"
                strokeDasharray="4 4"
              />
              {placements[a.id] && (
                // Two arrows: this spot is taken, so dropping here trades.
                <path
                  d={`M${a.x - 6} ${a.y - 3} h12 l-3 -3 M${a.x + 6} ${a.y + 3} h-12 l3 3`}
                  fill="none"
                  stroke="var(--gold)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </g>
          ))}

        {editing?.onRemove && picked && pickedAnchor && pickedPos && !drag.live && (
          <SceneRemoveBadge
            x={pickedPos.x ?? pickedAnchor.x}
            y={pickedPos.y ?? pickedAnchor.y}
            ring={30}
            label={`Take the ${decorName(pickedValue)} back down`}
            onRemove={() => editing.onRemove!(picked)}
          />
        )}
      </svg>

      {/* Alive, not pasted: figures run seeded schedules between the hearth,
          the table and the stable (KeepLife). A faction hall shows its members;
          your own hall shows you. Static figures were deliberately cut before
          this — if these ever stop moving, remove them rather than letting them
          go back to being stickers. */}
      <KeepLife members={members} />
    </div>
  )
}
