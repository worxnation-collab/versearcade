import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Page } from '@/components/Page'
import { QuizRunner } from '@/features/daily/QuizRunner'
import { usePractice } from '@/store/practice'

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
      onExit={() => navigate('/play')}
      onComplete={async (result) => {
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
