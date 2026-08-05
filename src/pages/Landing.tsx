import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button } from '@/components/Button'
import { Page } from '@/components/Page'
import { useAuth } from '@/store/auth'
import { useEffect } from 'react'

// Marketing / hero landing. On web this is the front door; inside the iOS app a
// returning user with a profile is bounced straight to /play.
export default function Landing() {
  const navigate = useNavigate()
  const profile = useAuth((s) => s.profile)

  useEffect(() => {
    if (profile) navigate('/play', { replace: true })
  }, [profile, navigate])

  return (
    <Page noNav>
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 22, paddingTop: 30 }}>
          <motion.div
            className="floaty"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 12 }}
            style={{ fontSize: 92, textAlign: 'center' }}
          >
            📖
          </motion.div>

          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: 46, lineHeight: 1.02 }}>
              <span className="gradient-text">Verse</span> Arcade
            </h1>
            <p className="dim" style={{ fontSize: 18, marginTop: 12, maxWidth: 340, marginInline: 'auto' }}>
              One verse. One shared drop a day. Beat the clock, keep your streak,
              and actually <b style={{ color: 'var(--gold)' }}>remember</b> it.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {['🔥 Daily streaks', '⚡ Beat the clock', '👥 Play with friends', '🃏 Collect verse cards'].map((t) => (
              <span key={t} className="pill">
                {t}
              </span>
            ))}
          </div>

          <p className="faint center" style={{ fontSize: 14, maxWidth: 320, marginInline: 'auto' }}>
            No shame, no pop quiz energy. Miss one? You still learn something
            surprising. It’s the Bible, but it’s a <i>game</i>.
          </p>
        </div>

        <div style={{ display: 'grid', gap: 12, paddingBottom: 'calc(var(--safe-bottom) + 20px)' }}>
          <Button variant="gold" full onClick={() => navigate('/welcome')}>
            Play today’s verse →
          </Button>
          <Button variant="ghost" full onClick={() => navigate('/auth')}>
            I already have an account
          </Button>
        </div>
      </div>
    </Page>
  )
}
