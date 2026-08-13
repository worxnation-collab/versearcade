import type { Rarity } from '@/types'

// Client catalog of collectibles. Two kinds:
//  - 'card'  = achievement verse cards, earned by how you play (streaks, perfect
//              runs, etc.). See earnedCards() in features/daily/shareCard.ts.
//  - 'relic' = sacred artifacts / antique icons found in the Daily Chest. The
//              chest draw + rarity weights live server-side (chest_relics table,
//              migration 0008); the `weight` here is only used for guest (offline)
//              draws so guests get the same odds.
// A collection loop gives players a reason to return beyond the streak: there's
// always another card to chase and a chest to open.
export interface Collectible {
  key: string
  name: string
  emoji: string
  rarity: Rarity
  category: 'card' | 'relic'
  description: string
  weight?: number // relic draw weight (guest/offline chest only)
}

export const COLLECTIBLES: Collectible[] = [
  // ————————————————————— Achievement cards —————————————————————
  { key: 'first_light', name: 'First Light', emoji: '🌅', rarity: 'common', category: 'card', description: 'Played your very first daily verse.' },
  { key: 'night_owl', name: 'Night Owl', emoji: '🦉', rarity: 'common', category: 'card', description: 'Solved a verse after midnight.' },
  { key: 'early_bird', name: 'Early Bird', emoji: '🐦', rarity: 'common', category: 'card', description: 'Played before 8am.' },
  { key: 'saved_by_grace', name: 'Saved by Grace', emoji: '🛟', rarity: 'common', category: 'card', description: 'A streak freeze rescued your streak.' },
  { key: 'flawless', name: 'Flawless', emoji: '💎', rarity: 'rare', category: 'card', description: 'A perfect, no-miss run.' },
  { key: 'combo_king', name: 'Combo King', emoji: '🎯', rarity: 'rare', category: 'card', description: 'Hit a 5x combo or better.' },
  { key: 'high_scorer', name: 'High Scorer', emoji: '🚀', rarity: 'rare', category: 'card', description: 'Scored 500+ in a single run.' },
  { key: 'week_warrior', name: 'Week Warrior', emoji: '🔥', rarity: 'rare', category: 'card', description: 'Reached a 7-day streak.' },
  { key: 'co_op_climber', name: 'Co-op Climber', emoji: '🧗', rarity: 'rare', category: 'card', description: 'Contributed to a group climb.' },
  { key: 'speed_seraph', name: 'Speed Seraph', emoji: '⚡', rarity: 'epic', category: 'card', description: 'Cleared a verse in record time.' },
  { key: 'fortnight', name: 'Fortnight Faithful', emoji: '📅', rarity: 'epic', category: 'card', description: 'Reached a 14-day streak.' },
  { key: 'month_mountain', name: 'Month Mountain', emoji: '⛰️', rarity: 'epic', category: 'card', description: 'Reached a 30-day streak.' },
  { key: 'devoted', name: 'Devoted', emoji: '📚', rarity: 'epic', category: 'card', description: 'Played 25 daily verses.' },
  { key: 'half_century', name: 'Half Century', emoji: '🏅', rarity: 'legendary', category: 'card', description: 'Reached a 50-day streak.' },
  { key: 'centurion', name: 'Centurion', emoji: '👑', rarity: 'legendary', category: 'card', description: 'Reached a 100-day streak.' },
  // The crown jewel: awarded the first time you hold the #1 spot on the
  // worldwide ranks. Once earned it's yours forever, even after you're dethroned
  // — a permanent record of having sat the throne. Granted from the leaderboard
  // screen (see LeaderboardScreen) and rendered with the spinning ThroneIcon.
  { key: 'leper_king', name: 'The Leper King', emoji: '👑', rarity: 'mythic', category: 'card', description: 'Ascended to #1 on the worldwide ranks — crowned above all.' },

  // ————————————————————— Daily Chest relics —————————————————————
  { key: 'olive_branch', name: 'Olive Branch', emoji: '🌿', rarity: 'common', category: 'relic', weight: 20, description: 'A sign of peace carried back to the ark.' },
  { key: 'clay_lamp', name: 'Clay Lamp', emoji: '🪔', rarity: 'common', category: 'relic', weight: 20, description: 'An oil lamp kept ready and burning through the night.' },
  { key: 'palm_frond', name: 'Palm Frond', emoji: '🌴', rarity: 'common', category: 'relic', weight: 20, description: 'Waved to welcome the King into the city.' },
  { key: 'water_jar', name: 'Water Jar', emoji: '🏺', rarity: 'common', category: 'relic', weight: 20, description: 'A vessel like those filled at the wedding in Cana.' },
  { key: 'scroll_fragment', name: 'Scroll Fragment', emoji: '📜', rarity: 'common', category: 'relic', weight: 20, description: 'A piece of a hand-copied sacred scroll.' },
  { key: 'mustard_seed', name: 'Mustard Seed', emoji: '🌱', rarity: 'common', category: 'relic', weight: 20, description: 'The smallest seed, and a picture of great faith.' },
  { key: 'anointing_oil', name: 'Anointing Oil', emoji: '🫒', rarity: 'uncommon', category: 'relic', weight: 8, description: 'Fragrant oil poured out in devotion.' },
  { key: 'illuminated_icon', name: 'Illuminated Icon', emoji: '🖼️', rarity: 'uncommon', category: 'relic', weight: 8, description: 'A gold-leafed devotional image from a monastery.' },
  { key: 'pilgrim_medallion', name: 'Pilgrim’s Medallion', emoji: '🎖️', rarity: 'uncommon', category: 'relic', weight: 8, description: 'Carried by a traveler on a holy journey.' },
  { key: 'ancient_menorah', name: 'Ancient Menorah', emoji: '🕎', rarity: 'uncommon', category: 'relic', weight: 8, description: 'A lampstand of light kept in the temple.' },
  { key: 'golden_chalice', name: 'Golden Chalice', emoji: '🏆', rarity: 'rare', category: 'relic', weight: 2, description: 'A cup set apart for the table of the Lord.' },
  { key: 'alabaster_jar', name: 'Alabaster Jar', emoji: '⚱️', rarity: 'rare', category: 'relic', weight: 2, description: 'Costly perfume broken open in worship.' },
  { key: 'star_of_bethlehem', name: 'Star of Bethlehem', emoji: '🌟', rarity: 'rare', category: 'relic', weight: 2, description: 'The light that led the wise men to the Child.' },
]

export const rarityColor: Record<Rarity, string> = {
  common: '#8fa3c8',
  uncommon: '#6fce7f',
  rare: '#4ecdc4',
  epic: '#a06bff',
  legendary: '#ffd23f',
  mythic: '#fff2c2', // radiant gold-white — the throne
}

// The collectible key granted for reaching #1 on the worldwide leaderboard.
// Kept as a named export so the leaderboard grant and the throne rendering
// never drift apart from a stringly-typed literal.
export const THRONE_KEY = 'leper_king'

export function collectibleByKey(key: string) {
  return COLLECTIBLES.find((c) => c.key === key)
}

export const CARDS = COLLECTIBLES.filter((c) => c.category === 'card')
export const RELICS = COLLECTIBLES.filter((c) => c.category === 'relic')

// Weighted random relic for a guest (offline) chest open. Online, the server
// (open_daily_chest) is authoritative; this mirrors its odds.
export function drawRelicKey(rng: () => number = Math.random): string {
  const total = RELICS.reduce((s, r) => s + (r.weight ?? 1), 0)
  let roll = rng() * total
  for (const r of RELICS) {
    roll -= r.weight ?? 1
    if (roll <= 0) return r.key
  }
  return RELICS[RELICS.length - 1].key
}
