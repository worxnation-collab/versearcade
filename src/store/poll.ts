import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { dealFingerprint, type AnswerPoll } from '@/data/poll'
import type { Question } from '@/types'

// The day's answer poll, read once per deal. Design: data/poll.ts + 0100.
//
// ONLINE-ONLY, inherited rather than chosen — the same break with the two-mode
// invariant store/firstLight.ts makes, for the same reason: a poll needs
// everybody else. Offline there is one player, so every bar would be 100% and
// say nothing. A guest online can still SEE it (daily_answer_poll is granted
// to anon); a guest's own answers are not counted (see the migration header),
// which is the pitch for the account.
//
// Read-only on purpose. The WRITE is not here: the run's choices ride into
// submit_play with the play itself (store/game.ts), so the tally is written
// exactly once per account per day by the same unique key that guards the
// play. A store with its own writer would be a second vote.
//
// Fails closed: no keys, a server without 0100, a network error — all of it is
// an empty poll, and the feedback screen renders nothing for it.

interface PollState {
  /** Keyed `${date}:${deal}` so a midnight rollover or a replay can't show the wrong day. */
  polls: Record<string, AnswerPoll>
  load: (date: string, questions: Question[]) => Promise<void>
  /** The poll for this deal, if the server released any of its questions. */
  get: (date: string, questions: Question[]) => AnswerPoll | null
}

const keyOf = (date: string, questions: Question[]) => `${date}:${dealFingerprint(questions)}`

function parse(raw: unknown): AnswerPoll {
  const out: AnswerPoll = {}
  const qs = (raw as { questions?: unknown } | null)?.questions
  if (!qs || typeof qs !== 'object') return out
  for (const [k, v] of Object.entries(qs as Record<string, unknown>)) {
    const qi = Number(k)
    if (!Number.isInteger(qi) || qi < 0 || !Array.isArray(v)) continue
    const counts = v.map((n) => (typeof n === 'number' && n >= 0 ? Math.floor(n) : 0))
    if (counts.length === 4) out[qi] = counts
  }
  return out
}

export const usePoll = create<PollState>((set, get) => ({
  polls: {},

  async load(date, questions) {
    if (!supabase || !questions.length) return
    const deal = dealFingerprint(questions)
    const { data, error } = await supabase.rpc('daily_answer_poll', { p_drop_date: date, p_deal: deal })
    if (error) return // a server without 0100: no poll, no error
    set((s) => ({ polls: { ...s.polls, [`${date}:${deal}`]: parse(data) } }))
  },

  get(date, questions) {
    return get().polls[keyOf(date, questions)] ?? null
  },
}))
