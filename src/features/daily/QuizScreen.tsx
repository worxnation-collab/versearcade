import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '@/components/Page'
import { useGame } from '@/store/game'
import { useSeason } from '@/store/season'
import { useFirstLight } from '@/store/firstLight'
import { usePoll } from '@/store/poll'
import { QuizRunner } from './QuizRunner'

export default function QuizScreen() {
  const navigate = useNavigate()
  const { today, submitPlay, playedToday, loadToday } = useGame()
  const polls = usePoll((s) => s.polls)
  const poll = today ? usePoll.getState().get(today.dropDate, today.questions) : null
  void polls // subscribed so the runner re-renders when the day's poll lands

  // The crowd's answers, read ONCE before the clock starts (data/poll.ts). The
  // client already holds every answerIndex before anybody taps, so fetching
  // the totals up front leaks nothing that generating the questions didn't;
  // what matters is that they are DRAWN only after an answer is locked, and
  // QuizRunner keeps that. One round trip per run, none per question.
  useEffect(() => {
    if (today) void usePoll.getState().load(today.dropDate, today.questions)
  }, [today])

  // Self-sufficient: if the verse isn't loaded yet (direct link / refresh),
  // fetch today's drop so the quiz works without coming through the hub.
  useEffect(() => {
    if (!today) loadToday()
  }, [today, loadToday])

  // Opening the verse IS opening this screen — it's the only place in the app
  // the day's verse is read, so this is the honest choke point for it. The
  // first account to get here holds the day (0081); everybody after is worth a
  // point to them and loses nothing. Idempotent per (day, account), so a
  // refresh or a bounce back through here costs nothing, and it deliberately
  // does not block the run: a failed write means the day's card is stale, not
  // that somebody can't play.
  useEffect(() => {
    void useFirstLight.getState().open()
  }, [])

  // Guard: if they already played (e.g. refresh), bounce to recap.
  useEffect(() => {
    if (playedToday) navigate('/play/result', { replace: true })
  }, [playedToday, navigate])

  if (!today) return <Page noNav><div className="skeleton" style={{ height: 300 }} /></Page>

  return (
    <QuizRunner
      verse={today}
      // The day's five questions are the same five for everybody, forever (see
      // getVerseForDate), so an abandoned run restarted is a retry with the
      // answers known. Naming the deal is what makes a reload come back to the
      // question it left instead — QuizRunner's run lock.
      runId={`daily:${today.dropDate}`}
      poll={poll}
      onExit={() => navigate('/play')}
      onComplete={async (result) => {
        // The daily drop's own miles, on top of the per-run miles QuizRunner
        // already paid. Gated to once a local day inside the store.
        void useSeason.getState().track('daily_play')
        try {
          await submitPlay(result)
        } catch {
          /* even if the network hiccups, show the recap */
        }
        navigate('/play/result', { replace: true })
      }}
    />
  )
}
