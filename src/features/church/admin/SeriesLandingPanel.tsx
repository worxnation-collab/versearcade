import { useEffect, useState } from 'react'
import { fetchSeriesLanding, type SeriesLanding } from '@/store/churchAdmin'
import { useJuice } from '@/juice/useJuice'
import { todayLocalDate } from '@/lib/date'
import { shareFile } from '@/lib/postcard'

// "How your series are landing" — Home, under the to-do (0150).
//
// One row per series the church has run or scheduled, newest first: its days,
// whether it is running, finished or still ahead, and two numbers about the
// CONGREGATION — how many members played at least one of its live days
// (engaged) and how many played every one (completed; "kept up so far" while
// it is still running). Both are out of the church's current members. Then one
// trend line: the newest series with a live day against the one before it.
//
// What it never shows is a person. No names, no who-finished, no ordering of
// anybody: the roster with names is the People tab's, and this is the room as
// a whole. Nothing here is drawn as a ranking of series either — they are in
// date order, the order a pastor preached them.
//
// "Export summary" (0156 batch): a one-page PDF of the last three series with
// something live — name, dates, engaged % and completed % — built on the
// device by `lib/seriesSummary.ts` through the Sunday pack's PDF writer. The
// same totals as the rows above, the same definitions printed on the page,
// and no name anywhere. Verified leadership only: Home mounts this panel only
// for a verified church, so a free claim sees no series numbers.
//
// Renders nothing when the church has no named series (or the server predates
// 0150): a section that only says "no series yet" is noise on Home.

const day = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return y && m && d ? new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : iso
}

/** The newest series with something live, against the one before it. */
export function seriesTrend(series: SeriesLanding[]): string | null {
  const measured = series.filter((s) => s.engagedPct != null)
  if (measured.length < 2) return null
  const [now, before] = measured
  const a = now.engagedPct!, b = before.engagedPct!
  const verb = a > b ? `up from ${b}%` : a < b ? `down from ${b}%` : `the same as`
  return a === b
    ? `${now.name}: ${a}% engaged — the same as ${before.name}.`
    : `${now.name}: ${a}% engaged, ${verb} on ${before.name}.`
}

export function SeriesLandingPanel({ churchId, churchName }: { churchId: string; churchName: string }) {
  const juice = useJuice()
  const [busy, setBusy] = useState(false)
  const [line, setLine] = useState<{ ok: boolean; text: string } | null>(null)
  const [data, setData] = useState<{ members: number; series: SeriesLanding[] } | null>(null)
  useEffect(() => {
    let alive = true
    fetchSeriesLanding(churchId).then((r) => alive && r.ok && setData(r.data))
    return () => { alive = false }
  }, [churchId])

  if (!data || data.series.length === 0) return null
  const trend = seriesTrend(data.series)
  const exportable = data.series.some((s) => s.status !== 'upcoming' && s.engagedPct != null)

  const exportSummary = async () => {
    setBusy(true); setLine(null)
    try {
      const m = await import('@/lib/seriesSummary')
      const today = todayLocalDate()
      const blob = await m.buildSeriesSummary({ churchName, members: data.members, series: data.series, today })
      if (!blob) { setLine({ ok: false, text: 'Couldn’t make the PDF on this device.' }); return }
      const out = await shareFile(blob, {
        filename: m.summaryFilename(churchName, today),
        title: `${churchName} — series summary`,
        text: 'How our series landed',
        ext: 'pdf',
        mime: 'application/pdf',
      })
      if (out === 'failed') { setLine({ ok: false, text: 'Couldn’t save the PDF.' }); return }
      if (out === 'cancelled') return
      juice.select?.()
      const n = m.summarySeries(data.series).length
      setLine({ ok: true, text: `${n} series, totals only.` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-label="How your series are landing" data-series-landing style={{ display: 'grid', gap: 8, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, flex: 1, fontSize: 17, fontFamily: 'var(--font-display)' }}>How your series are landing</h2>
        {exportable && (
          <button className="pill" data-export-summary disabled={busy} onClick={() => void exportSummary()} style={{ fontSize: 12, fontWeight: 800, padding: '5px 11px' }}>
            {busy ? 'Making…' : '📄 Export summary'}
          </button>
        )}
      </div>
      {line && <span role="status" className="faint" style={{ fontSize: 12, color: line.ok ? undefined : 'var(--coral)' }}>{line.text}</span>}
      {trend && <p style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>{trend}</p>}
      {data.series.map((s) => (
        <div key={`${s.name}:${s.startDate}`} className="card" data-series={s.name} style={{ padding: '10px 12px', display: 'grid', gap: 4, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{s.name}</b>
            <span className="faint" style={{ fontSize: 11.5 }}>
              {day(s.startDate)}–{day(s.endDate)} · {s.status === 'running' ? `day ${s.liveDays} of ${s.days}` : s.status === 'finished' ? `${s.days} days, finished` : `starts ${day(s.startDate)}`}
            </span>
          </div>
          {s.status === 'upcoming' ? (
            <span className="dim" style={{ fontSize: 12.5 }}>Nothing to measure until its first day.</span>
          ) : (
            <span style={{ fontSize: 13, lineHeight: 1.45 }}>
              <b>{s.engagedPct}% engaged</b>
              <span className="dim"> ({s.engaged} of {data.members})</span>
              {' · '}
              <b>{s.completedPct}% {s.status === 'running' ? 'kept up so far' : 'completed'}</b>
              <span className="dim"> ({s.completed})</span>
            </span>
          )}
        </div>
      ))}
      <p className="faint" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45 }}>
        Engaged: played at least one of the series’ days so far. Completed: played every one of them. Out of your
        {' '}{data.members} current member{data.members === 1 ? '' : 's'} — totals only, never who.
      </p>
    </section>
  )
}
