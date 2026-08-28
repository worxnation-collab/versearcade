import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { WashFeetButton } from '@/components/WashFeetButton'
import { useAuth } from '@/store/auth'
import { useBuddies } from '@/store/buddies'
import { useWashing } from '@/store/washing'
import { useJuice } from '@/juice/useJuice'
import {
  WASH_DAILY_CAP,
  WASH_MILESTONES,
  nextWashMilestone,
  washRank,
} from '@/data/washing'

// The Basin — the You tab's home for washing feet: what you've done, who's
// waiting, and who knelt for you.
//
// The whole section is written to be un-rankable. It shows YOUR lifetime count
// and nobody else's, the ladder is a set of numbers you passed rather than a
// place you hold, and the people who washed your feet are shown as faces in
// join order with no counts beside them — a crowd, not a board (the same rule
// the church roster follows).
export function BasinSection() {
  const navigate = useNavigate()
  const juice = useJuice()
  const isGuest = useAuth((s) => s.mode) === 'local'
  const { loaded, lifetime, received, recent, load, remaining } = useWashing()
  const buddies = useBuddies((s) => s.buddies)
  const loadBuddies = useBuddies((s) => s.load)
  const [cheer, setCheer] = useState<string | null>(null)

  useEffect(() => {
    if (isGuest) return
    void load()
    void loadBuddies()
  }, [isGuest, load, loadBuddies])

  if (isGuest) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 34 }}>🫗</div>
        <p style={{ margin: '8px 0 14px' }}>
          Washing feet needs somebody on the other end of it, so it comes with an account. Free, and your streak and
          character come with you.
        </p>
        <Button variant="gold" full onClick={() => navigate('/auth?mode=signup')}>Create an account</Button>
      </div>
    )
  }

  const rank = washRank(lifetime)
  const next = nextWashMilestone(lifetime)
  const left = remaining()

  return (
    <>
      {/* What you've done. One number, and it only goes up. */}
      <div className="card" style={{ textAlign: 'center', marginBottom: 14 }}>
        <div className="floaty" style={{ fontSize: 38 }}>🫗</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 900, lineHeight: 1.1 }}>
          {loaded ? lifetime : '—'}
        </div>
        <div className="dim" style={{ fontSize: 13 }}>
          {lifetime === 1 ? 'pair of feet washed' : 'pairs of feet washed'}
        </div>
        {rank && (
          <div className="pill" style={{ marginTop: 10, display: 'inline-block', fontWeight: 800, fontSize: 12, color: 'var(--gold)' }}>
            {rank.emoji} {rank.name}
          </div>
        )}
        <p className="faint" style={{ fontSize: 12, marginTop: 10 }}>
          {left > 0
            ? `${left} of ${WASH_DAILY_CAP} left today — one for each disciple. Each one pays you 1 XP.`
            : `That's all ${WASH_DAILY_CAP} for today. Twelve is the whole room.`}
        </p>
        <p className="faint" style={{ fontSize: 11, marginTop: 6, fontStyle: 'italic' }}>
          “Ye also ought to wash one another’s feet.” — John 13:14
        </p>
      </div>

      {cheer && (
        <motion.div
          className="card"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ marginBottom: 14, textAlign: 'center', borderColor: 'var(--gold)', background: 'rgba(255,210,63,0.08)' }}
        >
          <b style={{ fontFamily: 'var(--font-display)' }}>{cheer}</b>
        </motion.div>
      )}

      {/* Who's near you. Buddies first — the people most likely to notice. */}
      <h3 className="dim" style={{ fontSize: 16, margin: '4px 0 10px' }}>Wash a buddy’s feet</h3>
      {buddies.length === 0 ? (
        <p className="faint" style={{ fontSize: 14, marginBottom: 18 }}>
          No buddies yet — add someone below, or tap any player’s face anywhere in the app and wash their feet from
          their card.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 8, marginBottom: 18 }}>
          {/* Deliberately NOT sorted by who's washed: the list is fixed while
              you work down it, so the row under your thumb never moves out from
              under it the moment you tap. */}
          {buddies.map((u) => (
            <div key={u.username} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Avatar emoji={u.avatar_emoji} character={u.avatar_character} size={38} ring={false} username={u.username} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontWeight: 800 }}>@{u.username}</b>
                <div className="faint" style={{ fontSize: 12 }}>Level {u.level}</div>
              </div>
              <WashFeetButton
                username={u.username}
                onWashed={(m) => {
                  if (!m) return
                  juice.celebrate()
                  setCheer(`${m.emoji} ${m.name} — ${m.blurb}`)
                }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Who knelt for you. A gift, so it's faces and no numbers beside them. */}
      <h3 className="dim" style={{ fontSize: 16, margin: '4px 0 10px' }}>
        Washed for you{received > 0 && <span style={{ color: 'var(--gold)' }}> · {received}</span>}
      </h3>
      {recent.length === 0 ? (
        <p className="faint" style={{ fontSize: 14, marginBottom: 18 }}>
          Nobody yet. It’s not a score — it’s just nice when it happens.
        </p>
      ) : (
        <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
          {recent.map((u, i) => (
            <div key={`${u.username}-${i}`} style={{ textAlign: 'center', width: 58 }}>
              <Avatar emoji={u.avatar_emoji} character={u.avatar_character} size={40} ring={false} username={u.username} />
              <div className="faint" style={{ fontSize: 10, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                @{u.username}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* The ladder. Nothing expires and nothing resets. */}
      <h3 className="dim" style={{ fontSize: 16, margin: '4px 0 10px' }}>
        The ladder{next && <span className="faint" style={{ fontWeight: 600 }}> · {next.goal - lifetime} to go</span>}
      </h3>
      <div style={{ display: 'grid', gap: 8 }}>
        {WASH_MILESTONES.map((m) => {
          const got = lifetime >= m.goal
          const pct = Math.min(100, Math.round((lifetime / m.goal) * 100))
          return (
            <div
              key={m.id}
              className="card"
              style={{ display: 'flex', alignItems: 'center', gap: 12, borderColor: got ? 'var(--gold)' : undefined }}
            >
              <div style={{ fontSize: 24, opacity: got ? 1 : 0.45 }}>{m.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontWeight: 800, fontSize: 14 }}>
                  {m.name} <span className="faint" style={{ fontWeight: 600 }}>· {m.goal}</span>
                </b>
                <div className="faint" style={{ fontSize: 12 }}>{m.blurb}</div>
                {!got && (
                  <div style={{ height: 5, borderRadius: 999, background: 'var(--stroke)', marginTop: 6, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: 'var(--grape)' }} />
                  </div>
                )}
              </div>
              {got && <span style={{ color: 'var(--gold)', fontWeight: 900 }}>✓</span>}
            </div>
          )
        })}
      </div>
    </>
  )
}
