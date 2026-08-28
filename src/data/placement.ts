// Placing, merging and moving things in a little world — the one copy.
//
// These three planners used to live in data/keep.ts, hardcoded against the
// keep's ANCHORS. The Upper Room (data/room.ts) wants exactly the same three
// functions over a different anchor set, and a second copy is precisely the
// drift the QuizRunner rule exists to prevent: two rooms that disagree about
// what a duplicate means is a bug nobody would find for months, because both
// halves look right on their own.
//
// So the rules live here, once, parameterised by a Surface, and data/keep.ts
// keeps its existing exports as thin wrappers — every keep call site is
// untouched. The rules themselves are unchanged, and they are the whole
// contract of both worlds:
//
//   NOTHING IS EVER LOST. An empty target takes the piece, the SAME piece
//   merges a tier finer, and anything else TRADES PLACES. There is no code path
//   that overwrites, because "I dropped it on the wrong spot and my tapestry
//   vanished" is the one way tap-to-move can genuinely hurt.
//
//   A TIER IS A LOOK, NOT A COUNT. Merging keeps both worlds inside their
//   "presence, not quantity" rule: a Grand rug is not a bigger rug, reading it
//   back tells you nothing about anybody, and ownership stays derived — clear a
//   merged piece and it starts again at plain, because you never stopped owning
//   it.
//
//   A PIECE ONLY LANDS ON ITS OWN MOUNT. A rug on a rafter is not a placement,
//   it is a bug. The targets a scene draws while carrying are this constraint
//   made visible, rather than an error after the fact.

export interface SurfaceAnchor {
  id: string
  mount: string
}

/**
 * What a planner needs to know about a world: its anchors, in the order ties
 * should break, and how to find out what mount a placeable belongs on.
 *
 * `mountOf` returns undefined for an id the world doesn't know, and every
 * planner treats that as "do nothing" rather than throwing — a catalog can name
 * something this build doesn't have (the sanitizeQuestDefs doctrine).
 */
export interface Surface {
  anchors: SurfaceAnchor[]
  mountOf: (id: string) => string | undefined
}

export const MAX_TIER = 3

/** Tier 1 is the object itself, so it has no adjective. */
export const TIER_PREFIX = ['', 'Fine ', 'Grand '] as const

// ── The wire format ─────────────────────────────────────────────────────────
// A placement value is `keep_woven_rug` at tier 1 and `keep_woven_rug.2` / `.3`
// above it, so every row and every localStorage blob written before merging
// existed still reads correctly as tier 1 and no stored shape had to change.
// packDecor/unpackDecor are the only two places that know it.

export function packDecor(id: string, tier: number): string {
  const t = Math.min(MAX_TIER, Math.max(1, Math.floor(tier || 1)))
  return t <= 1 ? id : `${id}.${t}`
}

