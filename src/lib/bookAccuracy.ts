// Per-book accuracy — the "what do I actually know?" layer.
//
// Every quiz question the player answers is tagged with the book of the verse it
// came from (daily drop, practice replay, focus drill, CPU race, real battle) and
// rolled up into a running correct/answered tally per book. That tally is what
// the Study tab's review chart reads: it turns a pile of plays into "Psalms is
// solid, Romans needs another look", and gives Focus practice an obvious target.
//
// Deliberately mode-blind: accuracy is about knowledge, not rank, so a battle
// answer counts exactly the same as a daily one. Nothing here awards XP.

export interface BookStat {
  book: string
  correct: number
  answered: number
  /** Local date (YYYY-MM-DD) this book was last answered on. */
  lastPlayedOn: string | null
}

export type BookAccuracy = Record<string, BookStat>

// Below this many answers a book has no meaningful accuracy yet — it's shown as
// "just started" rather than being ranked as weak off one unlucky question.
export const MIN_ANSWERS_FOR_TIER = 5

// Tier thresholds, in percent. Chosen against the 5-question run: 4/5 = solid,
// 3/5 = getting there, 2/5 or worse = worth another look.
export const STRONG_PCT = 80
export const STEADY_PCT = 60

export type BookTier = 'strong' | 'steady' | 'shaky' | 'new'

// Tier presentation. The colors are the app's own tokens, checked for colorblind
// separation against the card surface (mint/gold/coral clear the deutan+protan
// gates that green/amber does not) — and every row still carries the tier's text
// label, so tier never rides on color alone.
export const TIERS: Record<BookTier, { label: string; color: string; blurb: string }> = {
  strong: { label: 'Solid', color: 'var(--mint)', blurb: 'you know this book' },
  steady: { label: 'Getting there', color: 'var(--gold)', blurb: 'close — one more pass' },
  shaky: { label: 'Needs review', color: 'var(--coral)', blurb: 'worth drilling' },
  new: { label: 'Just started', color: 'var(--ink-faint)', blurb: 'answer a few more' },
}

export function emptyStat(book: string): BookStat {
  return { book, correct: 0, answered: 0, lastPlayedOn: null }
}

/** Whole-percent accuracy, 0 when the book has no answers yet. */
export function accuracyPct(s: Pick<BookStat, 'correct' | 'answered'>): number {
  if (s.answered <= 0) return 0
  return Math.round((s.correct / s.answered) * 100)
}

export function tierOf(s: BookStat): BookTier {
  if (s.answered < MIN_ANSWERS_FOR_TIER) return 'new'
  const pct = accuracyPct(s)
  if (pct >= STRONG_PCT) return 'strong'
  if (pct >= STEADY_PCT) return 'steady'
  return 'shaky'
}

/** Fold one finished run into the tally. Pure — returns a new map. */
export function mergeRun(
  prev: BookAccuracy,
  book: string,
  correct: number,
  answered: number,
  day: string,
): BookAccuracy {
  if (!book || answered <= 0) return prev
  const cur = prev[book] ?? emptyStat(book)
  return {
    ...prev,
    [book]: {
      book,
      correct: cur.correct + Math.max(0, Math.min(correct, answered)),
      answered: cur.answered + answered,
      lastPlayedOn: day,
    },
  }
}

/**
 * Review order — weakest first, which is the whole point of the chart. Books
 * with too few answers to judge sink to the bottom (they're an invitation, not
 * a verdict), and ties break on volume so a well-sampled book outranks a thin one.
 */
const TIER_RANK: Record<BookTier, number> = { shaky: 0, steady: 1, strong: 2, new: 3 }

export function reviewOrder(stats: BookAccuracy): BookStat[] {
  return Object.values(stats)
    .filter((s) => s.answered > 0)
    .sort((a, b) => {
      const t = TIER_RANK[tierOf(a)] - TIER_RANK[tierOf(b)]
      if (t !== 0) return t
      const p = accuracyPct(a) - accuracyPct(b)
      if (p !== 0) return p
      if (b.answered !== a.answered) return b.answered - a.answered
      return a.book.localeCompare(b.book)
    })
}

export interface AccuracySummary {
  books: number
  correct: number
  answered: number
  pct: number
  /** The book most worth drilling next, or null when nothing qualifies yet. */
  weakest: BookStat | null
  /** The best-known book (needs a real sample), or null. */
  best: BookStat | null
}

export function summarize(stats: BookAccuracy): AccuracySummary {
  const list = Object.values(stats).filter((s) => s.answered > 0)
  const correct = list.reduce((n, s) => n + s.correct, 0)
  const answered = list.reduce((n, s) => n + s.answered, 0)
  const rated = list.filter((s) => tierOf(s) !== 'new')
  const byPct = [...rated].sort((a, b) => accuracyPct(a) - accuracyPct(b))
  const weakest = byPct.find((s) => tierOf(s) !== 'strong') ?? null
  const best = byPct.length ? byPct[byPct.length - 1] : null
  return {
    books: list.length,
    correct,
    answered,
    pct: answered > 0 ? Math.round((correct / answered) * 100) : 0,
    weakest,
    best: best && accuracyPct(best) >= STEADY_PCT ? best : null,
  }
}
