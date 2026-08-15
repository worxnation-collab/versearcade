// Practice-mode constants + the bonus-XP formula, shared by the online path
// (mirrors submit_practice / practice_bonus_xp in 0014) and the local/guest
// path. Keep this in sync with the SQL.

export const PRACTICE_LIST_SIZE = 5 // how many recent verses you can practice
export const PRACTICE_COOLDOWN_DAYS = 7 // per-verse reward cooldown

// Bonus XP for beating your best by `delta` points. Scales with the margin,
// floored so any genuine beat pays something, capped so one run can't balloon.
export function practiceBonusXp(delta: number): number {
  if (delta <= 0) return 0
  return Math.min(60, Math.max(5, Math.round(delta / 6)))
}

// Whole days from `fromDate` (YYYY-MM-DD) to `toDate`. Positive if toDate later.
export function daysBetween(fromDate: string, toDate: string): number {
  const a = new Date(fromDate + 'T00:00:00Z').getTime()
  const b = new Date(toDate + 'T00:00:00Z').getTime()
  return Math.round((b - a) / 86400000)
}

// A verse's weekly reward is available if it's never been rewarded, or the last
// reward was at least PRACTICE_COOLDOWN_DAYS ago.
export function rewardAvailable(lastRewardOn: string | null | undefined, today: string): boolean {
  if (!lastRewardOn) return true
  return daysBetween(lastRewardOn, today) >= PRACTICE_COOLDOWN_DAYS
}

// The date the weekly reward next opens, given the last reward date.
export function nextRewardDate(lastRewardOn: string | null | undefined): string | null {
  if (!lastRewardOn) return null
  const d = new Date(lastRewardOn + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + PRACTICE_COOLDOWN_DAYS)
  return d.toISOString().slice(0, 10)
}
