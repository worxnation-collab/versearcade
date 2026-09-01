import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { ComboMeter } from '@/components/ComboMeter'
import { CountUp } from '@/components/CountUp'
import { useJuice } from '@/juice/useJuice'
import { useBookAccuracy } from '@/store/bookAccuracy'
import { useBible } from '@/store/bible'
import { useDrops } from '@/store/drops'
import { useSeason } from '@/store/season'
import { scoreQuestion } from '@/lib/progress'
import { SCORING } from '@/lib/config'
import type { DailyVerse, PlayResult } from '@/types'

type Phase = 'read' | 'question' | 'feedback' | 'submitting'

interface Answered {
  choiceIndex: number
  correct: boolean
  timeMs: number
  points: number
}

/**
 * Holds the read phase until everybody says go — a live battle's ready-check.
 *
 * It lives HERE rather than in a wrapper for the reason every other cross-mode
 * concern does: the read phase and the button that ends it belong to QuizRunner,
 * and a caller that wanted to gate them would have to draw a second copy of the
 * verse card above the real one. So the caller supplies the words and the "has
 * everyone said go" answer, and the clock still starts in exactly one place.
 */
export interface StartGate {
  /** Flips true once every player has readied — the clock starts on the flip. */
  open: boolean
  /** Fired when this player taps the button. */
  onReady: () => void
  /** The button before it is tapped. */
  readyLabel: ReactNode
  /** The button after it is tapped, while the gate is still shut. */
  waitingLabel: ReactNode
}

/** Live snapshot handed to an optional HUD slot (e.g. a vs-CPU versus bar). */
export interface QuizHudState {
  score: number
  qi: number
  total: number
  phase: Phase
  justCorrect: boolean | null
}

