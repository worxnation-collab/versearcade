import { useCallback, useRef, useState } from 'react'
import { clampToBand, type Surface } from '@/data/placement'

// Dragging a placed piece around a little world — the one copy.
//
// The keep's hall and the Upper Room draw different art over the same rules
// (data/placement.ts), and the pointer mechanics of moving something inside a
// 560x300 viewBox are exactly the same in both. So they live here once and both
// scenes bind them, the same reason planPlacementOn is not written twice.
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

/** Where a piece is standing right now, mid-drag, in scene units. */
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

export interface SceneDrag {
  /** The piece being dragged and where it is, or null. */
  live: ScenePoint | null
  /** Pointer handlers for a placed piece's <g>. */
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
   * Put this on the scene's <svg>. It is what actually keeps a drag from
   * scrolling the page on a phone — see the note on the listener below.
   */
  sceneRef: (el: SVGSVGElement | null) => void
}

/**
 * Drag-to-place for a scene, over a Surface's mount bands.
 *
 * `picked` is the anchor currently lifted; only that piece can be dragged.
 * `onCommit` receives a point already clamped into the piece's own mount band,
 * so "put it where you like" still never hangs the brazier from the ceiling.
 */
export function useSceneDrag({
  surface,
  picked,
  enabled,
  width = 560,
  height = 300,
  onCommit,
}: {
  surface: Surface
  picked: string | null
  /** Off entirely on a surface that only shows the world (a visited room). */
  enabled: boolean
  width?: number
  height?: number
  onCommit: (anchor: string, x: number, y: number) => void
}): SceneDrag {
  const [live, setLive] = useState<ScenePoint | null>(null)
  const drag = useRef<DragRef | null>(null)
  const at = useRef<ScenePoint | null>(null)
  const swallowClick = useRef(false)

  const point = useCallback(
    (d: DragRef, e: React.PointerEvent): ScenePoint => {
      const p = clampToBand(surface, d.mount, d.x0 + (e.clientX - d.cx) * d.sx, d.y0 + (e.clientY - d.cy) * d.sy)
      // A mount with no band of its own still can't leave the frame.
      return {
        anchor: d.anchor,
        x: Math.min(width, Math.max(0, p.x)),
        y: Math.min(height, Math.max(0, p.y)),
      }
    },
    [surface, width, height],
  )

  const bind = useCallback(
    (anchor: string, mount: string, x: number, y: number) => ({
      onPointerDown: (e: React.PointerEvent) => {
        // Only the lifted piece drags. Everything else keeps the browser's own
        // behaviour, which on a phone means the sheet still scrolls.
        if (!enabled || picked !== anchor) return
        const svg = (e.currentTarget as SVGGElement).ownerSVGElement
        const r = svg?.getBoundingClientRect()
        if (!r?.width || !r.height) return
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
          sx: width / r.width,
          sy: height / r.height,
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
    [enabled, picked, width, height, point, onCommit],
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
  const sceneRef = useCallback((el: SVGSVGElement | null) => {
    detach.current?.()
    detach.current = null
    if (!el) return
    const onTouchMove = (e: TouchEvent) => {
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
