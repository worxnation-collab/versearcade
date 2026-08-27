import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Page } from '@/components/Page'
import { QuizRunner } from '@/features/daily/QuizRunner'
import { useBattles } from '@/store/battles'
import { useKeep } from '@/store/keep'
import { battleVerse } from './battle'
import type { PlayResult } from '@/types'

// Opponent flow: load the battle, play the SAME seeded quiz, submit the result.
export default function BattlePlay() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { getBattle, submitBattle } = useBattles()
  const [seed, setSeed] = useState<number | null>(null)

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
    })
    return () => {
      alive = false
    }
  }, [id, getBattle, navigate])

  const verse = useMemo(() => (seed != null ? battleVerse(seed) : null), [seed])

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

  return <QuizRunner verse={verse} onComplete={onComplete} onExit={() => navigate(`/battle/${id}`)} label="⚔️ Bible Battle" />
}
