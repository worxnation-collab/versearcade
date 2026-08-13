import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '@/components/Page'
import { useGame } from '@/store/game'
import { QuizRunner } from './QuizRunner'

export default function QuizScreen() {
  const navigate = useNavigate()
  const { today, submitPlay, playedToday, loadToday } = useGame()

  // Self-sufficient: if the verse isn't loaded yet (direct link / refresh),
  // fetch today's drop so the quiz works without coming through the hub.
  useEffect(() => {
    if (!today) loadToday()
  }, [today, loadToday])

  // Guard: if they already played (e.g. refresh), bounce to recap.
  useEffect(() => {
    if (playedToday) navigate('/play/result', { replace: true })
  }, [playedToday, navigate])

  if (!today) return <Page noNav><div className="skeleton" style={{ height: 300 }} /></Page>

  return (
    <QuizRunner
      verse={today}
      onExit={() => navigate('/play')}
      onComplete={async (result) => {
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
