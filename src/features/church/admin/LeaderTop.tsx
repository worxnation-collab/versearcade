import { useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { useJuice } from '@/juice/useJuice'
import { flaggedCount, type Autopilot, type AutoPublish, type AutoWeekJob, type InsightMember, type LeaderInsights, type WeekDay } from '@/store/churchAdmin'
import { activeThisWeek, CheckInSheet } from './InsightsPanel'
import type { HomeGo } from './HomePanel'
import { autopilotLine, cutoffLabel, RescueWeekButton } from './autopilot'
import { hourLabel } from './AutoPublishToggle'
import { dayRange, jobFailed, jobRunning } from '../../../../supabase/functions/church-digest/home.ts'

// The top of Home: the three things a pastor opens this for (2026-10-30).
//
// Production said no real leader had used the dashboard yet, and the first
// screen a pilot pastor met was a to-do list, a digest switch and a column of
// series numbers. So Home leads with three cards, in this order, and the to-do
// follows them:
//
//   1. This week — the ONE status line for the next seven days (2026-11-13:
//      the same "nothing planned" used to be said four times on Home and
//      Plan): covered, drafts waiting, or empty days, what Autopilot did or
//      will do, and one button to the thing to do next. Home's to-do no
//      longer carries the open-days and drafts-waiting rows that restated it.
//   2. Who's playing — everyone in the church who played in the last seven
//      days, leaders included, by name (leadership sees names since 0128): the
//      same people "At a glance" counts as active this week, so the two can't
//      disagree (they did — a leader who played read as "nobody" here and as
//      50% active there). The check-in row still counts members only.
//   3. Send a note — choose any member and write to them: the same check-in
//      sheet (0137/0138) People uses, so the verse attachment, the daily caps
//      and the report path are its own. It is not limited to quiet members;
//      the server never was.
//
// Everything is derived from reads Home already makes (`fetchDays`,
// `church_leader_insights`). Verified leadership only — a free claim has no
// plan and no names, and keeps Home as it was.

const MAX_FACES = 6

export function LeaderTop({ churchId, today, days, insights, onGo, ap = null, setAp, publish = null, jobs = null, onJob }: {
  churchId: string
  today: string
  days: WeekDay[] | null
  insights: LeaderInsights | null
  onGo: (go: HomeGo) => void
  /** Autopilot (0152/0179), when the church holds Content Generation. */
  ap?: Autopilot | null
  setAp?: (a: Autopilot) => void
  /** Auto-publish (0176). */
  publish?: AutoPublish | null
  /** The church's sermon / Autopilot weeks (0148). */
  jobs?: AutoWeekJob[] | null
  onJob?: () => void
}) {
  const juice = useJuice()
  const [to, setTo] = useState('')
  const [writing, setWriting] = useState<InsightMember | null>(null)
  const [sent, setSent] = useState<string | null>(null)

  const week = days?.slice(0, 7) ?? null
  const planned = week ? week.filter((w) => w.verse && w.verse.status !== 'draft').length : 0
  const drafts = week?.filter((w) => w.verse?.status === 'draft') ?? []
  const empty = week?.filter((w) => !w.verse) ?? []
  const flagged = drafts.filter((w) => flaggedCount(w.verse?.questions) > 0)
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  const status = !week ? '' : !drafts.length && !empty.length
    ? 'This week is covered — every day has a verse.'
    : [drafts.length ? `${plural(drafts.length, 'draft', 'drafts')} waiting for your approval` : '',
       empty.length ? plural(empty.length, 'empty day', 'empty days') : ''].filter(Boolean).join(' · ')
  const pilotLine = autopilotStatus(ap, publish, jobs)
  const autoAt = !ap?.enabled && publish?.enabled ? hourLabel(publish.hour) : null
  const go: { label: string; date: string } = drafts.length
    ? { label: `Review ${plural(drafts.length, 'draft', 'drafts')}`, date: drafts[0].date }
    : empty.length
      ? { label: `Plan ${plural(empty.length, 'empty day', 'empty days')}`, date: empty[0].date }
      : { label: 'Open the plan', date: today }

  // Everyone with a play in seven days, leaders too — "At a glance" counts the same people.
  const members = insights?.roster.filter((m) => !m.leader) ?? []
  const everyone = insights?.roster ?? []
  const playing = insights ? everyone.filter((m) => activeThisWeek(m, insights.today)) : []
  const total = insights ? Math.max(insights.members, everyone.length) : 0

  const card = { padding: '12px 14px', display: 'grid', gap: 8, minWidth: 0 } as const
  const head = { margin: 0, fontSize: 15, fontFamily: 'var(--font-display)' } as const

  return (
    <div style={{ display: 'grid', gap: 10, minWidth: 0 }} data-leader-top>
      <div className="card" style={card} data-top="plan" data-week-status>
        <h2 style={head}>📅 This week</h2>
        {!week ? <div className="skeleton" style={{ height: 18, borderRadius: 8 }} /> : (
          <>
            <div style={{ display: 'flex', gap: 4 }} aria-hidden>
              {week.map((w) => (
                <span key={w.date} style={{ flex: 1, height: 8, borderRadius: 4, background: w.verse ? (w.verse.status === 'draft' ? 'var(--edge)' : 'var(--mint)') : 'var(--card-sunken)' }} />
              ))}
            </div>
            <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45, fontWeight: 700 }}>{status}</p>
            <p className="dim" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45 }}>
              {planned} of the next 7 days {planned === 1 ? 'is' : 'are'} live for members.
              {pilotLine ? ` ${pilotLine}` : ''}
              {autoAt && drafts.length ? ` Auto-publish puts each draft live at ${autoAt} the night before.` : ''}
              {flagged.length && (publish?.enabled) ? ` ${plural(flagged.length, 'day has', 'days have')} a ⚠ flagged question, so auto-publish leaves ${flagged.length === 1 ? 'it' : 'them'} for you.` : ''}
            </p>
          </>
        )}
        {setAp && <RescueWeekButton churchId={churchId} ap={ap} setAp={setAp} onJob={onJob} primary />}
        <Button variant={ap?.enabled && ap.state === 'no_source' ? 'secondary' : 'primary'} onClick={() => onGo({ tab: 'plan', date: go.date })}>
          {go.label}
        </Button>
      </div>

      <div className="card" style={card} data-top="people">
        <h2 style={head}>👥 Who&rsquo;s playing</h2>
        {!insights ? <div className="skeleton" style={{ height: 36, borderRadius: 8 }} /> : (
          <>
            <p className="dim" style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>
              {playing.length === 0
                ? 'Nobody has played in the last seven days yet.'
                : `${playing.length} of ${total} ${total === 1 ? 'person' : 'people'} played in the last seven days.`}
            </p>
            {playing.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {playing.slice(0, MAX_FACES).map((m) => (
                  <span key={m.username} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: '100%' }}>
                    <Avatar emoji={m.avatarEmoji ?? '🙂'} character={m.avatarCharacter} username={m.username} size={28} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.username}{m.leader ? <span className="faint" style={{ fontWeight: 700 }}> · leader</span> : null}</span>
                  </span>
                ))}
                {playing.length > MAX_FACES && <span className="faint" style={{ fontSize: 12.5, alignSelf: 'center' }}>and {playing.length - MAX_FACES} more</span>}
              </div>
            )}
          </>
        )}
        <button className="pill" style={{ justifySelf: 'start', fontWeight: 800 }} onClick={() => { juice.select?.(); onGo({ tab: 'people' }) }}>
          See everyone →
        </button>
      </div>

      <div className="card" style={card} data-top="note">
        <h2 style={head}>✉️ Send a note</h2>
        {!insights ? <div className="skeleton" style={{ height: 36, borderRadius: 8 }} /> : members.length === 0 ? (
          <p className="dim" style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>Once members join, you can write to any of them here.</p>
        ) : (
          <>
            <p className="dim" style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>
              A short note to one member, with today&rsquo;s church verse attached when you&rsquo;ve set one. It lands in their mailbox.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
              <select aria-label="Who to write to" value={to} onChange={(e) => { setTo(e.target.value); setSent(null) }} style={{ flex: '1 1 160px', minWidth: 0 }}>
                <option value="">Choose a member…</option>
                {members.map((m) => <option key={m.username} value={m.username}>{m.username}</option>)}
              </select>
              <Button
                variant="ghost"
                disabled={!to}
                onClick={() => { const m = members.find((x) => x.username === to); if (m) setWriting(m) }}
              >
                Write the note
              </Button>
            </div>
            {sent && <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>Sent to {sent} ✓</p>}
          </>
        )}
      </div>

      {writing && (
        <CheckInSheet
          churchId={churchId}
          member={writing}
          onClose={() => setWriting(null)}
          onSent={(u) => { setSent(u); setTo(''); setWriting(null) }}
        />
      )}
    </div>
  )
}

