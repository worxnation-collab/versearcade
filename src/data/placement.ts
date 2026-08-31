// Placing, moving and sizing things in a little world — the one copy.
//
// These planners used to live in data/keep.ts, hardcoded against the keep's
// ANCHORS. The Upper Room (data/room.ts) wants exactly the same functions over
// a different anchor set, and a second copy is precisely the drift the
// QuizRunner rule exists to prevent: two rooms that disagree about what a
// placement means is a bug nobody would find for months, because both halves
// look right on their own.
//
// So the rules live here, once, parameterised by a Surface, and data/keep.ts
// keeps its existing exports as thin wrappers. The rules are the whole
// contract of both worlds:
//
//   NOTHING IS EVER LOST. An empty target takes the piece and anything else
//   TRADES PLACES. There is no code path that overwrites, because "I dropped
//   it on the wrong spot and my tapestry vanished" is the one way tap-to-move
//   can genuinely hurt.
//
//   A TIER IS A SEPARATE, EARNED THING. Merging is gone: a Fine rug is no
//   longer made by stacking two plain ones, it is its own unlock on the same
//   challenge ladder, earned at a higher goal and placed from the shelf like
//   anything else. Unlocking a finer tier upgrades the placed piece IN PLACE
//   (position and size kept), because the finer version of your rug is still
//   your rug. Ownership stays derived — nothing is spent, nothing granted,
//   nothing to revoke.
//
//   A PIECE ONLY LANDS ON ITS OWN MOUNT. A rug on a rafter is not a placement,
//   it is a bug. Free positioning moves WITHIN a mount's band, so "put it
//   where you like" never becomes "hang the brazier from the ceiling".
//
//   AN ANCHOR IS A ROW KEY, NOT A LOCATION. Since positions became free, the
//   anchor a piece is stored under only decides where it stands when its value
//   carries no position of its own — which is also what keeps every placement
//   written before free positioning existed rendering exactly where it always
//   has.

export interface SurfaceAnchor {
  id: string
  mount: string
}

/** An axis-aligned region a mount's pieces may stand in, in scene units. */
export interface MountBand {
  x0: number
  y0: number
  x1: number
  y1: number
}

/**
 * What a planner needs to know about a world: its anchors, in the order ties
 * should break, how to find out what mount a placeable belongs on, and
 * (optionally) where each mount's pieces are allowed to stand.
 *
 * `mountOf` returns undefined for an id the world doesn't know, and every
 * planner treats that as "do nothing" rather than throwing — a catalog can name
 * something this build doesn't have (the sanitizeQuestDefs doctrine).
 */
export interface Surface {
  anchors: SurfaceAnchor[]
  mountOf: (id: string) => string | undefined
  bands?: Record<string, MountBand>
}

export const MAX_TIER = 3

/** Tier 1 is the object itself, so it has no adjective. */
export const TIER_PREFIX = ['', 'Fine ', 'Grand '] as const

/** How much a placed piece may be grown or shrunk. Bounded on purpose: a rug
 *  scaled to fill the hall stops being furniture, and "presence, not quantity"
 *  still wants a Grand rug to be a finer rug rather than merely a bigger one. */
export const SCALE_MIN = 0.7
export const SCALE_MAX = 1.4

// ── The wire format ─────────────────────────────────────────────────────────
// A placement value is `keep_woven_rug` at tier 1, `keep_woven_rug.2` / `.3`
// above it, and either may carry a position/size suffix:
//
//     keep_woven_rug.2~x412y188s120     (moved and resized)
//     keep_woven_rug.2~x412y188         (moved, natural size)
//     keep_woven_rug.2~s120             (resized, on its anchor)
//
// x/y are scene units (integers), s is scale ×100 (70..140). Every row and
// every localStorage blob written before any of this existed still reads
// correctly — no suffix means "tier 1, standing on its anchor, at scale 1" —
// and packDecor/unpackDecor are the only two places that know the format.
// KEEP THE GRAMMAR IN SYNC with the value regexes in migration 0083.

export interface PlacedPos {
  x?: number
  y?: number
  /** Scale as a float (1 = natural size). */
  s?: number
}

const clampScale = (s: number) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, s))

export function packDecor(id: string, tier: number, pos?: PlacedPos): string {
  const t = Math.min(MAX_TIER, Math.max(1, Math.floor(tier || 1)))
  let out = t <= 1 ? id : `${id}.${t}`
  // Position and size are INDEPENDENT halves of the suffix, written only when
  // they carry information. Entangling them shipped for about a minute: a
  // resize on a never-moved piece defaulted x/y to 0 and teleported the mat to
  // the room's top-left corner. Found by driving the real app.
  const hasXY = pos?.x !== undefined && pos?.y !== undefined
  const sVal = pos?.s !== undefined ? Math.round(clampScale(pos.s) * 100) : 100
  const hasS = sVal !== 100
  if (hasXY || hasS) {
    out += '~'
    if (hasXY) out += `x${Math.max(0, Math.round(pos!.x!))}y${Math.max(0, Math.round(pos!.y!))}`
    if (hasS) out += `s${sVal}`
  }
  return out
}

