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
import { currentJob, dayRange, jobFrom, jobReason } from '../../../../supabase/functions/church-digest/home.ts'

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

// The reasons, the "drafted from" phrase and the range are shared with the
// Monday digest (supabase/functions/church-digest/home.ts), so Plan, Home and
// the email word a job the same way.
export const autoWeekFrom = (j: AutoWeekJob) => jobFrom(j)
export const autoWeekReason = (j: AutoWeekJob) => jobReason(j)

/** The job worth showing: running, failed/lost and not dismissed, or done and not yet seen. */
export function currentAutoWeek(jobs: AutoWeekJob[] | null): AutoWeekJob | null {
  return currentJob(jobs)
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

export const autoWeekRange = (dates: string[]) => dayRange(dates)

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
    if (!r.ok) return setErr(r.reason === 'limit' ? 'Your church had used today’s drafts.' : 'That didn’t start — try again in a moment.')
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
