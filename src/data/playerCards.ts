// Player-card backgrounds — the calling-card artwork behind your avatar, name
// and stats. Almost every background is earned: each one is tied to a collectible
// (an achievement card you completed, or a relic pulled from the Daily Chest),
// and unlocks the moment that collectible lands in your collection. Styling is
// themed after the thing that unlocked it, so a card reads as a trophy shelf.
//
// Those keys are collectible keys (see data/collectibles), so ownership is simply
// "is this key in your unlocks" — the server gates equipping the same way (see
// supabase/migrations/0037_player_cards.sql).
//
// The exception is PACK cards: calling cards bundled with a paid skin pack. They
// have no collectible behind them, so they gate on the pack entitlement instead
// (profiles.owned_skins). Nothing rank-related and nothing earned is ever moved
// behind that line — a pack card is extra artwork, not a shortcut.

import type { Rarity } from '@/types'
import { collectibleByKey, rarityColor } from './collectibles'
import { packPreviewable } from './avatar'
import type { Palette, Scene } from './cardArt'

export interface CardBgDef {
  /** Collectible key this background is themed after ('default' for the free one). */
  key: string
  name: string
  scene: Scene
  palette: Palette
  /** Paid-pack cards: the pack sku that unlocks this one (see FULL_SKINS). */
  pack?: string
  /** Pack cards have no collectible, so they carry their own rarity + chip art. */
  rarity?: Rarity
  emoji?: string
  /** Shown on a locked tile in place of "Unlocks with <collectible>". */
  unlockHint?: string
}

export const DEFAULT_CARD_BG = 'default'

// A few shared skies so related scenes hang together as a set.
const DAWN: [string, string] = ['#4b2a6b', '#1a0c3a']
const NIGHT: [string, string] = ['#141338', '#070518']
const DUSK: [string, string] = ['#5a2a4a', '#1c0a24']
const SEA: [string, string] = ['#1e4a6b', '#08182c']
const GOLDEN: [string, string] = ['#6b4a18', '#241505']
const STONEY: [string, string] = ['#3b4055', '#12141f']
const VERDANT: [string, string] = ['#2c5340', '#0b1c14']

// The one everybody starts with.
const BASE: CardBgDef = {
  key: DEFAULT_CARD_BG,
  name: 'Classic',
  scene: 'night',
  palette: { sky: ['#3a1f7a', '#150a34'], land: '#1d1046', glow: '#a06bff', accent: '#d9c8ff' },
}

