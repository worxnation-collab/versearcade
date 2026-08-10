// Shared domain types for Verse Arcade.

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

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
}

export interface Profile {
  id: string
  username: string
  displayName?: string
  avatarEmoji: string
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
}

export interface PresenceEvent {
  username: string
  avatarEmoji: string
  points: number
  kind: 'scored' | 'opened' | 'streak' | 'levelup'
  createdAt: string
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
