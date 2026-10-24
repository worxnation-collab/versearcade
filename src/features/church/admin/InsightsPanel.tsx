import { useEffect, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { Collapsible } from '@/components/Collapsible'
import { QuickSheet } from '@/components/QuickSheet'
import { Button } from '@/components/Button'
import { useJuice } from '@/juice/useJuice'
import { CHECK_IN_DRAFT, CHECK_IN_MAX, CHECK_IN_VERSE_DRAFT, useChurchCheckIns, type CheckInReason } from '@/store/churchCheckIns'
import { fetchDayVerse, fetchLeaderInsights, fetchLeaderSummary, type InsightMember, type LeaderInsights, type LeaderSummary } from '@/store/churchAdmin'
import { todayLocalDate } from '@/lib/date'
import { fetchChurchFeed, type FeedEvent } from '@/store/churchVerse'
import { ago } from '../ChurchLife'

// The leadership dashboard's three insight panels (0128): Overview, People and
// Activity. Names are shown — the owner reversed the earlier "totals only,
// floored at five" rule for leadership (2026-10-21): "this is a tool for church
// leaders, names are important". The server returns this only to verified
// leadership of THIS church (`church_leader_insights`, `church_admin_can`).
//
// Rules that hold on every panel here, for every tier (0137, 0138):
//   • nobody is ranked against anybody — the roster is in join order, in both
//     groups, and nothing sorts people by what they did;
//   • there is no list of who has not played on the FRONT of anything — no
//     "quiet" tile, no filter pill, no coral for a lapsed streak. Members with
//     no play in seven days sit in ONE folded section the leader has to open
//     (the owner's call), and the only thing offered there is a check-in.
// A FREE claim (unverified church) sees `SummaryTiles` and nothing per person.

export function useSummary(churchId: string) {
  const [data, setData] = useState<LeaderSummary | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    fetchLeaderSummary(churchId).then((r) => {
      if (!alive) return
      if (r.ok) setData(r.data)
      else setFailed(true)
    })
    return () => { alive = false }
  }, [churchId])
  return { data, failed }
}

/** Members, active this week (%), average current streak — every tier's top row. */
export function SummaryTiles({ summary }: { summary: LeaderSummary }) {
  const s = summary
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
      <Tile label="members" value={s.members.toLocaleString()} />
      <Tile label="active this week" value={s.activePct == null ? '—' : `${s.activePct}%`} tone="var(--mint)" />
      <Tile label="avg current streak" value={s.avgStreak.toLocaleString(undefined, { maximumFractionDigits: 1 })} />
    </div>
  )
}

/**
 * The free claim's whole dashboard: the three totals and the live notice.
 * Totals only, on purpose — names and per-person play arrive with Church
 * Leader, the verified plan.
 */
export function SummaryPanel({ summary, failed }: { summary: LeaderSummary | null; failed: boolean }) {
  if (failed) return FAILED
  if (!summary) return LOADING
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14, minWidth: 0 }}>
      <SummaryTiles summary={summary} />
      <p className="faint" style={{ margin: 0, fontSize: 12, lineHeight: 1.5 }}>
        Active means played in the last seven days. A streak counts while it&rsquo;s alive — played today or
        yesterday — and everyone else counts as zero in the average. These are totals for the whole
        congregation; nobody&rsquo;s name is attached to them.
      </p>
      <NoticeCard notice={summary.notice} />
    </div>
  )
}

function NoticeCard({ notice }: { notice: { message: string; createdAt: string } | null }) {
  return (
    <div className="card" style={{ padding: '12px 14px' }}>
      <Head>Live notice</Head>
      {notice ? (
        <>
          <p style={{ margin: '6px 0 0', fontSize: 13.5, lineHeight: 1.45, overflowWrap: 'anywhere' }}>{notice.message}</p>
          <div className="faint" style={{ fontSize: 11.5, marginTop: 4 }}>Posted {ago(notice.createdAt)} ago · on your church&rsquo;s page</div>
        </>
      ) : (
        <p className="dim" style={{ margin: '6px 0 0', fontSize: 13 }}>None right now — post one under Notices.</p>
      )}
    </div>
  )
}

export function useInsights(churchId: string) {
  const [data, setData] = useState<LeaderInsights | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    fetchLeaderInsights(churchId).then((r) => {
      if (!alive) return
      if (r.ok) setData(r.data)
      else setFailed(true)
    })
    return () => { alive = false }
  }, [churchId])
  return { data, failed }
}

