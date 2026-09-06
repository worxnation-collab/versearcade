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

// WHERE THE CONTENT COMES FROM
// Everything below is the BUNDLED catalog — the floor, and what a keyless
// LOCAL build, an offline phone or a failed fetch renders. A remote overlay
// (data/catalog.ts + store/catalog.ts) merges over it by id, which is how a
// Christmas road reaches a shipped App Store binary without a submission.
// Every accessor in this file reads the MERGED view, so no call site has to
// know whether a road came from the bundle or the wire.

import {
  ADVENT_DAILY,
  ADVENT_WEEKLY,
  EMMAUS_DAILY,
  EMMAUS_WEEKLY,
  JORDAN_DAILY,
  JORDAN_WEEKLY,
  LAMPLIGHT_DAILY,
  LAMPLIGHT_WEEKLY,
  SOWER_DAILY,
  SOWER_WEEKLY,
  WILDERNESS_DAILY,
  WILDERNESS_WEEKLY,
} from '@/lib/season'
import {
  DEFAULT_ROAD_LENGTH,
  catalogOverlay,
  mergeById,
  type ChestSkinDef,
  type ConfettiDef,
  type FlameDef,
  type Reward,
  type RoadDef,
  type TitleDef,
  type Waystation,
} from './catalog'

// The shapes moved to data/catalog.ts so the sanitisers there can see them
// without importing this file's content (which would be a cycle). Re-exported
// so every existing importer is untouched.
export type { ChestSkinDef, ConfettiDef, FlameDef, Reward, RoadDef, TitleDef, Waystation }

// ── Cosmetic catalogs ────────────────────────────────────────────────────────
// The four cheap reward types. Each is a small config object rather than art,
// which is the whole point: a confetti theme fires on every correct answer a
// player ever gets and costs one entry here.

/** A short earned phrase shown under your name. Fixed catalog — a player never
 *  types one, so there is no moderation surface. */
export const TITLES: TitleDef[] = [
  { id: 'title_gleaner', text: 'the Gleaner' },
  { id: 'title_barley', text: 'Barley-Handed' },
  { id: 'title_redeemer', text: 'Kinsman-Redeemer' },
  { id: 'title_lamplighter', text: 'Lamplighter' },
  { id: 'title_wayfarer', text: 'Wayfarer' },
  // ── The Lamplight Road ──
  { id: 'title_watchman', text: 'the Watchman' },
  { id: 'title_lampkeeper', text: 'Keeper of the Lamp' },
  { id: 'title_evensong', text: 'Evensong' },
  // ── The Advent Road ──
  { id: 'title_starfollower', text: 'Star-Follower' },
  { id: 'title_lightbearer', text: 'Light-Bearer' },
  { id: 'title_dayspring', text: 'the Dayspring' },
  // ── The Jordan Road ──
  { id: 'title_jordan', text: 'of the Jordan' },
  { id: 'title_lightnations', text: 'Light to the Nations' },
  // ── The Wilderness Road ──
  { id: 'title_sojourner', text: 'Sojourner' },
  { id: 'title_atthewell', text: 'At the Well' },
  // ── The Emmaus Road ──
  { id: 'title_witness', text: 'the Witness' },
  { id: 'title_breadbreaker', text: 'Bread-Breaker' },
  // ── The Sower's Road ──
  { id: 'title_sower', text: 'the Sower' },
  { id: 'title_goodsoil', text: 'Good Soil' },
]

/**
 * The merged catalogs. These are FUNCTIONS rather than the constants they
 * replace because the overlay arrives after module evaluation — a `const`
 * computed at import would freeze the bundled list forever, which is the exact
 * bug this whole feature exists to avoid. The arrays above stay exported as
 * the bundled floor; nothing outside this file should read them directly.
 */
export const allTitles = (): TitleDef[] => mergeById(TITLES, catalogOverlay().titles)
export const allConfetti = (): ConfettiDef[] => mergeById(CONFETTI_THEMES, catalogOverlay().confetti)
export const allFlames = (): FlameDef[] => mergeById(FLAMES, catalogOverlay().flames)
export const allChestSkins = (): ChestSkinDef[] => mergeById(CHEST_SKINS, catalogOverlay().chests)

export const titleById = (id?: string | null): TitleDef | undefined =>
  id ? allTitles().find((t) => t.id === id) : undefined

/** What bursts on a correct answer and at the end of a run. Colors only — a
 *  theme changes what is drawn, never WHETHER motion happens. Reduce-motion is
 *  still the last word, in juice/confetti. */
