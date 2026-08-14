import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Avatar } from '@/components/Avatar'
import { QuizRunner, type QuizHudState } from '@/features/daily/QuizRunner'
import { useAuth } from '@/store/auth'
import { scoreQuestion } from '@/lib/progress'
import { buildCpuPlan, type CpuProfile } from './cpu'
import type { DailyVerse, PlayResult } from '@/types'

// A quiz run with a live CPU opponent racing the same clock. Shared by Bible
// Battle (vs a chosen difficulty) and Focus practice (vs a study companion): the
// CPU's answers reveal question-by-question via a real-time versus bar, then the
// caller is handed both final scores. Pure presentation + sim — the caller owns
// what a win/finish means (records, XP, next verse, …).
export function CpuVersusQuiz({
  verse,
  seed,
  profile,
  label,
  onFinish,
  onExit,
}: {
  verse: DailyVerse
  /** Seeds the CPU's pre-rolled answer plan (correctness + think-time per question). */
  seed: number
  profile: CpuProfile
  label?: ReactNode
  onFinish: (player: PlayResult, cpuScore: number) => void
  onExit: () => void
}) {
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
      label={label ?? `🤖 vs ${profile.name}`}
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
