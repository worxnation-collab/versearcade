// The Pilgrimage — the seasonal track. Roads, waystations, and everything a
// road hands out. See docs/BATTLE-PASS.md for the design of record.
//
// A season is a ROAD. Progress is MILES. Tiers are WAYSTATIONS. It is a battle
// pass in shape, with two differences that matter:
//
//   1. Everything is free. Both reward columns, every road, forever. There is
//      no price, no premium track and no checkout anywhere in this feature —
//      which is why nothing here goes near lib/commerce.
//   2. Nothing here can rank anybody. Miles never touch profiles.xp (which IS
//      the worldwide leaderboard), never touch points, and are never compared
//      against another player. The road shows where you are and what's next.
//
// The one reward rule that survives from the paid design, on its own merits:
// NO RATE MODIFIERS. No "+10% drop chance", no seasonal XP multiplier, no
// battle bonus. A permanent multiplier makes you better than someone who
// started later, which is a ladder, and this app doesn't have those. Fixed
// grants — a boost you spend, a freeze you hold — are fine.
//
// Roads are pure data with hard ISO windows (like LIMITED_UNTIL in data/avatar)
// so the active road is a function of the clock and there is no server-side
// "current season" flag to drift out of sync.

// ── Cosmetic catalogs ────────────────────────────────────────────────────────
// The four cheap reward types. Each is a small config object rather than art,
// which is the whole point: a confetti theme fires on every correct answer a
// player ever gets and costs one entry here.

/** A short earned phrase shown under your name. Fixed catalog — a player never
 *  types one, so there is no moderation surface. */
export interface TitleDef {
  id: string
  text: string
}

export const TITLES: TitleDef[] = [
  { id: 'title_gleaner', text: 'the Gleaner' },
  { id: 'title_barley', text: 'Barley-Handed' },
  { id: 'title_redeemer', text: 'Kinsman-Redeemer' },
  { id: 'title_lamplighter', text: 'Lamplighter' },
  { id: 'title_wayfarer', text: 'Wayfarer' },
]

export const titleById = (id?: string | null): TitleDef | undefined =>
  id ? TITLES.find((t) => t.id === id) : undefined

/** What bursts on a correct answer and at the end of a run. Colors only — a
 *  theme changes what is drawn, never WHETHER motion happens. Reduce-motion is
 *  still the last word, in juice/confetti. */
export interface ConfettiDef {
  id: string
  name: string
  colors: string[]
  /** Confetti shapes; omitted means the library default mix. */
  shapes?: ('circle' | 'square')[]
}

export const CONFETTI_THEMES: ConfettiDef[] = [
  // The house palette, and what every player starts on.
  { id: 'confetti_arcade', name: 'Arcade', colors: ['#ffd23f', '#ff6b6b', '#4ecdc4', '#a06bff', '#5ee7df', '#ff9f1c'] },
  { id: 'confetti_chaff', name: 'Barley Chaff', colors: ['#e6c88a', '#c9a25f', '#f3e6c4', '#a8813f'] },
  { id: 'confetti_coins', name: 'Gold Coins', colors: ['#ffd23f', '#ffb648', '#fff2c2', '#c9950f'], shapes: ['circle'] },
  { id: 'confetti_doves', name: 'Doves', colors: ['#ffffff', '#dfe7ff', '#b8c8f0', '#8fa3c8'] },
  { id: 'confetti_petals', name: 'Rose Petals', colors: ['#ff6b6b', '#ff9fb0', '#e0518b', '#ffd6de'] },
]

export const DEFAULT_CONFETTI = 'confetti_arcade'
export const confettiById = (id?: string | null): ConfettiDef =>
  CONFETTI_THEMES.find((c) => c.id === id) ?? CONFETTI_THEMES[0]

/** The streak flame on the home screen — seen every single morning, which is
 *  most of why it's worth having as a reward. Glyph plus the color its glow
 *  takes; StreakFlame still scales the intensity by streak length. */
export interface FlameDef {
  id: string
  name: string
  glyph: string
  /** Glow color, as `r,g,b` so StreakFlame can vary the alpha by heat. */
  rgb: string
}

export const FLAMES: FlameDef[] = [
  { id: 'flame_ember', name: 'Ember', glyph: '🔥', rgb: '255,90,40' },
  { id: 'flame_olive', name: 'Olive Lamp', glyph: '🪔', rgb: '255,190,90' },
  { id: 'flame_pillar', name: 'Pillar of Fire', glyph: '🌋', rgb: '255,140,60' },
  { id: 'flame_candle', name: 'Candle', glyph: '🕯️', rgb: '255,225,160' },
  { id: 'flame_star', name: 'Morning Star', glyph: '✨', rgb: '255,210,63' },
]

