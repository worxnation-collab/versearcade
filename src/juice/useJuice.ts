// One hook to fire coordinated feedback (sound + haptics + particles) from any
// component. Keeps the engines in sync with the user's settings via an effect,
// so the sound/haptics/motion toggles take effect app-wide instantly.

import { useEffect, useMemo } from 'react'
import { useSettings } from '@/store/settings'
import { useSeason } from '@/store/season'
import { confettiById } from '@/data/season'
import { Sound } from './sound'
import { Haptic } from './haptics'
import { Burst } from './confetti'
import { configureHaptics } from './haptics'
import { configureConfetti } from './confetti'

export function useJuiceSync() {
  const { soundEnabled, hapticsEnabled, reduceMotion, volume } = useSettings()
  // The equipped confetti theme rides along here rather than being read at each
  // burst site: every juice call would otherwise need to know about seasons,
  // and the engines are already configured from one place.
  const theme = useSeason((s) => s.equipped.confetti)
  useEffect(() => {
    Sound.configure({ enabled: soundEnabled, volume })
    configureHaptics({ enabled: hapticsEnabled })
    configureConfetti({ reduceMotion, theme: confettiById(theme) })
  }, [soundEnabled, hapticsEnabled, reduceMotion, volume, theme])
}

export function useJuice() {
  return useMemo(
    () => ({
      unlock() {
        Sound.unlock()
      },
      tap() {
        Sound.tap()
        Haptic.light()
      },
      select() {
        Sound.select()
        Haptic.selection()
      },
      correct(x?: number, y?: number) {
        Sound.correct()
        Haptic.success()
        Burst.pop(x, y)
      },
      combo(level: number) {
        Sound.combo(level)
        Haptic.medium()
      },
      wrong() {
        // Deliberately gentle: soft sound + a light warning tick, no big buzz.
        Sound.wrong()
        Haptic.warning()
      },
      coin() {
        Sound.coin()
        Haptic.light()
      },
      levelUp() {
        Sound.levelUp()
        Haptic.heavy()
        Burst.celebrate()
      },
      streak() {
        Sound.streak()
        Haptic.heavy()
        Burst.fire()
      },
      celebrate() {
        Sound.levelUp()
        Haptic.success()
        Burst.celebrate()
      },
      whoosh() {
        Sound.whoosh()
      },
    }),
    [],
  )
}