export const CONFETTI_THEMES: ConfettiDef[] = [
  // The house palette, and what every player starts on.
  { id: 'confetti_arcade', name: 'Arcade', colors: ['#ffd23f', '#ff6b6b', '#4ecdc4', '#a06bff', '#5ee7df', '#ff9f1c'] },
  { id: 'confetti_chaff', name: 'Barley Chaff', colors: ['#e6c88a', '#c9a25f', '#f3e6c4', '#a8813f'] },
  { id: 'confetti_coins', name: 'Gold Coins', colors: ['#ffd23f', '#ffb648', '#fff2c2', '#c9950f'], shapes: ['circle'] },
  { id: 'confetti_doves', name: 'Doves', colors: ['#ffffff', '#dfe7ff', '#b8c8f0', '#8fa3c8'] },
  { id: 'confetti_petals', name: 'Rose Petals', colors: ['#ff6b6b', '#ff9fb0', '#e0518b', '#ffd6de'] },
  // ── The Lamplight Road ──
  { id: 'confetti_embers', name: 'Embers', colors: ['#ff8a3d', '#ffb648', '#ffd9a0', '#c2410c'] },
  { id: 'confetti_olives', name: 'Olive Grove', colors: ['#7f9c5a', '#a8bd7f', '#4a5f33', '#d9c27a'] },
  // ── The Advent Road ──
  { id: 'confetti_starlight', name: 'Starlight', colors: ['#ffffff', '#ffe9a8', '#cfe0ff', '#ffd23f'], shapes: ['circle'] },
  { id: 'confetti_frost', name: 'First Frost', colors: ['#e8f2ff', '#b9d4f0', '#ffffff', '#8fb6dd'] },
  { id: 'confetti_gifts', name: 'Three Gifts', colors: ['#ffd23f', '#c9950f', '#7a1f2b', '#2f5d43'] },
  // ── The Jordan Road ──
  { id: 'confetti_river', name: 'River Light', colors: ['#bfe3d8', '#8fc9c0', '#e8f5f0', '#5aa3a0'] },
  // ── The Wilderness Road ──
  { id: 'confetti_dust', name: 'Desert Dust', colors: ['#d9a86c', '#c98b5e', '#efd9b8', '#a8663f'] },
  { id: 'confetti_violet', name: 'Violets', colors: ['#7b5ea7', '#a98cd0', '#4a3570', '#d9c9ef'] },
  // ── The Emmaus Road ──
  { id: 'confetti_blossom', name: 'Almond Blossom', colors: ['#ffd9e2', '#ffffff', '#f5b7c8', '#c98fa8'] },
  { id: 'confetti_glory', name: 'Glory', colors: ['#ffd23f', '#ffffff', '#ffe9a8', '#ffb0c0'] },
  // ── The Sower's Road ──
  { id: 'confetti_seed', name: 'Broadcast Seed', colors: ['#c9b26a', '#8fae5a', '#e6d79a', '#5f7f3a'] },
  { id: 'confetti_vineyard', name: 'Vineyard', colors: ['#6b3f7a', '#9c6bb0', '#7f9c5a', '#e0c8ef'] },
]

export const DEFAULT_CONFETTI = 'confetti_arcade'
export const confettiById = (id?: string | null): ConfettiDef =>
  allConfetti().find((c) => c.id === id) ?? CONFETTI_THEMES[0]

/** The streak flame on the home screen — seen every single morning, which is
 *  most of why it's worth having as a reward. Glyph plus the color its glow
 *  takes; StreakFlame still scales the intensity by streak length. */
export const FLAMES: FlameDef[] = [
  { id: 'flame_ember', name: 'Ember', glyph: '🔥', rgb: '255,90,40' },
  { id: 'flame_olive', name: 'Olive Lamp', glyph: '🪔', rgb: '255,190,90' },
  { id: 'flame_pillar', name: 'Pillar of Fire', glyph: '🌋', rgb: '255,140,60' },
  { id: 'flame_candle', name: 'Candle', glyph: '🕯️', rgb: '255,225,160' },
  { id: 'flame_star', name: 'Morning Star', glyph: '✨', rgb: '255,210,63' },
  // ── The Lamplight Road ──
  { id: 'flame_lantern', name: 'Lantern', glyph: '🏮', rgb: '255,170,80' },
  // ── The Advent Road ──
  { id: 'flame_bethlehem', name: 'Bethlehem Star', glyph: '🌟', rgb: '255,235,180' },
  { id: 'flame_dayspring', name: 'Dayspring', glyph: '🌅', rgb: '255,150,110' },
  // ── The Jordan Road ──
  { id: 'flame_dove', name: 'Descending Dove', glyph: '🕊️', rgb: '210,235,255' },
  // ── The Wilderness Road ──
  { id: 'flame_noonday', name: 'Noonday', glyph: '☀️', rgb: '255,200,90' },
  // ── The Emmaus Road ──
  { id: 'flame_glory', name: 'Glory', glyph: '💫', rgb: '255,225,150' },
  // ── The Sower's Road ──
  { id: 'flame_summer', name: 'High Summer', glyph: '🔆', rgb: '255,215,110' },
]

export const DEFAULT_FLAME = 'flame_ember'
export const flameById = (id?: string | null): FlameDef =>
  allFlames().find((f) => f.id === id) ?? FLAMES[0]

