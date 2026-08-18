import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { usePractice } from '@/store/practice'
import { useJuice } from '@/juice/useJuice'
import { todayLocalDate } from '@/lib/date'
import { daysBetween } from '@/lib/practice'
import { FavoriteButton } from '@/components/FavoriteButton'

export default function PracticeResultScreen() {
  const navigate = useNavigate()
  const juice = useJuice()
  const { date = '' } = useParams()
  const lastResult = usePractice((s) => s.lastResult)
  const verse = usePractice((s) => s.verse)

  const outcome = lastResult?.outcome

  // Celebrate a genuine reward; otherwise a calm study close.
  useEffect(() => {
    if (!outcome) return
    const t = setTimeout(() => {
      if (outcome.rewarded) juice.celebrate()
      else juice.whoosh()
    }, 300)
    return () => clearTimeout(t)
  }, [outcome, juice])

  useEffect(() => {
    if (!lastResult) navigate('/play', { replace: true })
  }, [lastResult, navigate])

  if (!outcome) return null

  const delta = outcome.score - outcome.previousBest
  const daysToUnlock = outcome.nextRewardOn ? Math.max(0, daysBetween(todayLocalDate(), outcome.nextRewardOn)) : 0

  const headline = outcome.rewarded
    ? 'New personal best! 🏆'
    : outcome.weeklyLocked
      ? 'New best — no bonus this week'
      : outcome.improved
        ? 'New best!'
        : 'Good study 📖'

  const emoji = outcome.rewarded ? '🏆' : outcome.improved ? '📈' : '📖'

  return (
    <Page noNav>
      <div style={{ textAlign: 'center', paddingTop: 16 }}>
        <motion.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 12 }}>
          <div style={{ fontSize: 60 }}>{emoji}</div>
        </motion.div>

        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, marginTop: 6 }}>{headline}</h1>
        {verse && <p className="dim" style={{ marginTop: 4 }}>{verse.reference} · practice</p>}

        {/* Score vs. best */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 18 }}>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 24 }}>{outcome.score.toLocaleString()}</div>
            <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>This run</div>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 24 }}>{outcome.newBest.toLocaleString()}</div>
            <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your best</div>
          </div>
        </div>

        {/* Reward / status */}
        {outcome.rewarded ? (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 18 }}
            className="card"
            style={{ marginTop: 16, borderColor: 'var(--gold)', background: 'rgba(255,210,63,0.12)' }}
          >
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 30 }} className="gradient-text">
              +{outcome.xpEarned} XP
            </div>
            <p className="dim" style={{ fontSize: 13, marginTop: 4 }}>
              You beat your best by {delta.toLocaleString()} — bonus scales with how much you improve.
              This verse’s bonus returns in {daysToUnlock} day{daysToUnlock === 1 ? '' : 's'}.
            </p>
          </motion.div>
        ) : outcome.weeklyLocked ? (
          <div className="card" style={{ marginTop: 16 }}>
            <p style={{ fontWeight: 700 }}>Nice — that’s a new best! 📈</p>
            <p className="dim" style={{ fontSize: 13, marginTop: 4 }}>
              You already earned this verse’s weekly bonus. It opens again in{' '}
              <b style={{ color: 'var(--sky)' }}>{daysToUnlock} day{daysToUnlock === 1 ? '' : 's'}</b> — beat this
              score then to earn more.
            </p>
          </div>
        ) : (
          <div className="card" style={{ marginTop: 16 }}>
            <p className="dim" style={{ fontSize: 14 }}>
              No bonus this time — beat your best of <b style={{ color: 'var(--gold)' }}>{outcome.previousBest.toLocaleString()}</b> to
              earn XP. Replaying is always free to study. 📖
            </p>
          </div>
        )}

        {/* The verse itself, with the one gesture that keeps it. A practice run
            is study, so the text is the payoff — not the score above it. */}
        {verse && (
          <div className="card" style={{ marginTop: 14, textAlign: 'left' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <b style={{ fontFamily: 'var(--font-display)', fontSize: 17, flex: 1, minWidth: 0 }}>{verse.reference}</b>
              <FavoriteButton reference={verse.reference} variant="icon" />
            </div>
            <p style={{ marginTop: 8, lineHeight: 1.5 }}>“{verse.text}”</p>
          </div>
        )}

        <div style={{ display: 'grid', gap: 10, marginTop: 22 }}>
          <Button variant="gold" full onClick={() => navigate(`/play/practice/${date}`, { replace: true })}>
            ↻ Practice again
          </Button>
          <Button variant="ghost" full onClick={() => navigate('/play')}>Back home</Button>
        </div>
      </div>
    </Page>
  )
}