// One painted scene per collectible, themed to what it depicts.
const THEMED: Omit<CardBgDef, 'name'>[] = [
  // ——— Achievement cards ———
  { key: 'first_light', scene: 'sunrise', palette: { sky: ['#7a3f2a', '#2a1030'], land: '#2a1030', glow: '#ffb35c', accent: '#ffe0b0' } },
  { key: 'night_owl', scene: 'night', palette: { sky: NIGHT, land: '#0d0b26', glow: '#9db8ff', accent: '#cfe0ff' } },
  { key: 'early_bird', scene: 'sunrise', palette: { sky: ['#5c4a86', '#1d1240'], land: '#1d1240', glow: '#ffd88a', accent: '#fff0c8' } },
  { key: 'saved_by_grace', scene: 'storm', palette: { sky: ['#2c3f6b', '#0c1226'], land: '#151a35', glow: '#7fe6ff', accent: '#d6f6ff' } },
  { key: 'flawless', scene: 'mountain', palette: { sky: ['#245a78', '#08192e'], land: '#0e2440', glow: '#7fe6ff', accent: '#d8f4ff' } },
  { key: 'combo_king', scene: 'radiance', palette: { sky: DUSK, land: '#28102e', glow: '#ff6b9d', accent: '#ffd0e2' } },
  { key: 'high_scorer', scene: 'flames', palette: { sky: ['#4a2360', '#170a2c'], land: '#1c0b32', glow: '#ff8f5e', accent: '#ffd2a0' } },
  { key: 'week_warrior', scene: 'flames', palette: { sky: ['#63212c', '#1c0a1e'], land: '#220c20', glow: '#ff6b3d', accent: '#ffc46b' } },
  { key: 'co_op_climber', scene: 'mountain', palette: { sky: ['#2c5b52', '#0a1a1e'], land: '#0f2a26', glow: '#6fce7f', accent: '#c8f0cf' } },
  { key: 'speed_seraph', scene: 'star', palette: { sky: ['#33268c', '#0f0a30'], land: '#170f45', glow: '#9db8ff', accent: '#e2ecff' } },
  { key: 'fortnight', scene: 'night', palette: { sky: ['#312a6e', '#110d30'], land: '#191248', glow: '#a06bff', accent: '#dcc9ff' } },
  { key: 'month_mountain', scene: 'mountain', palette: { sky: STONEY, land: '#1a1f30', glow: '#b9c6e8', accent: '#e6ecfa' } },
  { key: 'devoted', scene: 'scroll', palette: { sky: ['#3d2a58', '#150b2c'], land: '#4a3a5e', glow: '#c9a2ff', accent: '#efe2ff' } },
  { key: 'half_century', scene: 'temple', palette: { sky: GOLDEN, land: '#2a1a08', glow: '#ffc861', accent: '#ffeab5' } },
  { key: 'centurion', scene: 'flames', palette: { sky: ['#6b4a12', '#241705'], land: '#2c1c06', glow: '#ffd23f', accent: '#fff0b0' } },
  { key: 'leper_king', scene: 'radiance', palette: { sky: ['#6e5518', '#241a06'], land: '#332409', glow: '#fff2c2', accent: '#ffffff' } },

  // ——— Daily Chest relics ———
  { key: 'olive_branch', scene: 'garden', palette: { sky: ['#3d6b4a', '#0d1a13'], land: '#16301f', glow: '#8fd694', accent: '#d8f2d5' } },
  { key: 'clay_lamp', scene: 'lamp', palette: { sky: ['#3a2a16', '#120a04'], land: '#1e1408', glow: '#ffbe5c', accent: '#ffe3ac' } },
  { key: 'palm_frond', scene: 'garden', palette: { sky: VERDANT, land: '#0e2a20', glow: '#5fd6a5', accent: '#c8f5e2' } },
  { key: 'water_jar', scene: 'water', palette: { sky: ['#3b5a7e', '#0d1424'], land: '#16304a', glow: '#7fb4e6', accent: '#d6ecff' } },
  { key: 'scroll_fragment', scene: 'scroll', palette: { sky: ['#4a3f28', '#17130b'], land: '#6b5c3c', glow: '#e0cf9a', accent: '#fff2cf' } },
  { key: 'mustard_seed', scene: 'field', palette: { sky: ['#4a5e2c', '#0f160b'], land: '#1e2a12', glow: '#a8d96b', accent: '#e0f5b8' } },
  { key: 'anointing_oil', scene: 'lamp', palette: { sky: ['#3f3620', '#15120a'], land: '#221c0e', glow: '#d8c46a', accent: '#f5ecc0' } },
  { key: 'illuminated_icon', scene: 'temple', palette: { sky: ['#5c481e', '#1b1408'], land: '#2a1f0b', glow: '#ffdf8a', accent: '#fff5d2' } },
  { key: 'pilgrim_medallion', scene: 'mountain', palette: { sky: ['#3f465e', '#111325'], land: '#1d2136', glow: '#c2b280', accent: '#efe6cd' } },
  { key: 'ancient_menorah', scene: 'lamp', palette: { sky: ['#4a3818', '#191206'], land: '#2a1f08', glow: '#ffcf5c', accent: '#ffeeb8' } },
  { key: 'golden_chalice', scene: 'temple', palette: { sky: ['#5e4514', '#1d1405', ], land: '#2c2008', glow: '#ffd23f', accent: '#fff0ae' } },
  { key: 'alabaster_jar', scene: 'radiance', palette: { sky: ['#4c4553', '#17141b'], land: '#282430', glow: '#efe6f0', accent: '#ffffff' } },
  { key: 'star_of_bethlehem', scene: 'star', palette: { sky: ['#1c2058', '#070a20'], land: '#0e1235', glow: '#ffe98a', accent: '#fff6cf' } },
  { key: 'widows_mite', scene: 'temple', palette: { sky: ['#463f28', '#16130b'], land: '#241f10', glow: '#d4b96a', accent: '#f3e6bd' } },
  { key: 'manna', scene: 'field', palette: { sky: ['#4d4132', '#18140e'], land: '#26200f', glow: '#f0d9a8', accent: '#fff4dd' } },
  { key: 'loaves_fish', scene: 'water', palette: { sky: ['#2c526b', '#0b1520'], land: '#123043', glow: '#6fc3d6', accent: '#cdeef5' } },
  { key: 'shepherds_crook', scene: 'field', palette: { sky: ['#3e4d34', '#101610'], land: '#1b2417', glow: '#a9c98a', accent: '#dcecc9' } },
  { key: 'descending_dove', scene: 'storm', palette: { sky: ['#3a4670', '#0f1324'], land: '#1c2340', glow: '#dfe8ff', accent: '#ffffff' } },
  { key: 'jubilee_trumpet', scene: 'sunrise', palette: { sky: ['#5e4519', '#1b1408'], land: '#2a1e08', glow: '#ffc94f', accent: '#ffe9ab' } },
  { key: 'davids_harp', scene: 'night', palette: { sky: ['#41306b', '#140c26'], land: '#221645', glow: '#c79bff', accent: '#ecdcff' } },
  { key: 'jordan_water', scene: 'water', palette: { sky: SEA, land: '#0d2c3e', glow: '#5ee7df', accent: '#c6f7f3' } },
  { key: 'apostles_letter', scene: 'scroll', palette: { sky: ['#463f2c', '#16140d'], land: '#6b5f42', glow: '#e6d7ae', accent: '#fff6e0' } },
  { key: 'covenant_rainbow', scene: 'rainbow', palette: { sky: ['#33417e', '#0f0c26'], land: '#182050', glow: '#cfe6ff', accent: '#ffffff' } },
  { key: 'tablets_law', scene: 'stone', palette: { sky: STONEY, land: '#4a5064', glow: '#c8d0dd', accent: '#f0f4fa' } },
  { key: 'kingdom_keys', scene: 'temple', palette: { sky: ['#57431a', '#191306'], land: '#291e07', glow: '#ffd76b', accent: '#fff0bc' } },
  { key: 'pearl_price', scene: 'deep', palette: { sky: ['#3f3a5c', '#0f0d1c'], land: '#1c1a30', glow: '#f2e9ff', accent: '#ffffff' } },
]

