import { SCORING } from '@/lib/config'

// CPU opponent for a solo "real-time" Bible Battle. The CPU plays the SAME
// seeded quiz as the player, but instead of a network opponent we simulate its
// run: for each question we pre-roll whether it answers correctly and how long
// it "thinks" before locking in. The plan is deterministic from the battle seed
// (so a CPU can't be re-rolled mid-question) yet its answers reveal live, one at
// a time, alongside the player's — giving a head-to-head race feel.

export type CpuLevel = 'easy' | 'medium' | 'hard'

export interface CpuProfile {
  level: CpuLevel
  name: string
  emoji: string
  blurb: string
  /** Chance of answering any single question correctly. */
  accuracy: number
  /** Answer-time window (ms) the CPU picks within — lower = faster = more speed bonus. */
  minMs: number
  maxMs: number
}

export const CPU_PROFILES: Record<CpuLevel, CpuProfile> = {
  easy: { level: 'easy', name: 'Rookie', emoji: '🐣', blurb: 'Still learning the verses — a gentle warm-up.', accuracy: 0.55, minMs: 4200, maxMs: 9500 },
  medium: { level: 'medium', name: 'Deacon', emoji: '😎', blurb: 'Knows the good book well. A fair fight.', accuracy: 0.74, minMs: 2600, maxMs: 6200 },
  hard: { level: 'hard', name: 'Prophet', emoji: '🔥', blurb: 'Fast and nearly flawless. Bring your best.', accuracy: 0.9, minMs: 1500, maxMs: 4200 },
}

export const CPU_LEVELS: CpuLevel[] = ['easy', 'medium', 'hard']

export interface CpuStep {
  correct: boolean
  answerMs: number
}

// Small deterministic PRNG so a given (seed, difficulty) always plays the same.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function buildCpuPlan(seed: number, count: number, p: CpuProfile): CpuStep[] {
  const rng = mulberry32((seed ^ 0x9e3779b9 ^ Math.round(p.accuracy * 1000)) >>> 0)
  const cap = SCORING.answerWindowMs - 200 // always answer before the clock runs out
  const steps: CpuStep[] = []
  for (let i = 0; i < count; i++) {
    const correct = rng() < p.accuracy
    const answerMs = Math.min(cap, Math.round(p.minMs + rng() * (p.maxMs - p.minMs)))
    steps.push({ correct, answerMs })
  }
  return steps
}