/** What the Daily Chest looks like before it's opened. */
export const CHEST_SKINS: ChestSkinDef[] = [
  { id: 'chest_classic', name: 'Treasure Chest', glyph: '🎁' },
  { id: 'chest_basket', name: 'Woven Basket', glyph: '🧺' },
  { id: 'chest_cedar', name: 'Cedar Chest', glyph: '🗃️' },
  { id: 'chest_jar', name: 'Clay Jar', glyph: '🏺' },
  { id: 'chest_sack', name: 'Treasure Sack', glyph: '💰' },
  // ── The Lamplight Road ──
  { id: 'chest_lampstand', name: 'Lampstand', glyph: '🕎' },
  // ── The Advent Road ──
  { id: 'chest_star', name: 'Star Chest', glyph: '⭐' },
  { id: 'chest_myrrh', name: 'Jar of Myrrh', glyph: '🫙' },
  // ── The Jordan Road ──
  { id: 'chest_waterjar', name: 'Water Jar', glyph: '🪣' },
  // ── The Wilderness Road ──
  { id: 'chest_sackcloth', name: 'Sackcloth Bundle', glyph: '🎒' },
  // ── The Emmaus Road ──
  { id: 'chest_bread', name: 'Broken Bread', glyph: '🍞' },
  // ── The Sower's Road ──
  { id: 'chest_seedbag', name: 'Seed Bag', glyph: '🌱' },
]

export const DEFAULT_CHEST = 'chest_classic'
export const chestSkinById = (id?: string | null): ChestSkinDef =>
  allChestSkins().find((c) => c.id === id) ?? CHEST_SKINS[0]

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
  if (id.startsWith('skin_')) {
    // A catalog skin names itself, so a road published after this binary
    // shipped still reveals "Gabriel" rather than "noel_1". The bundled map
    // below stays as the floor for everything that shipped with the app.
    //
    // Reactive skins carry their state in the id (skin_ruth_2), so try the
    // whole id first and then the base — a catalog only lists the base skin.
    const bare = id.slice(5)
    const fromCatalog =
      catalogOverlay().skins.find((s) => s.id === bare) ??
      catalogOverlay().skins.find((s) => s.id === bare.replace(/_\d+$/, ''))
    if (fromCatalog) return { name: fromCatalog.name, kindLabel: 'Skin', glyph: '🌾' }
    // Reactive-skin states get their own line so the toast can say what changed.
    const SKIN_NAMES: Record<string, string> = {
      skin_ruth_1: 'Ruth the Gleaner',
      skin_ruth_2: 'Ruth — basket half full',
      skin_ruth_3: 'Ruth — sheaf on her shoulder',
      skin_ruth_4: 'Ruth — basket overflowing',
      skin_boaz: 'Boaz',
      // The Lamplight Road.
      skin_lamplighter: 'The Lamplighter',
      skin_watchman: 'The Watchman',
      skin_wise_lamp: 'The Wise Lamp',
      skin_harvest_reaper: 'The Reaper',
      skin_olive_keeper: 'The Olive Keeper',
      // The Advent Road.
      skin_mary: 'Mary',
      skin_joseph: 'Joseph',
      skin_shepherd_night: 'The Night Shepherd',
      skin_magus: 'The Magus',
      skin_bethlehem_star_bearer: 'The Star Bearer',
    }
    return { name: SKIN_NAMES[id] ?? id.slice(5), kindLabel: 'Skin', glyph: '🌾' }
  }
  if (id.startsWith('item_')) {
    const ITEM_NAMES: Record<string, string> = {
      item_sickle: 'Harvest Sickle',
      item_winnowing_fork: 'Winnowing Fork',
      item_water_skin: 'Water Skin',
      item_harvest_headscarf: 'Harvest Headscarf',
      item_gleaner_shawl: 'Gleaner’s Shawl',
    }
    return { name: ITEM_NAMES[id] ?? id.slice(5), kindLabel: 'Item', glyph: '🧺' }
  }
  if (id === 'boost') return { name: 'XP Boost', kindLabel: 'Consumable', glyph: '⚡' }
  if (id === 'freeze') return { name: 'Streak Freeze', kindLabel: 'Consumable', glyph: '🛟' }
  if (id.startsWith('memento_')) {
    // A keepsake wears its own road's emblem. A 🌾 on an Advent memento would
    // be the Harvest Road's sheaf sitting under a picture of Bethlehem — the
    // same tell as a December road drawn over a wheat field. Anything a future
    // road invents falls back to the sheaf, which is a keepsake either way.
    const MEMENTOS: Record<string, string> = {
      memento_harvest: '🌾',
      memento_lamplight: '🪔',
      memento_advent: '🌟',
      memento_jordan: '💧',
      memento_wilderness: '🪨',
      memento_emmaus: '🌿',
      memento_sower: '🌻',
    }
    return { name: 'Road Memento', kindLabel: 'Keepsake', glyph: MEMENTOS[id] ?? '🌾' }
  }
  return { name: id, kindLabel: 'Reward', glyph: '✦' }
}

// ── Rewards ──────────────────────────────────────────────────────────────────

