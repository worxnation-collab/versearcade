import { fetchDays, useDraftAllowance, type VerseBackend, type WeekDay } from '@/store/churchAdmin'

// What the two week panels (WeekDraftPanel, StudyTopicWeek) share about a run
// of the content engine since 0142, kept in one place so they cannot drift:
// the words for its failures, the sentence a finished run ends on, the
// allowance line, and the recovery that runs when no answer came back at all.

/** The engine's own failures — the same words in every panel that drafts. */
export const ENGINE_REASONS: Record<string, string> = {
  limit: 'That’s more drafting than your church has left for today. Try fewer days, or tomorrow.',
  model_busy: 'The drafting engine is busy — try again in a minute. Nothing was used up.',
  timeout: 'That took too long to draft — try again, or try fewer days. Nothing was used up.',
  no_key: 'Drafting isn’t set up on the server right now. Nothing was used up — please let us know.',
  not_saved: 'The days were drafted but none could be saved — they may have gone live meanwhile. Nothing was used up.',
  no_reply: 'Lost the connection before the drafts came back, and none have landed — try again. Nothing was used up.',
}

const pretty = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const list = (ds: string[]) => ds.map(pretty).join(', ')
const was = (n: number) => (n === 1 ? 'was' : 'were')

/** The sentence a run ends on, from what the server actually did. */
export function outcomeText(
  lead: string,
  saved: string[],
  refused: { date: string; reason: string }[],
  missing: string[],
): string {
  const live = refused.filter((r) => r.reason === 'day_is_set').map((r) => r.date)
  const other = refused.filter((r) => r.reason !== 'day_is_set').map((r) => r.date)
  return (
    `${lead} ${saved.length} day${saved.length === 1 ? '' : 's'}, ${pretty(saved[0])}${saved.length > 1 ? ` – ${pretty(saved[saved.length - 1])}` : ''}. ` +
    `Nothing is live yet — review them below.` +
    (missing.length ? ` ${list(missing)} came back unusable and ${was(missing.length)} left empty.` : '') +
    (live.length ? ` ${list(live)} went live while this was drafting and ${was(live.length)} left alone.` : '') +
    (other.length ? ` ${list(other)} couldn’t be saved.` : '')
  )
}

/** "Uses N of today's drafts", with what's left once the engine has said. */
export function AllowanceLine({ churchId, units }: { churchId: string; units: number }) {
  const left = useDraftAllowance((s) => s.left[churchId])
  if (left == null) return <>Uses {units} of your church’s drafts for today.</>
  if (left < units) return <span style={{ color: 'var(--coral)' }}>Needs {units} drafts — your church has {left} left today.</span>
  return <>Uses {units} of your church’s drafts for today — {left} left.</>
}

const dayKey = (w: WeekDay) => (w.verse ? JSON.stringify([w.verse.status, w.verse.reference, w.verse.text, w.verse.series, w.verse.questions]) : '')

/**
 * No answer came back (the connection dropped, the phone suspended the tab),
 * but the function may have finished and saved the drafts anyway. So before
 * any error is shown, re-read the planned dates: a date that now holds a DRAFT
 * different from what it held before the run is this run's work. The function
 * saves every day together at its end, so the first read that shows any of
 * them shows all of them; until then, look again a few times across the
 * function's own time budget.
 */
export async function recoverLanded(
  churchId: string,
  backend: VerseBackend,
  before: WeekDay[],
  dates: string[],
  alive: () => boolean,
): Promise<string[]> {
  if (!dates.length) return []
  const sorted = [...dates].sort()
  const span = Math.min(42, Math.round((Date.parse(sorted[sorted.length - 1]) - Date.parse(sorted[0])) / 86_400_000) + 1)
  const was = new Map(before.map((w) => [w.date, dayKey(w)]))
  for (const wait of [0, 10_000, 20_000, 30_000, 40_000]) {
    if (wait) await new Promise((r) => setTimeout(r, wait))
    if (!alive()) return []
    const r = await fetchDays(churchId, sorted[0], span, backend)
    if (!r.ok) continue
    const landed = r.data
      .filter((w) => dates.includes(w.date) && w.verse?.status === 'draft' && dayKey(w) !== (was.get(w.date) ?? ''))
      .map((w) => w.date)
    if (landed.length) return landed
  }
  return []
}