export interface UnpackedDecor {
  id: string
  tier: number
  /** Present only when the piece has been moved off its anchor. */
  x?: number
  y?: number
  /** Present only when the piece has been resized; a float, 0.7..1.4. */
  s?: number
}

export function unpackDecor(value?: string | null): UnpackedDecor {
  if (!value) return { id: '', tier: 1 }
  let base = value
  let pos: Pick<UnpackedDecor, 'x' | 'y' | 's'> = {}
  const tilde = value.indexOf('~')
  if (tilde >= 0) {
    base = value.slice(0, tilde)
    const m = value.slice(tilde + 1).match(/^(?:x(\d{1,3})y(\d{1,3}))?(?:s(\d{2,3}))?$/)
    // An unknown suffix is somebody else's future, not a crash: stand it on
    // its anchor at natural size, the same way an unknown tier draws plain.
    if (m && (m[1] !== undefined || m[3] !== undefined)) {
      pos = {
        ...(m[1] !== undefined ? { x: Number(m[1]), y: Number(m[2]) } : {}),
        ...(m[3] !== undefined ? { s: clampScale(Number(m[3]) / 100) } : {}),
      }
    }
  }
  const dot = base.indexOf('.')
  if (dot < 0) return { id: base, tier: 1, ...pos }
  const tier = Number(base.slice(dot + 1))
  return {
    id: base.slice(0, dot),
    tier: Number.isFinite(tier) ? Math.min(MAX_TIER, Math.max(1, tier)) : 1,
    ...pos,
  }
}

/** The same placement with its position/size patched — tier and id untouched. */
export function repackPos(value: string, patch: PlacedPos): string {
  const cur = unpackDecor(value)
  return packDecor(cur.id, cur.tier, {
    x: patch.x ?? cur.x,
    y: patch.y ?? cur.y,
    s: patch.s ?? cur.s,
  })
}

/** Clamp a point into a mount's band, or pass it through when no band is set. */
export function clampToBand(surface: Surface, mount: string, x: number, y: number): { x: number; y: number } {
  const b = surface.bands?.[mount]
  if (!b) return { x: Math.round(x), y: Math.round(y) }
  return {
    x: Math.round(Math.min(b.x1, Math.max(b.x0, x))),
    y: Math.round(Math.min(b.y1, Math.max(b.y0, y))),
  }
}

/** anchor id -> packed value. */
export type PlacementMap = Record<string, string>

// ── Placing on a named anchor ───────────────────────────────────────────────

export interface PlacementPlan {
  /** The anchor that actually changes. */
  anchor: string
  /** What to write there — a packed value, or null to clear. */
  value: string | null
  /** The tier the object ends up at, for the toast. */
  tier: number
  /** True when the tap changes nothing at all, so nothing is written. */
  noop?: boolean
}

/**
 * What writing `value` onto `anchor` should actually do. The value is packed
 * (id, tier, and optionally position), and the planner's only judgement is the
 * no-op: writing what is already there — or a plain copy of something already
 * standing there finer — must change nothing. Everything smarter (which anchor,
 * which tier) is decided by planPickOn or by the caller.
 */
export function planPlacementOn(
  surface: Surface,
  placements: PlacementMap,
  anchor: string,
  value: string | null,
): PlacementPlan {
  if (!value) return { anchor, value: null, tier: 1 }
  const next = unpackDecor(value)
  const cur = unpackDecor(placements[anchor])
  // Writing the same piece at the same-or-lower tier over itself is the tap
  // that means "keep it" — writing it through would quietly demote a Grand
  // piece back to plain. (It did, until a browser found it.)
  if (cur.id === next.id && cur.tier >= next.tier) {
    return { anchor, value: placements[anchor], tier: cur.tier, noop: true }
  }
  return { anchor, value, tier: next.tier }
}

// ── Moving a placed piece ───────────────────────────────────────────────────

export interface MovePlan {
  /** anchor -> new packed value, or null to clear. Applied in this order. */
  writes: { anchor: string; value: string | null }[]
  /** True when two different pieces traded places. */
  swapped: boolean
  tier: number
}

/**
 * Move the piece on `from` to the anchor `to`. Never loses either one — an
 * occupied target trades places. Both pieces drop any free position they
 * carried (each now stands on its new anchor, which is what the tap said) but
 * keep their size: where something stands is the thing being changed, how big
 * it is isn't.
 */
