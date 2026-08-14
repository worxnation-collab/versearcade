import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { QuizRunner, type QuizHudState } from '@/features/daily/QuizRunner'
import { useAuth } from '@/store/auth'
import { useJuice } from '@/juice/useJuice'
import { scoreQuestion } from '@/lib/progress'
import { newBattleSeed, battleVerse } from './battle'
import { CPU_PROFILES, CPU_LEVELS, buildCpuPlan, type CpuLevel, type CpuProfile } from './cpu'
import type { AvatarSpec, PlayResult } from '@/types'

// Solo Bible Battle vs a simulated CPU. No account or opponent needed — you play
// the same seeded quiz while the CPU races the same clock, its score revealing
// live question-by-question for a real-time head-to-head feel.
export default function BattleCpu() {
  const navigate = useNavigate()
  const juice = useJuice()
  const [level, setLevel] = useState<CpuLevel | null>(null)
  const [seed, setSeed] = useState(() => newBattleSeed())
  const [outcome, setOutcome] = useState<{ player: PlayResult; cpuScore: number } | null>(null)

  const profile = level ? CPU_PROFILES[level] : null

  if (!level || !profile) {
    return (
      <CpuPicker
        onExit={() => navigate('/battle')}
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
        onDone={() => navigate('/battle')}
      />
    )
  }

  return (
    <CpuMatch
      key={seed}
      seed={seed}
      profile={profile}
      onFinish={(player, cpuScore) => setOutcome({ player, cpuScore })}
      onExit={() => setLevel(null)}
    />
  )
}

// ── The live match: QuizRunner + a real-time versus HUD driven by the CPU sim ──
function CpuMatch({
  seed,
  profile,
  onFinish,
  onExit,
}: {
  seed: number
  profile: CpuProfile
  onFinish: (player: PlayResult, cpuScore: number) => void
  onExit: () => void
}) {
  const verse = useMemo(() => battleVerse(seed), [seed])
  const plan = useMemo(() => buildCpuPlan(seed, verse.questions.length, profile), [seed, verse, profile])

  const [cpuScore, setCpuScore] = useState(0)
  const [status, setStatus] = useState<'thinking' | 'answered'>('thinking')
  const comboRef = useRef(0)
  const scoreRef = useRef(0)
  const resolved = useRef<Set<number>>(new Set())
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => clearTimeout(timer.current), [])

  // Lock in the CPU's answer for a question (via its own timer, or early when the
  // player answers first) — scored with the same rules as the player.
  const resolve = useCallback(
    (qi: number) => {
      if (resolved.current.has(qi)) return
      resolved.current.add(qi)
      clearTimeout(timer.current)
      const step = plan[qi]
      scoreRef.current += scoreQuestion(step.correct, step.answerMs, comboRef.current)
      comboRef.current = step.correct ? comboRef.current + 1 : 0
      setCpuScore(scoreRef.current)
      setStatus('answered')
    },
    [plan],
  )

  const onQuestionStart = useCallback(
    (qi: number) => {
      setStatus('thinking')
      clearTimeout(timer.current)
      timer.current = setTimeout(() => resolve(qi), plan[qi].answerMs)
    },
    [plan, resolve],
  )

  const onReveal = useCallback((qi: number) => resolve(qi), [resolve])

  const onComplete = useCallback(
    async (player: PlayResult) => {
      for (let i = 0; i < plan.length; i++) resolve(i)
      onFinish(player, scoreRef.current)
    },
    [plan, resolve, onFinish],
  )

  const hud = useCallback(
    (s: QuizHudState) => <VersusBar profile={profile} playerScore={s.score} cpuScore={cpuScore} status={status} phase={s.phase} />,
    [profile, cpuScore, status],
  )

  return (
    <QuizRunner
      verse={verse}
      onComplete={onComplete}
      onExit={onExit}
      label={`🤖 vs ${profile.name}`}
      hud={hud}
      onQuestionStart={onQuestionStart}
      onReveal={onReveal}
    />
  )
}

// ── Real-time versus bar: two live scores, an animated race meter, and the CPU's
//    think/lock status so you can feel the opponent racing the same clock. ──
function VersusBar({
  profile,
  playerScore,
  cpuScore,
  status,
  phase,
}: {
  profile: CpuProfile
  playerScore: number
  cpuScore: number
  status: 'thinking' | 'answered'
  phase: QuizHudState['phase']
}) {
  const me = useAuth((s) => s.profile)
  const total = playerScore + cpuScore
  const myPct = total === 0 ? 50 : (playerScore / total) * 100
  const leading = playerScore >= cpuScore

  return (
    <div className="card" style={{ padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <Avatar emoji={me?.avatarEmoji ?? '😇'} character={me?.avatarCharacter} size={30} ring={false} />
          <div style={{ minWidth: 0 }}>
            <div className="faint" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em' }}>YOU</div>
            <div className={leading && total > 0 ? 'gradient-text' : undefined} style={{ fontFamily: 'var(--font-display)', fontSize: 17, lineHeight: 1.1 }}>
              {playerScore.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="faint" style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.12em' }}>VS</div>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', minWidth: 0 }}>
          <div style={{ textAlign: 'right', minWidth: 0 }}>
            <div className="faint" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{profile.name}</div>
            <div className={!leading && total > 0 ? 'gradient-text' : undefined} style={{ fontFamily: 'var(--font-display)', fontSize: 17, lineHeight: 1.1 }}>
              {cpuScore.toLocaleString()}
            </div>
          </div>
          <motion.div
            animate={phase === 'question' && status === 'thinking' ? { rotate: [0, -8, 8, 0] } : { rotate: 0 }}
            transition={{ repeat: phase === 'question' && status === 'thinking' ? Infinity : 0, duration: 1.1 }}
            style={{ fontSize: 26, lineHeight: 1 }}
          >
            {profile.emoji}
          </motion.div>
        </div>
      </div>

      {/* Animated race meter — your gain pushes the divider toward the CPU. */}
      <div style={{ marginTop: 9, height: 8, borderRadius: 999, overflow: 'hidden', display: 'flex', background: 'rgba(0,0,0,0.3)' }}>
        <motion.div
          animate={{ width: `${myPct}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          style={{ height: '100%', background: 'linear-gradient(90deg, var(--good), var(--sky))' }}
        />
        <div style={{ flex: 1, background: 'linear-gradient(90deg, var(--grape), var(--coral))' }} />
      </div>

      <div style={{ marginTop: 6, textAlign: 'center', minHeight: 15 }}>
        {phase === 'question' && (
          <span className="faint" style={{ fontSize: 11, fontWeight: 700 }}>
            {status === 'thinking' ? `💭 ${profile.name} is thinking…` : `🔒 ${profile.name} locked it in`}
          </span>
        )}
        {phase === 'feedback' && (
          <span style={{ fontSize: 11, fontWeight: 800, color: playerScore > cpuScore ? 'var(--good)' : playerScore < cpuScore ? 'var(--coral)' : 'var(--ink-faint)' }}>
            {playerScore > cpuScore ? "You're ahead! 🔥" : playerScore < cpuScore ? `${profile.name} is ahead` : 'Dead even'}
          </span>
        )}
      </div>
    </div>
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