// Shown above the numbers on both tabs that carry names. Plain words, no icon:
// it is a promise about where this data goes, not a feature.
export function PrivacyNote() {
  return (
    <p className="dim" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, padding: '8px 12px', borderRadius: 12, background: 'var(--card-raised)' }}>
      This data is only visible to you. Players are never ranked publicly.
    </p>
  )
}

// A streak is only live if it was played today or yesterday — `current_streak`
// is written on play and never decays on its own, so a member gone a month
// still carries the number they stopped on. Same rule as the server's
// `streaks` buckets (0128), so the average and the buckets can't disagree.
export function liveStreak(m: InsightMember, today: string): number {
  if (!m.lastPlayedOn || m.streak <= 0) return 0
  const gap = Math.round((Date.parse(`${today}T00:00:00`) - Date.parse(`${m.lastPlayedOn}T00:00:00`)) / 86_400_000)
  return gap <= 1 ? m.streak : 0
}

// Played in the last seven days — the server's own rule (`last_on >= today - 6`
// in `church_leader_insights`, 0137), which is also what its `active_7d` total
// counts, so the fold and the Overview tile can't disagree. Worked out here
// because 0137 stopped sending a per-row `active`.
export function activeThisWeek(m: InsightMember, today: string): boolean {
  if (!m.lastPlayedOn) return false
  const gap = Math.round((Date.parse(`${today}T00:00:00`) - Date.parse(`${m.lastPlayedOn}T00:00:00`)) / 86_400_000)
  return gap <= 6
}

function headline(i: LeaderInsights) {
  const pctActive = i.members ? Math.round((i.active7d / i.members) * 100) : 0
  const avg = i.roster.length ? i.roster.reduce((t, m) => t + liveStreak(m, i.today), 0) / i.roster.length : 0
  return { pctActive, avgStreak: Math.round(avg * 10) / 10 }
}

const FAILED = <p className="dim" style={{ fontSize: 13.5 }}>These numbers couldn’t load just now.</p>
const LOADING = <div className="skeleton" style={{ height: 220, borderRadius: 14 }} />

export function OverviewPanel({ insights, failed, summary }: { insights: LeaderInsights | null; failed: boolean; summary: LeaderSummary | null }) {
  if (failed) return FAILED
  if (!insights) return LOADING
  const i = insights
  const max = Math.max(1, ...i.days.map((d) => Math.max(d.drop, d.church)))
  const h = headline(i)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14, minWidth: 0 }}>
      <PrivacyNote />
      {summary ? (
        <SummaryTiles summary={summary} />
      ) : (
        // A server without `church_leader_summary`: the same three numbers,
        // worked out from the roster the insights call already returned.
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          <Tile label="members" value={i.members.toLocaleString()} />
          <Tile label="active this week" value={`${h.pctActive}%`} tone="var(--mint)" />
          <Tile label="avg current streak" value={h.avgStreak.toLocaleString()} />
        </div>
      )}

      <div className="card" style={{ padding: '12px 14px' }}>
        <Head>Last 14 days</Head>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 90, marginTop: 10 }} role="img"
          aria-label="Members who played each day: the daily drop and your church verse">
          {i.days.map((d) => (
            <div key={d.date} style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 1, height: '100%' }} title={`${pretty(d.date)}: ${d.drop} drop, ${d.church} church verse`}>
              <span style={{ flex: 1, height: `${(d.drop / max) * 100}%`, minHeight: d.drop ? 3 : 0, background: 'var(--gold)', borderRadius: 2 }} />
              <span style={{ flex: 1, height: `${(d.church / max) * 100}%`, minHeight: d.church ? 3 : 0, background: 'var(--mint)', borderRadius: 2, opacity: d.scheduled ? 1 : 0.3 }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 4 }} className="faint">
          <span>{i.days[0] ? pretty(i.days[0].date) : ''}</span>
          <span>{i.days.length ? pretty(i.days[i.days.length - 1].date) : ''}</span>
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 12, marginTop: 6 }}>
          <Key color="var(--gold)">Daily drop</Key>
          <Key color="var(--mint)">Your church verse</Key>
        </div>
      </div>

      {i.series.length > 0 && (
        <div className="card" style={{ padding: '12px 14px' }}>
          <Head>Series</Head>
          <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
            {i.series.map((s) => (
              <div key={s.series}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13.5 }}>
                  <b style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.series}</b>
                  <span style={{ flexShrink: 0, fontWeight: 800 }}>{s.completion == null ? '—' : `${s.completion}%`}</span>
                </div>
                <div style={{ height: 8, borderRadius: 4, background: 'var(--card-sunken)', overflow: 'hidden', marginTop: 4 }}>
                  <div style={{ height: '100%', width: `${Math.min(100, s.completion ?? 0)}%`, background: 'var(--mint)' }} />
                </div>
                <div className="faint" style={{ fontSize: 11.5, marginTop: 3 }}>
                  {pretty(s.starts)} – {pretty(s.ends)} · day {Math.min(s.soFar, s.days)} of {s.days} · {s.players} {s.players === 1 ? 'person has' : 'people have'} played
                </div>
              </div>
            ))}
          </div>
          <p className="faint" style={{ margin: '8px 0 0', fontSize: 11.5 }}>
            Completion = church-verse plays so far ÷ (members × days so far).
          </p>
        </div>
      )}

      <div className="card" style={{ padding: '12px 14px' }}>
        <Head>Daily streaks</Head>
        <Row label="Not on a streak" n={i.streaks.s0} />
        <Row label="1 day" n={i.streaks.s1} />
        <Row label="2–6 days" n={i.streaks.s2_6} />
        <Row label="7 days or more" n={i.streaks.s7} />
      </div>

      <div className="card" style={{ padding: '12px 14px' }}>
        <Head>Live announcement</Head>
        {i.notice ? (
          <>
            <p style={{ margin: '6px 0 0', fontSize: 13.5, lineHeight: 1.45, overflowWrap: 'anywhere' }}>{i.notice.message}</p>
            <div className="faint" style={{ fontSize: 11.5, marginTop: 4 }}>Posted {ago(i.notice.createdAt)} ago · shown to every member on Play and the Church tab</div>
          </>
        ) : (
          <p className="dim" style={{ margin: '6px 0 0', fontSize: 13 }}>None right now — post one under Notices.</p>
        )}
      </div>
    </div>
  )
}

