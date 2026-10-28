// The "This week" rows that Home and the Monday digest BOTH carry — one copy.
//
// Home (`src/features/church/admin/HomePanel.tsx`) imports this for the rows
// below, and the `church-digest` Edge Function imports it to write the email,
// so the email can never say something Home doesn't. The digest is a SUBSET
// of Home on purpose (docs/CHURCH-DIGEST.md): the sermon week / Autopilot
// line, drafts waiting, flagged questions, inquiries waiting and the quiet
// count. Home's other rows (open days, the notice) stay Home-only.
//
// It lives in the church-digest folder rather than _shared so a change to it
// redeploys this function only (the deploy workflow redeploys EVERY function
// when _shared changes). Pure: no imports, no Deno or DOM APIs, plain data in and rows out — which is
// what lets both a Vite bundle and a Deno function load it. Dates are local
// calendar days ('YYYY-MM-DD'), formatted the way the dashboard formats them.

export type HomeGo =
  | { tab: 'plan'; date: string }
  | { tab: 'people'; quiet?: true; inquiries?: true }
  | { tab: 'page'; notice: true }

export type HomeRow = { key: string; icon: string; title: string; detail: string; go: HomeGo }

/** The parts of an auto-week job (0148/0152) the row reads. */
export interface HomeJob {
  status: string
  source: 'memo' | 'fallback'
  autopilot: boolean
  series: string
  references: string[]
  startDate: string
  saved: string[]
  flagged: number
  stale: boolean
  seen: boolean
  reason: string | null
}

export const jobRunning = (j: HomeJob) => !j.stale && j.status !== 'done' && j.status !== 'failed'
export const jobFailed = (j: HomeJob) => j.status === 'failed' || (j.stale && j.status !== 'done')
/** The job worth showing: running, failed/lost and not dismissed, or done and not yet seen. */
export const currentJob = <J extends HomeJob>(jobs: J[] | null | undefined): J | null =>
  jobs?.find((j) => jobRunning(j) || (!j.seen && (j.status === 'done' || jobFailed(j)))) ?? null

const REASONS: Record<string, string> = {
  model_busy: 'The drafting service was busy.',
  timeout: 'It took too long.',
  limit: 'Your church had used today’s drafts.',
  memo_limit: 'Your church had used today’s voice memos.',
  no_open_days: 'There weren’t two open days to draft into.',
  memo_format: 'That file type couldn’t be read — upload it as M4A, MP3 or WAV.',
  memo_too_long: 'The recording is over an hour.',
  memo_silent: 'We couldn’t hear speech in the recording.',
  memo_missing: 'The upload had expired — send the memo again.',
  not_saved: 'None of the days could be saved — they may have been filled meanwhile.',
  draft_failed: 'The draft didn’t come back usable.',
  no_addon: 'Content Generation isn’t on this church’s plan any more.',
  not_verified: 'The church isn’t verified right now.',
}
export const jobReason = (j: HomeJob) =>
  j.stale && j.status !== 'failed' ? 'It stopped partway through.' : REASONS[j.reason ?? ''] ?? 'Something went wrong on our side.'

/** What the week was drafted FROM: the sermon's passages, or Autopilot's fallback. */
export const jobFrom = (j: HomeJob) =>
  j.source === 'fallback' ? `your Autopilot fallback “${j.series}”` : `the sermon on ${j.references.join(', ')}`

const at = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return y && m && d ? new Date(y, m - 1, d, 12) : null
}
/** "Tue, Oct 28" — the strip's and the review's short day. */
export const shortDay = (iso: string) => at(iso)?.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) ?? iso
/** "Tuesday, Oct 28" — Home's long day. */
export const longDay = (iso: string) => at(iso)?.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) ?? iso
export const dayRange = (dates: string[]) =>
  dates.length ? (dates.length === 1 ? shortDay(dates[0]) : `${shortDay(dates[0])} – ${shortDay(dates[dates.length - 1])}`) : ''

