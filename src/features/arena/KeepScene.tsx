import { motion } from 'framer-motion'
import { SceneRemoveBadge } from '@/components/SceneRemoveBadge'
import { ANCHORS, KEEP_SURFACE, anchorById, decorName, unpackDecor } from '@/data/keep'
import { svgSpace, useSceneDrag } from '@/lib/sceneDrag'
import type { Placements } from '@/store/keep'
import type { KeepMember } from '@/store/keep'
import { KeepHall, DecorProp } from './KeepArt'
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
     * Where a DRAGGED piece was let go: stand it at that exact point, clamped
     * to its mount's band by the planner. Optional so a surface can offer
     * anchor-only moving; passing it is also what turns dragging on.
     *
     * It used to fire on a tap of open ground too, which is how you positioned
     * a piece before dragging existed. Now that you can drag one, that gesture
     * had to give the tap back: see onCancel.
     */
    onDropAt?: (x: number, y: number) => void
    /**
     * Tapping anywhere that isn't a piece or a target: put the held piece
     * down — it stays exactly where it stands and stops being held.
     *
     * "Click away to stop holding it" is what every other selection in every
     * other app does, and until now the ground was the one place a tap MOVED
     * the thing instead, which meant there was no way to let go by tapping at
     * all: you had to find the piece again, or the Done button under the scene.
     */
    onCancel?: () => void
    /** Take the lifted piece back down — the ✕ on its ring. */
    onRemove?: (anchor: string) => void
  }
  /** Makes the whole scene one big button. Only for the non-editing surfaces. */
  onOpen?: () => void
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
        onClick={() => {
          // Holding something + a tap on open ground = put it down where it
          // stands. Pieces, targets and the ✕ all stop propagation, so this
          // only ever fires for the ground itself.
          if (picked) editing?.onCancel?.()
        }}
      >
        <KeepHall color={color} level={level} />

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
      {/* Inert while a piece is held: a figure wanders in front of the thing
          you are arranging, and the tap meant for the hall would open their
          player card instead. Same rule the churchyard's crowd follows, and
          the cards are back the moment you put the piece down. */}
      <KeepLife members={members} inert={!!picked} />
    </div>
  )
}
