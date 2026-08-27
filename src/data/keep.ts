// The Keep — a denomination's hall on the Battle tab. See docs/FORTRESS.md for
// the design of record; the rules that matter most here:
//
//   PRESENCE, NOT QUANTITY. Nothing in a hall is ever counted. A decoration is
//   present or absent — never "×47", never "12 members own this", never a
//   contributor name. One member owning the destrier and ten thousand owning it
//   render identically. Counting would turn the hall into a tally of faction
//   size on a topic where real people have real sore spots.
//
//   THE BUILDING IS SECULAR. A keep, not a chapel: every faction on the board —
//   including agnostic and atheist, which data/denominations promises the same
//   styling with no asterisk — gets the same architecture. All religious
//   character comes from decorations members CHOSE to hang; the app never
//   assigns iconography by tradition, so it can never assign it wrongly.
//
//   NO PLAYER-AUTHORED TEXT. No plaques, no dedications, no "hung by". A
//   denomination is more strangers than a congregation, and the church-page
//   rule (no client writes someone else's page) applies doubly here.
//
//   EVERYTHING IS EARNED IN BATTLES, and only battles. The daily drop, study
//   and reading feed the church economy; the keep is the Battle tab's own
//   ladder. Challenges derive from six lifetime counters, so there is no grant
//   table to keep honest — own a decoration iff the counter cleared its goal.

// ── Anchors ──────────────────────────────────────────────────────────────────
// A fixed set of typed mount points, so the hall's render cost never grows no
// matter how much a player owns, and placement is a loadout rather than a
// canvas.

export type MountKind = 'banner' | 'wall' | 'rafters' | 'table' | 'floor' | 'stable'

export interface AnchorDef {
  id: string
  mount: MountKind
  /** Where the prop lands in the hall's 560x300 viewBox (its ground point). */
  x: number
  y: number
  /** Uniform scale applied to the prop at this anchor. */
  s?: number
}

// Positions are calibrated against the painted hall (public/keep/hall.jpg,
// drawn 1120x625 and shown sliced into this 560x300 viewBox): the big bare
// wall runs x 190..435 between the beams and the table, the hearth owns the
// left, the stable arch the right.
export const ANCHORS: AnchorDef[] = [
  { id: 'banner_l', mount: 'banner', x: 215, y: 76 },
  { id: 'banner_r', mount: 'banner', x: 405, y: 76 },
  { id: 'wall_1', mount: 'wall', x: 240, y: 148 },
  { id: 'wall_2', mount: 'wall', x: 310, y: 144 },
  { id: 'wall_3', mount: 'wall', x: 380, y: 148 },
  { id: 'rafters_1', mount: 'rafters', x: 310, y: 28 },
  { id: 'rafters_2', mount: 'rafters', x: 448, y: 54 },
  { id: 'table_1', mount: 'table', x: 250, y: 199 },
  { id: 'table_2', mount: 'table', x: 315, y: 199 },
  { id: 'floor_1', mount: 'floor', x: 160, y: 268 },
  { id: 'floor_2', mount: 'floor', x: 420, y: 284 },
  { id: 'stable_1', mount: 'stable', x: 482, y: 244 },
]

export const anchorById = (id: string): AnchorDef | undefined => ANCHORS.find((a) => a.id === id)
export const anchorsForMount = (mount: MountKind): AnchorDef[] =>
  ANCHORS.filter((a) => a.mount === mount)

// ── Decorations ──────────────────────────────────────────────────────────────
// Drawn, not generated: flat SVG props (components/KeepArt) that read at sheet
// size. Availability is universal — anyone can earn and hang anything. Gating
// the rosary to Catholics would be an identity check, it would break the moment
// somebody switched faction, and it would turn a warm object into a permission
// prompt. A hall looks like its tradition because members CHOSE those objects.

export interface DecorDef {
  id: string
  name: string
  mount: MountKind
  blurb: string
}

