import { useCallback, useEffect, useRef, useState } from 'react'
import { useJuice } from '@/juice/useJuice'
import {
  autoWeekFailed,
  autoWeekRunning,
  dismissAutoWeek,
  fetchAutoWeeks,
  retryAutoWeek,
  type AutoWeekJob,
} from '@/store/churchAdmin'

// Record Sunday, review Monday (0148) — what became of a sermon memo that was
// handed to the server to draft its own week.
//
// `useAutoWeeks` reads the church's recent jobs (`church_auto_weeks`) and, while
// one is running, looks again every 15 seconds so Plan turns from "drafting"
// to "ready" without a reload. `AutoWeekCard` is Plan's line for the latest job
// that still means something: running, ready (until it has been seen), or
// failed / lost — with Retry when the job kept what it needs (the transcript,
// or the upload), and Dismiss. Home draws the same job as a to-do row.
//
// Nothing here approves anything. "Ready" means drafts waiting in Review.

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
/** What the week was drafted FROM: the sermon's passages, or Autopilot's fallback (0152). */
export const autoWeekFrom = (j: AutoWeekJob) =>
  j.source === 'fallback' ? `your Autopilot fallback “${j.series}”` : `the sermon on ${j.references.join(', ')}`

export const autoWeekReason = (j: AutoWeekJob) =>
  j.stale && j.status !== 'failed' ? 'It stopped partway through.' : REASONS[j.reason ?? ''] ?? 'Something went wrong on our side.'

/** The job worth showing: running, failed/lost and not dismissed, or done and not yet seen. */
export function currentAutoWeek(jobs: AutoWeekJob[] | null): AutoWeekJob | null {
  if (!jobs) return null
  return jobs.find((j) => autoWeekRunning(j) || (!j.seen && (j.status === 'done' || autoWeekFailed(j)))) ?? null
}

export function useAutoWeeks(churchId: string, enabled: boolean) {
  const [jobs, setJobs] = useState<AutoWeekJob[] | null>(null)
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const reload = useCallback(async () => {
    if (!enabled) return
    const r = await fetchAutoWeeks(churchId)
    if (alive.current && r.ok) setJobs(r.data)
  }, [churchId, enabled])
  useEffect(() => { void reload() }, [reload])
  const running = !!jobs?.some(autoWeekRunning)
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => void reload(), 15_000)
    return () => clearInterval(t)
  }, [running, reload])
  return { jobs, reload }
}

const day = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return y && m && d ? new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : iso
}
export const autoWeekRange = (dates: string[]) =>
  dates.length ? (dates.length === 1 ? day(dates[0]) : `${day(dates[0])} – ${day(dates[dates.length - 1])}`) : ''

export function AutoWeekCard({
  churchId,
  jobs,
  reload,
  onLanded,
}: {
  churchId: string
  jobs: AutoWeekJob[] | null
  reload: () => Promise<void>
  /** A job finished while on screen: re-read the strip and the review. */
  onLanded: () => void
}) {
  const juice = useJuice()
  const job = currentAutoWeek(jobs)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const was = useRef<{ id: string; status: string } | null>(null)

  // Landed while open → refresh the planner; a "ready" job seen here is marked
  // seen so Home stops announcing it (the card stays for this visit).
  const [shown, setShown] = useState<AutoWeekJob | null>(null)
  useEffect(() => {
    if (!job) return
    const prev = was.current
    was.current = { id: job.id, status: job.status }
    setShown(job)
    if (job.status === 'done') {
      if (prev && prev.id === job.id && prev.status !== 'done') onLanded()
      if (!job.seen) void dismissAutoWeek(job.id)
    }
  }, [job?.id, job?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  const show = job ?? (shown?.status === 'done' ? shown : null)
  if (!show) return null

  const retry = async () => {
    setBusy(true); setErr(null)
    const r = await retryAutoWeek(churchId, show.id)
    setBusy(false)
    if (!r.ok) return setErr(r.reason === 'limit' ? REASONS.limit : 'That didn’t start — try again in a moment.')
    juice.select?.()
    await reload()
  }
  const dismiss = async () => {
    setBusy(true)
    await dismissAutoWeek(show.id)
    setBusy(false)
    setShown(null)
    await reload()
  }

  const from = autoWeekFrom(show)
  const running = autoWeekRunning(show)
  const failed = autoWeekFailed(show)
  return (
    <div
      className="card"
      data-auto-week={running ? 'running' : failed ? 'failed' : 'done'}
      role="status"
      style={{ padding: '11px 13px', display: 'grid', gap: 6, borderColor: failed ? 'var(--coral)' : 'var(--gold)' }}
    >
      <b style={{ fontSize: 13.5, lineHeight: 1.35 }}>
        {running
          ? `${show.source === 'fallback' ? '✈️' : '🎙️'} Drafting your week from ${from}…`
          : failed
            ? `The week from ${from} didn’t finish`
            : show.autopilot
              ? `✈️ Week drafted — review (from ${from})`
              : `✨ Your week from ${from} is ready to review`}
      </b>
      <span className="dim" style={{ fontSize: 12, lineHeight: 1.45 }}>
        {running
          ? `${show.source === 'fallback' ? 'Writing the days.' : show.status === 'drafting' ? 'Transcribed — now writing the days.' : 'Listening to the recording.'} You can close the app; the drafts will be waiting here.`
          : failed
            ? `${autoWeekReason(show)} Anything it had used was given back.${show.retryable ? '' : show.source === 'fallback' ? '' : ' Upload the memo again to start over.'}`
            : `${show.saved.length} draft${show.saved.length === 1 ? '' : 's'}, ${autoWeekRange(show.saved)}, in “${show.series}”.` +
              (show.flagged ? ` ${show.flagged} question${show.flagged === 1 ? '' : 's'} marked ⚠ to check.` : '') +
              ' Nothing is live until you approve it — see step 3.'}
      </span>
      {failed && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {show.retryable && (
            <button className="pill" disabled={busy} onClick={retry} style={{ fontSize: 12.5, fontWeight: 800 }}>
              {busy ? 'Starting…' : 'Retry'}
            </button>
          )}
          <button className="pill" disabled={busy} onClick={dismiss} style={{ fontSize: 12.5 }}>Dismiss</button>
        </div>
      )}
      {err && <span style={{ fontSize: 12, color: 'var(--coral)' }}>{err}</span>}
    </div>
  )
}