// ── Roads ────────────────────────────────────────────────────────────────────

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
  // Ruth lands at waystation 1 so the road pays off in the first minute — and
  // her basket fills at 20, 35 and 50 (see passSkinEquipId in data/avatar).
  { n: 1, a: [{ id: 'freeze', qty: 1 }], b: [{ id: 'skin_ruth_1' }] },
  { n: 2, a: [{ id: 'confetti_chaff' }], b: [{ id: 'title_gleaner' }] },
  { n: 4, a: [{ id: 'boost', qty: 1 }], b: [] },
  { n: 5, a: [{ id: 'chest_basket' }], b: [] },
  { n: 8, a: [{ id: 'freeze', qty: 1 }], b: [{ id: 'item_harvest_headscarf' }] },
  { n: 10, a: [{ id: 'flame_olive' }], b: [{ id: 'boost', qty: 1 }], ...M(10) },
  { n: 13, a: [{ id: 'confetti_coins' }], b: [{ id: 'item_sickle' }] },
  { n: 15, a: [{ id: 'freeze', qty: 1 }], b: [] },
  { n: 18, a: [{ id: 'chest_jar' }], b: [] },
  { n: 20, a: [{ id: 'title_barley' }], b: [{ id: 'skin_ruth_2' }], ...M(20) },
  { n: 23, a: [{ id: 'flame_candle' }], b: [{ id: 'boost', qty: 2 }] },
  { n: 26, a: [{ id: 'freeze', qty: 2 }], b: [{ id: 'item_water_skin' }] },
  { n: 28, a: [{ id: 'chest_cedar' }], b: [] },
  { n: 30, a: [{ id: 'confetti_petals' }], b: [{ id: 'title_lamplighter' }], ...M(30) },
  { n: 34, a: [{ id: 'boost', qty: 2 }], b: [{ id: 'item_winnowing_fork' }] },
  { n: 35, a: [], b: [{ id: 'skin_ruth_3' }] },
  { n: 38, a: [{ id: 'flame_pillar' }], b: [] },
  { n: 40, a: [{ id: 'chest_sack' }], b: [{ id: 'freeze', qty: 2 }], ...M(40) },
  { n: 44, a: [{ id: 'title_wayfarer' }], b: [{ id: 'item_gleaner_shawl' }] },
  { n: 47, a: [{ id: 'confetti_doves' }], b: [{ id: 'boost', qty: 3 }] },
  {
    n: 50,
    a: [{ id: 'flame_star' }, { id: 'memento_harvest' }],
    b: [{ id: 'skin_boaz' }, { id: 'skin_ruth_4' }],
    ...M(50),
  },
]

/**
 * The Lamplight Road — watchfulness at the end of the church year.
 *
 * Twelve waystations over eighteen days: a SHORT road, deliberately, sitting
 * between the Harvest Road's end and Advent's start so there is no morning on
 * which the Pilgrimage says "the road is resting". Waystations are ~0.7 x days,
 * the same ratio the Harvest Road uses, so the pace is unchanged even though
 * the road is a fifth of the length.
 *
 * Milestones are set by hand rather than through `M()` — that helper marks
 * every tenth, which on a twelve-rung road would put the only bigger reveal at
 * 10 and leave the finale plain.
 */
const LAMPLIGHT_WAYS: Waystation[] = [
  { n: 1, a: [{ id: 'freeze', qty: 1 }], b: [{ id: 'skin_lamplighter' }] },
  { n: 2, a: [{ id: 'confetti_embers' }], b: [{ id: 'title_watchman' }] },
  { n: 3, a: [{ id: 'boost', qty: 1 }], b: [] },
  { n: 4, a: [{ id: 'chest_lampstand' }], b: [{ id: 'skin_watchman' }] },
  { n: 5, a: [{ id: 'freeze', qty: 1 }], b: [] },
  { n: 6, a: [{ id: 'flame_lantern' }], b: [{ id: 'skin_wise_lamp' }], milestone: true },
  { n: 7, a: [{ id: 'boost', qty: 1 }], b: [{ id: 'title_lampkeeper' }] },
  { n: 8, a: [{ id: 'confetti_olives' }], b: [{ id: 'skin_harvest_reaper' }] },
  { n: 9, a: [{ id: 'freeze', qty: 2 }], b: [] },
  { n: 10, a: [{ id: 'boost', qty: 2 }], b: [{ id: 'title_evensong' }], milestone: true },
  { n: 11, a: [{ id: 'freeze', qty: 2 }], b: [] },
  {
    n: 12,
    a: [{ id: 'memento_lamplight' }],
    b: [{ id: 'skin_olive_keeper' }],
    milestone: true,
  },
]

/**
 * The Advent Road — the road to Bethlehem, walked by the people already on it.
 *
 * Thirty waystations from Nov 29 (the first Sunday of Advent 2026) through
 * Epiphany, which is the window docs/BATTLE-PASS.md planned for it.
 *
 * Note who is not on it: the child. Mary, Joseph, the shepherd, the magus and
 * the star-bearer are the travellers and the watchers. That is a content
 * decision settled in BATTLE-PASS.md and it does not get revisited by a road.
 */
