// Client-side mirror of the server scoring/streak rules (0003_functions.sql).
// Used directly in LOCAL mode, and to optimistically render results in ONLINE
// mode before the RPC returns. Keep the two in sync.

import { SCORING } from './config'
import type { Profile, SubmitOutcome } from '@/types'
import { levelInfo } from '@/components/XpBar'
import { DEFAULT_AVATAR } from '@/data/avatar'

// Score a single answered question: base points for correct, a decaying speed
// bonus, times the current combo multiplier.
export function scoreQuestion(correct: boolean, timeMs: number, comboLevel: number): number {
  if (!correct) return 0
  const speedFrac = Math.max(0, 1 - timeMs / SCORING.answerWindowMs)
  const speedBonus = Math.round(SCORING.maxSpeedBonus * speedFrac)
  const mult = Math.min(SCORING.comboMax, 1 + comboLevel * SCORING.comboStep)
  return Math.round((SCORING.basePerCorrect + speedBonus) * mult)
}

export function xpFromPlay(score: number, correct: number): number {
  return Math.max(10, Math.round(score / 8)) + correct * 4
}

// Advance a profile for a new play (drop_date assumed to be "today" locally).
export function applyPlayLocal(
  profile: Profile,
  args: { dropDate: string; score: number; correct: number; useBoost?: boolean },
): { profile: Profile; outcome: SubmitOutcome } {
  const prevLevel = profile.level
  let streak = profile.currentStreak
  let freezes = profile.streakFreezes
  let usedFreeze = false

  const last = profile.lastPlayedOn ? new Date(profile.lastPlayedOn) : null
  const today = new Date(args.dropDate)
  const dayMs = 86400000

  if (!last) {
    streak = 1
  } else {
    const gapDays = Math.round((today.getTime() - last.getTime()) / dayMs)
    if (gapDays === 1) streak = streak + 1
    else if (gapDays <= 0) {
      /* same/back day — unchanged */
    } else {
      const missed = gapDays - 1
      if (freezes >= missed && missed > 0) {
        freezes -= missed
        streak += 1
        usedFreeze = true
      } else {
        streak = 1
      }
    }
  }

  let xpEarned = xpFromPlay(args.score, args.correct)
  if ([3, 7, 30, 100].includes(streak)) xpEarned += streak * 5

  // XP Boost: +50% on this play, then consume one.
  const boostUsed = !!args.useBoost && profile.xpBoosts > 0
  if (boostUsed) xpEarned = Math.round(xpEarned * 1.5)
  const boostsLeft = boostUsed ? profile.xpBoosts - 1 : profile.xpBoosts

  const newXp = profile.xp + xpEarned
  const newLevel = levelInfo(newXp).level

  const updated: Profile = {
    ...profile,
    xp: newXp,
    level: newLevel,
    currentStreak: streak,
    longestStreak: Math.max(profile.longestStreak, streak),
    streakFreezes: freezes,
    xpBoosts: boostsLeft,
    lastPlayedOn: args.dropDate,
    totalPlays: profile.totalPlays + 1,
  }

  return {
    profile: updated,
    outcome: {
      alreadyPlayed: false,
      xpEarned,
      xp: newXp,
      level: newLevel,
      leveledUp: newLevel > prevLevel,
      currentStreak: streak,
      usedFreeze,
      streakFreezes: freezes,
      boostUsed,
      xpBoosts: boostsLeft,
    },
  }
}

export function newLocalProfile(username: string, emoji: string): Profile {
  return {
    id: 'local-' + Math.random().toString(36).slice(2, 9),
    username,
    displayName: username,
    avatarEmoji: emoji,
    xp: 0,
    level: 1,
    currentStreak: 0,
    longestStreak: 0,
    streakFreezes: 2,
    lastPlayedOn: null,
    totalPlays: 0,
    soundEnabled: true,
    hapticsEnabled: true,
    reduceMotion: false,
    onboarded: false,
    avatarBorder: 'default',
    avatarBadge: null,
    avatarCharacter: DEFAULT_AVATAR,
    sharedDays: [],
    xpBoosts: 0,
  }
}