export const DEFAULT_FLAME = 'flame_ember'
export const flameById = (id?: string | null): FlameDef =>
  FLAMES.find((f) => f.id === id) ?? FLAMES[0]

/** What the Daily Chest looks like before it's opened. */
export interface ChestSkinDef {
  id: string
  name: string
  glyph: string
}

export const CHEST_SKINS: ChestSkinDef[] = [
  { id: 'chest_classic', name: 'Treasure Chest', glyph: '🎁' },
  { id: 'chest_basket', name: 'Woven Basket', glyph: '🧺' },
  { id: 'chest_cedar', name: 'Cedar Chest', glyph: '🗃️' },
  { id: 'chest_jar', name: 'Clay Jar', glyph: '🏺' },
  { id: 'chest_sack', name: 'Treasure Sack', glyph: '💰' },
]

export const DEFAULT_CHEST = 'chest_classic'
export const chestSkinById = (id?: string | null): ChestSkinDef =>
  CHEST_SKINS.find((c) => c.id === id) ?? CHEST_SKINS[0]

// Which slot a seasonal cosmetic equips into. One key per kind, stored together
// in profiles.equipped_cosmetics so a new reward type is a catalog entry rather
// than a migration.
export type CosmeticKind = 'title' | 'confetti' | 'flame' | 'chest'

export const COSMETIC_DEFAULTS: Record<CosmeticKind, string | null> = {
  title: null,
  confetti: DEFAULT_CONFETTI,
  flame: DEFAULT_FLAME,
  chest: DEFAULT_CHEST,
}

/** The kind a reward id equips into, or null if it isn't an equippable
 *  cosmetic (a boost, a freeze). Derived from the id prefix so the reward table
 *  never has to repeat itself. */
export function cosmeticKind(rewardId: string): CosmeticKind | null {
  if (rewardId.startsWith('title_')) return 'title'
  if (rewardId.startsWith('confetti_')) return 'confetti'
  if (rewardId.startsWith('flame_')) return 'flame'
  if (rewardId.startsWith('chest_')) return 'chest'
  return null
}

/** Everything unlockable, keyed by reward id — for the reveal and the equip UI. */
export function rewardLabel(id: string): { name: string; kindLabel: string; glyph: string } {
  const kind = cosmeticKind(id)
  if (kind === 'title') return { name: titleById(id)?.text ?? id, kindLabel: 'Title', glyph: '🏷️' }
  if (kind === 'confetti') return { name: confettiById(id).name, kindLabel: 'Confetti', glyph: '🎊' }
  if (kind === 'flame') return { name: flameById(id).name, kindLabel: 'Streak flame', glyph: flameById(id).glyph }
  if (kind === 'chest') return { name: chestSkinById(id).name, kindLabel: 'Chest skin', glyph: chestSkinById(id).glyph }
  if (id === 'boost') return { name: 'XP Boost', kindLabel: 'Consumable', glyph: '⚡' }
  if (id === 'freeze') return { name: 'Streak Freeze', kindLabel: 'Consumable', glyph: '🛟' }
  if (id.startsWith('memento_')) return { name: 'Road Memento', kindLabel: 'Keepsake', glyph: '🌾' }
  return { name: id, kindLabel: 'Reward', glyph: '✦' }
}

// ── Rewards ──────────────────────────────────────────────────────────────────

export interface Reward {
  /** Stable id. Cosmetics use their catalog id; consumables are 'boost'/'freeze'. */
  id: string
  /** How many, for consumables. Cosmetics are always one. */
  qty?: number
}

export interface Waystation {
  /** 1-based tier. */
  n: number
  /** Both columns, both free. Column A is the steady drip, B the bigger beat. */
  a: Reward[]
  b: Reward[]
  /** Every tenth is a milestone: a bigger reveal, nothing more. */
  milestone?: boolean
}

// ── Roads ────────────────────────────────────────────────────────────────────

export interface RoadDef {
  id: string
  name: string
  blurb: string
  /** Inclusive start / exclusive end, ISO. */
  start: string
  end: string
  waystations: Waystation[]
  /** Granted to everyone who reached waystation 1, so nobody ends empty-handed. */
  memento: string
}

