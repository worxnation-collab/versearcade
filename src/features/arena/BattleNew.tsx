import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { QuizRunner } from '@/features/daily/QuizRunner'
import { useBattles } from '@/store/battles'
import { newBattleSeed, battleVerse } from './battle'
import type { PlayResult } from '@/types'

// Challenger flow: play a fresh random-verse quiz, create the battle from the
// score, then land on the battle page to share the invite.
export default function BattleNew() {
  const navigate = useNavigate()
  const createBattle = useBattles((s) => s.createBattle)
  const seed = useMemo(() => newBattleSeed(), [])
  const verse = useMemo(() => battleVerse(seed), [seed])

  const onComplete = async (result: PlayResult) => {
    const id = await createBattle(seed, result.score, result.timeMs)
    if (id) navigate(`/battle/${id}`, { replace: true, state: { justCreated: true } })
    else navigate('/battle', { replace: true })
  }

  return <QuizRunner verse={verse} onComplete={onComplete} onExit={() => navigate('/battle')} label="⚔️ Bible Battle" />
}
