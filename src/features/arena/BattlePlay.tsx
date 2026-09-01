import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Page } from '@/components/Page'
import { QuizRunner } from '@/features/daily/QuizRunner'
import { useBattles } from '@/store/battles'
import { useKeep } from '@/store/keep'
import { battleVerse, battleModeLabel, asBattleMode, type BattleMode } from './battle'
import type { PlayResult } from '@/types'

// Opponent flow: load the battle, play the SAME seeded quiz, submit the result.
export default function BattlePlay() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { getBattle, submitBattle } = useBattles()
  const [seed, setSeed] = useState<number | null>(null)
  // Read off the ROW, never decided here: the challenger's round is the round,
  // and a client that guessed would hand the two players different questions
  // under one score column. `asBattleMode` reads a missing value (a row written
  // before 0094, or a server without it) as 'verse', which is what it is.
  const [mode, setMode] = useState<BattleMode>('verse')

  useEffect(() => {
    let alive = true
    getBattle(id).then((b) => {
      if (!alive) return
      // Can't play your own battle, a finished one, or one you already played.
      if (!b || b.status === 'complete' || b.is_challenger) {
        navigate(`/battle/${id}`, { replace: true })
        return
      }
      setSeed(b.seed)
      setMode(asBattleMode(b.mode))
    })
    return () => {
      alive = false
    }
  }, [id, getBattle, navigate])

  const verse = useMemo(() => (seed != null ? battleVerse(seed, mode) : null), [seed, mode])

  const onComplete = async (result: PlayResult) => {
    // Keep challenges: answering a friend's battle counts as played, and the
    // run's quality feeds the perfect/combo ladders (see data/keep).
    const k = useKeep.getState()
    void k.track('battle_played')
    if (result.correctCount === result.totalQuestions && result.totalQuestions > 0) void k.track('battle_perfect')
    if ((result.comboMax ?? 0) >= 4) void k.track('battle_combo')
    await submitBattle(id, result.score, result.timeMs)
    navigate(`/battle/${id}`, { replace: true, state: { justPlayed: true } })
  }

  if (!verse) {
    return (
      <Page noNav>
        <div style={{ display: 'grid', placeItems: 'center', height: '70dvh' }}>
          <div className="floaty" style={{ fontSize: 56 }}>⚔️</div>
        </div>
      </Page>
    )
  }

  // The battle's seed is fixed by the challenger, so this deal can't be
  // re-rolled by walking out of it — naming it hands an interrupted run back
  // where the old behaviour was a fresh attempt at the same five questions.
  return (
    <QuizRunner
      verse={verse}
      onComplete={onComplete}
      onExit={() => navigate(`/battle/${id}`)}
      label={`⚔️ Bible Battle · ${battleModeLabel(seed ?? 0, mode)}`}
      runId={`battle:${id}`}
    />
  )
}
