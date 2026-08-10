import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useGame } from '@/store/game'
import { CountUp } from '@/components/CountUp'
import { Avatar } from '@/components/Avatar'

// Ambient presence, NOT a leaderboard. A live opened-count plus a gentle,
// endlessly scrolling feed of people earning points. The feeling is warmth and
// company — "others are doing this with me today" — never ranking or pressure.
export function PresenceStrip() {
  const pulse = useGame((s) => s.pulse)
  const loadPulse = useGame((s) => s.loadPulse)

  useEffect(() => {
    loadPulse()
    const t = setInterval(loadPulse, 20000)
    return () => clearInterval(t)
  }, [loadPulse])

  if (!pulse) return null
  const feed = [...pulse.feed, ...pulse.feed] // duplicate for seamless loop

  return (
    <div className="card" style={{ padding: 14, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          <span style={{ width: 9, height: 9, borderRadius: 999, background: 'var(--good)', boxShadow: '0 0 10px var(--good)' }} />
        </span>
        <b style={{ fontFamily: 'var(--font-display)' }}>
          <CountUp to={pulse.opened} /> opened today’s verse
        </b>
      </div>

      <div style={{ position: 'relative', height: 34, overflow: 'hidden', maskImage: 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)' }}>
        <motion.div
          animate={{ x: ['0%', '-50%'] }}
          transition={{ repeat: Infinity, ease: 'linear', duration: 22 }}
          style={{ display: 'flex', gap: 10, whiteSpace: 'nowrap', position: 'absolute', alignItems: 'center' }}
        >
          {feed.map((f, i) => (
            <span key={i} className="pill" style={{ fontSize: 12, padding: '4px 10px 4px 5px', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              <Avatar emoji={f.avatarEmoji} size={20} ring={false} border={f.avatarBorder} badge={f.avatarBadge} />
              <span>@{f.username}</span>
              <span style={{ color: f.kind === 'levelup' ? 'var(--gold)' : 'var(--mint)' }}>
                {f.kind === 'levelup' ? `hit LVL ${f.points}` : `+${f.points}`}
              </span>
            </span>
          ))}
        </motion.div>
      </div>
    </div>
  )
}