const ADVENT_WAYS: Waystation[] = [
  { n: 1, a: [{ id: 'freeze', qty: 1 }], b: [{ id: 'skin_shepherd_night' }] },
  { n: 2, a: [{ id: 'confetti_starlight' }], b: [{ id: 'title_starfollower' }] },
  { n: 4, a: [{ id: 'boost', qty: 1 }], b: [] },
  { n: 6, a: [{ id: 'chest_star' }], b: [] },
  { n: 8, a: [{ id: 'freeze', qty: 1 }], b: [{ id: 'skin_joseph' }] },
  { n: 10, a: [{ id: 'flame_bethlehem' }], b: [{ id: 'boost', qty: 1 }], ...M(10) },
  { n: 12, a: [{ id: 'confetti_frost' }], b: [] },
  { n: 14, a: [{ id: 'freeze', qty: 2 }], b: [{ id: 'title_lightbearer' }] },
  { n: 16, a: [{ id: 'chest_myrrh' }], b: [{ id: 'skin_magus' }] },
  { n: 18, a: [{ id: 'boost', qty: 2 }], b: [] },
  { n: 20, a: [{ id: 'confetti_gifts' }], b: [{ id: 'skin_bethlehem_star_bearer' }], ...M(20) },
  { n: 22, a: [{ id: 'freeze', qty: 2 }], b: [] },
  { n: 24, a: [{ id: 'boost', qty: 2 }], b: [{ id: 'title_dayspring' }] },
  { n: 26, a: [{ id: 'flame_dayspring' }], b: [] },
  { n: 28, a: [{ id: 'freeze', qty: 3 }], b: [] },
  {
    n: 30,
    a: [{ id: 'memento_advent' }],
    b: [{ id: 'skin_mary' }],
    ...M(30),
  },
]

/**
 * The Jordan Road — Epiphany: the light shown to everybody.
 *
 * Twenty-four waystations over thirty-four days, Epiphany to the eve of Lent.
 * The figures are the people who RECOGNISED something — Simeon and Anna in the
 * temple, Nathanael under his fig tree, the steward at Cana who tasted the wine
 * and could not account for it. John the Baptist opens it.
 */
const JORDAN_WAYS: Waystation[] = [
  { n: 1, a: [{ id: 'freeze', qty: 1 }], b: [{ id: 'skin_john_baptist' }] },
  { n: 2, a: [{ id: 'confetti_river' }], b: [{ id: 'title_jordan' }] },
  { n: 4, a: [{ id: 'boost', qty: 1 }], b: [] },
  { n: 6, a: [{ id: 'chest_waterjar' }], b: [{ id: 'skin_simeon' }] },
  { n: 8, a: [{ id: 'freeze', qty: 1 }], b: [] },
  { n: 10, a: [{ id: 'flame_dove' }], b: [{ id: 'boost', qty: 1 }], ...M(10) },
  { n: 12, a: [{ id: 'freeze', qty: 2 }], b: [{ id: 'skin_anna_prophetess' }] },
  { n: 14, a: [{ id: 'boost', qty: 2 }], b: [] },
  { n: 16, a: [{ id: 'freeze', qty: 2 }], b: [{ id: 'skin_nathanael' }] },
  { n: 18, a: [{ id: 'boost', qty: 2 }], b: [{ id: 'title_lightnations' }] },
  { n: 20, a: [{ id: 'freeze', qty: 2 }], b: [], ...M(20) },
  { n: 22, a: [{ id: 'boost', qty: 3 }], b: [] },
  { n: 24, a: [{ id: 'memento_jordan' }], b: [{ id: 'skin_cana_steward' }], milestone: true },
]

/**
 * The Wilderness Road — Lent.
 *
 * Thirty-two waystations over the forty-six days from Ash Wednesday to Easter.
 * Its quest pool leans on praying and the Prayer Wall harder than any other
 * road's, which is the one place a season is allowed to have a character: Lent's
 * own practices are prayer and giving, and both are verbs this app already
 * scores. NOTHING here asks a player to give anything UP — no fast to keep, no
 * streak to break, no rung to lose. A season about repentance in an app with no
 * losers has to be built out of things you do, not things you go without.
 *
 * The figures are all people the story treats gently: the woman at the well, the
 * son coming home, the tax collector at the back of the temple, Bartimaeus on
 * his feet, and Simon of Cyrene, who carried somebody else's load.
 */
const WILDERNESS_WAYS: Waystation[] = [
  { n: 1, a: [{ id: 'freeze', qty: 1 }], b: [{ id: 'skin_samaritan_woman' }] },
  { n: 2, a: [{ id: 'confetti_dust' }], b: [{ id: 'title_atthewell' }] },
  { n: 4, a: [{ id: 'boost', qty: 1 }], b: [] },
  { n: 6, a: [{ id: 'chest_sackcloth' }], b: [] },
  { n: 8, a: [{ id: 'freeze', qty: 1 }], b: [{ id: 'skin_prodigal_return' }] },
  { n: 10, a: [{ id: 'flame_noonday' }], b: [{ id: 'boost', qty: 1 }], ...M(10) },
  { n: 12, a: [{ id: 'confetti_violet' }], b: [] },
  { n: 14, a: [{ id: 'freeze', qty: 2 }], b: [{ id: 'skin_publican' }] },
  { n: 16, a: [{ id: 'boost', qty: 2 }], b: [] },
  { n: 18, a: [{ id: 'freeze', qty: 2 }], b: [{ id: 'title_sojourner' }] },
  { n: 20, a: [{ id: 'boost', qty: 2 }], b: [{ id: 'skin_bartimaeus' }], ...M(20) },
  { n: 22, a: [{ id: 'freeze', qty: 2 }], b: [] },
  { n: 24, a: [{ id: 'boost', qty: 3 }], b: [] },
  { n: 26, a: [{ id: 'freeze', qty: 3 }], b: [] },
  { n: 28, a: [{ id: 'boost', qty: 3 }], b: [] },
  { n: 30, a: [{ id: 'freeze', qty: 3 }], b: [], ...M(30) },
  { n: 32, a: [{ id: 'memento_wilderness' }], b: [{ id: 'skin_simon_cyrene' }], milestone: true },
]

