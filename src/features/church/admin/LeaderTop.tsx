import { useState } from 'react'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { useJuice } from '@/juice/useJuice'
import type { InsightMember, LeaderInsights, WeekDay } from '@/store/churchAdmin'
import { activeThisWeek, CheckInSheet } from './InsightsPanel'
import type { HomeGo } from './HomePanel'

// The top of Home: the three things a pastor opens this for (2026-10-30).
//
// Production said no real leader had used the dashboard yet, and the first
// screen a pilot pastor met was a to-do list, a digest switch and a column of
// series numbers. So Home leads with three cards, in this order, and the to-do
// follows them:
//
//   1. This week's verse — how many of the next seven days have one, and one
//      button into Plan (on the first empty day, else today).
//   2. Who's playing — the members (leaders aside) who played in the last
//      seven days, by name (leadership sees names since 0128), and a door to People.
//   3. Send a note — choose any member and write to them: the same check-in
//      sheet (0137/0138) People uses, so the verse attachment, the daily caps
//      and the report path are its own. It is not limited to quiet members;
//      the server never was.
//
// Everything is derived from reads Home already makes (`fetchDays`,
// `church_leader_insights`). Verified leadership only — a free claim has no
// plan and no names, and keeps Home as it was.

const MAX_FACES = 6

export function LeaderTop({ churchId, today, days, insights, onGo }: {
  churchId: string
  today: string
  days: WeekDay[] | null
  insights: LeaderInsights | null
  onGo: (go: HomeGo) => void
}) {
  const juice = useJuice()
  const [to, setTo] = useState('')
  const [writing, setWriting] = useState<InsightMember | null>(null)
  const [sent, setSent] = useState<string | null>(null)

  const week = days?.slice(0, 7) ?? null
  const planned = week ? week.filter((w) => w.verse && w.verse.status !== 'draft').length : 0
  const firstEmpty = week?.find((w) => !w.verse)?.date ?? today

  const members = insights?.roster.filter((m) => !m.leader) ?? []
  const playing = insights ? members.filter((m) => activeThisWeek(m, insights.today)) : []

  const card = { padding: '12px 14px', display: 'grid', gap: 8, minWidth: 0 } as const
  const head = { margin: 0, fontSize: 15, fontFamily: 'var(--font-display)' } as const

  return (
    <div style={{ display: 'grid', gap: 10, minWidth: 0 }} data-leader-top>
      <div className="card" style={card} data-top="plan">
        <h2 style={head}>📅 This week&rsquo;s verse</h2>
        {!week ? <div className="skeleton" style={{ height: 18, borderRadius: 8 }} /> : (
          <>
            <div style={{ display: 'flex', gap: 4 }} aria-hidden>
              {week.map((w) => (
                <span key={w.date} style={{ flex: 1, height: 8, borderRadius: 4, background: w.verse ? (w.verse.status === 'draft' ? 'var(--edge)' : 'var(--mint)') : 'var(--card-sunken)' }} />
              ))}
            </div>
            <p className="dim" style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>
              {planned === 7 ? 'Every day this week has a verse.' : planned === 0 ? 'No church verse planned for the next seven days yet.' : `${planned} of the next 7 days have a verse.`}
            </p>
          </>
        )}
        <Button onClick={() => onGo({ tab: 'plan', date: firstEmpty })}>
          {planned === 7 ? 'Open the plan' : 'Plan the week'}
        </Button>
      </div>

      <div className="card" style={card} data-top="people">
        <h2 style={head}>👥 Who&rsquo;s playing</h2>
        {!insights ? <div className="skeleton" style={{ height: 36, borderRadius: 8 }} /> : (
          <>
            <p className="dim" style={{ margin: 0, fontSize: 13, lineHeight: 1.45 }}>
              {playing.length === 0
                ? 'Nobody has played this week yet.'
                : `${playing.length} of ${members.length} ${members.length === 1 ? 'member' : 'members'} played in the last seven days.`}
            </p>
            {playing.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {playing.slice(0, MAX_FACES).map((m) => (
                  <span key={m.username} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: '100%' }}>
                    <Avatar emoji={m.avatarEmoji ?? '🙂'} character={m.avatarCharacter} username={m.username} size={28} />
                    <span style={{ fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.username}</span>
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
