// The quiz run that is happening RIGHT NOW, parked on the device.
//
// Why this exists: a quiz you can walk out of is a quiz you can re-deal. The
// daily drop's five questions are deterministic for the date, a practice replay
// is the same verse every time and an accepted battle is a fixed seed — so
// abandoning a run that is going badly and starting it again is a retry with
// the answers already known. `QuizRunner` locks the run for that reason (see
// its `locked`), and this is the other half of the same rule: whatever gets a
// player out of the screen anyway — a reload, a killed app, a crash — brings
// them back to the SAME question rather than to a clean slate.
//
// **The clock never stops, and that is the load-bearing part.** A parked run
// stores when the current question's window opened as WALL time, and resuming
// computes what is left of it from that — so stepping out to think (or to look
// the answer up) costs exactly what sitting there costs, and a question whose
// window has passed lands on its teach card the moment you come back. Without
// that, "resume" would be a pause button on a timed question, which is the
// thing being closed rather than a smaller version of it.
//
// DEVICE-LOCAL in both modes, and that is a deliberate break with the two-mode
// invariant of the same kind `store/looks.ts` and `store/crossword.ts` make.
// A half-finished run grants NOTHING — every reward in this app is paid by
// `onComplete`, which only fires when the run ends — so there is nothing here
// to farm by clearing it, and clearing it by hand costs you your progress
// rather than buying you anything. It is a scratch note about what this device
// is doing in the next ninety seconds, not a possession. If it ever should
// follow the account, the shape is the house one: a
// `quiz_runs(user_id, run_id, snapshot jsonb, updated_at)` table behind a
// security-definer upsert, with this as the local mirror — `store/bible.ts` is
// the store to copy.
//
// One slot per device: exactly one quiz can be in flight at a time, because a
// run fills the whole screen. A record for a different run simply overwrites
// it, which is also how yesterday's abandoned drop stops existing.

import { useAuth } from '@/store/auth'

export interface RunAnswer {
  choiceIndex: number
  correct: boolean
  timeMs: number
  points: number
}

export interface RunSnapshot {
  /** Identifies the deal — `daily:2026-09-01`, `practice:2026-08-04`, `battle:<id>`. */
  runId: string
  /** The verse the run was dealt from; a mismatch discards the record. */
  reference: string
  /** Question index the player is on. */
  qi: number
  score: number
  combo: number
  comboMax: number
  /** One entry per question already locked in — `qi` of them, or `qi + 1` on a teach card. */
  answers: RunAnswer[]
  /**
   * Epoch ms the CURRENT question's window opened, or null while the teach card
   * is up (nothing is being timed then). Wall time on purpose — see the header.
   */
  questionStartedAt: number | null
  savedAt: number
}

function key(): string {
  const uid = useAuth.getState().profile?.id
  return uid ? `va.run.${uid}` : 'va.run.guest'
}

function isAnswer(a: unknown): a is RunAnswer {
  const r = a as RunAnswer
  return (
    !!r &&
    typeof r === 'object' &&
    typeof r.choiceIndex === 'number' &&
    typeof r.correct === 'boolean' &&
    typeof r.timeMs === 'number' &&
    typeof r.points === 'number'
  )
}

/**
 * The parked run for this deal, or null.
 *
 * Fails closed the way every reader in this app does: anything it cannot read
 * as a run of `questionCount` questions on `reference` is discarded and the
 * player is dealt a fresh one, because a half-restored run would be worse than
 * no restore at all.
 */
export function readRun(runId: string, reference: string, questionCount: number): RunSnapshot | null {
  let snap: RunSnapshot | null = null
  try {
    snap = JSON.parse(localStorage.getItem(key()) || 'null') as RunSnapshot | null
  } catch {
    return null
  }
  if (!snap || typeof snap !== 'object') return null
  if (snap.runId !== runId || snap.reference !== reference) return null
  if (!Array.isArray(snap.answers) || !snap.answers.every(isAnswer)) return null
  if (typeof snap.qi !== 'number' || snap.qi < 0 || snap.qi >= questionCount) return null
  if (typeof snap.score !== 'number' || typeof snap.combo !== 'number' || typeof snap.comboMax !== 'number') return null
  const onTeachCard = snap.questionStartedAt === null
  if (!onTeachCard && typeof snap.questionStartedAt !== 'number') return null
  // The two halves have to agree about where the run is: `qi` answers banked
  // while a question is up, one more while its teach card is.
  if (snap.answers.length !== snap.qi + (onTeachCard ? 1 : 0)) return null
  return snap
}

export function saveRun(snap: RunSnapshot) {
  try {
    localStorage.setItem(key(), JSON.stringify(snap))
  } catch {
    /* private mode / storage full — the run stays in memory and finishes fine;
       all that is lost is the ability to come back to it after a reload. */
  }
}

/** Called when a run ENDS. Scoped to the run so a stale call can't drop a newer one. */
export function clearRun(runId: string) {
  try {
    const raw = JSON.parse(localStorage.getItem(key()) || 'null') as RunSnapshot | null
    if (raw && raw.runId !== runId) return
    localStorage.removeItem(key())
  } catch {
    /* nothing readable to clear */
  }
}
