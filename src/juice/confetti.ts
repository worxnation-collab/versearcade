// Particle bursts via canvas-confetti. Respects the reduce-motion setting.

import confetti from 'canvas-confetti'

let motionOn = true
export function configureConfetti(opts: { reduceMotion?: boolean }) {
  if (opts.reduceMotion !== undefined) motionOn = !opts.reduceMotion
}

const ARCADE_COLORS = ['#ffd23f', '#ff6b6b', '#4ecdc4', '#a06bff', '#5ee7df', '#ff9f1c']

export const Burst = {
  // A small pop at a point (0..1 relative coords) — for correct answers.
  pop(x = 0.5, y = 0.5) {
    if (!motionOn) return
    confetti({
      particleCount: 26,
      spread: 60,
      startVelocity: 32,
      origin: { x, y },
      colors: ARCADE_COLORS,
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
        confetti({ particleCount: 70, spread: 100, startVelocity: 45, origin: { x: 0.5, y: 0.6 }, colors: ARCADE_COLORS })
        confetti({ particleCount: 40, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors: ARCADE_COLORS })
        confetti({ particleCount: 40, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors: ARCADE_COLORS })
      }, delay),
    )
  },
  // Streak flames — warm palette raining up.
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
}
