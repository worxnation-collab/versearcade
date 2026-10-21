import { useEffect, useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { fetchLeaderInsights, type LeaderInsights } from '@/store/churchAdmin'
import { fetchChurchFeed, type FeedEvent } from '@/store/churchVerse'
import { ago } from '../ChurchLife'

// The leadership dashboard's three insight panels (0127): Overview, People and
// Activity. Names are shown — the owner reversed the earlier "totals only,
// floored at five" rule for leadership (2026-10-21): "this is a tool for church
// leaders, names are important". The server returns this only to verified
// leadership of THIS church (`church_leader_insights`, `church_admin_can`).

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

const FAILED = <p className="dim" style={{ fontSize: 13.5 }}>These numbers couldn’t load just now.</p>
const LOADING = <div className="skeleton" style={{ height: 220, borderRadius: 14 }} />

export function OverviewPanel({ insights, failed }: { insights: LeaderInsights | null; failed: boolean }) {
  if (failed) return FAILED
  if (!insights) return LOADING
  const i = insights
  const max = Math.max(1, ...i.days.map((d) => Math.max(d.drop, d.church)))

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14, minWidth: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        <Tile label="members" value={i.members} />
        <Tile label="active this week" value={i.active7d} tone="var(--mint)" />
        <Tile label="quiet 7+ days" value={i.quiet} tone={i.quiet ? 'var(--coral)' : undefined} />
      </div>

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

export function PeoplePanel({ insights, failed }: { insights: LeaderInsights | null; failed: boolean }) {
  const [filter, setFilter] = useState<'all' | 'active' | 'quiet'>('all')
  if (failed) return FAILED
  if (!insights) return LOADING
  const rows = insights.roster.filter((m) => filter === 'all' || (filter === 'active' ? m.active : !m.active))

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10, minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {(['all', 'active', 'quiet'] as const).map((f) => (
          <button
            key={f}
            className="pill"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            style={{ fontSize: 12.5, fontWeight: 700, ...(filter === f ? { background: 'var(--select)', borderColor: 'var(--select)', color: 'var(--ink)' } : null) }}
          >
            {f === 'all' ? `All ${insights.members}` : f === 'active' ? `Active ${insights.active7d}` : `Quiet ${insights.quiet}`}
          </button>
        ))}
      </div>
      {rows.length === 0 && <p className="dim" style={{ fontSize: 13.5 }}>Nobody here.</p>}
      {rows.map((m) => (
        <div key={m.username} className="card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', minWidth: 0 }}>
          <Avatar emoji={m.avatarEmoji ?? '🙂'} character={m.avatarCharacter} username={m.username} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {m.username}{m.leader ? <span className="faint" style={{ fontWeight: 700, fontSize: 11.5 }}> · leader</span> : null}
            </div>
            <div className="faint" style={{ fontSize: 11.5 }}>
              {m.lastPlayedOn ? `Last played ${lastLabel(m.lastPlayedOn, insights.today)}` : 'Hasn’t played yet'}
              {` · ${m.drop7d} drop, ${m.church7d} church this week`}
              {m.churchAvg != null ? ` · avg ${m.churchAvg.toLocaleString()}` : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, color: m.active ? 'var(--mint)' : 'var(--coral)' }}>{m.streak}</div>
            <div className="faint" style={{ fontSize: 10.5 }}>streak</div>
          </div>
        </div>
      ))}
    </div>
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

function Tile({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="card center" style={{ padding: '12px 6px' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: tone }}>{value.toLocaleString()}</div>
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
