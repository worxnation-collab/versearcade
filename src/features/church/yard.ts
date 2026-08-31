// The churchyard — what a giver can plant out front.
//
// The building itself is the congregation's: `levels.ts` grows it with pooled
// XP, `skins.ts` decides what it's made of. This is the third thing and it is
// the only one that is YOURS — the landscaping you put in front of a church you
// give to. Flowers are unlocked by giving and by nothing else: no shop, no
// promo code, no drop.
//
// Three rules, and they are the same three the keep's hall runs on (see the
// header of data/keep.ts), because this is the same shape of feature:
//
//   PLANTINGS ARE PER-PLAYER, THE YARD IS SHARED. You choose your own six
//   plots; the churchyard other members see is a deterministic per-viewer
//   sample of everyone's (church_yard_json, 0061). So a yard fills up as a
//   congregation gives, and no bed anywhere carries a name.
//
//   PRESENCE, NOT QUANTITY. Nothing is counted and nobody is compared. A yard
//   never says how many members planted, who planted what, or who gave most —
//   that would turn a garden into a receipt, and the giving screen already has
//   the one list where a number is a thank-you rather than a ranking.
//
//   GIVING IS STILL FREE. Points given cost the giver nothing (their own XP and
//   rank don't move), so a flower can't be "spent" — the threshold is LIFETIME
//   given and only ever goes up. Switch churches and you keep every flower:
//   you gave, and giving isn't a deposit you can lose.
//
// NO PRICES, EITHER MODE. Nothing here is or becomes a purchase, so this
// surface is byte-identical on the web and in the App Store build and
// `commerce.ts` never has to know it exists — the same rule the church page's
// "Add info" pill follows.

import {
  clampToPercentBand,
  packPercent,
  unpackPercent,
  type PercentBand,
  type PercentPos,
} from '@/data/placement'

// ── Plots ────────────────────────────────────────────────────────────────────
// A fixed set of spots in the scene, so the yard's render cost never grows and
// planting is a loadout rather than a canvas — six plots, eight plants, so a
// full collection still has to choose.
//
// Coordinates are ChurchScene's: x is percent across, b is percent up from the
// bottom. Measured against the scene, not guessed — the building is 190px wide
// on a 390px canvas, so its footprint is x 26-74% with its base at b≈31%, and
// the path flares from x 47-53% at the door to x 35-65% at the viewer.
//
// Three depth bands, symmetric, in three separate x-columns per side. The
// columns are the load-bearing part: a lamp post at the front is a quarter of
// the scene tall, so a front plot sharing a column with a back plot puts a lamp
// head straight through a flower bed. (It did.) The front pair also sits
// OUTSIDE the path's flare, so nothing is ever planted in the middle of the
// walk up to the door.

export interface PlotDef {
  id: string
  /** Percent across the scene. */
  x: number
  /** Percent up from the scene's bottom edge. */
  b: number
  /** What the picker calls it. */
  label: string
}

export const PLOTS: PlotDef[] = [
  // Back: against the front wall, either side of the door.
  { id: 'bed_l', x: 33, b: 28, label: 'Bed, left of the door' },
  { id: 'bed_r', x: 67, b: 28, label: 'Bed, right of the door' },
  // Middle: out on the lawn, clear of the building. Pulled in from the edges
  // because the generated plants are cropped tight and each has its own shape —
  // a hedge is half again as wide as it is tall, and at x 90 it ran off the
  // side of the scene.
  { id: 'lawn_l', x: 14, b: 17, label: 'Left lawn' },
  { id: 'lawn_r', x: 86, b: 17, label: 'Right lawn' },
  // Front: nearest the viewer, flanking the foot of the path.
  { id: 'path_l', x: 24, b: 4, label: 'Path edge, left' },
  { id: 'path_r', x: 76, b: 4, label: 'Path edge, right' },
]

export const plotById = (id: string): PlotDef | undefined => PLOTS.find((p) => p.id === id)

// ── Where a plant may actually stand ────────────────────────────────────────
// A plot is now a ROW KEY rather than a location, exactly as an anchor became
// one in the keep (data/placement.ts): a planting stands wherever its value
// says, and falls back to its plot when the value carries no position — which
// is what keeps every bed planted before free placement standing where it
// always did.
//
// The band is the lawn. Its top is the line the building's base sits on (b≈31%)
// so nothing can be dragged into the sky or onto the roof, and the sides stop
// short of the frame because the art is cropped tight and centred on its point:
// a boxwood hedge is half again as wide as it is tall, so at the old x1 of 96
// its right edge was clipped by the frame. 6..94 keeps every shape inside.
export const YARD_BAND: PercentBand = { x0: 6, b0: 1, x1: 94, b1: 30 }

/** `yard_lamp~x412y188` — the shared grammar, in tenths of a percent. */
export function packPlanting(id: string, pos: PercentPos): string {
  const p = clampToPercentBand(YARD_BAND, pos.x, pos.b)
  return packPercent(id, p)
}