// ——— Angels Pack calling cards ———
// Two scenes the angels step out of: the stairway Jacob saw, and the host
// ——— these came with The Angel Pack and are free now, along with it. They keep
// no `pack`, so cardBackgroundOwned falls through to "everyone", which is what
// the de-monetisation means for artwork nobody can buy any more.
// that filled the sky over the shepherds. Both unlock together with any skin in
// the pack (data/avatar FULL_SKINS, pack 'angels'); the server enforces the same
// rule in migration 0043.
const PACK: CardBgDef[] = [
  // ——— Founding Patron ———
  // The second half of the app's one product. A skin is only ever seen by
  // somebody looking at your figure; the player card is the surface that turns
  // up beside your name everywhere in the app, which is what makes this the
  // part of the pack other people actually see.
  //
  // It gates on the pack rather than on a collectible, like the angel cards, so
  // `packEntitled('patron', …)` is satisfied by EITHER founding-patron skin —
  // the whale buyers get the cornerstone too, without a second rule. The server
  // says the same thing in 0095's set_card_background; keep the two in sync.
  //
  // `/cards/patron_cornerstone.webp` is a Nano Banana painting (the first stone
  // of a building not yet risen, one gold vein, dusk), cut to the same 1040x520
  // as the rest of the shelf. CardBg still falls back to the drawn `stone`
  // scene if the image 404s, so the card is complete either way.
  {
    key: 'patron_cornerstone',
    name: 'The Cornerstone',
    pack: 'patron',
    rarity: 'legendary',
    emoji: '🪨',
    unlockHint: 'Comes with the Founding Patron',
    scene: 'stone',
    palette: { sky: ['#4a4130', '#15120c'], land: '#5c5443', glow: '#ffd76b', accent: '#fff2cf' },
  },
  {
    key: 'angels_ladder',
    name: 'Jacob’s Ladder',
    rarity: 'legendary',
    emoji: '🪜',
    unlockHint: 'Comes with The Angel Pack',
    scene: 'ladder',
    palette: { sky: ['#2a2270', '#0a0722'], land: '#150f3c', glow: '#ffe08a', accent: '#fff4cf' },
  },
  {
    key: 'angels_host',
    name: 'Heavenly Host',
    rarity: 'legendary',
    emoji: '👼',
    unlockHint: 'Comes with The Angel Pack',
    scene: 'host',
    palette: { sky: ['#1b2f63', '#06091f'], land: '#0d1633', glow: '#ffeeb4', accent: '#fffaf0' },
  },
]

