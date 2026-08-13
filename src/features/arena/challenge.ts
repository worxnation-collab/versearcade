// Arena — async 1v1 "challenge a friend" engine (Phase 1).
//
// Design decisions (locked with the user):
//  • Opt-in Arena, walled off from the warm daily loop.
//  • Async first: the challenger plays 10 questions, then shares a link; the
//    opponent plays the SAME 10 and sees a head-to-head result. Real-time
//    synchronized duels are a later phase.
//  • Questions are drawn from the last 5 GLOBAL daily verses, so both players
//    face an identical, fair set with no shared history required.
//
// The whole challenge fits in the invite link: because daily verses are
// deterministic from their date, we only need to ship an anchor date + a seed,
// and both apps rebuild byte-identical questions. No backend needed for the duel
// itself (the opt-in ranking, later, is the only part that needs the server).

import type { Question } from '@/types'
import { getVerseForDate } from '@/data/bible/questions'
import { todayLocalDate } from '@/lib/date'

export const DUEL_VERSE_WINDOW = 5 // last N daily verses to draw from
export const DUEL_QUESTIONS = 10 // questions per duel

export interface DuelQuestion extends Question {
  /** The verse this question is about, surfaced since a duel mixes verses. */
  reference: string
  verseText: string
}

export interface ChallengePayload {
  by: string // challenger's @username
  anchor: string // YYYY-MM-DD — the most recent verse in the pool
  seed: number // deterministic question pick + order
  score: number // challenger's score to beat
  timeMs: number // challenger's total answer time (tiebreak / speed flex)
}

// The five verse dates the duel pulls from: the anchor day and the four before.
export function duelVerseDates(anchor: string = todayLocalDate()): string[] {
  const dates: string[] = []
  const [y, m, d] = anchor.split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1, d))
  for (let i = 0; i < DUEL_VERSE_WINDOW; i++) {
    const dt = new Date(base)
    dt.setUTCDate(base.getUTCDate() - i)
    dates.push(dt.toISOString().slice(0, 10))
  }
  return dates
}

// Small, fast, seedable PRNG (mulberry32) — deterministic across devices so both
// players get the same pick and order from the same seed.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// A fresh random seed for a new challenge (challenger side only; the opponent
// reuses the seed carried in the link).
export function newSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0
}

// Assemble the exact 10 duel questions from an anchor date + seed. Pure and
// deterministic: same inputs → identical output on every device.
export function assembleDuel(anchor: string, seed: number): DuelQuestion[] {
  const pool: DuelQuestion[] = []
  for (const date of duelVerseDates(anchor)) {
    const v = getVerseForDate(date)
    for (const q of v.questions) {
      pool.push({ ...q, reference: v.reference, verseText: v.text })
    }
  }
  // Seeded Fisher–Yates, then take the first DUEL_QUESTIONS.
  const rng = mulberry32(seed)
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, Math.min(DUEL_QUESTIONS, pool.length))
}

// ── Challenge link encode / decode (URL-safe base64 of compact JSON) ──────────

function toBase64Url(s: string): string {
  const b64 = typeof btoa !== 'undefined' ? btoa(s) : Buffer.from(s, 'utf8').toString('base64')
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  return typeof atob !== 'undefined' ? atob(b64) : Buffer.from(b64, 'base64').toString('utf8')
}

// Compact array form keeps the link short.
export function encodeChallenge(p: ChallengePayload): string {
  return toBase64Url(JSON.stringify([p.by, p.anchor, p.seed, p.score, p.timeMs]))
}

export function decodeChallenge(token: string): ChallengePayload | null {
  try {
    const raw = JSON.parse(fromBase64Url(token))
    if (!Array.isArray(raw) || raw.length < 5) return null
    const [by, anchor, seed, score, timeMs] = raw
    if (typeof by !== 'string' || typeof anchor !== 'string') return null
    if (![seed, score, timeMs].every((n) => typeof n === 'number' && Number.isFinite(n))) return null
    return { by, anchor, seed, score, timeMs }
  } catch {
    return null
  }
}

// Duel scoring mirrors the daily loop's spirit: reward correctness first, then
// speed. Kept here so both the challenger's run and the opponent's replay score
// identically. (Tuning shared with the eventual server check for ranked play.)
export const DUEL_BASE_PER_CORRECT = 100
export const DUEL_MAX_SPEED_BONUS = 100
export const DUEL_ANSWER_WINDOW_MS = 12000

export function scoreDuelAnswer(correct: boolean, timeMs: number): number {
  if (!correct) return 0
  const frac = Math.max(0, 1 - timeMs / DUEL_ANSWER_WINDOW_MS)
  return DUEL_BASE_PER_CORRECT + Math.round(DUEL_MAX_SPEED_BONUS * frac)
}