export const DECOR: DecorDef[] = [
  { id: 'keep_woven_rug', name: 'Woven Rug', mount: 'floor', blurb: 'The first thing that makes stone feel like home.' },
  { id: 'keep_oil_lamp', name: 'Oil Lamp', mount: 'table', blurb: 'A light kept burning on the long table.' },
  { id: 'keep_kite_shield', name: 'Kite Shield', mount: 'wall', blurb: 'Hung point-down over the hearth.' },
  { id: 'keep_sheaf_banner', name: 'Sheaf Banner', mount: 'banner', blurb: 'Barley on a field of gold.' },
  { id: 'keep_rosary', name: 'Rosary', mount: 'table', blurb: 'Laid gently by the lamp.' },
  { id: 'keep_crossed_spears', name: 'Crossed Spears', mount: 'wall', blurb: 'Practice arms, retired to the wall.' },
  { id: 'keep_open_bible', name: 'Open Bible', mount: 'table', blurb: 'Open on its stand, mid-Psalm.' },
  { id: 'keep_lanterns', name: 'Hanging Lanterns', mount: 'rafters', blurb: 'Warm light from the beams.' },
  { id: 'keep_brazier', name: 'Brazier', mount: 'floor', blurb: 'Coals against the evening cold.' },
  { id: 'keep_barrels', name: 'Barrel Stack', mount: 'floor', blurb: 'Provisions for a long siege of studying.' },
  { id: 'keep_tapestry', name: 'Harvest Tapestry', mount: 'wall', blurb: 'A field at harvest, woven in wool.' },
  { id: 'keep_chess', name: 'Chess Set', mount: 'table', blurb: 'A quieter kind of battle.' },
  { id: 'keep_chandelier', name: 'Iron Chandelier', mount: 'rafters', blurb: 'Wrought iron, a dozen candles.' },
  { id: 'keep_armor_rack', name: 'Armor of God Rack', mount: 'wall', blurb: 'All six pieces, hung as a set (Eph 6).' },
  { id: 'keep_destrier', name: 'Armoured Destrier', mount: 'stable', blurb: 'Barded in the faction’s colors — the grail.' },
]

export const decorById = (id?: string | null): DecorDef | undefined =>
  id ? DECOR.find((d) => d.id === id) : undefined
export const decorForMount = (mount: MountKind): DecorDef[] => DECOR.filter((d) => d.mount === mount)

// ── Challenges ───────────────────────────────────────────────────────────────
// Six lifetime counters, all battles. Every challenge is "counter reaches
// goal"; ownership is DERIVED, never granted, so two devices can't disagree and
// there's nothing to revoke. cpu_won counts a simulation and battle_won counts
// a real match — both live on the Battle tab, which is the one corner of the
// app that's allowed to be competitive.

export type KeepCounter =
  | 'cpu_played'
  | 'cpu_won'
  | 'battle_played'
  | 'battle_won'
  | 'battle_perfect'
  | 'battle_combo'

export type KeepCounters = Record<KeepCounter, number>

export const EMPTY_COUNTERS: KeepCounters = {
  cpu_played: 0,
  cpu_won: 0,
  battle_played: 0,
  battle_won: 0,
  battle_perfect: 0,
  battle_combo: 0,
}

export interface ChallengeDef {
  id: string
  counter: KeepCounter
  goal: number
  text: string
  /** The decoration this challenge unlocks. */
  decor: string
}

