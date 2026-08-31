// The ✕ that takes the piece you are holding back out of the room.
//
// One copy, for both little worlds you can furnish — the keep's hall and the
// Upper Room — like every other thing those two scenes share. It is drawn on
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
