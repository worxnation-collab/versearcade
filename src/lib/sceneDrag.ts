import { useCallback, useRef, useState } from 'react'
import {
  clampToBand,
  clampToPercentBand,
  type PercentBand,
  type Surface,
} from '@/data/placement'

// Dragging a placed piece around a little world — the one copy.
//
// The keep's hall, the Upper Room and the churchyard draw different art over
// the same rules (data/placement.ts), and the pointer mechanics of moving
// something around inside a scene are the same in all three. So they live here
// once and every scene binds them, the same reason planPlacementOn is not
// written twice.
//
// The three do not share a coordinate system: the two rooms are 560x300
// viewBoxes and the yard is HTML positioned in percent, with its second axis
// running UP from the bottom. That is the whole of the difference, so it is the
// whole of what a caller passes in — `space` converts a client-pixel delta into
// the scene's own units and clamps the result. `svgSpace()` and `percentSpace()`
// below are the two that exist; nothing else in the hook knows or cares.
//
// WHY THIS IS SAFE NEXT TO THE SCROLL, which is what kept dragging out of these
// rooms until now: a drag can only start on the piece that is ALREADY PICKED
// UP. One tap selects, and only then does that single element take
// `touch-action: none` and capture the pointer. Every other pixel of the scene
// — every unselected piece, the floor, the walls — still scrolls the sheet
// under your thumb exactly as before, so the gesture costs nothing anywhere
// except on the one object you said you were holding. Tapping is untouched:
// tap-to-lift, tap-a-spot-to-trade and tap-the-ground still work, and a drag
// that never leaves the slop radius is still a tap.
//
// The preview is local and the commit is one write. Writing on every pointer
// move would be an RPC per frame; instead the scene renders the live point and
// `onCommit` fires once, on release, through the same planner the tap path
// uses — so a dragged piece and a tapped one land under identical rules.

/** The element a scene is measured against: an <svg> or a plain <div>. */
export type SceneRoot = SVGSVGElement | HTMLElement

/** Where a piece is standing right now, mid-drag, in the scene's own units. */
export interface ScenePoint {
  anchor: string
  x: number
  y: number
}

/** How far a pointer must travel before this stops being a tap. In CSS px, so
 *  it means the same thing on every screen: small enough that a deliberate
 *  nudge registers, big enough that a thumb tap never smears into a move. */
const DRAG_SLOP = 4

interface DragRef {
  anchor: string
  mount: string
  pointerId: number
  /** Where the pointer went down, in client px. */
  cx: number
  cy: number
  /** Where the piece was standing when it went down, in scene units. */
  x0: number
  y0: number
  /** Scene units per client px, so a drag tracks the finger at any width. */
  sx: number
  sy: number
  moved: boolean
}

/**
 * A scene's coordinate system: how a client-pixel delta becomes scene units,
 * and where a piece of a given kind is allowed to end up.
 */
export interface SceneSpace {
  /** Scene units per client pixel, from the scene's own rect. `sy` is negative
   *  for a bottom-up axis, which is what the churchyard uses. */
  project: (rect: DOMRect) => { sx: number; sy: number }
  /** Keep the point inside the band belonging to this kind of piece. */
  clamp: (kind: string, x: number, y: number) => { x: number; y: number }
}

/** The two rooms: 560x300 scene units, clamped into a mount's band. */
export function svgSpace(surface: Surface, width = 560, height = 300): SceneSpace {
  return {
    project: (r) => ({ sx: width / r.width, sy: height / r.height }),
    clamp: (mount, x, y) => {
      const p = clampToBand(surface, mount, x, y)
      // A mount with no band of its own still can't leave the frame.
      return { x: Math.min(width, Math.max(0, p.x)), y: Math.min(height, Math.max(0, p.y)) }
    },
  }
}

/**
 * The churchyard: percent across and percent UP from the bottom, so `sy` is
 * negative — dragging a plant down the screen brings it toward the viewer,
 * which is a smaller `b`, not a bigger one. Every kind shares one band, since
 * the yard is one lawn rather than six mounts.
 */
export function percentSpace(band: PercentBand): SceneSpace {
  return {
    project: (r) => ({ sx: 100 / r.width, sy: -100 / r.height }),
    clamp: (_kind, x, b) => {
      const p = clampToPercentBand(band, x, b)
      return { x: p.x, y: p.b }
    },
  }
}

export interface SceneDrag {
  /** The piece being dragged and where it is, or null. */
  live: ScenePoint | null
  /** Pointer handlers for a placed piece. */
  bind: (
    anchor: string,
    mount: string,
    x: number,
    y: number,
  ) => {
    onPointerDown: (e: React.PointerEvent) => void
    onPointerMove: (e: React.PointerEvent) => void
    onPointerUp: (e: React.PointerEvent) => void
    onPointerCancel: (e: React.PointerEvent) => void
  }
  /**
   * True for the one click that a finished drag is about to fire, which must
   * not also read as "tap the piece" — that would put down what you just
   * dragged. Consuming it clears the latch.
   */
  consumeClick: () => boolean
  /**
   * Put this on the scene's root — the <svg> of a room, the wrapper <div> of
   * the churchyard. It is what a drag is measured against, and what keeps one
   * from scrolling the page on a phone (see the note on the listener below).
   */
  sceneRef: (el: SceneRoot | null) => void
}