/**
 * The Emmaus Road — Eastertide, Easter to Pentecost.
 *
 * Thirty-four waystations over forty-nine days. The outward-facing road: its
 * quests are sharing, battling, visiting and giving, because Eastertide is the
 * season of going and telling. It still never asks anybody to WIN —
 * `battles_played`, never `battle_wins`.
 */
const EMMAUS_WAYS: Waystation[] = [
  { n: 1, a: [{ id: 'freeze', qty: 1 }], b: [{ id: 'skin_mary_magdalene' }] },
  { n: 2, a: [{ id: 'confetti_blossom' }], b: [{ id: 'title_witness' }] },
  { n: 4, a: [{ id: 'boost', qty: 1 }], b: [] },
  { n: 6, a: [{ id: 'chest_bread' }], b: [] },
  { n: 8, a: [{ id: 'freeze', qty: 1 }], b: [{ id: 'skin_cleopas' }] },
  { n: 10, a: [{ id: 'flame_glory' }], b: [{ id: 'boost', qty: 1 }], ...M(10) },
  { n: 12, a: [{ id: 'confetti_glory' }], b: [] },
  { n: 14, a: [{ id: 'freeze', qty: 2 }], b: [{ id: 'skin_thomas' }] },
  { n: 16, a: [{ id: 'boost', qty: 2 }], b: [] },
  { n: 18, a: [{ id: 'freeze', qty: 2 }], b: [{ id: 'title_breadbreaker' }] },
  { n: 20, a: [{ id: 'boost', qty: 2 }], b: [{ id: 'skin_ethiopian_traveller' }], ...M(20) },
  { n: 22, a: [{ id: 'freeze', qty: 2 }], b: [] },
  { n: 24, a: [{ id: 'boost', qty: 3 }], b: [] },
  { n: 26, a: [{ id: 'freeze', qty: 3 }], b: [] },
  { n: 28, a: [{ id: 'boost', qty: 3 }], b: [] },
  { n: 30, a: [{ id: 'freeze', qty: 3 }], b: [], ...M(30) },
  { n: 32, a: [{ id: 'boost', qty: 3 }], b: [] },
  { n: 34, a: [{ id: 'memento_emmaus' }], b: [{ id: 'skin_lydia' }], milestone: true },
]

/**
 * The Sower's Road — Ordinary Time, Pentecost to the next Harvest.
 *
 * The long one: seventy-two waystations over a hundred and three days, which is
 * the SAME ~0.7 stations-per-day the Harvest Road runs at. A summer season is
 * not a harder season, it is a longer one, and the pacing has to say so — the
 * payouts are simply spaced wider (every three or four rather than every two),
 * so the walk between them feels identical.
 *
 * The figures are the parables: the sower, the vinedresser, the Samaritan on the
 * road, the widow with her two coins, and Martha in her kitchen.
 */
const SOWER_WAYS: Waystation[] = [
  { n: 1, a: [{ id: 'freeze', qty: 1 }], b: [{ id: 'skin_the_sower' }] },
  { n: 3, a: [{ id: 'confetti_seed' }], b: [{ id: 'title_sower' }] },
  { n: 6, a: [{ id: 'boost', qty: 1 }], b: [] },
  { n: 9, a: [{ id: 'chest_seedbag' }], b: [] },
  { n: 12, a: [{ id: 'freeze', qty: 1 }], b: [{ id: 'skin_vinedresser' }] },
  { n: 15, a: [{ id: 'boost', qty: 2 }], b: [] },
  { n: 18, a: [{ id: 'freeze', qty: 2 }], b: [] },
  { n: 20, a: [{ id: 'flame_summer' }], b: [{ id: 'boost', qty: 1 }], ...M(20) },
  { n: 24, a: [{ id: 'confetti_vineyard' }], b: [{ id: 'skin_good_samaritan' }] },
  { n: 28, a: [{ id: 'freeze', qty: 2 }], b: [] },
  { n: 32, a: [{ id: 'boost', qty: 2 }], b: [] },
  { n: 36, a: [{ id: 'freeze', qty: 2 }], b: [{ id: 'title_goodsoil' }] },
  { n: 40, a: [{ id: 'boost', qty: 3 }], b: [{ id: 'skin_widow_mite' }], ...M(40) },
  { n: 44, a: [{ id: 'freeze', qty: 3 }], b: [] },
  { n: 48, a: [{ id: 'boost', qty: 3 }], b: [] },
  { n: 52, a: [{ id: 'freeze', qty: 3 }], b: [] },
  { n: 56, a: [{ id: 'boost', qty: 3 }], b: [] },
  { n: 60, a: [{ id: 'freeze', qty: 3 }], b: [], ...M(60) },
  { n: 64, a: [{ id: 'boost', qty: 3 }], b: [] },
  { n: 68, a: [{ id: 'freeze', qty: 3 }], b: [] },
  { n: 72, a: [{ id: 'memento_sower' }], b: [{ id: 'skin_martha' }], milestone: true },
]

