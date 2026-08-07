import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { CountUp } from '@/components/CountUp'
import { StreakFlame } from '@/components/StreakFlame'
import { useGame } from '@/store/game'
import { useAuth } from '@/store/auth'
import { useJuice } from '@/juice/useJuice'
import { buildShareText, shareResult, earnedCards } from './shareCard'
import { collectibleByKey, rarityColor } from '@/data/collectibles'
import { useCollection } from '@/store/collection'
import { OAuthButtons } from '@/features/auth/oauthUi'

export default function ResultScreen() {
  const navigate = useNavigate()
  const juice = useJuice()
  const { today, lastResult } = useGame()
  const profile = useAuth((s) => s.profile)!
  const isGuest = useAuth((s) => s.mode) === 'local'
  const [shareState, setShareState] = useState<string | null>(null)
  const [signInErr, setSignInErr] = useState<string | null>(null)

  const result = lastResult?.result
  const outcome = lastResult?.outcome

  const cards = useMemo(
    () => (result && outcome ? earnedCards(result, outcome, profile.totalPlays) : []),
    [result, outcome, profile.totalPlays],
  )
  // Persist earned cards to the account (or device for guests) so they stick.
  useEffect(() => {
    if (cards.length) useCollection.getState().grant(cards)
  }, [cards])

  // Celebrate on arrival — the reason people come back is this moment feels good.
  useEffect(() => {
    if (!outcome) return
    const t = setTimeout(() => {
      if (outcome.leveledUp) juice.levelUp()
      else if (outcome.currentStreak >= 3) juice.streak()
      else juice.celebrate()
    }, 350)
    return () => clearTimeout(t)
  }, [outcome, juice])

  useEffect(() => {
    if (!lastResult) navigate('/play', { replace: true })
  }, [lastResult, navigate])

  if (!result || !outcome || !today) return null

  const doShare = async () => {
    const text = buildShareText(result, outcome)
    const r = await shareResult(text)
    setShareState(r === 'copied' ? 'Copied to clipboard!' : r === 'shared' ? 'Shared!' : 'Could not share')
  }

  return (
    <Page noNav>
      <div style={{ textAlign: 'center', paddingTop: 12 }}>
        <motion.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 12 }}>
          <div style={{ fontSize: 60 }}>{outcome.leveledUp ? '🎉' : result.correctCount === result.totalQuestions ? '💎' : '⭐'}</div>
        </motion.div>

        <p className="dim" style={{ marginTop: 4 }}>You scored</p>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 64, lineHeight: 1 }}>
          <CountUp to={result.score} duration={1200} tickSound className="gradient-text" />
        </div>

        {/* The teaching payoff: reveal what the verse actually was. */}
        <div className="card" style={{ marginTop: 18, textAlign: 'left' }}>
          <span className="pill" style={{ marginBottom: 8 }}>📖 Today’s verse</span>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{today.reference}</b>
          <p style={{ marginTop: 6, lineHeight: 1.5 }}>“{today.text}”</p>
          {today.facts[0] && <p className="faint" style={{ marginTop: 10, fontSize: 13 }}>💡 {today.facts[0]}</p>}
        </div>

        {/* Level up / XP */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 16 }}>
          <Tile label="XP earned" value={`+${outcome.xpEarned ?? 0}`} accent="var(--gold)" />
          <Tile label="Level" value={`${outcome.level}`} accent={outcome.leveledUp ? 'var(--good)' : undefined} badge={outcome.leveledUp ? 'UP!' : undefined} />
          <Tile label="Correct" value={`${result.correctCount}/${result.totalQuestions}`} />
        </div>

        {/* Streak */}
        <motion.div className="card" style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}
          animate={outcome.currentStreak >= 3 ? { scale: [1, 1.03, 1] } : {}} transition={{ repeat: 2, duration: 0.5 }}>
          <StreakFlame days={outcome.currentStreak} size={26} />
          <span className="dim">
            {outcome.usedFreeze ? 'Streak freeze saved you! 🛟' : outcome.currentStreak === 1 ? 'Streak started — come back tomorrow!' : `${outcome.currentStreak}-day streak. Don’t break it!`}
          </span>
        </motion.div>

        {/* Collectibles earned */}
        {cards.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <p className="faint" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>New verse card{cards.length > 1 ? 's' : ''}!</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              {cards.map((k) => {
                const c = collectibleByKey(k)
                if (!c) return null
                return (
                  <motion.div key={k} initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 16 }}
                    className="card" style={{ padding: 12, minWidth: 92, borderColor: rarityColor[c.rarity] }}>
                    <div style={{ fontSize: 30 }}>{c.emoji}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, marginTop: 4 }}>{c.name}</div>
                    <div style={{ fontSize: 10, color: rarityColor[c.rarity], textTransform: 'uppercase' }}>{c.rarity}</div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        )}

        {/* The moment of highest intent: they just got the payoff. Ask guests to
            save it before they bounce. */}
        {isGuest && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, type: 'spring', stiffness: 220, damping: 20 }}
            className="card"
            style={{ marginTop: 20, textAlign: 'left', borderColor: 'var(--gold)', background: 'rgba(255,209,102,0.10)' }}
          >
            <div style={{ fontSize: 26 }}>💾</div>
            <b style={{ fontSize: 17, display: 'block', marginTop: 2 }}>Save your streak</b>
            <p className="dim" style={{ fontSize: 13, marginTop: 4 }}>
              You’re playing as a guest. Create a free account so your streak, XP, and verse
              cards sync across devices — and never reset.
            </p>
            <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
              <OAuthButtons onError={setSignInErr} />
              <Button variant="ghost" full onClick={() => navigate('/auth')}>
                Use email instead
              </Button>
            </div>
            {signInErr && (
              <p style={{ color: 'var(--coral)', fontSize: 13, marginTop: 8, textAlign: 'center' }}>{signInErr}</p>
            )}
          </motion.div>
        )}

        <div style={{ display: 'grid', gap: 10, marginTop: 22 }}>
          <Button variant="gold" full onClick={doShare}>📤 Share my result</Button>
          {shareState && <p className="faint" style={{ fontSize: 13 }}>{shareState}</p>}
          <Button variant="secondary" full onClick={() => navigate('/groups')}>👥 Add this to a group climb</Button>
          <Button variant="ghost" full onClick={() => navigate('/play')}>Back home</Button>
        </div>
      </div>
    </Page>
  )
}

function Tile({ label, value, accent, badge }: { label: string; value: string; accent?: string; badge?: string }) {
  return (
    <div className="card" style={{ padding: 12, position: 'relative' }}>
      {badge && (
        <span style={{ position: 'absolute', top: -8, right: -6, background: 'var(--good)', color: '#04210f', fontSize: 10, fontWeight: 900, padding: '2px 6px', borderRadius: 999 }}>{badge}</span>
      )}
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: accent }}>{value}</div>
      <div className="faint" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  )
}
