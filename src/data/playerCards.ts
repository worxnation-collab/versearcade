// Player-card backgrounds — the Modern Warfare-style banner behind your avatar,
// name and stats. Every background is earned: each one is tied to a collectible
// (an achievement card you completed, or a relic pulled from the Daily Chest),
// and unlocks the moment that collectible lands in your collection. Styling is
// themed after the thing that unlocked it, so a card reads as a trophy shelf.
//
// Keys are collectible keys (see data/collectibles), so ownership is simply
// "is this key in your unlocks" — the server gates equipping the same way (see
// supabase/migrations/0037_player_cards.sql).

import type { Rarity } from '@/types'
import { collectibleByKey, rarityColor } from './collectibles'

/** How the accent is painted over the base gradient. */
export type CardPattern = 'glow' | 'rays' | 'stripes' | 'aurora' | 'stars' | 'embers' | 'waves' | 'marble'

export interface CardBgDef {
  /** Collectible key this background is themed after ('default' for the free one). */
  key: string
  name: string
  from: string
  to: string
  accent: string
  pattern: CardPattern
}

export const DEFAULT_CARD_BG = 'default'

// The one everybody starts with — the app's own grape gradient.
const BASE: CardBgDef = { key: DEFAULT_CARD_BG, name: 'Classic', from: '#2a1660', to: '#150a34', accent: '#7a3ff2', pattern: 'glow' }

// Themed backgrounds, one per collectible. Anything not listed still works —
// styleFor() falls back to a rarity-tinted default — but these are hand-tuned.
const THEMED: Omit<CardBgDef, 'name'>[] = [
  // ——— Achievement cards ———
  { key: 'first_light', from: '#3a2a63', to: '#160b36', accent: '#ffb35c', pattern: 'rays' },
  { key: 'night_owl', from: '#1b1746', to: '#0b0722', accent: '#6f8fd8', pattern: 'stars' },
  { key: 'early_bird', from: '#39305f', to: '#150c33', accent: '#ffd88a', pattern: 'rays' },
  { key: 'saved_by_grace', from: '#1e2a58', to: '#0d1130', accent: '#5ee7df', pattern: 'waves' },
  { key: 'flawless', from: '#1f3358', to: '#0c142e', accent: '#7fe6ff', pattern: 'marble' },
  { key: 'combo_king', from: '#3d1f4f', to: '#160a2c', accent: '#ff6b9d', pattern: 'rays' },
  { key: 'high_scorer', from: '#402154', to: '#170b30', accent: '#ff8f5e', pattern: 'embers' },
  { key: 'week_warrior', from: '#4a2033', to: '#1c0a1e', accent: '#ff6b3d', pattern: 'embers' },
  { key: 'co_op_climber', from: '#233f45', to: '#0c1a20', accent: '#6fce7f', pattern: 'stripes' },
  { key: 'speed_seraph', from: '#2b2170', to: '#0f0a30', accent: '#9db8ff', pattern: 'rays' },
  { key: 'fortnight', from: '#2f2a5e', to: '#110d30', accent: '#a06bff', pattern: 'stripes' },
  { key: 'month_mountain', from: '#2b3350', to: '#0f1428', accent: '#b9c6e8', pattern: 'marble' },
  { key: 'devoted', from: '#39264f', to: '#150b2c', accent: '#c9a2ff', pattern: 'glow' },
  { key: 'half_century', from: '#4b3520', to: '#1d1108', accent: '#ffc861', pattern: 'rays' },
  { key: 'centurion', from: '#513a1a', to: '#1f1206', accent: '#ffd23f', pattern: 'embers' },
  { key: 'leper_king', from: '#5c4718', to: '#241a06', accent: '#fff2c2', pattern: 'aurora' },

  // ——— Daily Chest relics ———
  { key: 'olive_branch', from: '#243f2e', to: '#0d1a13', accent: '#8fd694', pattern: 'waves' },
  { key: 'clay_lamp', from: '#41301c', to: '#180f07', accent: '#ffbe5c', pattern: 'glow' },
  { key: 'palm_frond', from: '#1f4034', to: '#0a1a15', accent: '#5fd6a5', pattern: 'stripes' },
  { key: 'water_jar', from: '#26364f', to: '#0d1424', accent: '#7fb4e6', pattern: 'waves' },
  { key: 'scroll_fragment', from: '#3d3524', to: '#17130b', accent: '#e0cf9a', pattern: 'marble' },
  { key: 'mustard_seed', from: '#2b3a22', to: '#0f160b', accent: '#a8d96b', pattern: 'glow' },
  { key: 'anointing_oil', from: '#3a3320', to: '#15120a', accent: '#d8c46a', pattern: 'glow' },
  { key: 'illuminated_icon', from: '#4a3a1c', to: '#1b1408', accent: '#ffdf8a', pattern: 'rays' },
  { key: 'pilgrim_medallion', from: '#33384f', to: '#111325', accent: '#c2b280', pattern: 'stripes' },
  { key: 'ancient_menorah', from: '#453518', to: '#191206', accent: '#ffcf5c', pattern: 'rays' },
  { key: 'golden_chalice', from: '#4e3a15', to: '#1d1405', accent: '#ffd23f', pattern: 'glow' },
  { key: 'alabaster_jar', from: '#3f3a45', to: '#17141b', accent: '#efe6f0', pattern: 'marble' },
  { key: 'star_of_bethlehem', from: '#1a1c4a', to: '#080a22', accent: '#ffe98a', pattern: 'stars' },
  { key: 'widows_mite', from: '#3b3524', to: '#16130b', accent: '#d4b96a', pattern: 'glow' },
  { key: 'manna', from: '#41372a', to: '#18140e', accent: '#f0d9a8', pattern: 'stars' },
  { key: 'loaves_fish', from: '#22394a', to: '#0b1520', accent: '#6fc3d6', pattern: 'waves' },
  { key: 'shepherds_crook', from: '#2e3a2a', to: '#101610', accent: '#a9c98a', pattern: 'stripes' },
  { key: 'descending_dove', from: '#2c3550', to: '#0f1324', accent: '#dfe8ff', pattern: 'glow' },
  { key: 'jubilee_trumpet', from: '#4a3719', to: '#1b1408', accent: '#ffc94f', pattern: 'rays' },
  { key: 'davids_harp', from: '#38284f', to: '#140c26', accent: '#c79bff', pattern: 'waves' },
  { key: 'jordan_water', from: '#1f3a4e', to: '#0a1620', accent: '#5ee7df', pattern: 'waves' },
  { key: 'apostles_letter', from: '#3b3628', to: '#16140d', accent: '#e6d7ae', pattern: 'marble' },
  { key: 'covenant_rainbow', from: '#2a2352', to: '#0f0c26', accent: '#5ee7df', pattern: 'aurora' },
  { key: 'tablets_law', from: '#333644', to: '#12141c', accent: '#c8d0dd', pattern: 'marble' },
  { key: 'kingdom_keys', from: '#463617', to: '#191306', accent: '#ffd76b', pattern: 'rays' },
  { key: 'pearl_price', from: '#3a3550', to: '#141223', accent: '#f2e9ff', pattern: 'glow' },
]

