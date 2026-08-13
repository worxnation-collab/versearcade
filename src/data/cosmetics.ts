// Profile cosmetics — avatar borders + badge emblems unlocked by streak
// milestones. Unlock eligibility is based on the player's LONGEST streak ever,
// so a missed day never strips a cosmetic they earned.
//
// Keys + thresholds here must match supabase/migrations/0010 (the server gates
// equipping); the visual styling lives here on the client.

export type CosmeticKind = 'border' | 'badge'

export interface BorderDef {
  key: string
  name: string
  requiredStreak: number
  blurb: string
}

export interface BadgeDef {
  key: string
  name: string
  requiredStreak: number
  emoji: string // '' for the "none" option
}

// Ordered by requiredStreak so galleries render as a progression.
export const BORDERS: BorderDef[] = [
  { key: 'default', name: 'Classic', requiredStreak: 0, blurb: 'The original gold ring.' },
  { key: 'ember', name: 'Ember', requiredStreak: 7, blurb: 'A warm glow for your first week.' },
  { key: 'silver', name: 'Silver', requiredStreak: 30, blurb: 'One month strong.' },
  { key: 'gold', name: 'Golden', requiredStreak: 90, blurb: 'Three months of showing up.' },
  { key: 'amethyst', name: 'Amethyst', requiredStreak: 180, blurb: 'Half a year of devotion.' },
  { key: 'aurora', name: 'Aurora', requiredStreak: 365, blurb: 'A full year — the sky celebrates.' },
  { key: 'halo', name: 'Halo of Light', requiredStreak: 1000, blurb: '1000 days. Truly radiant.' },
]

export const BADGES: BadgeDef[] = [
  { key: 'none', name: 'None', requiredStreak: 0, emoji: '' },
  { key: 'flame', name: 'Kindling', requiredStreak: 7, emoji: '🔥' },
  { key: 'star', name: 'Rising Star', requiredStreak: 30, emoji: '⭐' },
  { key: 'medal', name: 'Devoted', requiredStreak: 90, emoji: '🏅' },
  { key: 'gem', name: 'Treasured', requiredStreak: 180, emoji: '💎' },
  { key: 'crown', name: 'Crowned', requiredStreak: 365, emoji: '👑' },
  { key: 'halo', name: 'Radiant', requiredStreak: 1000, emoji: '😇' },
]

export const borderByKey = (key?: string | null): BorderDef =>
  BORDERS.find((b) => b.key === key) ?? BORDERS[0]

export const badgeByKey = (key?: string | null): BadgeDef | null =>
  key && key !== 'none' ? BADGES.find((b) => b.key === key) ?? null : null

// A founder grant unlocks every streak cosmetic regardless of streak.
export const isUnlocked = (requiredStreak: number, longestStreak: number, founder?: boolean): boolean =>
  !!founder || longestStreak >= requiredStreak

// Render config for a border. `type: 'shadow'` draws stacked rings via
// box-shadow; `type: 'gradient'` needs a conic-gradient wrapper (Avatar handles
// that). `halo` also animates (see the .va-halo rule in index.css).
export type BorderRender =
  | { type: 'shadow'; boxShadow: string }
  | { type: 'gradient'; gradient: string; animated?: boolean }

const BASE_SHADOW = '0 6px 16px rgba(0,0,0,0.4)'

export function borderRender(key: string): BorderRender {
  switch (key) {
    case 'ember':
      return { type: 'shadow', boxShadow: `0 0 0 3px #ff9f1c, 0 0 14px 2px rgba(255,159,28,0.60), ${BASE_SHADOW}` }
    case 'silver':
      return { type: 'shadow', boxShadow: `0 0 0 3px #d7dee8, 0 0 0 6px rgba(215,222,232,0.35), ${BASE_SHADOW}` }
    case 'gold':
      return { type: 'shadow', boxShadow: `0 0 0 3px #ffd23f, 0 0 0 6px rgba(255,210,63,0.35), 0 0 16px 2px rgba(255,210,63,0.45), ${BASE_SHADOW}` }
    case 'amethyst':
      return { type: 'shadow', boxShadow: `0 0 0 3px #a06bff, 0 0 18px 3px rgba(160,107,255,0.65), ${BASE_SHADOW}` }
    case 'aurora':
      return { type: 'gradient', gradient: 'conic-gradient(from 0deg, #5ee7df, #a06bff, #ffd23f, #43e97b, #ff6b6b, #5ee7df)' }
    case 'halo':
      return { type: 'gradient', gradient: 'conic-gradient(from 0deg, #fff6cf, #ffd23f, #fff6cf, #ffe58a, #ffffff, #ffd23f, #fff6cf)', animated: true }
    case 'default':
    default:
      return { type: 'shadow', boxShadow: `0 0 0 3px var(--gold), ${BASE_SHADOW}` }
  }
}
