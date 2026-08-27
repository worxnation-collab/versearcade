// Practice-mode constants + the bonus-XP formula, shared by the online path
// (mirrors submit_practice / practice_bonus_xp in 0014, uncapped by 0057) and
// the local/guest path. Keep this in sync with the SQL.

export const PRACTICE_LIST_SIZE = 5 // how many recent verses you can practice

// Beating your best pays, every time you do it — there is no per-verse cooldown.
// That stays self-limiting without a gate: the bar is your own record and it only
// ever rises, so earning again means beating the score you just set.

// Bonus XP for beating your best by `delta` points. Scales with the margin,
// floored so any genuine beat pays something, capped so one run can't balloon.
export function practiceBonusXp(delta: number): number {
  if (delta <= 0) return 0
  return Math.min(60, Math.max(5, Math.round(delta / 6)))
}