/** The plant in a planting value — a bare `yard_ivy` or a positioned one. */
export const plantingId = (value?: string | null): string => unpackPercent(value).id

/**
 * Where a planting stands: its own position, or its plot's.
 *
 * Every render path goes through this, so a value written before free
 * placement and one dragged this morning are drawn by the same code.
 */
export function plantingAt(value: string | undefined, plot: PlotDef): PercentPos {
  const u = unpackPercent(value)
  return { x: u.x ?? plot.x, b: u.b ?? plot.b }
}

/** Depth cue, matching the crowd's: further up the yard = smaller. */
export function plotHeight(b: number): number {
  const clamped = Math.min(Math.max(b, 4), 30)
  return 52 - ((clamped - 4) / 26) * 22
}

// ── What you can plant ───────────────────────────────────────────────────────
// Ordered as a ladder. The first two land inside a week of ordinary play so a
// new giver sees the yard change; the dogwood is a long season of giving. The
// list is deliberately not all flowers — a lamp post and a hedge are what make
// a strip of grass read as landscaping rather than a flower shop.
//
// KEEP IN SYNC with the thresholds in `church_flora_min_given` (0061). The
// server is the one that decides whether a planting is allowed; this copy is
// what draws the ladder and greys out the locked rows.

export interface FloraDef {
  id: string
  name: string
  /** Lifetime points given, across every church you've given to. */
  given: number
  blurb: string
  /** Multiplier on the plot's height — a tree is not a pot of marigolds. */
  scale: number
}

// Ordered by threshold. Six of these were added after the first eight, slotted
// BETWEEN the original rungs rather than on top of them: every existing
// threshold is untouched, because lowering one would be free points and
// raising one would lock a plant somebody had already planted.
export const FLORA: FloraDef[] = [
  { id: 'yard_planters', name: 'Doorstep Planters', given: 250, scale: 0.62, blurb: 'Two pots by the door. Somebody has been here.' },
  { id: 'yard_ivy', name: 'Ivy', given: 500, scale: 0.55, blurb: 'It got there on its own, and nobody minds.' },
  { id: 'yard_marigolds', name: 'Marigold Bed', given: 1_000, scale: 0.72, blurb: 'Orange all summer, and hard to kill.' },
  { id: 'yard_lavender', name: 'Lavender', given: 2_000, scale: 0.7, blurb: 'The bees find it before anybody else does.' },
  { id: 'yard_lilies', name: 'Easter Lilies', given: 3_000, scale: 0.86, blurb: 'White trumpets, out for the one Sunday.' },
  { id: 'yard_olive', name: 'Olive Sapling', given: 5_000, scale: 1.05, blurb: 'Slow, and worth it.' },
  { id: 'yard_rosebush', name: 'Rose Bush', given: 7_500, scale: 0.95, blurb: 'Someone prunes this every spring.' },
  { id: 'yard_bench', name: 'Garden Bench', given: 10_000, scale: 0.7, blurb: 'Somewhere to sit before you go in.' },
  { id: 'yard_hedge', name: 'Boxwood Hedge', given: 15_000, scale: 0.8, blurb: 'Clipped square, the way it has always been.' },
  { id: 'yard_birdbath', name: 'Stone Birdbath', given: 22_000, scale: 0.78, blurb: 'Sparrows, mostly. He knows about those.' },
  { id: 'yard_lamp', name: 'Lamp Post', given: 30_000, scale: 1.25, blurb: 'So the path is lit for the evening service.' },
  { id: 'yard_wisteria', name: 'Wisteria', given: 45_000, scale: 1.3, blurb: 'It takes years to climb, and then it is everywhere.' },
  { id: 'yard_sunflowers', name: 'Sunflowers', given: 60_000, scale: 1.15, blurb: 'Taller than the children who planted them.' },
  { id: 'yard_dogwood', name: 'Flowering Dogwood', given: 120_000, scale: 1.6, blurb: 'A tree in bloom. It will outlast the roof.' },
]

/**
 * Takes an id OR a packed planting value, because nearly every caller has the
 * latter and forgetting to unpack draws an empty plot rather than an error —
 * the exact class of bug that is invisible until somebody looks at their yard.
 */
export const floraById = (id?: string | null): FloraDef | undefined => {
  if (!id) return undefined
  const bare = id.includes('~') ? unpackPercent(id).id : id
  return FLORA.find((f) => f.id === bare)
}

/** What a giver has earned. Pure function of lifetime given — nothing granted. */
export function unlockedFlora(given: number): FloraDef[] {
  return FLORA.filter((f) => given >= f.given)
}

export function floraUnlocked(id: string, given: number): boolean {
  const f = floraById(id)
  return !!f && given >= f.given
}

/** The next thing to earn, for the one line that says what giving more buys. */
export function nextFlora(given: number): FloraDef | undefined {
  return FLORA.find((f) => given < f.given)
}

/** plot id -> planting value (`yard_ivy`, or `yard_ivy~x412y188`). */
export type Plantings = Record<string, string>
