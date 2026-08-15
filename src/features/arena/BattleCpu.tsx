import { useMemo, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { useAuth } from '@/store/auth'
import { useJuice } from '@/juice/useJuice'
import { newBattleSeed, battleVerse } from './battle'
import { CpuVersusQuiz } from './CpuVersusQuiz'
import { CPU_PROFILES, CPU_LEVELS, type CpuLevel, type CpuProfile } from './cpu'
import type { AvatarSpec, PlayResult } from '@/types'

// Solo Bible Battle vs a simulated CPU, reached from the Study tab. No account
// or opponent needed — you play the same seeded quiz while the CPU races the
// same clock, its score revealing live question-by-question for a real-time
// head-to-head feel.
export default function BattleCpu() {
  const navigate = useNavigate()
  const juice = useJuice()
  const [level, setLevel] = useState<CpuLevel | null>(null)
  const [seed, setSeed] = useState(() => newBattleSeed())
  const [outcome, setOutcome] = useState<{ player: PlayResult; cpuScore: number } | null>(null)

  const profile = level ? CPU_PROFILES[level] : null
  const verse = useMemo(() => battleVerse(seed), [seed])

  if (!level || !profile) {
    return (
      <CpuPicker
        onExit={() => navigate('/study')}
        onPick={(lv) => {
          juice.coin()
          setLevel(lv)
          setSeed(newBattleSeed())
          setOutcome(null)
        }}
      />
    )
  }

  if (outcome) {
    return (
      <CpuResult
        profile={profile}
        outcome={outcome}
        onRematch={() => {
          juice.coin()
          setSeed(newBattleSeed())
          setOutcome(null)
        }}
        onChange={() => {
          juice.select()
          setLevel(null)
          setOutcome(null)
        }}
        onDone={() => navigate('/study')}
      />
    )
  }

  return (
    <CpuVersusQuiz
      key={seed}
      verse={verse}
      seed={seed}
      profile={profile}
      label={`🤖 vs ${profile.name}`}
      onFinish={(player, cpuScore) => setOutcome({ player, cpuScore })}
      onExit={() => setLevel(null)}
    />
  )
}

// ── Difficulty picker ──
function CpuPicker({ onPick, onExit }: { onPick: (lv: CpuLevel) => void; onExit: () => void }) {
  return (
    <Page noNav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <button className="pill" onClick={onExit} aria-label="Back">✕</button>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Play vs CPU</b>
      </div>

      <div className="center" style={{ marginBottom: 18 }}>
        <div className="floaty" style={{ fontSize: 46 }}>🤖</div>
        <h1 style={{ fontSize: 26, marginTop: 4 }}>Race the CPU</h1>
        <p className="dim" style={{ marginTop: 4 }}>Same verse quiz, live head-to-head. Pick your challenger.</p>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {CPU_LEVELS.map((lv) => {
          const p = CPU_PROFILES[lv]
          return (
            <motion.button
              key={lv}
              whileTap={{ scale: 0.98 }}
              onClick={() => onPick(lv)}
              className="card"
              style={{ display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', width: '100%', padding: '14px 16px' }}
            >
              <div style={{ fontSize: 36, lineHeight: 1 }}>{p.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontWeight: 800, fontSize: 17 }}>{p.name}</b>
                <div className="faint" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.35 }}>{p.blurb}</div>
              </div>
              <span className="pill" style={{ background: 'var(--gold)', color: '#241f0a', fontWeight: 800, fontSize: 13 }}>Play</span>
            </motion.button>
          )
        })}
      </div>
      <p className="faint center" style={{ fontSize: 11, marginTop: 14, lineHeight: 1.4 }}>
        Practice runs — CPU battles don’t affect your rank or win record.
      </p>
      <div style={{ height: 30 }} />
    </Page>
  )
}

// ── Result screen ──
function CpuResult({
  profile,
  outcome,
  onRematch,
  onChange,
  onDone,
}: {
  profile: CpuProfile
  outcome: { player: PlayResult; cpuScore: number }
  onRematch: () => void
  onChange: () => void
  onDone: () => void
}) {
  const juice = useJuice()
  const me = useAuth((s) => s.profile)
  const you = outcome.player.score
  const cpu = outcome.cpuScore
  const result: 'won' | 'lost' | 'tie' = you > cpu ? 'won' : you < cpu ? 'lost' : 'tie'

  useEffect(() => {
    result === 'won' ? juice.levelUp() : juice.celebrate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Page noNav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <button className="pill" onClick={onDone} aria-label="Back">✕</button>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>vs {profile.name}</b>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 16 }}
        style={{ textAlign: 'center', margin: '10px 0 18px' }}
      >
        <div style={{ fontSize: 56 }}>{result === 'won' ? '🏆' : result === 'tie' ? '🤝' : '💪'}</div>
        <h1 className="gradient-text" style={{ fontSize: 30, marginTop: 4 }}>
          {result === 'won' ? 'You won!' : result === 'tie' ? "It's a tie!" : `${profile.name} wins`}
        </h1>
        <p className="dim" style={{ marginTop: 4 }}>
          {result === 'won' ? 'Faster and sharper. Nice run!' : result === 'tie' ? 'Down to the wire — rematch?' : 'So close — run it back 👀'}
        </p>
      </motion.div>

      <CpuScoreRow name={me?.username ? `@${me.username}` : 'You'} emoji={me?.avatarEmoji ?? '😇'} character={me?.avatarCharacter} score={you} winner={result === 'won'} />
      <div className="faint center" style={{ fontSize: 12, letterSpacing: '0.3em', margin: '2px 0' }}>VS</div>
      <CpuScoreRow name={profile.name} emoji={profile.emoji} score={cpu} winner={result === 'lost'} />

      <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
        <Button variant="gold" full onClick={onRematch}>🔁 Rematch {profile.name}</Button>
        <Button variant="secondary" full onClick={onChange}>Change difficulty</Button>
      </div>
      <div style={{ height: 30 }} />
    </Page>
  )
}

function CpuScoreRow({
  name,
  emoji,
  character,
  score,
  winner,
}: {
  name: string
  emoji: string
  character?: AvatarSpec | null
  score: number
  winner: boolean
}) {
  return (
    <div
      className="card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderColor: winner ? 'var(--gold)' : 'var(--stroke)',
        background: winner ? 'rgba(255,210,63,0.1)' : undefined,
      }}
    >
      <Avatar emoji={emoji} character={character} size={44} ring={false} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{name}</b>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className={winner ? 'gradient-text' : undefined} style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>
          {score.toLocaleString()}
        </div>
        <div className="faint" style={{ fontSize: 10 }}>{winner ? '👑 winner' : 'pts'}</div>
      </div>
    </div>
  )
}
