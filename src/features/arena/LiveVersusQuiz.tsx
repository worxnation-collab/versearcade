import { useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Avatar } from '@/components/Avatar'
import { QuizRunner, type QuizHudState } from '@/features/daily/QuizRunner'
import { useAuth } from '@/store/auth'
import { useLive, type LivePlayer } from '@/store/live'
import type { DailyVerse, PlayResult } from '@/types'

// A quiz run against a LIVE opponent — the same shape as CpuVersusQuiz, with the
// simulated plan replaced by messages off the wire. Deliberately the same shape:
// the versus bar is the thing players already understand from vs-CPU battles,
// and a second, different-looking race meter for live matches would be two
// designs for one idea.
//
// What is NOT here, on purpose: per-question lockstep. The feedback screen is
// self-paced because the teach line is the entire point of a wrong answer in
// this app — every answer reveals a fact — and a live match that yanked the
// verse away the moment the faster player tapped "Next" would make the reward
// for being slower "you don't get to read it". So the two runs drift by a few
// seconds and the bar says where the other player is.
//
// Drift costs nothing in fairness: every question is timed independently from
// the moment IT starts on YOUR device (see QuizRunner's startTs), so points are
// a function of how fast you answered your own question, never of whose clock
// started first. The only thing the ready-check has to buy is that the two
// people feel like they started together.
export function LiveVersusQuiz({
  verse,
  opponent,
  onFinish,
  onExit,
}: {
  verse: DailyVerse
  opponent: LivePlayer | null
  onFinish: (result: PlayResult) => void
  onExit: () => void
}) {
  const stage = useLive((s) => s.stage)
  const setReady = useLive((s) => s.setReady)
  const opponentReady = useLive((s) => s.opponentReady)

  const hud = useCallback(
    (s: QuizHudState) => (
      <LiveVersusBar opponent={opponent} playerScore={s.score} qi={s.qi} total={s.total} phase={s.phase} />
    ),
    [opponent],
  )

  const onComplete = useCallback(async (result: PlayResult) => onFinish(result), [onFinish])

  return (
    <QuizRunner
      verse={verse}
      onComplete={onComplete}
      onExit={onExit}
      label={opponent ? `🔴 LIVE vs @${opponent.username}` : '🔴 Live battle'}
      hud={hud}
      startGate={{
        open: stage === 'playing',
        onReady: setReady,
        readyLabel: 'I’ve read it — I’m ready ✋',
        waitingLabel: opponentReady
          ? 'Starting…'
          : `Waiting for ${opponent ? `@${opponent.username}` : 'your opponent'}…`,
      }}
    />
  )
}

// ── The live versus bar. Same anatomy as the vs-CPU one: two scores, a race
//    meter, and a status line — but the status is a real person's position in
//    their own run, which is the thing that makes a live match legible when the
//    two of you drift apart on the teach lines. ──
function LiveVersusBar({
  opponent,
  playerScore,
  qi,
  total: totalQuestions,
  phase,
}: {
  opponent: LivePlayer | null
  playerScore: number
  qi: number
  total: number
  phase: QuizHudState['phase']
}) {
  const me = useAuth((s) => s.profile)
  const sendProgress = useLive((s) => s.sendProgress)
  const them = useLive((s) => s.progress)
  const opponentGone = useLive((s) => s.opponentGone)
  const opponentReady = useLive((s) => s.opponentReady)

  // Broadcast my position whenever it changes. This is an effect in the HUD
  // rather than a call from QuizRunner's handlers because the HUD is the one
  // place that already sees the live score — and an effect fires AFTER render,
  // where a send from inside a render body would double-fire under StrictMode.
  const locked = phase === 'feedback'
  useEffect(() => {
    sendProgress({ score: playerScore, qi, locked, done: false })
  }, [sendProgress, playerScore, qi, locked])

  const total = playerScore + them.score
  const myPct = total === 0 ? 50 : (playerScore / total) * 100
  const leading = playerScore >= them.score

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
            <div className="faint" style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {opponent ? `@${opponent.username}` : 'OPPONENT'}
            </div>
            <div className={!leading && total > 0 ? 'gradient-text' : undefined} style={{ fontFamily: 'var(--font-display)', fontSize: 17, lineHeight: 1.1 }}>
              {them.score.toLocaleString()}
            </div>
          </div>
          <Avatar emoji={opponent?.avatarEmoji ?? '🙂'} character={opponent?.avatarCharacter} size={30} ring={false} />
        </div>
      </div>

      <div style={{ marginTop: 9, height: 8, borderRadius: 999, overflow: 'hidden', display: 'flex', background: 'rgba(0,0,0,0.3)' }}>
        <motion.div
          animate={{ width: `${myPct}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          style={{ height: '100%', background: 'linear-gradient(90deg, var(--good), var(--sky))' }}
        />
        <div style={{ flex: 1, background: 'linear-gradient(90deg, var(--grape), var(--coral))' }} />
      </div>

      <div style={{ marginTop: 6, textAlign: 'center', minHeight: 15 }}>
        {opponentGone ? (
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--sky)' }}>
            📴 They dropped — finish your run, it still counts
          </span>
        ) : phase === 'read' ? (
          // Before the gate opens, "on question 1" is a lie — nobody has been
          // asked anything yet. This line is the ready-check, mirrored.
          <span className="faint" style={{ fontSize: 11, fontWeight: 700 }}>
            {opponentReady ? '✋ They’re ready — waiting on you' : '📖 They’re still reading…'}
          </span>
        ) : (
          <span className="faint" style={{ fontSize: 11, fontWeight: 700 }}>
            {them.done
              ? '🏁 They’ve finished — play your own out'
              : them.locked
                ? `🔒 Locked question ${them.qi + 1}`
                : `💭 On question ${them.qi + 1} of ${totalQuestions}`}
          </span>
        )}
      </div>
    </div>
  )
}
