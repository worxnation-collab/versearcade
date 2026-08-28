import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Page } from '@/components/Page'
import { QuizRunner } from '@/features/daily/QuizRunner'
import { usePractice } from '@/store/practice'
import { useSeason } from '@/store/season'

// A practice replay of a past verse. Same gameplay as the daily drop, but the
// result is submitted as practice (study — XP only for beating your best).
export default function PracticeQuizScreen() {
  const navigate = useNavigate()
  const { date = '' } = useParams()
  const verse = usePractice((s) => s.verse)
  const activeDate = usePractice((s) => s.activeDate)
  const start = usePractice((s) => s.start)
  const submit = usePractice((s) => s.submit)

  useEffect(() => {
    if (date && activeDate !== date) start(date)
  }, [date, activeDate, start])

  if (!verse || activeDate !== date) {
    return <Page noNav><div className="skeleton" style={{ height: 300 }} /></Page>
  }

  return (
    <QuizRunner
      verse={verse}
      label="📖 Practice · study run"
      onExit={() => navigate('/study/recent')}
      studyDrop
      onComplete={async (result) => {
        // Prepacked verb — a catalog road can ask for replay runs specifically,
        // where 'study_runs' (tracked by QuizRunner) counts every study mode.
        void useSeason.getState().track('replay_run')
        try {
          await submit(result)
        } catch {
          /* still show the recap */
        }
        navigate(`/play/practice/${date}/result`, { replace: true })
      }}
    />
  )
}