// Ordered as a ladder: early rows land in the first session, the destrier is a
// season of evenings. Texts say the goal plainly — no shame, no timer, nothing
// expires, and progress only ever goes up.
export const CHALLENGES: ChallengeDef[] = [
  { id: 'k_rug', counter: 'cpu_played', goal: 1, text: 'Race the CPU once', decor: 'keep_woven_rug' },
  { id: 'k_lamp', counter: 'cpu_won', goal: 1, text: 'Beat the CPU once', decor: 'keep_oil_lamp' },
  { id: 'k_shield', counter: 'cpu_won', goal: 3, text: 'Beat the CPU 3 times', decor: 'keep_kite_shield' },
  { id: 'k_sheaf', counter: 'battle_played', goal: 1, text: 'Play a battle with a friend', decor: 'keep_sheaf_banner' },
  { id: 'k_rosary', counter: 'cpu_played', goal: 5, text: 'Race the CPU 5 times', decor: 'keep_rosary' },
  { id: 'k_spears', counter: 'cpu_won', goal: 5, text: 'Beat the CPU 5 times', decor: 'keep_crossed_spears' },
  { id: 'k_bible', counter: 'battle_perfect', goal: 1, text: 'Finish a battle run with no misses', decor: 'keep_open_bible' },
  { id: 'k_lanterns', counter: 'battle_combo', goal: 1, text: 'Hit a 4× combo in a battle', decor: 'keep_lanterns' },
  { id: 'k_brazier', counter: 'cpu_won', goal: 10, text: 'Beat the CPU 10 times', decor: 'keep_brazier' },
  { id: 'k_barrels', counter: 'battle_played', goal: 5, text: 'Play 5 battles with friends', decor: 'keep_barrels' },
  { id: 'k_tapestry', counter: 'battle_won', goal: 3, text: 'Win 3 battles', decor: 'keep_tapestry' },
  { id: 'k_chess', counter: 'battle_perfect', goal: 3, text: '3 battle runs with no misses', decor: 'keep_chess' },
  { id: 'k_chandelier', counter: 'cpu_won', goal: 25, text: 'Beat the CPU 25 times', decor: 'keep_chandelier' },
  { id: 'k_rack', counter: 'battle_won', goal: 8, text: 'Win 8 battles', decor: 'keep_armor_rack' },
  { id: 'k_destrier', counter: 'battle_won', goal: 15, text: 'Win 15 battles', decor: 'keep_destrier' },
]

/** Ownership is a pure function of the counters. */
export function decorOwned(decorId: string, counters: KeepCounters): boolean {
  const ch = CHALLENGES.find((c) => c.decor === decorId)
  if (!ch) return false
  return (counters[ch.counter] ?? 0) >= ch.goal
}

export function ownedDecor(counters: KeepCounters): string[] {
  return CHALLENGES.filter((c) => (counters[c.counter] ?? 0) >= c.goal).map((c) => c.decor)
}

// ── The hall's level ─────────────────────────────────────────────────────────
// A faction's hall grows with its POOLED battle wins — earned by playing, and
// nothing buys it (the same split as church levels vs church skins). The curve
// is sub-linear so a huge faction doesn't lap a small one forever; the level is
// shown as a label, never as a rank between factions.

export function keepLevelForWins(wins: number): number {
  return 1 + Math.floor(Math.sqrt(Math.max(0, wins) / 3))
}

export const KEEP_LEVEL_NAMES = [
  'Hall of Timber',
  'Hall of Stone',
  'Walled Keep',
  'High Keep',
  'Great Keep',
  'Bastion',
] as const

export function keepLevelName(level: number): string {
  return KEEP_LEVEL_NAMES[Math.min(KEEP_LEVEL_NAMES.length - 1, Math.max(0, level - 1))]
}

/** 0-based index into the six halls — the tier the room is actually drawn at. */
export function keepTier(level: number): number {
  return Math.min(KEEP_LEVEL_NAMES.length - 1, Math.max(0, Math.floor(level) - 1))
}

/** Wins the faction needs for the next hall, or null at the top. */
export function winsForTier(tier: number): number | null {
  if (tier >= KEEP_LEVEL_NAMES.length - 1) return null
  // Inverse of keepLevelForWins: level L starts at 3(L-1)^2 wins.
  return 3 * (tier + 1) * (tier + 1)
}

