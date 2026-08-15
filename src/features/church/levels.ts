// A church's level curve and its building ladder.
//
// The curve mirrors church_level_from_xp() in 0040_churches.sql — change one,
// change the other. It's deliberately slower and heavier than a player's curve:
// a church is a long climb a whole congregation pushes together, and the reward
// for pushing is that the building itself grows.

const BASE_COST = 1000
const GROWTH = 1.32
const MAX_LEVEL = 200

export interface ChurchLevelInfo {
  level: number
  /** XP banked since reaching the current level. */
  intoLevel: number
  /** XP the current level costs in total. */
  levelSpan: number
  /** 0..1 progress toward the next level. */
  pct: number
  toNext: number
}

export function churchLevelInfo(xp: number): ChurchLevelInfo {
  let level = 1
  let need = BASE_COST
  let left = Math.max(0, Math.floor(xp || 0))
  while (left >= need && level < MAX_LEVEL) {
    left -= need
    level += 1
    need = Math.round(need * GROWTH)
  }
  return {
    level,
    intoLevel: left,
    levelSpan: need,
    pct: Math.min(1, left / need),
    toNext: Math.max(0, need - left),
  }
}

// ---------------------------------------------------------------------------
// The building ladder
// ---------------------------------------------------------------------------
export type ChurchTierId =
  | 'gathering'
  | 'chapel'
  | 'country'
  | 'parish'
  | 'stone'
  | 'great'
  | 'cathedral'
  | 'basilica'

export interface ChurchTier {
  id: ChurchTierId
  name: string
  minLevel: number
  blurb: string
}

// Eight buildings across the first ~26 levels. Early ones come quickly so a
// brand-new church sees itself grow in the first week; the last few are a
// genuine congregation-sized effort.
export const CHURCH_TIERS: ChurchTier[] = [
  { id: 'gathering', name: 'House Gathering', minLevel: 1, blurb: 'Where two or three are gathered.' },
  { id: 'chapel', name: 'Little Chapel', minLevel: 3, blurb: 'A door, a bell, and a place to kneel.' },
  { id: 'country', name: 'Country Church', minLevel: 5, blurb: 'A white steeple you can see from the road.' },
  { id: 'parish', name: 'Parish Church', minLevel: 8, blurb: 'A bell tower and room for the whole town.' },
  { id: 'stone', name: 'Stone Church', minLevel: 11, blurb: 'Built to outlast everyone who built it.' },
  { id: 'great', name: 'Great Church', minLevel: 15, blurb: 'Twin spires and a rose window ablaze.' },
  { id: 'cathedral', name: 'Cathedral', minLevel: 20, blurb: 'Arches, buttresses, and a city at its feet.' },
  { id: 'basilica', name: 'Basilica', minLevel: 26, blurb: 'A golden dome. The long climb, finished.' },
]

export function tierForLevel(level: number): ChurchTier {
  let tier = CHURCH_TIERS[0]
  for (const t of CHURCH_TIERS) if (level >= t.minLevel) tier = t
  return tier
}

export const tierIndexForLevel = (level: number): number =>
  CHURCH_TIERS.findIndex((t) => t.id === tierForLevel(level).id)

/** The next building up, or null once the ladder is topped out. */
export function nextTier(level: number): ChurchTier | null {
  return CHURCH_TIERS.find((t) => t.minLevel > level) ?? null
}