// Active members are the list. Members with no play in seven days sit in ONE
// folded section the leader has to open — never a filter pill, never coral,
// never a "quiet" tile on the front page. Somebody who hasn't played this week
// is a person to call, not a row on a list of failures, and the fold is what
// keeps the page from opening on them. The header keeps its count so a folded
// section still says how many people are inside.
//
// "Check in" lives on rows INSIDE the fold and nowhere else. It opens a draft
// the leader edits and sends by hand (0137); nothing is sent on its own, and
// the server is told only who and what — never which list the name came from.
// Since 0138 the draft leads with the church's own verse for today.
//
// `demo` is /churches/try's: the same panel over an invented roster, so the
// sales page's demo shows exactly what leadership gets. It sends nothing — no
// player card is opened for a made-up name, and "Check in" explains itself
// instead of opening a sheet that would call the server.
export function PeoplePanel({ churchId, insights, failed, demo = false }: { churchId: string; insights: LeaderInsights | null; failed: boolean; demo?: boolean }) {
  const [checkIn, setCheckIn] = useState<InsightMember | null>(null)
  const [sent, setSent] = useState<Set<string>>(() => new Set())
  const [demoNote, setDemoNote] = useState<string | null>(null)
  if (failed) return FAILED
  if (!insights) return LOADING
  // The roster arrives in join order (0137) and keeps it in both groups.
  const active = insights.roster.filter((m) => activeThisWeek(m, insights.today))
  const resting = insights.roster.filter((m) => !activeThisWeek(m, insights.today))

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10, minWidth: 0 }}>
      <PrivacyNote />
      {active.length === 0 && (
        <p className="dim" style={{ fontSize: 13.5, margin: '4px 0' }}>Nobody has played this week yet.</p>
      )}
      {active.map((m) => <MemberRow key={m.username} m={m} today={insights.today} demo={demo} />)}
      {resting.length > 0 && (
        <Collapsible icon="🕊️" title="Not active this week" meta={resting.length.toLocaleString()}>
          <div style={{ display: 'grid', gap: 8 }}>
            {demoNote && (
              <p className="dim" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45 }}>
                In your church, &ldquo;Check in&rdquo; opens a short note to {demoNote} that you edit and send
                yourself — with today&rsquo;s church verse attached when you&rsquo;ve set one. Nothing is sent from
                this demo.
              </p>
            )}
            {resting.map((m) => (
              <MemberRow
                key={m.username}
                m={m}
                today={insights.today}
                demo={demo}
                action={
                  m.leader ? undefined : sent.has(m.username) ? (
                    <span className="faint" style={{ fontSize: 12, fontWeight: 700 }}>Sent ✓</span>
                  ) : (
                    <button className="pill" onClick={() => (demo ? setDemoNote(m.username) : setCheckIn(m))} style={{ fontSize: 12, fontWeight: 800, padding: '6px 11px' }}>
                      Check in
                    </button>
                  )
                }
              />
            ))}
          </div>
        </Collapsible>
      )}
      {checkIn && !demo && (
        <CheckInSheet
          churchId={churchId}
          member={checkIn}
          onClose={() => setCheckIn(null)}
          onSent={(u) => { setSent((s) => new Set(s).add(u)); setCheckIn(null) }}
        />
      )}
    </div>
  )
}