/**
 * Every road this binary ships with, in order.
 *
 * ALL THREE ARE PRE-SHIPPED AND SWITCH THEMSELVES ON. `activeRoad()` is a pure
 * function of the clock against these ISO windows, so the Lamplight Road opens
 * on 2026-11-11 and the Advent Road on 2026-11-29 with nobody publishing
 * anything, no fetch, and no App Store submission — an offline phone gets the
 * same season as a connected one. That is the free half of the content system;
 * the catalog overlay (data/catalog.ts) is the other half, for the seasons
 * decided after this binary was signed.
 *
 * THE WINDOWS ARE DELIBERATELY BUTT-JOINED, with no gap. `end` is exclusive and
 * the next road's `start` is the same instant, so the Pilgrimage never shows
 * "the road is resting" between them and the switch happens at a UTC midnight
 * while almost nobody is looking. docs/BATTLE-PASS.md argued for a rest week
 * between roads; that is overridden here on purpose, because a tab that goes
 * blank for a week is a tab people stop opening.
 *
 * Every road carries its OWN quest pools. Sharing the bundled ones would have
 * meant the Harvest Road's dailies naming barley in December — and, worse, that
 * editing them for one road re-deals every remaining day of the other.
 */
export const ROADS: RoadDef[] = [
  {
    id: 'harvest',
    name: 'The Harvest Road',
    blurb: 'Ruth gleaned in a field until the harvest was in. Walk it a day at a time.',
    start: '2026-08-27T00:00:00Z',
    end: '2026-11-11T00:00:00Z',
    waystations: HARVEST_WAYS,
    memento: 'memento_harvest',
    // No `scene`: the Harvest painting IS roadArt's fallback, and naming it
    // here would be the same file by a second route.
    // No `daily`/`weekly` either — the bundled pools belong to this road now.
  },
  {
    id: 'lamplight',
    name: 'The Lamplight Road',
    blurb: 'The lamps are lit and the harvest is in. Keep watch — the wait is the whole point.',
    start: '2026-11-11T00:00:00Z',
    end: '2026-11-29T00:00:00Z',
    waystations: LAMPLIGHT_WAYS,
    length: 12,
    scene: 'lamplight',
    memento: 'memento_lamplight',
    daily: LAMPLIGHT_DAILY,
    weekly: LAMPLIGHT_WEEKLY,
    rollingWeeklies: true,
  },
  {
    id: 'advent',
    name: 'The Advent Road',
    blurb: 'A long walk toward Bethlehem in the cold. Follow the light a day at a time.',
    start: '2026-11-29T00:00:00Z',
    end: '2027-01-07T00:00:00Z',
    waystations: ADVENT_WAYS,
    length: 30,
    scene: 'advent',
    memento: 'memento_advent',
    daily: ADVENT_DAILY,
    weekly: ADVENT_WEEKLY,
    rollingWeeklies: true,
  },
  {
    id: 'jordan',
    name: 'The Jordan Road',
    blurb: 'A light shown to everybody, and the people who recognised it. Walk down to the water.',
    start: '2027-01-07T00:00:00Z',
    end: '2027-02-10T00:00:00Z',
    waystations: JORDAN_WAYS,
    length: 24,
    scene: 'jordan',
    memento: 'memento_jordan',
    daily: JORDAN_DAILY,
    weekly: JORDAN_WEEKLY,
    rollingWeeklies: true,
  },
  {
    id: 'wilderness',
    name: 'The Wilderness Road',
    blurb: 'Forty days of dry country. Nothing to give up — only things to do, a day at a time.',
    start: '2027-02-10T00:00:00Z',
    end: '2027-03-28T00:00:00Z',
    waystations: WILDERNESS_WAYS,
    length: 32,
    scene: 'wilderness',
    memento: 'memento_wilderness',
    daily: WILDERNESS_DAILY,
    weekly: WILDERNESS_WEEKLY,
    rollingWeeklies: true,
  },
  {
    id: 'emmaus',
    name: 'The Emmaus Road',
    blurb: 'Seven miles out of the city with somebody you don’t recognise yet. Go and tell it.',
    start: '2027-03-28T00:00:00Z',
    end: '2027-05-16T00:00:00Z',
    waystations: EMMAUS_WAYS,
    length: 34,
    scene: 'emmaus',
    memento: 'memento_emmaus',
    daily: EMMAUS_DAILY,
    weekly: EMMAUS_WEEKLY,
    rollingWeeklies: true,
  },
  {
    id: 'sower',
    name: 'The Sower’s Road',
    blurb: 'A long green summer of parables. Scatter it wide and see what comes up.',
    start: '2027-05-16T00:00:00Z',
    end: '2027-08-27T00:00:00Z',
    waystations: SOWER_WAYS,
    length: 72,
    scene: 'sower',
    memento: 'memento_sower',
    daily: SOWER_DAILY,
    weekly: SOWER_WEEKLY,
    rollingWeeklies: true,
  },
]