/**
 * What Autopilot did or will do this week, in one sentence — the status
 * card's second line. Null when it is off.
 */
function autopilotStatus(ap: Autopilot | null, publish: AutoPublish | null, jobs: AutoWeekJob[] | null): string | null {
  if (!ap?.enabled) return null
  const job = jobs?.find((j) => j.autopilot && j.source === 'fallback' && j.startDate >= ap.weekStart) ?? null
  const publishing = publish?.enabled ? ` and is publishing each evening at ${hourLabel(publish.hour)}` : ''
  if (job && jobRunning(job)) return `Autopilot is drafting this week from “${job.series}”.`
  if (job && jobFailed(job)) return `Autopilot’s week from “${job.series}” didn’t finish — retry it on Plan.`
  if (job && job.status === 'done' && job.saved.length) {
    return `Autopilot planned ${dayRange(job.saved)} from “${job.series}”${publishing}.${publishing ? '' : ' Nothing goes live until you approve it.'}`
  }
  if (ap.state === 'waiting') {
    const from = ap.fallback ? `your backup plan “${ap.fallback.label}”` : 'a week Verse Arcade picks'
    return `If no sermon memo arrives by ${cutoffLabel(ap.cutoffDow, ap.cutoffMinute)}, Autopilot drafts the week from ${from}${publishing}.`
  }
  return autopilotLine(ap)?.text ?? null
}