/**
 * Drag-to-place for a scene, over a Surface's mount bands.
 *
 * `picked` is the anchor currently lifted; only that piece can be dragged.
 * `onCommit` receives a point already clamped into the piece's own mount band,
 * so "put it where you like" still never hangs the brazier from the ceiling.
 */
export function useSceneDrag({
  space,
  picked,
  enabled,
  onCommit,
}: {
  space: SceneSpace
  picked: string | null
  /** Off entirely on a surface that only shows the world (a visited room). */
  enabled: boolean
  onCommit: (anchor: string, x: number, y: number) => void
}): SceneDrag {
  const [live, setLive] = useState<ScenePoint | null>(null)
  const root = useRef<SceneRoot | null>(null)
  const drag = useRef<DragRef | null>(null)
  const at = useRef<ScenePoint | null>(null)
  const swallowClick = useRef(false)

  const point = useCallback(
    (d: DragRef, e: React.PointerEvent): ScenePoint => {
      const p = space.clamp(d.mount, d.x0 + (e.clientX - d.cx) * d.sx, d.y0 + (e.clientY - d.cy) * d.sy)
      return { anchor: d.anchor, x: p.x, y: p.y }
    },
    [space],
  )

  const bind = useCallback(
    (anchor: string, mount: string, x: number, y: number) => ({
      onPointerDown: (e: React.PointerEvent) => {
        // Only the lifted piece drags. Everything else keeps the browser's own
        // behaviour, which on a phone means the sheet still scrolls.
        if (!enabled || picked !== anchor) return
        // Measured from the element sceneRef was put on, so an SVG viewBox and
        // an HTML lawn are the same question.
        const r = root.current?.getBoundingClientRect()
        if (!r?.width || !r.height) return
        const { sx, sy } = space.project(r)
        try {
          ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
        } catch {
          /* capture is an optimisation; the move handler works without it */
        }
        drag.current = {
          anchor,
          mount,
          pointerId: e.pointerId,
          cx: e.clientX,
          cy: e.clientY,
          x0: x,
          y0: y,
          sx,
          sy,
          moved: false,
        }
      },
      onPointerMove: (e: React.PointerEvent) => {
        const d = drag.current
        if (!d || d.pointerId !== e.pointerId) return
        if (!d.moved && Math.hypot(e.clientX - d.cx, e.clientY - d.cy) < DRAG_SLOP) return
        d.moved = true
        const p = point(d, e)
        at.current = p
        setLive(p)
      },
      onPointerUp: (e: React.PointerEvent) => {
        const d = drag.current
        if (!d || d.pointerId !== e.pointerId) return
        drag.current = null
        const p = d.moved ? at.current : null
        at.current = null
        if (p) {
          // The click this pointerup is about to fire would otherwise toggle
          // the piece back down, undoing the selection mid-arrangement.
          swallowClick.current = true
          onCommit(p.anchor, p.x, p.y)
          // Hold the preview for one frame so the piece never flickers back to
          // where it was while the store's optimistic write lands — and let go
          // of it after, so a write that failed and re-read tells the truth.
          requestAnimationFrame(() => setLive(null))
        } else {
          setLive(null)
        }
      },
      onPointerCancel: (e: React.PointerEvent) => {
        const d = drag.current
        if (!d || d.pointerId !== e.pointerId) return
        drag.current = null
        at.current = null
        setLive(null)
      },
    }),
    [enabled, picked, space, point, onCommit],
  )

  // WHY A HAND-ROLLED, NON-PASSIVE touchmove LISTENER and not `touch-action`.
  //
  // `touch-action: none` is the tidy answer and it does not work here: on an
  // SVG child element browsers ignore it (it was set, read back empty, and the
  // page scrolled out from under the piece), and putting it on the wrapper
  // would kill scrolling over the whole picture for as long as anything is
  // selected — on /you that is a tall page with a room in the middle of it.
  //
  // So the scroll is cancelled exactly when a drag is in flight: `drag.current`
  // is only ever set by a pointerdown on the piece you are already holding, and
  // the browser honours a preventDefault on the FIRST touchmove of a gesture.
  // React attaches its own touch listeners passively, which is why this one is
  // registered by hand.
  const detach = useRef<(() => void) | null>(null)
  const sceneRef = useCallback((el: SceneRoot | null) => {
    detach.current?.()
    detach.current = null
    root.current = el
    if (!el) return
    const onTouchMove = (e: Event) => {
      if (drag.current) e.preventDefault()
    }
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    detach.current = () => el.removeEventListener('touchmove', onTouchMove)
  }, [])

  const consumeClick = useCallback(() => {
    const swallow = swallowClick.current
    swallowClick.current = false
    return swallow
  }, [])

  return { live, bind, consumeClick, sceneRef }
}