// Names come from the collectible that unlocks each background, so the two can
// never drift apart. Pack cards bring their own name (there's no collectible).
export const CARD_BACKGROUNDS: CardBgDef[] = [
  BASE,
  ...THEMED.map((t) => ({ ...t, name: collectibleByKey(t.key)?.name ?? t.key })),
  ...PACK,
]

export const cardBgByKey = (key?: string | null): CardBgDef =>
  CARD_BACKGROUNDS.find((b) => b.key === key) ?? BASE

/** Rarity of the collectible behind a background — drives the picker's framing. */
export function cardBgRarity(key: string): Rarity {
  if (key === DEFAULT_CARD_BG) return 'common'
  return cardBgByKey(key).rarity ?? collectibleByKey(key)?.rarity ?? 'common'
}

export const cardBgAccentColor = (key: string): string =>
  key === DEFAULT_CARD_BG ? 'var(--gold)' : rarityColor[cardBgRarity(key)]

/**
 * A background is yours once you own the collectible it's themed after — or, for
 * a pack card, once you own the pack it ships with.
 */
export function cardBgUnlocked(
  key: string,
  owned: string[] | Set<string>,
  ctx?: { ownedSkins?: string[]; admin?: boolean },
): boolean {
  if (key === DEFAULT_CARD_BG) return true
  const def = cardBgByKey(key)
  if (def.pack) return packPreviewable(def.pack, ctx?.ownedSkins, ctx?.admin)
  return owned instanceof Set ? owned.has(key) : owned.includes(key)
}

/** The scene + palette to paint for a background key. */
export function cardArtProps(key?: string | null): { scene: Scene; palette: Palette } {
  const d = cardBgByKey(key)
  return { scene: d.scene, palette: d.palette }
}

/** The painted background image for a key, served from public/cards. */
export const cardBgImage = (key?: string | null): string => `/cards/${cardBgByKey(key).key}.webp`

/** A flat fallback fill, used under the image while it decodes and for tiny chips. */
export function cardBgStyle(key?: string | null): React.CSSProperties {
  const d = cardBgByKey(key)
  return { background: `linear-gradient(180deg, ${d.palette.sky[0]} 0%, ${d.palette.sky[1]} 100%)` }
}