// Names come from the collectible that unlocks each background, so the two can
// never drift apart.
export const CARD_BACKGROUNDS: CardBgDef[] = [
  BASE,
  ...THEMED.map((t) => ({ ...t, name: collectibleByKey(t.key)?.name ?? t.key })),
]

export const cardBgByKey = (key?: string | null): CardBgDef =>
  CARD_BACKGROUNDS.find((b) => b.key === key) ?? BASE

/** Rarity of the collectible behind a background — drives the picker's framing. */
export function cardBgRarity(key: string): Rarity {
  if (key === DEFAULT_CARD_BG) return 'common'
  return collectibleByKey(key)?.rarity ?? 'common'
}

export const cardBgAccentColor = (key: string): string =>
  key === DEFAULT_CARD_BG ? 'var(--gold)' : rarityColor[cardBgRarity(key)]

/** A background is yours once you own the collectible it's themed after. */
export function cardBgUnlocked(key: string, owned: string[] | Set<string>): boolean {
  if (key === DEFAULT_CARD_BG) return true
  return owned instanceof Set ? owned.has(key) : owned.includes(key)
}

// The CSS. Every pattern paints one or more layers over a base gradient; all of
// them are pure CSS so a card costs no images and scales to any size.
export function cardBgStyle(key?: string | null): React.CSSProperties {
  const d = cardBgByKey(key)
  const a = d.accent
  const base = `linear-gradient(160deg, ${mix(d.from, a, 0.26)} 0%, ${d.from} 45%, ${d.to} 100%)`
  const layers: string[] = []
  // A wash of the accent over everything, so even the subtler patterns read as
  // "this player picked something" rather than as the default card.
  const wash = `linear-gradient(150deg, ${hexA(a, 0.28)} 0%, transparent 55%)`

  switch (d.pattern) {
    case 'rays':
      layers.push(`repeating-conic-gradient(from 210deg at 15% -10%, ${hexA(a, 0.224)} 0deg 6deg, transparent 6deg 18deg)`)
      layers.push(`radial-gradient(420px 220px at 12% -10%, ${hexA(a, 0.56)}, transparent 70%)`)
      break
    case 'stripes':
      layers.push(`repeating-linear-gradient(115deg, ${hexA(a, 0.182)} 0px 14px, transparent 14px 34px)`)
      layers.push(`radial-gradient(360px 200px at 85% 0%, ${hexA(a, 0.42)}, transparent 72%)`)
      break
    case 'aurora':
      layers.push(`radial-gradient(300px 190px at 20% 0%, ${hexA(a, 0.7)}, transparent 70%)`)
      layers.push(`radial-gradient(320px 200px at 80% 20%, ${hexA('#a06bff', 0.588)}, transparent 72%)`)
      layers.push(`radial-gradient(280px 180px at 55% 100%, ${hexA('#5ee7df', 0.448)}, transparent 70%)`)
      break
    case 'stars':
      layers.push(`radial-gradient(1.6px 1.6px at 12% 22%, ${hexA(a, 0.98)}, transparent 100%)`)
      layers.push(`radial-gradient(1.4px 1.4px at 68% 14%, ${hexA(a, 0.98)}, transparent 100%)`)
      layers.push(`radial-gradient(1.8px 1.8px at 84% 62%, ${hexA(a, 0.98)}, transparent 100%)`)
      layers.push(`radial-gradient(1.2px 1.2px at 32% 74%, ${hexA(a, 0.98)}, transparent 100%)`)
      layers.push(`radial-gradient(1.5px 1.5px at 46% 40%, ${hexA(a, 0.98)}, transparent 100%)`)
      layers.push(`radial-gradient(420px 240px at 70% 0%, ${hexA(a, 0.308)}, transparent 72%)`)
      break
    case 'embers':
      layers.push(`radial-gradient(120px 90px at 22% 108%, ${hexA(a, 0.77)}, transparent 70%)`)
      layers.push(`radial-gradient(150px 110px at 62% 115%, ${hexA(a, 0.56)}, transparent 72%)`)
      layers.push(`radial-gradient(100px 80px at 88% 100%, ${hexA(a, 0.476)}, transparent 70%)`)
      break
    case 'waves':
      layers.push(`repeating-radial-gradient(120% 60% at 50% 118%, transparent 0 18px, ${hexA(a, 0.168)} 18px 20px)`)
      layers.push(`radial-gradient(380px 200px at 50% 110%, ${hexA(a, 0.476)}, transparent 72%)`)
      break
    case 'marble':
      layers.push(`repeating-linear-gradient(62deg, ${hexA(a, 0.14)} 0px 2px, transparent 2px 26px)`)
      layers.push(`repeating-linear-gradient(-48deg, ${hexA(a, 0.098)} 0px 1px, transparent 1px 19px)`)
      layers.push(`radial-gradient(360px 220px at 25% 5%, ${hexA(a, 0.336)}, transparent 72%)`)
      break
    case 'glow':
    default:
      layers.push(`radial-gradient(400px 230px at 78% 4%, ${hexA(a, 0.588)}, transparent 72%)`)
      layers.push(`radial-gradient(300px 190px at 8% 92%, ${hexA(a, 0.308)}, transparent 70%)`)
      break
  }

  return { background: [...layers, wash, base].join(', ') }
}

// Lift the top of the gradient toward the ACCENT rather than toward white —
// mixing with white desaturates a deep base into grey, which reads as a washed
// out card instead of themed artwork.
function mix(hex: string, toward: string, amount: number): string {
  const a = rgb(hex)
  const b = rgb(toward)
  if (!a || !b) return hex
  const c = (i: number) => Math.round(a[i] + (b[i] - a[i]) * amount)
  return `rgb(${c(0)}, ${c(1)}, ${c(2)})`
}

function rgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** #rrggbb → rgba() at the given alpha. Non-hex values pass through unchanged. */
function hexA(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}
