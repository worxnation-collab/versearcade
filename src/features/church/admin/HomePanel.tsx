import { useEffect, useState, type ReactNode } from 'react'
import { addDays, todayLocalDate } from '@/lib/date'
import { useJuice } from '@/juice/useJuice'
import { fetchDays, flaggedCount, type AdminSettings, type LeaderInsights, type WeekDay } from '@/store/churchAdmin'
import { activeThisWeek } from './InsightsPanel'
import { SeriesLandingPanel } from './SeriesLandingPanel'
import { currentAutoWeek, useAutoWeeks } from './autoWeek'
import { autoRow, draftRows, inquiryRow, quietRow, type HomeGo, type HomeRow } from '../../../../supabase/functions/church-digest/home.ts'
import { useAutopilot } from './autopilot'
import { useJoinInquiries } from './InquiriesSection'
import { DigestToggle } from './DigestToggle'

// Home — "This week": what needs a leader, before anything else (2026-10-26).
//
// The dashboard used to open on a grid of totals, which answers "how are we
// doing?" when the question a pastor opens it with on a Monday is "what do I
// need to do?". So it opens on a SHORT list of jobs, each one a door to the
// tool that does it — the map's rule ("a row lands where the deed is done"),
// applied to leadership:
//
//   • days in the next seven with no church verse  → Plan, on the first one
//   • drafts waiting for approval                  → Plan, on the first draft
//   • drafted questions the answer check flagged ⚠ → Plan, on that day
//   • no live notice (none set, or it expired)     → Your page, the notice form
//   • members who could use a check-in             → People, the quiet fold open
//   • players asking about the church from a leader's card (0149) → People
//   • a sermon memo's week (0148): ready, drafting, or failed → Plan
//     ("record Sunday, review Monday" — the week drafted itself from the memo;
//     the row is the in-app notice that it is waiting)
//
// Every row is DERIVED from reads the dashboard already makes (`fetchDays`,
// the same window logic as `WeekGapLine`; `church_leader_insights`;
// `church_admin_settings`) — no new RPC, no new table, nothing stored.
//
// It is a to-do, not a scoreboard: a row appears only while there is
// something to do and goes when it is done, and an empty list is one warm
// line. **The check-in row narrows the People tab's rule** that nobody who
// hasn't played is listed on the front of anything — the owner's call
// (2026-10-26). It names NOBODY and carries no streak or coral; it is one
// count of members a leader can write to, and the names stay behind the fold
// it opens. Leaders are never counted in it.
//
// Under the list, "How your series are landing" (0150): per series, how many
// members engaged and how many completed it — congregation totals, never who.
// Any leadership reads it (it names nobody); it renders nothing with no series.
//
// Totals ("At a glance") follow the list, unchanged; they used to be the
// whole first screen.

// The rows the Monday digest also carries come from one shared builder
// (supabase/functions/church-digest/home.ts) — the email can't word a row
// differently from Home. docs/CHURCH-DIGEST.md.
export type { HomeGo }
type Row = HomeRow

const day = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })

export function HomePanel({
  churchId,
  verified,
  settings,
  insights,
  onGo,
  glance,
  autoWeeks = false,
}: {
  /** The church holds Content Generation: read its sermon-memo weeks (0148). */
  autoWeeks?: boolean
  churchId: string
  verified: boolean
  settings: AdminSettings
  insights: LeaderInsights | null
  onGo: (go: HomeGo) => void
  /** The totals, drawn under the list. */
  glance: ReactNode
}) {
  const juice = useJuice()
  const today = todayLocalDate()
  const [days, setDays] = useState<WeekDay[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!verified) return
    let alive = true
    // Three weeks, the planner's own window: gaps are judged on the first
    // seven (WeekGapLine's rule), drafts and flags on all of it — a draft for
    // the week after next still needs approving.
    fetchDays(churchId, today, 21).then((r) => {
      if (!alive) return
      if (r.ok) setDays(r.data); else setFailed(true)
    })
    return () => { alive = false }
  }, [churchId, verified, today])

  const rows: Row[] = []
  const { jobs, reload: reloadJobs } = useAutoWeeks(churchId, verified && autoWeeks)
  // Autopilot (0152): opening Home is a visit after the cutoff — this is what
  // settles a due week. A fallback job it made shows up in the jobs above.
  const { ap } = useAutopilot(churchId, verified && autoWeeks, () => void reloadJobs())
  const auto = autoRow(currentAutoWeek(jobs), !!(ap?.enabled && ap.state === 'no_source'), today)
  if (auto) rows.push(auto)
  // The Monday digest (0154, docs/CHURCH-DIGEST.md) carries this line and the
  // drafts / flags / inquiries / quiet rows below, built by the same functions.

  if (verified && days) {
    const week = days.slice(0, 7)
    const empty = week.filter((w) => !w.verse)
    if (empty.length) {
      rows.push({
        key: 'gaps',
        icon: '📅',
        title: empty.length === 7 ? 'No church verse for the next 7 days' : `${empty.length} of the next 7 days ${empty.length === 1 ? 'has' : 'have'} no church verse`,
        detail: `First open day: ${day(empty[0].date)}. Plan it →`,
        go: { tab: 'plan', date: empty[0].date },
      })
    }
    const drafts = days.filter((w) => w.verse?.status === 'draft')
    rows.push(...draftRows(drafts.map((w) => ({ date: w.date, flagged: flaggedCount(w.verse?.questions) }))))
  }

  const notice = settings.announcement
  const endsSoon = notice?.expiresAt && Date.parse(notice.expiresAt) < Date.parse(`${addDays(today, 2)}T00:00:00`)
  if (!notice) {
    rows.push({
      key: 'notice',
      icon: '📣',
      title: 'No live notice on your page',
      detail: 'One line for your congregation and visitors — this week’s potluck, a service change. Post one →',
      go: { tab: 'page', notice: true },
    })
  } else if (endsSoon) {
    rows.push({
      key: 'notice',
      icon: '📣',
      title: 'Your notice ends soon',
      detail: `“${notice.message.slice(0, 60)}${notice.message.length > 60 ? '…' : ''}” — replace or extend it →`,
      go: { tab: 'page', notice: true },
    })
  }

  const { items: asks } = useJoinInquiries(churchId, verified)
  const ask = inquiryRow(asks?.length ?? 0, asks?.[0]?.username ?? null)
  if (ask) rows.push(ask)

  if (verified && insights) {
    const q = quietRow(insights.roster.filter((m) => !m.leader && !activeThisWeek(m, insights.today)).length)
    if (q) rows.push(q)
  }

  const loading = verified && !days && !failed

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10, minWidth: 0 }}>
      <h2 style={{ margin: '2px 0 0', fontSize: 17, fontFamily: 'var(--font-display)' }}>This week</h2>
      {loading && <div className="skeleton" style={{ height: 64, borderRadius: 14 }} />}
      {failed && (
        <p className="dim" style={{ margin: 0, fontSize: 12.5 }}>Couldn’t read your schedule just now — the Plan tab has it.</p>
      )}
      {!loading && rows.length === 0 && (
        <div className="card" style={{ padding: '12px 14px', fontSize: 13.5, lineHeight: 1.5 }}>
          <b>You’re all set for this week.</b>{' '}
          <span className="dim">Every day has a verse, nothing is waiting on you, and your notice is up.</span>
        </div>
      )}
      {rows.map((r) => (
        <button
          key={r.key}
          className="card"
          data-todo={r.key}
          onClick={() => { juice.select?.(); onGo(r.go) }}
          style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 13px', textAlign: 'left', color: 'inherit', font: 'inherit', cursor: 'pointer', width: '100%', minWidth: 0 }}
        >
          <span aria-hidden style={{ fontSize: 18, lineHeight: '22px', width: 22, textAlign: 'center', flexShrink: 0 }}>{r.icon}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <b style={{ display: 'block', fontSize: 14, lineHeight: 1.35 }}>{r.title}</b>
            <span className="dim" style={{ display: 'block', fontSize: 12.5, lineHeight: 1.45, marginTop: 2 }}>{r.detail}</span>
          </span>
        </button>
      ))}

      {verified && <DigestToggle churchId={churchId} />}

      <SeriesLandingPanel churchId={churchId} />

      <h2 style={{ margin: '10px 0 0', fontSize: 17, fontFamily: 'var(--font-display)' }}>At a glance</h2>
      {glance}
    </div>
  )
}
