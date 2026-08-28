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

/** Which way the base figure is drawn. Purely a look: both figures share the
 *  same head, arms, legs and palette, so a player reads as the same character
 *  either way — the robe hem and the hair length are the whole difference. */
export type Figure = 'masc' | 'fem'

export interface AvatarSpec {
  skin: string // SKINS key (see data/avatar)
  robe: string // ROBES key
  /** HAIRS key. Optional for specs written before hair existed; those render
   *  with the default so nobody's stored avatar changes out from under them. */
  hair?: string
  /** Defaults to 'masc' when absent, for the same backward-compatible reason. */
  figure?: Figure
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
  /** Equipped player-card background key (a collectible key; see
   *  data/playerCards). null/undefined = the free 'default' background. */
  cardBackground?: string | null
  /** Equipped pet id (see data/pets), or null for none. Earned by player level
   *  and purely company — it touches no score, no board and no standing. */
  pet?: string | null
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
  /** This account's shareable referral code. */
  referralCode?: string | null
  /** How many people signed up with this account's referral code. */
  referralCount?: number
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

// Practice mode — replaying an already-played verse to study. Reward comes from
// beating your best, every time you manage it: no per-verse cooldown since 0057
// (see submit_practice / 0014).
export interface PracticeItem {
  dropDate: string
  reference: string
  /** Score to beat = higher of your daily score and any better practice score. */
  bestScore: number
}

export interface PracticeOutcome {
  score: number
  previousBest: number
  newBest: number
  improved: boolean
  rewarded: boolean
  xpEarned: number
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

// The church a player plays for. XP here is congregational: pooled from every
// member's gifts, on its own (slower) level curve — see features/church/levels.
export interface Church {
  id: string
  name: string
  address?: string | null
  city?: string | null
  region?: string | null
  lat: number
  lng: number
  xp: number
  level: number
  members: number
  /** Distance from the viewer's church, on the local board. */
  miles?: number
  rank?: number
  isMine?: boolean
  /**
   * What the building is made of — a `ChurchSkinId`, or null for the default.
   *
   * Carried on the church rather than on its profile because the board draws
   * it: a skin is the one thing a church pays for that a stranger scrolling
   * past can actually see. Typed as a plain string so a value from a newer
   * build doesn't fail to parse; `churchSkin()` falls back to the default for
   * anything it doesn't recognise.
   */
  skin?: string | null
}

// A member of your church, ranked by what they've given to it.
export interface ChurchGiver {
  username: string
  avatarEmoji: string
  avatarCharacter?: AvatarSpec | null
  points: number
  isMe: boolean
}

// Someone who plays for a church, as the church page draws them: a figure
// standing outside the building. Deliberately carries no points — the crowd
// outside a stranger's church is a congregation, not a ladder.
export interface ChurchMember {
  username: string
  avatarEmoji: string
  avatarCharacter?: AvatarSpec | null
  isMe: boolean
}

// The extra detail a church shows on its page. Null until a church claims it;
// there is no client write path at all (see migration 0050), so this only ever
// arrives from the server already vetted.
export interface ChurchInfo {
  tagline?: string | null
  about?: string | null
  serviceTimes?: string | null
  website?: string | null
  contact?: string | null
}

// Everything behind a tap on a leaderboard row.
export interface ChurchPage {
  church: Church
  info: ChurchInfo | null
  members: ChurchMember[]
  memberTotal: number
  /** This player already has an unhandled "add info" ask in for this church. */
  myRequestPending: boolean
}