function MemberRow({ m, today, action, demo = false }: { m: InsightMember; today: string; action?: React.ReactNode; demo?: boolean }) {
  const plays = m.drop7d + m.church7d
  const isActive = activeThisWeek(m, today)
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', minWidth: 0 }}>
      <Avatar emoji={m.avatarEmoji ?? '🙂'} character={m.avatarCharacter} username={demo ? null : m.username} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {m.username}{m.leader ? <span className="faint" style={{ fontWeight: 700, fontSize: 11.5 }}> · leader</span> : null}
        </div>
        <div className="faint" style={{ fontSize: 11.5 }}>
          {m.lastPlayedOn ? `Last played ${lastLabel(m.lastPlayedOn, today)}` : 'Hasn’t played yet'}
          {isActive ? ` · ${plays} ${plays === 1 ? 'play' : 'plays'} this week` : ''}
        </div>
      </div>
      {/* Inside the fold both numbers are always 0 (no play in seven days ⇒ no
          plays this week and no live streak), so they are left out: they said
          nothing and squeezed the row until its line wrapped under Check in. */}
      {isActive && (
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>{liveStreak(m, today)}</div>
          <div className="faint" style={{ fontSize: 10.5 }}>streak</div>
        </div>
      )}
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  )
}

const CHECK_IN_FAIL: Record<CheckInReason, string> = {
  offline: 'You’re offline — nothing was sent.',
  empty: 'Write a few words first.',
  no_verse: 'Today’s verse isn’t available any more, so nothing was sent.',
  not_member: 'They’re no longer a member here, so nothing was sent.',
  self: 'That’s you.',
  daily_cap: 'That’s today’s check-ins. You can send more tomorrow.',
  already_today: 'You’ve already checked in with them today.',
  not_leadership: 'Only this church’s leadership can send these.',
  not_verified: 'Check-ins open once the church is verified.',
  failed: 'That didn’t send. Try again in a moment.',
}

