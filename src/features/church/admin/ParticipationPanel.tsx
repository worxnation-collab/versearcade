import { useEffect, useState } from 'react'
import { fetchParticipation } from '@/store/churchAdmin'
import { PARTICIPATION_FLOOR, type ChurchParticipation } from '@/types/churchPackages'

// How the congregation's last two weeks went — PRIVATE to leadership (0119).
//
// Every figure is a congregation total, and every one under five comes back
// null from the server and draws as "fewer than 5": in a small group a total
// points at a person. There is no list of people here, no per-person number,
// no ordering of members and nothing about who did NOT play — the church
// roster's "a crowd, not a ladder" (docs/CHURCH-CLAIM.md), with authority
// attached, which is exactly why it holds harder here than anywhere.

const DAYS = 14

export function ParticipationPanel({ churchId, sample }: { churchId: string; sample?: ChurchParticipation }) {
  // `sample` is the public demo's: invented, illustrative totals, never fetched
  // and never about a real church — the panel says so in its first line.
  const [p, setP] = useState<ChurchParticipation | null>(sample ?? null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (sample) return
    let alive = true
    fetchParticipation(churchId, DAYS).then((r) => {
      if (!alive) return
      if (r.ok) setP(r.data)
      else setFailed(true)
    })
    return () => { alive = false }
  }, [churchId, sample])

  if (failed) return <p className="dim" style={{ fontSize: 13.5 }}>These numbers couldn't load just now.</p>
  if (!p) return <div className="skeleton" style={{ height: 220, borderRadius: 14 }} />

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14, minWidth: 0 }}>
      {sample && (
        <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--mint)' }}>
          Sample numbers — your church&rsquo;s real totals appear here.
        </p>
      )}
      <div className="card" style={{ padding: '10px 12px', borderColor: 'var(--edge)' }}>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5 }}>
          🔒 <b>Only your church's leadership sees this.</b>{' '}
          <span className="dim">
            Every number is the whole congregation together, never one person. Anything under{' '}
            {PARTICIPATION_FLOOR} shows as “fewer than {PARTICIPATION_FLOOR}”, so no total can point at someone.
          </span>
        </p>
      </div>

      <div>
        <div className="faint" style={{ fontSize: 11.5, marginBottom: 8 }}>
          The last {p.days} days · {pretty(p.from)} – {pretty(p.to)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
          <Tile label="in your congregation" value={p.members} />
          <Tile label="played at least once" value={p.players} />
          <Tile label="daily verses played" value={p.plays} />
          <Tile label="average score" value={p.avg_score} />
          <Tile label="played today" value={p.pct_played_today} suffix="%" />
        </div>
      </div>

      <div>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>Daily rhythms</b>
        <p className="dim" style={{ margin: '4px 0 10px', fontSize: 12.5, lineHeight: 1.45 }}>
          How many people are on a run of days right now.
        </p>
        <Row label="1 day" n={p.streaks.s1} />
        <Row label="2–6 days" n={p.streaks.s2_6} />
        <Row label="7 days or more" n={p.streaks.s7} />
      </div>
    </div>
  )
}

const FEWER = `fewer than ${PARTICIPATION_FLOOR}`

function Tile({ label, value, suffix = '' }: { label: string; value: number | null; suffix?: string }) {
  return (
    <div className="card center" style={{ padding: '12px 8px' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: value == null ? 14 : 24, minHeight: 29, display: 'grid', placeItems: 'center' }}>
        {value == null ? <span className="dim">{FEWER}</span> : `${value.toLocaleString()}${suffix}`}
      </div>
      <div className="faint" style={{ fontSize: 11.5, marginTop: 2 }}>{label}</div>
    </div>
  )
}

function Row({ label, n }: { label: string; n: number | null }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '6px 0', borderTop: '1px solid var(--stroke)' }}>
      <span>{label}</span>
      <span className={n == null ? 'faint' : undefined} style={{ fontFamily: n == null ? undefined : 'var(--font-display)' }}>
        {n == null ? FEWER : n.toLocaleString()}
      </span>
    </div>
  )
}

function pretty(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
