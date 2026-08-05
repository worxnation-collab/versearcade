import type { PlayResult, SubmitOutcome } from '@/types'

// Public front door — appended to every share so friends can jump straight in.
export const APP_URL = 'https://versearcade.org'

// Spoiler-free share text (Wordle-style virality). Never leaks the reference or
// answers, so sharing can't ruin the day's drop for a friend — it just flexes
// the score and streak and pulls them in, then links them to play.
export function buildShareText(result: PlayResult, outcome: SubmitOutcome): string {
  const dots = result.perQuestion.map((q) => (q.correct ? '🟩' : '⬜')).join('')
  const streakLine = outcome.currentStreak > 1 ? `\n🔥 ${outcome.currentStreak}-day streak` : ''
  return (
    `Verse Arcade — today’s drop\n` +
    `${dots}  ${result.correctCount}/${result.totalQuestions}\n` +
    `⚡ ${result.score.toLocaleString()} pts · ×${result.comboMax} best combo` +
    streakLine +
    `\n\nCan you beat me? Same verse, everyone. 📖\n${APP_URL}`
  )
}

export async function shareResult(text: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (navigator.share) {
      // `url` drives the rich link preview; `text` already ends with the link
      // for share targets (and the clipboard fallback) that ignore `url`.
      await navigator.share({ title: 'Verse Arcade', text, url: APP_URL })
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
  if (result.correctCount === result.totalQuestions && result.totalQuestions > 0) earned.push('flawless')
  if (outcome.currentStreak >= 7) earned.push('week_warrior')
  if (outcome.currentStreak >= 30) earned.push('month_mountain')
  if (outcome.currentStreak >= 100) earned.push('centurion')
  const hour = new Date().getHours()
  if (hour >= 0 && hour < 5) earned.push('night_owl')
  return earned
}