// ── Offering a finished piece ────────────────────────────────────────────────
// A decoration merged all the way to Grand has nowhere left to go, so it can be
// given to your church: the Grand one leaves the hall, your church banks the
// points, and you keep the plain decoration (you never stopped owning it — the
// counters did not move).
//
// ONCE EVER PER DECORATION, and the values are small on purpose. Church XP is
// the one number here that ranks anything, and keep counters are clamped rather
// than verified (0059's doctrine: an inflated counter is worth wall furniture,
// not standing). Turning counters into church XP moves them a little closer to
// standing than that doctrine likes, so the whole set is worth 3,100 points —
// under three church levels at the very bottom of the curve — and the
// primary key on (user, decor) is what caps it. See 0062.
//
// KEEP IN SYNC with `keep_decor_offer_value` in 0062. The server decides; this
// copy draws the number on the button.

export const OFFER_VALUES: Record<string, number> = {
  keep_woven_rug: 60,
  keep_oil_lamp: 60,
  keep_kite_shield: 90,
  keep_rosary: 90,
  keep_sheaf_banner: 120,
  keep_crossed_spears: 120,
  keep_open_bible: 150,
  keep_lanterns: 150,
  keep_brazier: 200,
  keep_barrels: 200,
  keep_tapestry: 260,
  keep_chess: 260,
  keep_chandelier: 340,
  keep_armor_rack: 400,
  keep_destrier: 600,
}

export function offerValue(decorId?: string | null): number {
  return (decorId && OFFER_VALUES[decorId]) || 0
}

/** Anchors holding a Grand piece — the only ones that can be offered. */
export function offerableAnchors(placements: Record<string, string>): { anchor: string; decor: string }[] {
  return ANCHORS.flatMap((a) => {
    const { id, tier } = unpackDecor(placements[a.id])
    return id && tier >= MAX_DECOR_TIER ? [{ anchor: a.id, decor: id }] : []
  })
}

// ── Moving a piece ───────────────────────────────────────────────────────────
// Tap something already placed, then tap where it should go. A piece only ever
// lands on an anchor of its own MOUNT — a rug on a rafter is not a placement,
// it is a bug — so the targets a pick-up offers are exactly its own kind.

export interface MovePlan {
  /** anchor -> new packed value, or null to clear. Applied in this order. */
  writes: { anchor: string; value: string | null }[]
  /** True when the two pieces were the same thing and folded together. */
  merged: boolean
  /** True when two different pieces traded places. */
  swapped: boolean
  tier: number
}

/**
 * Move the piece on `from` to `to`.
 *
 * Three outcomes, and none of them can lose a decoration: an empty target just
 * takes it, a target holding the SAME decoration merges (the same rule as
 * placing a duplicate — one step up, capped), and a target holding something
 * else trades places with it. Nothing is ever overwritten, because "I dropped
 * it on the wrong spot and my tapestry vanished" is the one way a drag can
 * genuinely hurt.
 */