/** The sermon-week / Autopilot row — Home's first row and the digest's. */
export function autoRow(job: HomeJob | null, autopilotSkipped: boolean, today: string): HomeRow | null {
  if (job) {
    const from = jobFrom(job)
    if (jobRunning(job)) return { key: 'auto', icon: job.source === 'fallback' ? '✈️' : '🎙️', title: `Your week from ${from} is being drafted`, detail: 'Nothing to do yet — it’ll be waiting on Plan. →', go: { tab: 'plan', date: job.startDate } }
    if (jobFailed(job)) return { key: 'auto', icon: '↻', title: `The week from ${from} didn’t finish`, detail: `${jobReason(job)} Retry it from Plan →`, go: { tab: 'plan', date: job.startDate } }
    return {
      key: 'auto', icon: job.autopilot ? '✈️' : '✨',
      title: job.autopilot ? 'Week drafted — review' : `Your week from ${from} is ready to review`,
      detail: `${job.saved.length} draft${job.saved.length === 1 ? '' : 's'}, ${dayRange(job.saved)}${job.autopilot ? `, from ${from}` : ''}${job.flagged ? ` · ⚠ ${job.flagged} to check` : ''}. Nothing is live until you approve it →`,
      go: { tab: 'plan', date: job.saved[0] ?? job.startDate },
    }
  }
  if (autopilotSkipped) return { key: 'autopilot', icon: '✈️', title: 'No source this week — Autopilot skipped', detail: 'No sermon memo arrived and no fallback is set, so nothing was drafted. Set a fallback on Plan →', go: { tab: 'plan', date: today } }
  return null
}

/** Drafts waiting and flagged questions, from the planner's 21-day window, in date order. */
export function draftRows(drafts: Array<{ date: string; flagged: number }>): HomeRow[] {
  const rows: HomeRow[] = []
  if (drafts.length) {
    rows.push({
      key: 'drafts', icon: '✎',
      title: `${drafts.length} ${drafts.length === 1 ? 'draft is' : 'drafts are'} waiting for your approval`,
      detail: `Members see nothing until you approve. First: ${longDay(drafts[0].date)} →`,
      go: { tab: 'plan', date: drafts[0].date },
    })
  }
  const flagged = drafts.filter((d) => d.flagged > 0)
  if (flagged.length) {
    const qs = flagged.reduce((n, d) => n + d.flagged, 0)
    rows.push({
      key: 'flags', icon: '⚠',
      title: `${qs} drafted ${qs === 1 ? 'question needs' : 'questions need'} a second look`,
      detail: `The answer check wasn’t sure the passage supports ${qs === 1 ? 'its answer' : 'their answers'}. ${longDay(flagged[0].date)} →`,
      go: { tab: 'plan', date: flagged[0].date },
    })
  }
  return rows
}

/**
 * Players asking about the church (0149). `firstName` is Home's one-asker
 * wording; the digest passes null so the email carries a count and no name.
 */
export function inquiryRow(count: number, firstName: string | null): HomeRow | null {
  if (!count) return null
  return {
    key: 'inquiries', icon: '✉',
    title: count === 1 ? (firstName ? `${firstName} asked about your church` : 'A player asked about your church') : `${count} players asked about your church`,
    detail: 'They wrote from a leader’s player card. Read them →',
    go: { tab: 'people', inquiries: true },
  }
}

/** Members (never leaders) with no play in seven days — a count, never who. */
export function quietRow(quiet: number): HomeRow | null {
  if (!quiet) return null
  return {
    key: 'quiet', icon: '✉',
    title: quiet === 1 ? 'Someone could use a check-in' : `${quiet} members could use a check-in`,
    detail: 'They haven’t played this week. A short note, with today’s verse if you’ve set one →',
    go: { tab: 'people', quiet: true },
  }
}

/** The dashboard link a row lands on (`ChurchAdminScreen` reads `?go=`). */
export function homeGoQuery(go: HomeGo): string {
  if (go.tab === 'plan') return `go=plan&date=${encodeURIComponent(go.date)}`
  if (go.tab === 'people') return `go=people${go.quiet ? '&focus=quiet' : go.inquiries ? '&focus=inquiries' : ''}`
  return 'go=page&focus=notice'
}

/** The reverse of `homeGoQuery`; null for anything it does not recognise. */
export function parseHomeGo(params: URLSearchParams): HomeGo | null {
  const go = params.get('go')
  if (go === 'plan') {
    const date = params.get('date') ?? ''
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? { tab: 'plan', date } : null
  }
  if (go === 'people') {
    const f = params.get('focus')
    return f === 'quiet' ? { tab: 'people', quiet: true } : f === 'inquiries' ? { tab: 'people', inquiries: true } : { tab: 'people' }
  }
  if (go === 'page') return { tab: 'page', notice: true }
  return null
}
