// Particle bursts via canvas-confetti. Respects the reduce-motion setting.

import confetti from 'canvas-confetti'
import type { ConfettiDef } from '@/data/season'

let motionOn = true

// The house palette, and what every player starts on. A seasonal confetti theme
// (data/season) swaps these colors — and only the colors. A theme changes what
// is drawn, never WHETHER motion happens: reduce-motion is still the last word
// below, which is why the theme is kept separate from `motionOn`.
const ARCADE_COLORS = ['#ffd23f', '#ff6b6b', '#4ecdc4', '#a06bff', '#5ee7df', '#ff9f1c']

let colors: string[] = ARCADE_COLORS
let shapes: ('circle' | 'square')[] | undefined

export function configureConfetti(opts: { reduceMotion?: boolean; theme?: ConfettiDef | null }) {
  if (opts.reduceMotion !== undefined) motionOn = !opts.reduceMotion
  if (opts.theme !== undefined) {
    colors = opts.theme?.colors?.length ? opts.theme.colors : ARCADE_COLORS
    shapes = opts.theme?.shapes
  }
}

export const Burst = {
  // A small pop at a point (0..1 relative coords) — for correct answers.
  pop(x = 0.5, y = 0.5) {
    if (!motionOn) return
    confetti({
      particleCount: 26,
      spread: 60,
      startVelocity: 32,
      origin: { x, y },
      colors,
      shapes,
      scalar: 0.9,
      ticks: 120,
    })
  },
  // Big celebration — for level up / streak milestones / finishing a run.
  celebrate() {
    if (!motionOn) return
    const shots = [0, 180, 360]
    shots.forEach((delay) =>
      setTimeout(() => {
        confetti({ particleCount: 70, spread: 100, startVelocity: 45, origin: { x: 0.5, y: 0.6 }, colors, shapes })
        confetti({ particleCount: 40, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors, shapes })
        confetti({ particleCount: 40, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors, shapes })
      }, delay),
    )
  },
  // Streak flames — warm palette raining up. Deliberately NOT themed: this one
  // is the streak's own colour language, and a pale "Doves" streak burst read
  // as a bug rather than a choice.
  fire() {
    if (!motionOn) return
    confetti({
      particleCount: 50,
      spread: 55,
      startVelocity: 40,
      origin: { x: 0.5, y: 0.8 },
      colors: ['#ff6b6b', '#ff9f1c', '#ffd23f'],
      shapes: ['circle'],
      scalar: 1.1,
    })
  },
  /** Fire a specific theme once, without equipping it — the confetti tile in the
   *  picker is the one cosmetic you can't judge by looking at it. */
  preview(theme: ConfettiDef) {
    if (!motionOn) return
    confetti({
      particleCount: 34,
      spread: 70,
      startVelocity: 34,
      origin: { x: 0.5, y: 0.55 },
      colors: theme.colors,
      shapes: theme.shapes,
      scalar: 0.95,
      ticks: 130,
    })
  },
}
