// The Upper Room — a small chamber that belongs to one person.
//
//   "Let us make a little chamber on the wall; and let us set for him there a
//    bed, and a table, and a stool, and a candlestick." — 2 Kings 4:10
//
// Every other place in this app belongs to a group: the hall is the faction's,
// the churchyard is the congregation's, the road is the season's. This is the
// one that is yours. See docs/UPPER-ROOM.md for the design of record; the rules
// that matter most here are the keep's, inherited deliberately:
//
//   PRESENCE, NOT QUANTITY. Nothing in the room is ever counted — not on your
//   own room, and certainly not on a room you are visiting. No completion
//   percentage on the scene, no "12 furnishings", no comparison between two
//   people's rooms. The Journal counts what you have DONE; a room is a place.
//
//   OWNERSHIP IS DERIVED. Eighteen furnishings against six lifetime numbers the
//   app already keeps. There is no grant table, nothing to revoke, and every
//   number only ever goes up — so a bad week can never take a chair away. Same
//   promise the pets make.
//
//   NO PLAYER-AUTHORED TEXT. Anchors and furnishing ids against fixed catalogs.
//   A room a stranger can walk into with a text field in it is a moderation
//   queue, and this one is visitable by design.
//
//   A VISITOR CAN ONLY LOOK. room_json returns placements and a tier and no
//   numbers at all, because a room you can rank is a scoreboard with furniture
//   on it.

import {
  MAX_TIER,
  TIER_PREFIX,
  anchorsHoldingOn,
  placedTierOn,
  planMoveOn,
  planPickOn,
  planPlacementOn,
  unpackDecor,
  type MovePlan,
  type PickOutcome,
  type PlacementMap,
  type PlacementPlan,
  type Surface,
} from './placement'

// ── Anchors ─────────────────────────────────────────────────────────────────
// A fixed set of typed mount points, so the room's render cost never grows and
// furnishing is a loadout rather than a canvas. Calibrated against the drawn
// chamber (features/room/RoomArt): the shelf runs along the left wall, the
// window is right of centre, the low table sits mid-floor and the sleeping
// nook is the alcove on the right.

export type RoomMount = 'shelf' | 'wall' | 'sill' | 'floor' | 'table' | 'nook'

export interface RoomAnchorDef {
  id: string
  mount: RoomMount
  /** Ground point in the room's 560x300 viewBox. */
  x: number
  y: number
}

export const ROOM_ANCHORS: RoomAnchorDef[] = [
  { id: 'shelf_1', mount: 'shelf', x: 148, y: 120 },
  { id: 'shelf_2', mount: 'shelf', x: 198, y: 120 },
  { id: 'wall_1', mount: 'wall', x: 258, y: 96 },
  { id: 'wall_2', mount: 'wall', x: 320, y: 92 },
  { id: 'wall_3', mount: 'wall', x: 382, y: 96 },
  { id: 'sill_1', mount: 'sill', x: 452, y: 134 },
  { id: 'table_1', mount: 'table', x: 296, y: 212 },
  { id: 'table_2', mount: 'table', x: 336, y: 212 },
  { id: 'floor_1', mount: 'floor', x: 108, y: 262 },
  { id: 'floor_2', mount: 'floor', x: 250, y: 284 },
  { id: 'floor_3', mount: 'floor', x: 398, y: 266 },
  { id: 'nook_1', mount: 'nook', x: 496, y: 240 },
]

export const roomAnchorById = (id: string): RoomAnchorDef | undefined =>
  ROOM_ANCHORS.find((a) => a.id === id)

export const roomAnchorsForMount = (mount: RoomMount): RoomAnchorDef[] =>
  ROOM_ANCHORS.filter((a) => a.mount === mount)

/** What to call a full mount when the room refuses a piece. */
export const ROOM_MOUNT_WORD: Record<RoomMount, string> = {
  shelf: 'shelf',
  wall: 'wall',
  sill: 'windowsill',
  floor: 'floor',
  table: 'table',
  nook: 'alcove',
}

// ── What the room asks of you ───────────────────────────────────────────────
// Six lifetime numbers, every one of them already kept by something else and
// every one of them monotonic. `streak` is the LONGEST, never the current, for
// the reason the pets give: a requirement you can lose by missing a day is a
// punishment, and nothing in this app takes something back.

export type RoomRequirement = 'level' | 'streak' | 'plays' | 'studied' | 'read' | 'cards'

export interface RoomProgress {
  level: number
  /** Longest streak ever reached. */
  streak: number
  plays: number
  /** Verses quizzed, in any mode. */
  studied: number
  /** Chapters opened. */
  read: number
  /** Collectibles stamped. */
  cards: number
}

