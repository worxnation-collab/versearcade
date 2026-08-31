// The ✕ that takes the piece you are holding back out of the world.
//
// One copy, for every world you can arrange — the keep's hall, the Upper Room
// and the churchyard — like every other thing those scenes share. It comes in
// two bodies because the scenes do: an SVG <g> for the two rooms, drawn in
// their viewBox, and an HTML button for the yard, which is absolutely
// positioned over a photograph. Same size, same colours, same rules. It is drawn on
// the selection ring rather than on the shelf tile below, because "get this
// out of here" is a thought you have while looking at the room: the shelf's ✕
// still exists and still clears every copy, but it makes you find the piece
// again in a grid of eighteen to do it.
//
// It only ever appears on the SELECTED piece, so a room is never a field of
// delete buttons, and nothing about it is destructive in the way the word
// suggests: ownership is derived from lifetime counters, so a piece taken back
// out is still earned and goes straight back on the shelf, at the same tier.

const SCENE_W = 560
const SCENE_H = 300

export function SceneRemoveBadge({
  x,
  y,
  ring,
  label,
  onRemove,
}: {
  /** The piece's ground point, in scene units. */
  x: number
  y: number
  /** Radius of the selection ring it sits on. */
  ring: number
  label: string
  onRemove: () => void
}) {
  // Up and to the right, on the ring — attached to the selection rather than
  // floating over the art. Clamped so a piece against an edge keeps its ✕ on
  // screen instead of half outside the viewBox.
  const bx = Math.min(SCENE_W - 14, Math.max(14, x + ring * 0.72))
  const by = Math.min(SCENE_H - 14, Math.max(14, y - ring * 0.72))

  return (
    <g
      role="button"
      aria-label={label}
      /* Editing chrome, marked so the postcard can strip it the way it strips
         the rings and the move targets: a ✕ on a picture somebody sends is a
         stray dark blob, and its var(--gold) does not resolve in a detached
         document anyway. */
      data-scene-edit=""
      style={{ cursor: 'pointer' }}
      // The <g> around this one starts a drag on pointerdown and toggles the
      // selection on click. Reaching for the ✕ must do neither.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onRemove()
      }}
    >
      {/* Generous invisible hit area — the visible badge is a 10px tap. */}
      <circle cx={bx} cy={by} r="17" fill="transparent" />
      <circle cx={bx} cy={by} r="10.5" fill="rgba(10,5,26,0.92)" stroke="var(--gold)" strokeWidth="1.6" />
      <path
        d={`M${bx - 3.8} ${by - 3.8} l7.6 7.6 M${bx + 3.8} ${by - 3.8} l-7.6 7.6`}
        stroke="var(--gold)"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </g>
  )
}


/**
 * The same ✕, for a scene drawn in HTML rather than in a viewBox.
 *
 * The churchyard positions everything in percent (`left: x%`, `bottom: b%`) and
 * has no coordinate space of its own to draw into, so the badge is a button
 * offset from the piece's own point in pixels: up and to the right, clear of
 * the art, which for a plant is drawn upward from where it meets the grass.
 */
export function SceneRemoveButton({
  x,
  b,
  height,
  label,
  onRemove,
}: {
  /** The piece's point in the scene, in percent. */
  x: number
  b: number
  /** How tall the piece is drawn, so the ✕ clears its head rather than its feet. */
  height: number
  label: string
  onRemove: () => void
}) {
  return (
    <button
      aria-label={label}
      // The wrapper this sits in starts a drag on pointerdown and toggles the
      // selection on click. Reaching for the ✕ must do neither.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onRemove()
      }}
      style={{
        position: 'absolute',
        left: `${x}%`,
        bottom: `${b}%`,
        // Out of the plant and up its side, from the ground point it stands on.
        transform: `translate(6px, -${Math.round(height) + 4}px)`,
        width: 22,
        height: 22,
        padding: 0,
        borderRadius: '50%',
        border: '1.5px solid var(--gold)',
        background: 'rgba(10,5,26,0.92)',
        color: 'var(--gold)',
        fontSize: 12,
        fontWeight: 800,
        lineHeight: 1,
        cursor: 'pointer',
        pointerEvents: 'auto',
        zIndex: 4,
      }}
    >
      ✕
    </button>
  )
}
