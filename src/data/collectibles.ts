import type { Rarity } from '@/types'

// Client catalog of collectible "verse cards" (mirrors 0004_seed.sql). A
// collection loop gives players a reason to return beyond the streak: there's
// always another card to chase.
export interface Collectible {
  key: string
  name: string
  emoji: string
  rarity: Rarity
  description: string
}

export const COLLECTIBLES: Collectible[] = [
  { key: 'first_light', name: 'First Light', emoji: '🌅', rarity: 'common', description: 'Played your very first daily verse.' },
  { key: 'week_warrior', name: 'Week Warrior', emoji: '🔥', rarity: 'rare', description: 'Reached a 7-day streak.' },
  { key: 'night_owl', name: 'Night Owl', emoji: '🦉', rarity: 'common', description: 'Solved a verse after midnight.' },
  { key: 'flawless', name: 'Flawless', emoji: '💎', rarity: 'rare', description: 'A perfect, no-miss run.' },
  { key: 'speed_seraph', name: 'Speed Seraph', emoji: '⚡', rarity: 'epic', description: 'Cleared a verse in record time.' },
  { key: 'month_mountain', name: 'Month Mountain', emoji: '⛰️', rarity: 'epic', description: 'Reached a 30-day streak.' },
  { key: 'centurion', name: 'Centurion', emoji: '👑', rarity: 'legendary', description: 'Reached a 100-day streak.' },
  { key: 'co_op_climber', name: 'Co-op Climber', emoji: '🧗', rarity: 'rare', description: 'Contributed to a group climb.' },
]

export const rarityColor: Record<Rarity, string> = {
  common: '#8fa3c8',
  rare: '#4ecdc4',
  epic: '#a06bff',
  legendary: '#ffd23f',
}

export function collectibleByKey(key: string) {
  return COLLECTIBLES.find((c) => c.key === key)
}
