// The exchanges the third format is built on, and the rule that stops it
// becoming the same two men every week.
//
// An EXCHANGE is a real question and its answer from the text: somebody asks,
// somebody replies, and the reply goes somewhere the asker did not expect.
// That is the reference account's setup-turn-payoff with no joke in it — the
// structure transfers, the register does not.
//
// **Face variety is the constraint here, not content supply.** Measured
// against the pool: 250 entries, 43 books, 88 of them in the gospels, and 39
// carrying a question or a reply in their own before/after metadata. Supply
// is fine. What is not fine is WHO SPEAKS — Jesus is the speaker on 80 of
// those 250 and Paul on 68, so the top two are 59% of everything. Picked by
// seed alone, this format is the same two faces by March, which is exactly
// the templated look the originality policies penalise.
//
// So the pick is ROTATED, the way `autoCast` rotates the morning reader:
// walk the pool from a fixed epoch and take the first exchange that reuses
// NOBODY from the last few posts. Deterministic, memoised, and derived from
// the date on both sides, so the dashboard and the runner agree.

export interface Exchange {
  id: string
  reference: string
  /** The pinned hook card — on screen for the whole video. */
  hook: string
  /** Who asks, and who answers: cast figure ids, both needing face renders. */
  asker: string
  answerer: string
  /** Their words, from the text. */
  question: string
  answer: string
  /** The whole-frame change saved for the end — their ducks, our arithmetic. */
  payoff: string
}

/**
 * How many posts back a SPEAKER may not reappear from.
 *
 * Three a week, so 5 is a little under a fortnight of distance between two
 * appearances of the same face. Larger starves the pick — Jesus answers most
 * of the gospel exchanges, so demanding he sit out a month means either an
 * exhausted pool or a rule that silently gives up. `pickExchange` falls back
 * to the least-recently-used rather than repeating, so the failure mode is a
 * shorter gap and never a crash.
 */
export const SPEAKER_MEMORY = 5

/** A speaker is anyone on screen, asker or answerer: both faces are the post. */
export const speakersOf = (e: Exchange): string[] => [e.asker, e.answerer]

/**
 * The next exchange, given what the last few posts used.
 *
 * `recent` is newest-first. Returns the first candidate sharing NO speaker
 * with the window; if every candidate collides — which it will once the bank
 * is small relative to the memory — the one whose speakers were used longest
 * ago, so the rule degrades to "as far apart as possible" instead of failing.
 */
export function pickExchange(pool: Exchange[], recent: Exchange[], used: Set<string>): Exchange | null {
  const fresh = pool.filter((e) => !used.has(e.id))
  if (!fresh.length) return null
  const window = recent.slice(0, SPEAKER_MEMORY).flatMap(speakersOf)
  const clean = fresh.filter((e) => !speakersOf(e).some((s) => window.includes(s)))
  if (clean.length) return clean[0]
  // Nothing clean: the least-recently-seen speakers win. `lastSeen` is the
  // distance back to this exchange's most recent speaker, so a bigger number
  // is a longer rest.
  const lastSeen = (e: Exchange) => Math.min(...speakersOf(e).map((s) => {
    const i = recent.findIndex((r) => speakersOf(r).includes(s))
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }))
  return fresh.slice().sort((a, b) => lastSeen(b) - lastSeen(a))[0]
}

/**
 * The bank. Ordered as authored; the rotation decides what actually airs, so
 * adding one here never re-deals the ones already scheduled — the lesson the
 * season's quest pools learned the hard way.
 */
export const EXCHANGES: Exchange[] = [
  {
    id: 'forgive-seventy',
    reference: 'Matthew 18:21-22',
    hook: 'Peter thought seven was generous',
    asker: 'cephas',
    answerer: 'jesus',
    question: 'Lord, how many times shall I forgive my brother who sins against me? Up to seven times?',
    answer: 'I tell you, not seven times, but seventy times seven.',
    payoff: '490',
  },
]
