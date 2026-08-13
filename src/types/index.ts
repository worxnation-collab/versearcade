// Shared domain types for Verse Arcade.

// 'mythic' sits above 'legendary' — reserved for one-of-a-kind honors like the
// #1-rank throne (see THRONE_KEY in data/collectibles).
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic'

export interface Question {
  /** The prompt, always about the *displayed* verse. */
  prompt: string
  options: string[]
  answerIndex: number
  /** Shown after answering (win or lose) so a miss still teaches something. */
  teach: string
}

export interface DailyVerse {
  dropDate: string // YYYY-MM-DD
  translation: string
  reference: string // "John 3:16"
  book: string
  chapter: number
  verseStart: number
  verseEnd?: number
  text: string
  theme?: string
  questions: Question[]
  /** "Did you know" facts revealed on wrong answers / at the end. */
  facts: string[]
  /** Prose describing what happens just before / after this verse — used by the
   *  chapter reader for quick context and as an offline fallback when the full
   *  chapter can't be fetched. */
  contextBefore?: string
  contextAfter?: string
}

// A composable character avatar (the "Armor of God" figure). Which pieces are
// equipped + the skin/robe choice. Rendered by components/Character and used as
// the profile picture anywhere the Avatar component appears. Piece definitions
// and unlock gating live in data/avatar.
export type ArmorSlot = 'helmet' | 'breastplate' | 'belt' | 'shield' | 'sword' | 'sandals'

// Wearable-item slots (collected from the Daily Chest). One item per slot.
export type ItemSlot = 'hat' | 'held' | 'cape'

export interface AvatarSpec {
  skin: string // SKINS key (see data/avatar)
  robe: string // ROBES key
  armor: Partial<Record<ArmorSlot, boolean>>
  /** Equipped items by slot, values are item ids (see data/avatar ITEMS). */
  items?: Partial<Record<ItemSlot, string>>
  /** Equipped full-look skin id (e.g. 'baldwin', 'moses'). When set (and owned),
   *  it overrides the base character, armor and items. See data/avatar SKINS. */
  skinId?: string | null
  /** @deprecated superseded by skinId; read for backward compatibility only. */
  regalia?: 'baldwin' | null
}

export interface Profile {
  id: string
  username: string
  displayName?: string
  avatarEmoji: string
  /** Composable character avatar; null/undefined falls back to avatarEmoji. */
  avatarCharacter?: AvatarSpec | null
  xp: number
  level: number
  currentStreak: number
  longestStreak: number
  streakFreezes: number
  lastPlayedOn?: string | null
  totalPlays: number
  soundEnabled: boolean
  hapticsEnabled: boolean
  reduceMotion: boolean
  onboarded: boolean
  /** Equipped avatar border cosmetic key (see data/cosmetics). */
  avatarBorder: string
  /** Equipped badge cosmetic key, or null for none. */
  avatarBadge?: string | null
  /** Distinct day-drops the player has shared (YYYY-MM-DD). Drives share-count
   *  unlocks like the King Baldwin set. */
  sharedDays?: string[]
  /** Wearable item ids the player has collected (from the Daily Chest). */
  ownedItems?: string[]
  /** Full-look skin ids the player is entitled to (paid/preview-unlocked). */
  ownedSkins?: string[]
  /** Unused XP Boost consumables (rarely dropped by the Daily Chest). */
  xpBoosts: number
  /** Founder grant — unlocks the streak cosmetics (borders/badges) regardless
   *  of streak. Server-authoritative; the client only mirrors it for display. */
  founder?: boolean
  /** Admin/operator account. Server-authoritative (every admin RPC re-checks);
   *  the client only mirrors it to reveal the hidden admin entry point. */
  isAdmin?: boolean
  /** Optional denomination "faction" key (see data/denominations). Shown only on
   *  the Battle ranks; battle wins auto-pool into the denomination's total. */
  denomination?: string | null
}

export interface PlayResult {
  score: number
  timeMs: number
  correctCount: number
  totalQuestions: number
  comboMax: number
  perQuestion: { correct: boolean; timeMs: number; choiceIndex: number }[]
}

export interface SubmitOutcome {
  alreadyPlayed: boolean
  xpEarned?: number
  xp: number
  level: number
  leveledUp: boolean
  currentStreak: number
  usedFreeze?: boolean
  streakFreezes?: number
  /** True if an XP Boost was applied to this play (+50% XP). */
  boostUsed?: boolean
  /** Remaining XP Boosts after this play. */
  xpBoosts?: number
}

// Practice mode — replaying an already-played verse to study. Reward only comes
// from beating your best, once per week per verse (see submit_practice / 0014).
export interface PracticeItem {
  dropDate: string
  reference: string
  /** Score to beat = higher of your daily score and any better practice score. */
  bestScore: number
  /** True if beating your best could pay out now (not on weekly cooldown). */
  rewardable: boolean
  /** When the weekly reward unlocks again, if currently on cooldown. */
  nextRewardOn: string | null
}

export interface PracticeOutcome {
  score: number
  previousBest: number
  newBest: number
  improved: boolean
  rewarded: boolean
  xpEarned: number
  /** Improved, but the weekly per-verse reward was already claimed. */
  weeklyLocked: boolean
  nextRewardOn: string | null
}

export interface PresenceEvent {
  username: string
  avatarEmoji: string
  points: number
  kind: 'scored' | 'opened' | 'streak' | 'levelup'
  createdAt: string
  avatarBorder?: string
  avatarBadge?: string | null
}

export interface DailyPulse {
  opened: number
  feed: PresenceEvent[]
}

export interface Group {
  id: string
  name: string
  emoji: string
  joinCode: string
  xp: number
  level: number
  currentStreak: number
  longestStreak: number
}