const M = (n: number): Partial<Waystation> => ({ milestone: n % 10 === 0 })

/**
 * The Harvest Road — Ruth and Boaz. Gleaning, redemption, and showing up in a
 * field every day until the harvest is in.
 *
 * Only the tiers that pay out are listed; the gaps between them are the pacing.
 * Both columns are free, so a waystation with entries in both simply hands over
 * both.
 */
const HARVEST_WAYS: Waystation[] = [
  { n: 1, a: [{ id: 'freeze', qty: 1 }], b: [{ id: 'title_gleaner' }] },
  { n: 2, a: [{ id: 'confetti_chaff' }], b: [] },
  { n: 4, a: [{ id: 'boost', qty: 1 }], b: [] },
  { n: 5, a: [{ id: 'chest_basket' }], b: [] },
  { n: 8, a: [{ id: 'freeze', qty: 1 }], b: [] },
  { n: 10, a: [{ id: 'flame_olive' }], b: [{ id: 'boost', qty: 1 }], ...M(10) },
  { n: 13, a: [{ id: 'confetti_coins' }], b: [] },
  { n: 15, a: [{ id: 'freeze', qty: 1 }], b: [] },
  { n: 18, a: [{ id: 'chest_jar' }], b: [] },
  { n: 20, a: [{ id: 'title_barley' }], b: [{ id: 'boost', qty: 2 }], ...M(20) },
  { n: 23, a: [{ id: 'flame_candle' }], b: [] },
  { n: 26, a: [{ id: 'freeze', qty: 2 }], b: [] },
  { n: 28, a: [{ id: 'chest_cedar' }], b: [] },
  { n: 30, a: [{ id: 'confetti_petals' }], b: [{ id: 'title_lamplighter' }], ...M(30) },
  { n: 34, a: [{ id: 'boost', qty: 2 }], b: [] },
  { n: 38, a: [{ id: 'flame_pillar' }], b: [] },
  { n: 40, a: [{ id: 'chest_sack' }], b: [{ id: 'freeze', qty: 2 }], ...M(40) },
  { n: 44, a: [{ id: 'title_wayfarer' }], b: [] },
  { n: 47, a: [{ id: 'confetti_doves' }], b: [{ id: 'boost', qty: 3 }] },
  { n: 50, a: [{ id: 'flame_star' }], b: [{ id: 'memento_harvest' }], ...M(50) },
]

export const ROADS: RoadDef[] = [
  {
    id: 'harvest',
    name: 'The Harvest Road',
    blurb: 'Ruth gleaned in a field until the harvest was in. Walk it a day at a time.',
    start: '2026-08-27T00:00:00Z',
    end: '2026-11-11T00:00:00Z',
    waystations: HARVEST_WAYS,
    memento: 'memento_harvest',
  },
]

/** How many waystations a road has, whether or not each one pays out. */
export const ROAD_LENGTH = 50

/** The road being walked right now, or null between seasons. */
export function activeRoad(now: number = Date.now()): RoadDef | null {
  return (
    ROADS.find((r) => now >= new Date(r.start).getTime() && now < new Date(r.end).getTime()) ?? null
  )
}

export const roadById = (id?: string | null): RoadDef | undefined =>
  id ? ROADS.find((r) => r.id === id) : undefined

/** Day number within the road, 0-based. Drives quest generation. */
export function roadDay(road: RoadDef, now: number = Date.now()): number {
  const ms = now - new Date(road.start).getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}

/** Days left, for the header. Never negative. */
export function daysLeft(road: RoadDef, now: number = Date.now()): number {
  return Math.max(0, Math.ceil((new Date(road.end).getTime() - now) / 86_400_000))
}

/** Everything a road hands over at exactly this waystation, both columns. */
export function rewardsAt(road: RoadDef, n: number): Reward[] {
  const w = road.waystations.find((x) => x.n === n)
  return w ? [...w.a, ...w.b] : []
}

/** Every reward from waystation `from` (exclusive) through `to` (inclusive) —
 *  what a player just earned when their waystation moved. */
export function rewardsBetween(road: RoadDef, from: number, to: number): Reward[] {
  const out: Reward[] = []
  for (const w of road.waystations) {
    if (w.n > from && w.n <= to) out.push(...w.a, ...w.b)
  }
  return out
}

/** The next waystation that actually pays out, for the "next up" strip. */
export function nextPayout(road: RoadDef, current: number): Waystation | null {
  return road.waystations.find((w) => w.n > current) ?? null
}