/** How many waystations a road has when it doesn't say. The Harvest Road's 50. */
export const ROAD_LENGTH = DEFAULT_ROAD_LENGTH

/** Every road this build knows: bundled, plus whatever the catalog published. */
export const allRoads = (): RoadDef[] => mergeById(ROADS, catalogOverlay().roads)

/** How long a given road is, for the screens that draw the whole track. */
export const roadLength = (road: RoadDef): number => road.length ?? ROAD_LENGTH

/**
 * The road being walked right now, or null between seasons.
 *
 * Still a pure function of the clock, exactly as when ROADS was the only
 * source: there is no server-side "current season" flag to drift, and a road
 * published months early simply switches itself on at its `start`. That is what
 * makes pre-shipping a holiday road in today's binary work at all.
 *
 * Overlapping windows resolve to the road that starts LATEST. A publisher who
 * overlaps two roads meant the new one; picking the first match would have a
 * long-running road swallow a short holiday one sitting inside it.
 */
export function activeRoad(now: number = Date.now()): RoadDef | null {
  const live = allRoads().filter(
    (r) => now >= new Date(r.start).getTime() && now < new Date(r.end).getTime(),
  )
  if (live.length === 0) return null
  return live.reduce((best, r) =>
    new Date(r.start).getTime() > new Date(best.start).getTime() ? r : best,
  )
}

/**
 * The road's own emblem, for the surfaces that put an icon beside its name.
 *
 * Derived from the road's MEMENTO rather than being a field of its own, so a
 * road can't be published with a keepsake that says one thing and a header that
 * says another — and so a catalog road gets an emblem for free, since it has to
 * name a memento anyway. The Harvest Road's sheaf was hardcoded into three
 * surfaces before this existed, which is a wheat field drawn over Bethlehem the
 * moment a second road opens.
 */
export const roadEmblem = (road?: RoadDef | null): string =>
  road ? rewardLabel(road.memento).glyph : '🌾'

export const roadById = (id?: string | null): RoadDef | undefined =>
  id ? allRoads().find((r) => r.id === id) : undefined

/** Day number within the road, 0-based. Drives quest generation. */
export function roadDay(road: RoadDef, now: number = Date.now()): number {
  const ms = now - new Date(road.start).getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}

/** Days left, for the header. Never negative. */
export function daysLeft(road: RoadDef, now: number = Date.now()): number {
  return Math.max(0, Math.ceil((new Date(road.end).getTime() - now) / 86_400_000))
}

/**
 * How long this road is open, as one short phrase — the countdown shown on the
 * Play tab's strip and in the Pilgrimage header. ONE function, so the two can't
 * drift into saying different things about the same road.
 *
 * Three deliberate limits, because a countdown is the easiest thing in this app
 * to turn into a shame device:
 *
 * - **It counts the ROAD, never the player.** It says when the season closes,
 *   not how far behind anybody is. There is no "3 waystations to go", no pace
 *   bar, no "finish by". A road ending is a fact about the calendar.
 * - **No seconds, ever.** Below a day it drops to hours and below an hour it
 *   stops counting altogether. A ticking clock on the busiest screen in the app
 *   is a pressure device — and it would re-render this card once a second for
 *   no information anybody can act on.
 * Two phrasings of one fact, never two facts: `text` is the sentence under the
 * Pilgrimage header ("17d left"), `short` is the badge that sits on the road's
 * own painting where there is room for three characters ("17d"). They are
 * returned together so a surface can pick a length without doing the maths
 * again — the first attempt put the long form in a pill beside the road's NAME
 * on the Play tab, which truncated "The Advent Road" to "The A…" on a 390px
 * phone. Found by looking at it.
 *
 * - **Nothing is lost when it runs out.** Every reward already banked is kept
 *   forever (season_unlocks outlives its road), so `urgent` only changes a
 *   colour on the last day; it never adds a warning, and no copy anywhere says
 *   what a player will miss.
 */
export function roadTimeLeft(
  road: RoadDef,
  now: number = Date.now(),
): { text: string; short: string; urgent: boolean } {
  const ms = new Date(road.end).getTime() - now
  if (ms <= 0) return { text: 'Closed', short: '—', urgent: false }
  const hours = Math.ceil(ms / 3_600_000)
  if (hours <= 1) return { text: 'Ends within the hour', short: '<1h', urgent: true }
  if (hours <= 48) return { text: `${hours}h left`, short: `${hours}h`, urgent: true }
  const days = Math.ceil(ms / 86_400_000)
  return { text: `${days}d left`, short: `${days}d`, urgent: false }
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
