import { clampToBand, type Surface, type SurfaceAnchor } from './placement'

// How a room ARRANGES ITSELF.
//
// ── Why this replaced dragging ──────────────────────────────────────────────
//
// The two rooms let a player drag every piece anywhere inside its mount's band
// and resize it in ten steps. That cost about 2,500 lines across sixteen files,
// two migrations, a build check and three of the nastiest scars in this
// codebase — `touch-action` not working on an SVG child, a finished drag firing
// a click that put the piece back down, and two shelf taps in one tick planning
// against a stale snapshot. All of it existed so somebody could nudge a rug.
//
// And it bought less than it cost. Every scene in this app that people love is
// a PAINTING — the library, the road, the churchyard, the chamber itself —
// composed by one hand. The rooms were the one place composition was handed to
// the player, and they were the one place the app looked least like its own
// art. A hand-arranged room will not beat a designed one, and the clearest
// evidence is that `keep_placements` sat at ZERO ROWS in production for months
// because the RPC was never awaited, and nobody reported it.
//
// So: **you pick the skin and the arrangement; the app places things.** The
// unlock gets better rather than worse — a piece you earn appears where it
// belongs, in a room that still looks composed, instead of landing on an anchor
// and waiting for you to tidy it.
//
// ── An arrangement is CONTENT, and that is why it is a transform ────────────
//
// The obvious shape is a table of anchor → position per arrangement, which is
// 27 hand-placed coordinates per variant and a release every time one changes.
// An arrangement here is instead a handful of NUMBERS applied to the anchors a
// room already has — which is exactly the shape `data/catalog.ts` can ship
// without a submission, the way a road is "a reward table, five hex codes and
// an emoji". A new arrangement is a row, not a release.
//
// ── What makes it safe ─────────────────────────────────────────────────────
//
// **An arrangement MOVES anchors and never removes one.** Every placement stays
// valid, nothing can be orphaned, and switching is purely visual — there is no
// state to migrate and nothing a player can lose by trying one. That is the
// same "nothing is ever lost" rule `placement.ts` is built on.
//
// **Every position is clamped to its own mount's band**, by the same
// `clampToBand` the free-drag path used. So an arrangement cannot hang the
// brazier from the ceiling or slide a shelf piece off its shelf, however its
// numbers are set — including numbers that arrive from a catalog.
//
// **Stored positions are ignored now.** The wire format is unchanged and old
// values still parse (`unpackDecor` is untouched), so THERE IS NO MIGRATION —
// the `~x412y188s120` suffix simply stops being read by the two rooms, and
// stops being written. A room that was hand-arranged re-composes itself, which
// is the feature rather than a side effect. The churchyard is deliberately NOT
// part of this: a congregation's plants are a shared space where any member may
// plant and move, which is its own argument (0084), and it keeps free placement.

export interface Arrangement {
  id: string
  /** What the player picks. */
  name: string
  /** One line saying what it feels like. Never a number. */
  line: string
  /**
   * How far each piece is drawn toward the centre of its mount's band.
   * 0 leaves the room exactly as designed; 1 gathers everything to the middle;
   * -1 pushes it to the edges. Clamped hard, so a catalog cannot send 40.
   */
  pull: number
  /** Nudge up (negative) or down, in scene units, before clamping. */
  rise: number
}

/**
 * Three, and deliberately not thirty.
 *
 * `settled` is the rooms exactly as they have always been, so nothing moves for
 * anybody who does not go looking — and it is the default for that reason. The
 * other two are a real change of feel with no way to make either ugly, which is
 * the whole point of choosing an arrangement rather than a position.
 */
export const ARRANGEMENTS: Arrangement[] = [
  { id: 'settled', name: 'Settled', line: 'The room as it was laid out.', pull: 0, rise: 0 },
  { id: 'gathered', name: 'Gathered', line: 'Everything drawn in close, around the middle.', pull: 0.55, rise: -2 },
  { id: 'spread', name: 'Spread', line: 'Pushed out to the walls, with the floor left open.', pull: -0.5, rise: 1 },
]

export const DEFAULT_ARRANGEMENT = 'settled'

export function arrangementById(id?: string | null): Arrangement {
  return ARRANGEMENTS.find((a) => a.id === id) ?? ARRANGEMENTS[0]
}

/**
 * A room's anchors, as this arrangement has them.
 *
 * Pure and cheap — a caller memoises on (surface, arrangement). Anchors whose
 * mount has no band are returned untouched: a band is what makes a move safe,
 * so no band means no move.
 */
export function arrangeAnchors(surface: Surface, arrangement: Arrangement): SurfaceAnchor[] {
  const pull = Math.max(-1, Math.min(1, arrangement.pull || 0))
  const rise = Math.max(-40, Math.min(40, arrangement.rise || 0))
  if (pull === 0 && rise === 0) return surface.anchors

  return surface.anchors.map((a) => {
    const withPos = a as SurfaceAnchor & { x?: number; y?: number }
    const band = surface.bands?.[a.mount]
    if (band == null || withPos.x == null || withPos.y == null) return a
    const midX = (band.x0 + band.x1) / 2
    // Toward the middle at pull > 0, away from it at pull < 0. Away is done by
    // pushing toward whichever end the anchor is already nearer, so a piece
    // never crosses the room to get to the "far" wall.
    const x =
      pull >= 0
        ? withPos.x + (midX - withPos.x) * pull
        : withPos.x + ((withPos.x >= midX ? band.x1 : band.x0) - withPos.x) * -pull
    const clamped = clampToBand(surface, a.mount, x, withPos.y + rise)
    return { ...a, x: clamped.x, y: clamped.y }
  })
}
