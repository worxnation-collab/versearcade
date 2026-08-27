import type { PlayResult, SubmitOutcome } from '@/types'

// Public front door — appended to every share so friends can jump straight in.
export const APP_URL = 'https://versearcade.org'

/**
 * Build a shareable link, carrying the sharer's referral code when they have one.
 *
 * Every link the app hands out goes through here. The referral pipeline was
 * already complete on both ends — App.tsx stashes `?ref=` into `va.ref` on
 * landing and AuthScreen prefills the signup field from it — but the share
 * button that people actually press sent a bare URL, so three weeks of shares
 * arrived unattributable and `referred_by` stayed at 1 account in 85. The code
 * was never missing; it was being dropped in transit.
 *
 * Guests have no referral code (the server issues it), so they get the plain
 * link and nothing breaks.
 */
export function inviteUrl(refCode?: string | null, path = '/'): string {
  const base = `${APP_URL}${path.startsWith('/') ? path : `/${path}`}`
  if (!refCode) return base
  return `${base}${base.includes('?') ? '&' : '?'}ref=${encodeURIComponent(refCode)}`
}

// Spoiler-free share text (Wordle-style virality). Never leaks the reference or
// answers, so sharing can't ruin the day's drop for a friend — it just flexes
// the score and streak and pulls them in, then links them to play.
export function buildShareText(result: PlayResult, outcome: SubmitOutcome, refCode?: string | null): string {
  const dots = result.perQuestion.map((q) => (q.correct ? '🟩' : '⬜')).join('')
  const streakLine = outcome.currentStreak > 1 ? `\n🔥 ${outcome.currentStreak}-day streak` : ''
  return (
    `Verse Arcade — today’s drop\n` +
    `${dots}  ${result.correctCount}/${result.totalQuestions}\n` +
    `⚡ ${result.score.toLocaleString()} pts · ×${result.comboMax} best combo` +
    streakLine +
    `\n\nCan you beat me? Same verse, everyone. 📖\n${inviteUrl(refCode)}`
  )
}

export async function shareResult(text: string, url: string = APP_URL): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share) {
      // `url` drives the rich link preview; `text` already ends with the link
      // for share targets (and the clipboard fallback) that ignore `url`. Pass
      // the same referral-carrying link to both, or the preview strips credit.
      await navigator.share({ title: 'Verse Arcade', text, url })
      return 'shared'
    }
    await navigator.clipboard.writeText(text)
    return 'copied'
  } catch {
    try {
      await navigator.clipboard.writeText(text)
      return 'copied'
    } catch {
      return 'failed'
    }
  }
}

// Which collectible "verse cards" this run earned. Client-side for now; server
// grants can be added later (see docs). Returns collectible keys.
export function earnedCards(result: PlayResult, outcome: SubmitOutcome, totalPlays: number): string[] {
  const earned: string[] = []
  if (totalPlays <= 1) earned.push('first_light')
  if (totalPlays >= 25) earned.push('devoted')
  const perfect = result.correctCount === result.totalQuestions && result.totalQuestions > 0
  if (perfect) earned.push('flawless')
  if (result.comboMax >= 5) earned.push('combo_king')
  if (result.score >= 500) earned.push('high_scorer')
  if (perfect && result.timeMs > 0 && result.timeMs <= 25000) earned.push('speed_seraph')
  if (outcome.usedFreeze) earned.push('saved_by_grace')
  if (outcome.currentStreak >= 7) earned.push('week_warrior')
  if (outcome.currentStreak >= 14) earned.push('fortnight')
  if (outcome.currentStreak >= 30) earned.push('month_mountain')
  if (outcome.currentStreak >= 50) earned.push('half_century')
  if (outcome.currentStreak >= 100) earned.push('centurion')
  const hour = new Date().getHours()
  if (hour >= 0 && hour < 5) earned.push('night_owl')
  if (hour >= 5 && hour < 8) earned.push('early_bird')
  return earned
}
