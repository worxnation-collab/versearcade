import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '@/components/Avatar'
import { useJuice } from '@/juice/useJuice'
import { useChurchVerse, fetchChurchFeed, type FeedEvent } from '@/store/churchVerse'
import type { ChurchExtras } from '@/types/churchPackages'
import type { Church } from '@/types'

// The member's church, as a PLACE PEOPLE ARE (0128) — the top of the Church tab
// for a member of a VERIFIED church, between the churchyard and Give:
//
//   1. "You're in {name}" — the context is said once, plainly.
//   2. The leader's live announcement.
//   3. Today's church verse, with how far through its series you are — its own
//      lane, played at /play/church, never in place of the daily drop.
//   4. What the congregation has been doing (`church_feed`): who played the
//      drop or the church verse and how they scored, who gave, who joined,
//      what leadership posted. Scores are shown — the owner's call.
//   5. Where to compete: church against church is the default (the board and
//      the week below), and the global views are one tap away.
//
// An unverified church gets none of this and the tab reads exactly as before:
// the richer layer is the verified one, like every church package feature.
export function ChurchLife({ church, extras }: { church: Church; extras: ChurchExtras | null }) {
  const navigate = useNavigate()
  const juice = useJuice()
  const verse = useChurchVerse((s) => s.today)
  const loadVerse = useChurchVerse((s) => s.load)
  const [feed, setFeed] = useState<FeedEvent[] | null>(null)
  const [more, setMore] = useState(false)

  const verified = !!extras?.verified

  useEffect(() => {
    if (!verified) return
    void loadVerse()
    let alive = true
    fetchChurchFeed(church.id, 40).then((f) => { if (alive) setFeed(f) })
    return () => { alive = false }
  }, [verified, church.id, loadVerse])

  if (!verified) return null

  const go = (to: string) => { juice.select?.(); navigate(to) }
  const shown = feed ? (more ? feed : feed.slice(0, 6)) : null
  const p = verse?.progress

  return (
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      <div className="card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, borderColor: 'var(--edge)' }}>
        <span aria-hidden style={{ fontSize: 20 }}>⛪</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
          You’re in <b>{church.name}</b>
          <span className="faint" style={{ display: 'block', fontSize: 12 }}>
            {church.members.toLocaleString()} {church.members === 1 ? 'member' : 'members'} · verified church
          </span>
        </span>
      </div>

      {extras?.announcement && (
        <div className="card" style={{ padding: '12px 14px' }}>
          <Eyebrow>From your church’s leaders</Eyebrow>
          <p style={{ margin: '4px 0 0', fontSize: 14, lineHeight: 1.45, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>
            {extras.announcement.message}
          </p>
          <div className="faint" style={{ fontSize: 11.5, marginTop: 4 }}>{ago(extras.announcement.createdAt)}</div>
        </div>
      )}

      {verse && (
        <button
          className="card"
          onClick={() => go('/play/church')}
          style={{ padding: '12px 14px', textAlign: 'left', color: 'inherit', font: 'inherit', cursor: 'pointer', width: '100%' }}
        >
          <Eyebrow>Today’s church verse{verse.series ? ` · ${verse.series}` : ''}</Eyebrow>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
            <b style={{ flex: 1, minWidth: 0, fontSize: 16 }}>{verse.reference}</b>
            <span style={{ fontSize: 13, fontWeight: 800, color: verse.played ? 'var(--mint)' : 'var(--gold)', flexShrink: 0 }}>
              {verse.played ? `${verse.played.correct}/${verse.played.total} ✓` : 'Play →'}
            </span>
          </div>
          {p && p.total > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', gap: 3 }} aria-label={`You've played ${p.played} of ${p.soFar} days so far`}>
                {Array.from({ length: p.total }, (_, i) => (
                  <span
                    key={i}
                    style={{
                      flex: 1, height: 6, borderRadius: 3,
                      background: i < p.played ? 'var(--mint)' : i < p.soFar ? 'var(--edge)' : 'var(--card-sunken)',
                    }}
                  />
                ))}
              </div>
              <div className="faint" style={{ fontSize: 11.5, marginTop: 4 }}>
                Day {p.soFar} of {p.total} · you’ve played {p.played}
              </div>
            </div>
          )}
        </button>
      )}

      <div className="card" style={{ padding: '12px 14px' }}>
        <Eyebrow>What your church has been up to</Eyebrow>
        {!shown && <div className="skeleton" style={{ height: 90, borderRadius: 12, marginTop: 8 }} />}
        {shown && shown.length === 0 && (
          <p className="dim" style={{ margin: '6px 0 0', fontSize: 13.5 }}>
            Quiet so far. Play today’s verse and you’ll be the first thing here.
          </p>
        )}
        {shown && shown.length > 0 && (
          <div style={{ display: 'grid', gap: 2, marginTop: 6 }}>
            {shown.map((e, i) => <FeedRow key={`${e.kind}-${e.at}-${i}`} e={e} />)}
          </div>
        )}
        {feed && feed.length > 6 && (
          <button
            onClick={() => setMore((m) => !m)}
            style={{ marginTop: 6, padding: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--ink-dim)', cursor: 'pointer' }}
          >
            {more ? 'Show less' : `Show all ${feed.length}`}
          </button>
        )}
      </div>

      <div className="card" style={{ padding: '12px 14px' }}>
        <Eyebrow>Compete</Eyebrow>
        <p className="dim" style={{ margin: '4px 0 10px', fontSize: 13, lineHeight: 1.45 }}>
          Your church plays as one team — the church board and the week of giving are below. Want the global game too?
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="pill" onClick={() => go('/battle')} style={{ flex: 1, justifyContent: 'center', fontWeight: 700 }}>Global battles</button>
          <button className="pill" onClick={() => go('/leaderboard')} style={{ flex: 1, justifyContent: 'center', fontWeight: 700 }}>Worldwide ranks</button>
        </div>
      </div>
    </div>
  )
}

function FeedRow({ e }: { e: FeedEvent }) {
  const who = e.username ?? 'Someone'
  let what: string
  switch (e.kind) {
    case 'church_verse':
      what = `played the church verse${e.detail ? ` (${e.detail})` : ''} — ${e.correct}/${e.total}, ${(e.score ?? 0).toLocaleString()} pts`
      break
    case 'drop':
      what = `played today’s drop — ${e.correct}/${e.total}, ${(e.score ?? 0).toLocaleString()} pts`
      break
    case 'gave':
      what = `gave ${(e.points ?? 0).toLocaleString()} to the church`
      break
    case 'joined':
      what = 'joined the church'
      break
    case 'notice':
      what = `posted: “${e.detail ?? ''}”`
      break
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: '1px solid var(--stroke)', minWidth: 0 }}>
      <Avatar emoji={e.avatarEmoji ?? '🙂'} character={e.avatarCharacter ?? undefined} username={e.username ?? undefined} size={30} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.4, overflowWrap: 'anywhere' }}>
        <b>{who}</b> {what}
      </span>
      <span className="faint" style={{ fontSize: 11, flexShrink: 0 }}>{ago(e.at)}</span>
    </div>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="faint" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
      {children}
    </div>
  )
}

export function ago(iso: string): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const m = Math.max(0, Math.round((Date.now() - t) / 60_000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.round(h / 24)
  return `${d}d`
}