export function planMove(
  placements: Record<string, string>,
  from: string,
  to: string,
): MovePlan | null {
  if (from === to) return null
  const fromDef = anchorById(from)
  const toDef = anchorById(to)
  if (!fromDef || !toDef || fromDef.mount !== toDef.mount) return null

  const moving = unpackDecor(placements[from])
  if (!moving.id) return null
  const target = unpackDecor(placements[to])

  if (target.id === moving.id && target.tier < MAX_DECOR_TIER) {
    const tier = Math.min(MAX_DECOR_TIER, Math.max(target.tier, moving.tier) + 1)
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

// ── Merging duplicates ───────────────────────────────────────────────────────
// Two of the same thing in one room is clutter, so a duplicate MERGES instead
// of standing beside itself: put a second rug down and it goes into the rug you
// already have, which becomes a Fine Woven Rug, and the spot you were about to
// fill stays free for something else. Three make it Grand. It is pure upside —
// nothing is spent, nothing is destroyed, and the spare anchor comes back.
//
// This does NOT break "presence, not quantity" (see the header): a tier is a
// LOOK, exactly like a church skin, and reading it back the other way tells you
// nothing about anybody. Ownership is still derived from the six counters, so a
// merge can't be hoarded or lost — clear a tiered prop and it simply starts
// again at plain, because you never stopped owning the rug.
//
// WIRE FORMAT. A placement value is `keep_woven_rug` at tier 1 and
// `keep_woven_rug.2` / `.3` above it, so every row and every localStorage blob
// written before merging existed still reads correctly as tier 1 and no stored
// shape had to change. `set_keep_placement` (0060) allows exactly this suffix.
// packDecor/unpackDecor are the only two places that know it.

export const MAX_DECOR_TIER = 3

/** Tier 1 is the object itself, so it has no adjective. */
const TIER_PREFIX = ['', 'Fine ', 'Grand '] as const

export function packDecor(id: string, tier: number): string {
  const t = Math.min(MAX_DECOR_TIER, Math.max(1, Math.floor(tier || 1)))
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
    tier: Number.isFinite(tier) ? Math.min(MAX_DECOR_TIER, Math.max(1, tier)) : 1,
  }
}

/** 'Grand Woven Rug' — the name a tiered decoration wears in the UI. */
export function decorName(value?: string | null): string {
  const { id, tier } = unpackDecor(value)
  const def = decorById(id)
  if (!def) return ''
  return `${TIER_PREFIX[tier - 1] ?? ''}${def.name}`
}

export interface PlacementPlan {
  /** The anchor that actually changes. */
  anchor: string
  /** What to write there — a packed decor value, or null to clear. */
  value: string | null
  /** True when this absorbed a duplicate rather than filling the target spot. */
  merged: boolean
  /** The tier the object ends up at, for the toast. */
  tier: number
  /** True when the tap changes nothing at all, so nothing is written. */
  noop?: boolean
}

/**
 * What placing `decorId` on `anchor` should actually do.
 *
 * If that decoration is already out anywhere and isn't maxed, the placement
 * merges into THAT copy and the tapped spot is left alone. Ties go to the copy
 * furthest along — a second merge should finish the Fine one rather than
 * starting a second ladder — and then to ANCHORS order, so two devices given
 * the same state always pick the same spot.
 *
 * The tapped anchor counts as a candidate when it's already holding the same
 * thing, which is what stops the destrier being the one decoration that can
 * never be merged: the stable has a single spot, so "put a second one out" has
 * to mean tapping the one you have. Everywhere else it just reads as tapping
 * again to keep going.
 */
export function planPlacement(
  placements: Record<string, string>,
  anchor: string,
  decorId: string | null,
): PlacementPlan {
  if (!decorId) return { anchor, value: null, merged: false, tier: 1 }

  let best: { anchor: string; tier: number } | null = null
  for (const a of ANCHORS) {
    const here = unpackDecor(placements[a.id])
    if (here.id !== decorId || here.tier >= MAX_DECOR_TIER) continue
    if (!best || here.tier > best.tier) best = { anchor: a.id, tier: here.tier }
  }

  if (best) {
    return { anchor: best.anchor, value: packDecor(decorId, best.tier + 1), merged: true, tier: best.tier + 1 }
  }

  // Nothing left to merge into. If the tapped spot is ALREADY holding this —
  // a maxed one, since anything below max would have merged — then the tap
  // means "keep it", and writing a plain `decorId` here would quietly demote a
  // Grand piece back to nothing. (It did, until a browser found it.)
  const onTarget = unpackDecor(placements[anchor])
  if (onTarget.id === decorId) {
    return { anchor, value: placements[anchor], merged: false, tier: onTarget.tier, noop: true }
  }

  return { anchor, value: decorId, merged: false, tier: 1 }
}