// The draft. When the church has an approved verse for today, that verse IS
// the check-in: it is attached by default, with "Thought of you with this
// one." under it as a line the leader can edit or clear. The server copies the
// verse itself (0138), so what the leader sees here is only a preview. On a day
// with no verse to attach the sheet is 0137's: a prefilled line, required.
// Sent only by the button — closing the sheet discards it.
function CheckInSheet({ churchId, member, onClose, onSent }: {
  churchId: string
  member: InsightMember
  onClose: () => void
  onSent: (username: string) => void
}) {
  const juice = useJuice()
  const send = useChurchCheckIns((s) => s.send)
  const [verse, setVerse] = useState<{ reference: string; text: string } | null | undefined>(undefined)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const today = todayLocalDate()

  useEffect(() => {
    let live = true
    void fetchDayVerse(churchId, today).then((r) => {
      if (!live) return
      // A draft isn't the church's verse yet, and the server refuses to attach one.
      const v = r.ok && r.data && r.data.status !== 'draft' ? { reference: r.data.reference, text: r.data.text } : null
      setVerse(v)
      setText(v ? CHECK_IN_VERSE_DRAFT : CHECK_IN_DRAFT)
    })
    return () => { live = false }
  }, [churchId, today])

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    const r = await send(churchId, member.username, text, { attachVerse: !!verse, localDate: today })
    setBusy(false)
    if (r.ok) {
      juice.select?.()
      onSent(member.username)
    } else {
      setError(CHECK_IN_FAIL[r.reason ?? 'failed'])
    }
  }

  return (
    <QuickSheet title={`Check in with ${member.username}`} onClose={onClose}>
      {verse === undefined ? (
        <div className="skeleton" style={{ height: 180, borderRadius: 14 }} />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {verse && (
            <div style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--card-raised)', border: '1px solid var(--edge)' }}>
              <div className="faint" style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Today’s church verse · {verse.reference}
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.45 }}>{verse.text}</p>
            </div>
          )}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, CHECK_IN_MAX))}
            rows={verse ? 2 : 4}
            autoFocus={!verse}
            aria-label={verse ? 'A line with the verse (optional)' : 'Your message'}
            placeholder={verse ? 'Add a line (optional)' : undefined}
            style={{
              width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '10px 12px', borderRadius: 12,
              border: '1px solid var(--edge)', background: 'var(--card-raised)', color: 'var(--ink)',
              font: 'inherit', fontSize: 15, lineHeight: 1.45,
            }}
          />
          <div className="faint" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5 }}>
            <span>
              {verse
                ? 'It arrives in their mailbox from you: the verse, and your line if you keep one.'
                : 'It arrives in their mailbox from you, with only these words.'}
            </span>
            <span style={{ flexShrink: 0 }}>{text.length}/{CHECK_IN_MAX}</span>
          </div>
          {error && <p className="dim" style={{ margin: 0, fontSize: 13 }}>{error}</p>}
          <Button full onClick={submit} disabled={busy || (!verse && !text.trim())}>{busy ? 'Sending…' : 'Send'}</Button>
          <Button variant="secondary" full onClick={onClose}>Not now</Button>
        </div>
      )}
    </QuickSheet>
  )
}

export function ActivityPanel({ churchId }: { churchId: string }) {
  const [feed, setFeed] = useState<FeedEvent[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    fetchChurchFeed(churchId, 100).then((f) => {
      if (!alive) return
      if (f) setFeed(f)
      else setFailed(true)
    })
    return () => { alive = false }
  }, [churchId])
  if (failed) return FAILED
  if (!feed) return LOADING
  if (!feed.length) return <p className="dim" style={{ fontSize: 13.5 }}>Nothing in the last two weeks yet.</p>
  return (
    <div className="card" style={{ padding: '6px 14px' }}>
      {feed.map((e, i) => (
        <div key={`${e.kind}-${e.at}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: i ? '1px solid var(--stroke)' : undefined, minWidth: 0 }}>
          <Avatar emoji={e.avatarEmoji ?? '🙂'} character={e.avatarCharacter} username={e.username} size={30} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.4, overflowWrap: 'anywhere' }}>
            <b>{e.username ?? 'Someone'}</b> {describe(e)}
          </span>
          <span className="faint" style={{ fontSize: 11, flexShrink: 0 }}>{ago(e.at)}</span>
        </div>
      ))}
    </div>
  )
}

function describe(e: FeedEvent): string {
  switch (e.kind) {
    case 'church_verse': return `played the church verse${e.detail ? ` (${e.detail})` : ''} — ${e.correct}/${e.total}, ${(e.score ?? 0).toLocaleString()} pts`
    case 'drop': return `played the daily drop — ${e.correct}/${e.total}, ${(e.score ?? 0).toLocaleString()} pts`
    case 'gave': return `gave ${(e.points ?? 0).toLocaleString()} to the church`
    case 'joined': return 'joined the church'
    case 'notice': return `posted: “${e.detail ?? ''}”`
  }
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="card center" style={{ padding: '12px 6px' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: tone }}>{value}</div>
      <div className="faint" style={{ fontSize: 11, marginTop: 2 }}>{label}</div>
    </div>
  )
}

function Head({ children }: { children: React.ReactNode }) {
  return <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>{children}</b>
}

function Key({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
      {children}
    </span>
  )
}

function Row({ label, n }: { label: string; n: number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '6px 0', borderTop: '1px solid var(--stroke)' }}>
      <span>{label}</span>
      <span style={{ fontFamily: 'var(--font-display)' }}>{n.toLocaleString()}</span>
    </div>
  )
}

function lastLabel(iso: string, today: string): string {
  const a = Date.parse(`${iso}T00:00:00`)
  const b = Date.parse(`${today}T00:00:00`)
  const d = Math.round((b - a) / 86_400_000)
  if (d <= 0) return 'today'
  if (d === 1) return 'yesterday'
  return `${d} days ago`
}

function pretty(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
