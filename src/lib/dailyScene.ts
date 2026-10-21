// Which painting a little world shows today. The Keep's five halls and the
// Upper Room's five scenes rotate BY DAY: one scene per local date, the same
// for everybody on that date, the way the daily verse is. A faction hall that
// shuffled per viewer was a different room for every member; a room that is
// "today's hall" is one room the whole faction is standing in.
//
// It walks the scenes in order (day number mod n), so all five come round
// every five days and no two consecutive days repeat. Pure over the date, so
// the Battle tab and the sheet can never disagree.

import { useEffect, useState } from 'react'
import { msUntilNextLocalMidnight, todayLocalDate } from './date'

/** Days since 1970-01-01 for a YYYY-MM-DD local date. */
const dayNumber = (date: string): number => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000)

/** The scene index for a date. `offset` staggers two worlds' cycles. */
export const dailySceneIndex = (date: string, n: number, offset = 0): number =>
  n > 0 ? (((dayNumber(date) + offset) % n) + n) % n : 0

/**
 * Today's local date, kept current: re-read at local midnight and whenever
 * the app comes back to the foreground, so a phone left open overnight (or
 * resumed the next morning) moves to the new day's scene.
 */
export function useToday(): string {
  const [today, setToday] = useState(todayLocalDate)
  useEffect(() => {
    const check = () => setToday(todayLocalDate())
    let timer = setTimeout(function tick() {
      check()
      timer = setTimeout(tick, msUntilNextLocalMidnight() + 1000)
    }, msUntilNextLocalMidnight() + 1000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  return today
}