export const EMPTY_ROOM_PROGRESS: RoomProgress = {
  level: 1, streak: 0, plays: 0, studied: 0, read: 0, cards: 0,
}

/** How each requirement reads in a sentence, so no screen writes its own copy. */
export const REQUIREMENT_NOUN: Record<RoomRequirement, (n: number) => string> = {
  level: (n) => `Reach level ${n}`,
  streak: (n) => `Reach a ${n}-day streak`,
  plays: (n) => `Play ${n} daily verse${n === 1 ? '' : 's'}`,
  studied: (n) => `Study ${n} verse${n === 1 ? '' : 's'}`,
  read: (n) => `Open ${n} chapter${n === 1 ? '' : 's'} of the Bible`,
  cards: (n) => `Collect ${n} card${n === 1 ? '' : 's'} or relic${n === 1 ? '' : 's'}`,
}

// ── Furnishings ─────────────────────────────────────────────────────────────
// Availability is universal, like the keep's decorations: everything is earned
// by playing and nothing is bought. The ladder is ordered so the first two land
// in the first session and the cedar chest is a season of evenings.

export interface FurnishingDef {
  id: string
  name: string
  mount: RoomMount
  blurb: string
  req: RoomRequirement
  goal: number
}

export const FURNISHINGS: FurnishingDef[] = [
  { id: 'room_reed_mat', name: 'Reed Mat', mount: 'floor', blurb: 'Woven rushes, and the floor stops being stone.', req: 'plays', goal: 1 },
  { id: 'room_lampstand', name: 'Lampstand', mount: 'table', blurb: 'The candlestick of the little chamber.', req: 'streak', goal: 3 },
  { id: 'room_stool', name: 'Three-legged Stool', mount: 'floor', blurb: 'Somewhere to sit and read.', req: 'plays', goal: 5 },
  { id: 'room_sleeping_mat', name: 'Sleeping Mat', mount: 'nook', blurb: 'Rolled out in the alcove.', req: 'streak', goal: 7 },
  { id: 'room_olive_jar', name: 'Olive Oil Jar', mount: 'shelf', blurb: 'Enough oil to keep the lamp lit.', req: 'plays', goal: 10 },
  { id: 'room_lattice', name: 'Window Lattice', mount: 'sill', blurb: 'Cedar lattice, and the light comes in patterned.', req: 'read', goal: 10 },
  { id: 'room_hanging', name: 'Woven Hanging', mount: 'wall', blurb: 'Dyed wool against a plastered wall.', req: 'level', goal: 8 },
  { id: 'room_open_scroll', name: 'Open Scroll', mount: 'table', blurb: 'Left open at the place you stopped.', req: 'read', goal: 25 },
  { id: 'room_scroll_rack', name: 'Scroll Rack', mount: 'shelf', blurb: 'Everything you have worked through, standing up.', req: 'studied', goal: 25 },
  { id: 'room_water_jar', name: 'Water Jar', mount: 'floor', blurb: 'Filled at the well, set by the door.', req: 'plays', goal: 25 },
  { id: 'room_clay_lamps', name: 'Row of Clay Lamps', mount: 'shelf', blurb: 'One for every evening you came back.', req: 'streak', goal: 14 },
  { id: 'room_psaltery', name: 'Psaltery', mount: 'wall', blurb: 'Ten strings, hung where the light reaches it.', req: 'level', goal: 16 },
  { id: 'room_palm_wreath', name: 'Palm Wreath', mount: 'wall', blurb: 'Plaited palm, kept from a feast.', req: 'cards', goal: 10 },
  { id: 'room_censer', name: 'Censer', mount: 'table', blurb: 'Brass, and still faintly warm.', req: 'studied', goal: 60 },
  { id: 'room_land_map', name: 'Map of the Land', mount: 'wall', blurb: 'Inked on hide — everywhere you have read about.', req: 'read', goal: 50 },
  { id: 'room_dovecote', name: 'Dove Cote', mount: 'sill', blurb: 'They come and go as they please.', req: 'cards', goal: 20 },
  { id: 'room_loom', name: 'Hand Loom', mount: 'floor', blurb: 'Half-finished, the way a loom always is.', req: 'studied', goal: 100 },
  { id: 'room_cedar_chest', name: 'Cedar Chest', mount: 'nook', blurb: 'Cedar, brass-cornered — the grail of the room.', req: 'level', goal: 30 },
]

export const furnishingById = (id?: string | null): FurnishingDef | undefined =>
  id ? FURNISHINGS.find((f) => f.id === id) : undefined