export function unpackDecor(value?: string | null): { id: string; tier: number } {
  if (!value) return { id: '', tier: 1 }
  const dot = value.indexOf('.')
  if (dot < 0) return { id: value, tier: 1 }
  const tier = Number(value.slice(dot + 1))
  return {
    id: value.slice(0, dot),
    // An unknown suffix is somebody else's future, not a crash: draw it plain.
    tier: Number.isFinite(tier) ? Math.min(MAX_TIER, Math.max(1, tier)) : 1,
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
  /** True when this absorbed a duplicate rather than filling the target spot. */
  merged: boolean
  /** The tier the object ends up at, for the toast. */
  tier: number
  /** True when the tap changes nothing at all, so nothing is written. */
  noop?: boolean
}

/**
 * What placing `id` on `anchor` should actually do.
 *
 * If that piece is already out anywhere and isn't maxed, the placement merges
 * into THAT copy and the tapped spot is left alone. Ties go to the copy
 * furthest along — a second merge should finish the Fine one rather than
 * starting a second ladder — and then to anchor order, so two devices given the
 * same state always pick the same spot.
 *
 * The tapped anchor counts as a candidate when it's already holding the same
 * thing, which is what stops a single-anchor mount (the keep's stable) being
 * the one place that can never be merged.
 */
export function planPlacementOn(
  surface: Surface,
  placements: PlacementMap,
  anchor: string,
  id: string | null,
): PlacementPlan {
  if (!id) return { anchor, value: null, merged: false, tier: 1 }

  let best: { anchor: string; tier: number } | null = null
  for (const a of surface.anchors) {
    const here = unpackDecor(placements[a.id])
    if (here.id !== id || here.tier >= MAX_TIER) continue
    if (!best || here.tier > best.tier) best = { anchor: a.id, tier: here.tier }
  }

  if (best) {
    return { anchor: best.anchor, value: packDecor(id, best.tier + 1), merged: true, tier: best.tier + 1 }
  }

  // Nothing left to merge into. If the tapped spot is ALREADY holding this — a
  // maxed one, since anything below max would have merged — then the tap means
  // "keep it", and writing a plain id here would quietly demote a Grand piece
  // back to nothing. (It did, until a browser found it.)
  const onTarget = unpackDecor(placements[anchor])
  if (onTarget.id === id) {
    return { anchor, value: placements[anchor], merged: false, tier: onTarget.tier, noop: true }
  }

  return { anchor, value: id, merged: false, tier: 1 }
}

// ── Moving a placed piece ───────────────────────────────────────────────────

export interface MovePlan {
  /** anchor -> new packed value, or null to clear. Applied in this order. */
  writes: { anchor: string; value: string | null }[]
  /** True when the two pieces were the same thing and folded together. */
  merged: boolean
  /** True when two different pieces traded places. */
  swapped: boolean
  tier: number
}

/** Move the piece on `from` to `to`. Never loses either one — see the header. */
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

  if (target.id === moving.id && target.tier < MAX_TIER) {
    const tier = Math.min(MAX_TIER, Math.max(target.tier, moving.tier) + 1)
    return {
      writes: [{ anchor: to, value: packDecor(moving.id, tier) }, { anchor: from, value: null }],
      merged: true,
      swapped: false,
      tier,
    }
  }

  return {
    writes: [
      { anchor: to, value: placements[from] },
      { anchor: from, value: placements[to] ?? null },
    ],
    merged: false,
    swapped: !!target.id,
    tier: moving.tier,
  }
}

// ── Tapping the shelf ───────────────────────────────────────────────────────

export type PickOutcome =
  /** Goes to a free anchor of its mount. */
  | { kind: 'place'; anchor: string; value: string; tier: 1 }
  /** Folds into the copy already out, one tier up. */
  | { kind: 'merge'; anchor: string; value: string; tier: number }
  /** Already out and already Grand — there is nothing left to do to it. */
  | { kind: 'maxed'; anchor: string }
  /** Every spot of its kind is taken by something else. */
  | { kind: 'full'; mount: string }

/**
 * What tapping `id` on the shelf should do.
 *
 * Order matters: merging beats filling a new spot, so a second tap always
 * improves the piece you have rather than starting a second one. When the mount
 * is full of OTHER things it refuses instead of overwriting.
 */
export function planPickOn(surface: Surface, placements: PlacementMap, id: string): PickOutcome {
  const mount = surface.mountOf(id)
  if (!mount) return { kind: 'full', mount: '' }
  const spots = surface.anchors.filter((a) => a.mount === mount)

  let best: { anchor: string; tier: number } | null = null
  let anyCopy: string | null = null
  for (const a of spots) {
    const here = unpackDecor(placements[a.id])
    if (here.id !== id) continue
    anyCopy = anyCopy ?? a.id
    if (here.tier < MAX_TIER && (!best || here.tier > best.tier)) {
      best = { anchor: a.id, tier: here.tier }
    }
  }

  if (best) {
    const tier = best.tier + 1
    return { kind: 'merge', anchor: best.anchor, value: packDecor(id, tier), tier }
  }
  if (anyCopy) return { kind: 'maxed', anchor: anyCopy }

  const free = spots.find((a) => !placements[a.id])
  if (free) return { kind: 'place', anchor: free.id, value: id, tier: 1 }

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
