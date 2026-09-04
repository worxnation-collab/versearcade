import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Page } from '@/components/Page'
import { QuizRunner } from '@/features/daily/QuizRunner'
import { usePractice } from '@/store/practice'
import { useSeason } from '@/store/season'
import { usePoll } from '@/store/poll'

// A practice replay of a past verse. Same gameplay as the daily drop, but the
// result is submitted as practice (study — XP only for beating your best).
export default function PracticeQuizScreen() {
  const navigate = useNavigate()
  const { date = '' } = useParams()
  const verse = usePractice((s) => s.verse)
  const activeDate = usePractice((s) => s.activeDate)
  const start = usePractice((s) => s.start)
  const submit = usePractice((s) => s.submit)
  const polls = usePoll((s) => s.polls)
  const ready = !!verse && activeDate === date
  const poll = ready ? usePoll.getState().get(date, verse.questions) : null
  void polls // subscribed so the runner re-renders when the poll lands

  useEffect(() => {
    if (date && activeDate !== date) start(date)
  }, [date, activeDate, start])

  // A replay is the same deal everybody played on that date, so it READS that
  // day's poll (data/poll.ts). It never writes it: practice is uncapped, and a
  // replay counting would be one person voting many times. submit_practice
  // takes no choices, so there is nothing here to forget to leave out.
  useEffect(() => {
    if (ready) void usePoll.getState().load(date, verse.questions)
  }, [ready, date, verse])

  if (!verse || activeDate !== date) {
    return <Page noNav><div className="skeleton" style={{ height: 300 }} /></Page>
  }

  return (
    <QuizRunner
      verse={verse}
      label="📖 Practice · study run"
      // A replay is the same past verse every time, so a run walked out of and
      // started again is a retry with the answers known — name the deal and
      // QuizRunner hands the interrupted one back instead.
      runId={`practice:${date}`}
      poll={poll}
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