/** Ownership is a pure function of the six numbers. */
export function furnishingOwned(id: string, p: RoomProgress): boolean {
  const def = furnishingById(id)
  return !!def && (p[def.req] ?? 0) >= def.goal
}

export function ownedFurnishings(p: RoomProgress): string[] {
  return FURNISHINGS.filter((f) => (p[f.req] ?? 0) >= f.goal).map((f) => f.id)
}

/** How close the next locked furnishing is, for the shelf's one line of copy. */
export function nextFurnishing(p: RoomProgress): FurnishingDef | null {
  const locked = FURNISHINGS.filter((f) => (p[f.req] ?? 0) < f.goal)
  if (!locked.length) return null
  // Closest by fraction of the way there, so "one more chapter" beats "level 30".
  return locked.reduce((best, f) =>
    (p[f.req] ?? 0) / f.goal > (p[best.req] ?? 0) / best.goal ? f : best,
  )
}

// ── The room grows with you ─────────────────────────────────────────────────
// Earned by playing, and nothing buys it — the same split as church levels and
// keep halls. It is YOUR level rather than a pooled number, because this is the
// one place in the app that is not pooled with anybody.

export const ROOM_TIER_NAMES = [
  'Bare Chamber',
  'Plastered Room',
  'Lit Chamber',
  'Upper Room',
  'Room on the Wall',
] as const

const TIER_LEVELS = [1, 5, 12, 25, 40]

/** 0-based index into the five rooms — the tier the room is actually drawn at. */
export function roomTier(level: number): number {
  let tier = 0
  for (let i = 0; i < TIER_LEVELS.length; i++) if (level >= TIER_LEVELS[i]) tier = i
  return tier
}

export function roomTierName(tier: number): string {
  return ROOM_TIER_NAMES[Math.min(ROOM_TIER_NAMES.length - 1, Math.max(0, tier))]
}

/** The level the next room needs, or null at the top. */
export function levelForTier(tier: number): number | null {
  return tier >= TIER_LEVELS.length - 1 ? null : TIER_LEVELS[tier + 1]
}

// ── The planners ────────────────────────────────────────────────────────────
// One copy of the rules, in data/placement.ts, handed this room's anchors. The
// keep does exactly the same thing with its own — which is the point: the two
// worlds cannot drift about what a duplicate means.

export const ROOM_SURFACE: Surface = {
  anchors: ROOM_ANCHORS,
  mountOf: (id) => furnishingById(id)?.mount,
}

export const MAX_ROOM_TIER = MAX_TIER

/** 'Grand Reed Mat' — the name a merged furnishing wears in the UI. */
export function furnishingName(value?: string | null): string {
  const { id, tier } = unpackDecor(value)
  const def = furnishingById(id)
  if (!def) return ''
  return `${TIER_PREFIX[tier - 1] ?? ''}${def.name}`
}

export function planRoomPlacement(
  placements: PlacementMap,
  anchor: string,
  id: string | null,
): PlacementPlan {
  return planPlacementOn(ROOM_SURFACE, placements, anchor, id)
}

export function planRoomMove(placements: PlacementMap, from: string, to: string): MovePlan | null {
  return planMoveOn(ROOM_SURFACE, placements, from, to)
}

export function planRoomPick(placements: PlacementMap, id: string): PickOutcome {
  return planPickOn(ROOM_SURFACE, placements, id)
}

export function roomAnchorsHolding(placements: PlacementMap, id: string): string[] {
  return anchorsHoldingOn(ROOM_SURFACE, placements, id)
}

export function roomPlacedTier(placements: PlacementMap, id: string): number {
  return placedTierOn(ROOM_SURFACE, placements, id)
}

// ── Dev assertion ───────────────────────────────────────────────────────────
// Every furnishing must have somewhere to go. A mount with no anchors is a
// piece that can be earned and never placed — invisible in a diff, obvious the
// moment someone taps it, which is the same failure mode checkQuestVerbs()
// exists to catch.
export function checkRoomData() {
  const mounts = new Set(ROOM_ANCHORS.map((a) => a.mount))
  const orphans = FURNISHINGS.filter((f) => !mounts.has(f.mount))
  if (orphans.length) {
    console.warn('[room] furnishings with no anchor of their mount:', orphans.map((f) => f.id))
  }
  const ids = new Set<string>()
  for (const f of FURNISHINGS) {
    if (ids.has(f.id)) console.warn('[room] duplicate furnishing id:', f.id)
    ids.add(f.id)
  }
}

if (import.meta.env.DEV) checkRoomData()