// The full quiz gameplay — read → timed questions → score. Shared by the daily
// drop (QuizScreen), practice replays (PracticeQuizScreen) and vs-CPU battles
// (CpuVersusQuiz). It owns the run state and scoring; the caller decides what
// "done" means via onComplete (which persists the result and navigates), and
// gets a spot for a mode label + the exit target.
export function QuizRunner({
  verse,
  onComplete,
  onExit,
  label,
  hud,
  onQuestionStart,
  onReveal,
  startGate,
  studyDrop = false,
}: {
  verse: DailyVerse
  onComplete: (result: PlayResult) => Promise<void>
  onExit: () => void
  /** Small pill under the HUD, e.g. "Practice" — omitted for the daily drop. */
  label?: ReactNode
  /**
   * Opt this run into a study drop roll (see lib/drops.ts). Off by default and
   * set only by the Study tab's surfaces: the daily drop and real battles carry
   * their own rewards, and a relic falling out of a ranked match would tie a
   * find to standing — the one thing the Study loop is not allowed to do.
   */
  studyDrop?: boolean
  /** Optional live HUD (rendered under the score row) — used by vs-CPU battles
      to show a real-time versus bar. Gets the current run snapshot each render. */
  hud?: (s: QuizHudState) => ReactNode
  /** Fired when a question's clock starts — lets an opponent race the same clock. */
  onQuestionStart?: (qi: number) => void
  /** Fired the moment the player locks an answer — lets an opponent sync up. */
  onReveal?: (qi: number, correct: boolean, timeMs: number) => void
  /** Optional ready-check on the read phase — see StartGate. */
  startGate?: StartGate
}) {
  const juice = useJuice()

  const [phase, setPhase] = useState<Phase>('read')
  const [qi, setQi] = useState(0)
  const [combo, setCombo] = useState(0)
  const [comboMax, setComboMax] = useState(0)
  const [score, setScore] = useState(0)
  const [answered, setAnswered] = useState<Answered | null>(null)
  const [answers, setAnswers] = useState<Answered[]>([])
  const [pop, setPop] = useState<{ id: number; text: string } | null>(null)
  const [waitingToStart, setWaitingToStart] = useState(false)
  const startTs = useRef(0)
  const timeout = useRef<ReturnType<typeof setTimeout>>()

  const questions = verse.questions
  const q = questions[qi]
  const isLast = qi === questions.length - 1

  // What the read phase promises, derived from the run rather than passed in —
  // a prop would let a caller describe a run it didn't build. A bonus question
  // is about the whole BOOK, so a run that holds one must not still say every
  // question is about this exact verse.
  const bonusCount = questions.filter((x) => x.bonus).length
  const verseCount = questions.length - bonusCount
  const readPromise =
    bonusCount === 0
      ? `In a second you’ll answer ${questions.length} quick questions about this exact verse.`
      : verseCount === 0
        ? `In a second you’ll answer ${questions.length} quick questions about the book it comes from.`
        : `In a second you’ll answer ${questions.length} quick questions — ${verseCount} about this verse, ` +
          `then a bonus about the book it comes from.`
  const multiplier = Math.min(SCORING.comboMax, 1 + combo * SCORING.comboStep)

  const beginQuestion = useCallback(() => {
    startTs.current = performance.now()
    setAnswered(null)
    setPhase('question')
  }, [])

  // The gate opened (everyone is ready) — start the clock, from the one place
  // that ever starts it.
  useEffect(() => {
    if (startGate?.open && phase === 'read') beginQuestion()
  }, [startGate?.open, phase, beginQuestion])

  // Per-question timer: running out = a gentle miss (still reveals the fact).
  useEffect(() => {
    if (phase !== 'question') return
    onQuestionStart?.(qi)
    timeout.current = setTimeout(() => handleAnswer(-1), SCORING.answerWindowMs)
    return () => clearTimeout(timeout.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, qi])

  const handleAnswer = (choiceIndex: number) => {
    if (answered) return
    clearTimeout(timeout.current)
    const timeMs = Math.round(performance.now() - startTs.current)
    const correct = choiceIndex === q.answerIndex
    const points = scoreQuestion(correct, timeMs, combo)

    if (correct) {
      const nextCombo = combo + 1
      setCombo(nextCombo)
      setComboMax((m) => Math.max(m, nextCombo))
      setScore((s) => s + points)
      setPop({ id: Date.now(), text: `+${points}` })
      juice.correct()
      if (nextCombo >= 2) setTimeout(() => juice.combo(nextCombo), 120)
    } else {
      setCombo(0)
      juice.wrong()
    }

    const a: Answered = { choiceIndex, correct, timeMs, points }
    setAnswered(a)
    setAnswers((arr) => [...arr, a])
    setPhase('feedback')
    onReveal?.(qi, correct, timeMs)
  }

  const next = async () => {
    if (!isLast) {
      setQi((i) => i + 1)
      beginQuestion()
      return
    }
    // Finalize the run.
    setPhase('submitting')
    juice.whoosh()
    const correctCount = answers.filter((a) => a.correct).length
    const totalTime = answers.reduce((s, a) => s + a.timeMs, 0)
    const result: PlayResult = {
      score,
      timeMs: totalTime,
      correctCount,
      totalQuestions: questions.length,
      comboMax,
      perQuestion: answers.map((a) => ({ correct: a.correct, timeMs: a.timeMs, choiceIndex: a.choiceIndex })),
    }
    // Every finished run feeds per-book accuracy, whatever mode it came from —
    // knowing Romans is knowing Romans whether it was a daily drop or a battle.
    // (An abandoned run doesn't count: a quit isn't a wrong answer.)
    useBookAccuracy.getState().record(verse.book, correctCount, answers.length)
    // …and lights the verse up in the player's own Bible, from whichever mode it
    // came. Studying a verse is studying it whether it was the daily drop or a
    // battle, and the Bible is the one place that shows all of it at once.
    useBible.getState().markStudied(verse.reference)
    // A finished study run rolls for a relic — here, at the same choke point as
    // the two marks above, so every study mode counts without five call sites.
    // Fire-and-forget: the reveal is a toast that follows the player to whatever
    // screen onComplete sends them to, and a failed roll is simply no find.
    if (studyDrop) void useDrops.getState().roll()
    // …and it walks the road. Same choke point, same reason: every quiz mode
    // counts once, from here, rather than from five screens. Miles are not XP
    // and appear on no board (see lib/season), so paying them from a battle is
    // safe in a way paying points from a study run would not be.
    void useSeason.getState().track('quiz_complete', {
      correct: correctCount,
      perfect: correctCount === questions.length,
      comboMax,
    })
    if (studyDrop) void useSeason.getState().track('study_run')
    try {
      await onComplete(result)
    } catch {
      /* even if the network hiccups, the caller still moves on */
    }
  }

  return (
    <Page noNav>
      {/* HUD */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: label ? 8 : 12 }}>
        <button className="pill" onClick={onExit} aria-label="Back">✕</button>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22 }}>
          <CountUp to={score} /> <span className="faint" style={{ fontSize: 13 }}>pts</span>
        </div>
        <ComboMeter combo={combo} multiplier={multiplier} />
      </div>
      {label && (
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <span className="pill">{label}</span>
        </div>
      )}
      {hud && (
        <div style={{ marginBottom: 14 }}>
          {hud({ score, qi, total: questions.length, phase, justCorrect: answered?.correct ?? null })}
        </div>
      )}

      <div>
        {/* READ PHASE — reference hidden so "which book" isn't spoiled */}
        {phase === 'read' && (
          <motion.div key="read" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}>
            <div className="card" style={{ padding: 26, textAlign: 'center' }}>
              <span className="pill">📖 {verse.translation}</span>
              <p style={{ fontSize: 24, lineHeight: 1.5, fontWeight: 700, marginTop: 18, fontFamily: 'var(--font-display)' }}>
                “{verse.text}”
              </p>
              <p className="faint" style={{ marginTop: 14, fontSize: 13 }}>
                Read it once. {readPromise}
              </p>
            </div>
            <div style={{ marginTop: 18 }}>
              {startGate ? (
                <Button
                  variant="gold"
                  full
                  disabled={waitingToStart}
                  onClick={() => { juice.whoosh(); setWaitingToStart(true); startGate.onReady() }}
                >
                  {waitingToStart ? startGate.waitingLabel : startGate.readyLabel}
                </Button>
              ) : (
                <Button variant="gold" full onClick={() => { juice.whoosh(); beginQuestion() }}>
                  I’ve read it — start the clock ⏱️
                </Button>
              )}
            </div>
          </motion.div>
        )}

        {/* QUESTION / FEEDBACK */}
        {(phase === 'question' || phase === 'feedback') && q && (
          <motion.div key={`q${qi}`} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
            {/* progress + timer */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {questions.map((_, i) => (
                <div key={i} style={{ flex: 1, height: 6, borderRadius: 999, background: i < qi ? 'var(--good)' : i === qi ? 'var(--gold)' : 'rgba(255,255,255,0.12)' }} />
              ))}
            </div>

            {phase === 'question' && (
              <div style={{ height: 8, borderRadius: 999, background: 'rgba(0,0,0,0.3)', overflow: 'hidden', marginBottom: 16 }}>
                <motion.div
                  key={`timer${qi}`}
                  initial={{ width: '100%' }}
                  animate={{ width: '0%' }}
                  transition={{ duration: SCORING.answerWindowMs / 1000, ease: 'linear' }}
                  style={{ height: '100%', background: 'linear-gradient(90deg, var(--gold), var(--coral))' }}
                />
              </div>
            )}

            {/* The pill marks the ONE question that is not about the verse just
                read. In a run where EVERY question is trivia (the library's
                round) it marks nothing — it just restates the run's own label
                on every screen — so it is suppressed there rather than being
                decoration. */}
            {q.bonus && verseCount > 0 && (
              <div style={{ marginBottom: 10 }}>
                <span className="pill">✨ Bonus trivia · {q.bonus}</span>
              </div>
            )}

            <h2 style={{ fontSize: 22, marginBottom: 16 }}>{q.prompt}</h2>

            <div style={{ display: 'grid', gap: 10, position: 'relative' }}>
              {q.options.map((opt, i) => {
                const isChosen = answered?.choiceIndex === i
                const isAnswer = i === q.answerIndex
                const showState = phase === 'feedback'
                let bg = 'var(--card-solid)'
                let border = '1px solid var(--stroke)'
                if (showState && isAnswer) { bg = 'linear-gradient(180deg, var(--good), var(--good-deep))'; border = '1px solid var(--good)' }
                else if (showState && isChosen && !isAnswer) { bg = 'linear-gradient(180deg, #6b3f8f, #4a2a63)'; border = '1px solid var(--grape)' }
                return (
                  <motion.button
                    key={i}
                    disabled={phase === 'feedback'}
                    whileTap={{ scale: 0.97 }}
                    animate={showState && isAnswer ? { scale: [1, 1.04, 1] } : {}}
                    onClick={() => handleAnswer(i)}
                    style={{
                      textAlign: 'left', padding: '16px 18px', borderRadius: 'var(--r-md)',
                      background: bg, border, color: '#fff', fontWeight: 700, fontSize: 16,
                      display: 'flex', alignItems: 'center', gap: 12,
                    }}
                  >
                    <span style={{ opacity: 0.6, fontFamily: 'var(--font-display)' }}>{'ABCD'[i]}</span>
                    <span style={{ flex: 1 }}>{opt}</span>
                    {showState && isAnswer && <span>✅</span>}
                    {showState && isChosen && !isAnswer && <span>💡</span>}
                  </motion.button>
                )
              })}

              {/* floating points pop */}
              <AnimatePresence>
                {pop && phase === 'feedback' && answered?.correct && (
                  <motion.div
                    key={pop.id}
                    initial={{ opacity: 0, y: 0, scale: 0.6 }}
                    animate={{ opacity: 1, y: -50, scale: 1.2 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 16 }}
                    style={{ position: 'absolute', right: 10, top: -6, fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 30, color: 'var(--gold)', textShadow: '0 2px 12px rgba(255,210,63,0.7)', pointerEvents: 'none' }}
                  >
                    {pop.text}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Shame-free reveal: every answer (right OR wrong) teaches. */}
            <AnimatePresence>
              {phase === 'feedback' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  style={{ overflow: 'hidden', marginTop: 16 }}
                >
                  <div className="card" style={{ background: answered?.correct ? 'rgba(67,233,123,0.1)' : 'rgba(94,231,223,0.1)', borderColor: answered?.correct ? 'var(--good)' : 'var(--sky)' }}>
                    <b style={{ color: answered?.correct ? 'var(--good)' : 'var(--sky)' }}>
                      {answered?.correct ? '🎯 Nice!' : answered?.choiceIndex === -1 ? '⏱️ Time!' : '💡 Good to know'}
                    </b>
                    <p style={{ marginTop: 6, fontSize: 15, lineHeight: 1.5 }}>{q.teach}</p>
                  </div>
                  <div style={{ marginTop: 14 }}>
                    <Button variant="gold" full onClick={next}>
                      {isLast ? 'See my score →' : 'Next question →'}
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {phase === 'submitting' && (
          <motion.div key="sub" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ textAlign: 'center', paddingTop: 60 }}>
            <div className="floaty" style={{ fontSize: 60 }}>✨</div>
            <p className="dim" style={{ marginTop: 12 }}>Tallying your points…</p>
          </motion.div>
        )}
      </div>
    </Page>
  )
}