export function planMoveOn(
  surface: Surface,
  placements: PlacementMap,
  from: string,
  to: string,
): MovePlan | null {
  if (from === to) return null
  const fromDef = surface.anchors.find((a) => a.id === from)
  const toDef = surface.anchors.find((a) => a.id === to)
  if (!fromDef || !toDef || fromDef.mount !== toDef.mount) return null

  const moving = unpackDecor(placements[from])
  if (!moving.id) return null
  const target = unpackDecor(placements[to])

  return {
    writes: [
      { anchor: to, value: packDecor(moving.id, moving.tier, { s: moving.s }) },
      {
        anchor: from,
        value: target.id ? packDecor(target.id, target.tier, { s: target.s }) : null,
      },
    ],
    swapped: !!target.id,
    tier: moving.tier,
  }
}

/**
 * Move the piece on `from` to a free point within its own mount's band. The
 * piece keeps its anchor row — position is display, the anchor is the key —
 * so this is one write, and clearing the piece later works exactly as before.
 */
export function planMoveToPointOn(
  surface: Surface,
  placements: PlacementMap,
  from: string,
  x: number,
  y: number,
): MovePlan | null {
  const fromDef = surface.anchors.find((a) => a.id === from)
  const moving = unpackDecor(placements[from])
  if (!fromDef || !moving.id) return null
  const p = clampToBand(surface, fromDef.mount, x, y)
  return {
    writes: [{ anchor: from, value: repackPos(placements[from], { x: p.x, y: p.y }) }],
    swapped: false,
    tier: moving.tier,
  }
}

/** Resize the piece on `anchor`, clamped to SCALE_MIN..SCALE_MAX. */
export function planResizeOn(
  placements: PlacementMap,
  anchor: string,
  s: number,
): MovePlan | null {
  const cur = unpackDecor(placements[anchor])
  if (!cur.id) return null
  return {
    writes: [{ anchor, value: repackPos(placements[anchor], { s: clampScale(s) }) }],
    swapped: false,
    tier: cur.tier,
  }
}

// ── Tapping the shelf ───────────────────────────────────────────────────────

export type PickOutcome =
  /** Goes to a free anchor of its mount. */
  | { kind: 'place'; anchor: string; value: string; tier: number }
  /** A finer tier replacing the copy already out, where it stands. */
  | { kind: 'upgrade'; anchor: string; value: string; tier: number }
  /** Already out at this tier — there is nothing the tap would change. */
  | { kind: 'already'; anchor: string }
  /** Every spot of its kind is taken by something else. */
  | { kind: 'full'; mount: string }

/**
 * What tapping `id` on the shelf should do, now that the shelf offers the best
 * TIER you've earned rather than a stack of duplicates.
 *
 * If the piece is already out at a lesser tier, the tap upgrades it IN PLACE —
 * same anchor, same position, same size — because the finer version of your
 * rug is still your rug and moving it under you would undo an arrangement you
 * chose. Already out at this tier: nothing to do. Not out: first free anchor
 * of its mount, refusing (never overwriting) when the mount is full.
 */
export function planPickOn(
  surface: Surface,
  placements: PlacementMap,
  id: string,
  tier = 1,
): PickOutcome {
  const mount = surface.mountOf(id)
  if (!mount) return { kind: 'full', mount: '' }
  const spots = surface.anchors.filter((a) => a.mount === mount)

  for (const a of spots) {
    const here = unpackDecor(placements[a.id])
    if (here.id !== id) continue
    if (here.tier >= tier) return { kind: 'already', anchor: a.id }
    return {
      kind: 'upgrade',
      anchor: a.id,
      value: packDecor(id, tier, { x: here.x, y: here.y, s: here.s }),
      tier,
    }
  }

  const free = spots.find((a) => !placements[a.id])
  if (free) return { kind: 'place', anchor: free.id, value: packDecor(id, tier), tier }

  return { kind: 'full', mount }
}

// ── Reading the room ────────────────────────────────────────────────────────

/** Every anchor currently holding this piece, best tier first. */
export function anchorsHoldingOn(
  surface: Surface,
  placements: PlacementMap,
  id: string,
): string[] {
  return surface.anchors
    .filter((a) => unpackDecor(placements[a.id]).id === id)
    .sort((a, b) => unpackDecor(placements[b.id]).tier - unpackDecor(placements[a.id]).tier)
    .map((a) => a.id)
}

/** The best tier of this piece currently out, or 0 if it isn't. */
export function placedTierOn(surface: Surface, placements: PlacementMap, id: string): number {
  return surface.anchors.reduce((best, a) => {
    const here = unpackDecor(placements[a.id])
    return here.id === id ? Math.max(best, here.tier) : best
  }, 0)
}
