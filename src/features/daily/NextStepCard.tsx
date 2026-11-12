import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '@/store/auth'
import { useChurchVerse } from '@/store/churchVerse'
import { useDailyTrivia } from '@/store/dailyTrivia'
import { dailyTriviaBook } from '@/data/bible/questions'
import { todayLocalDate } from '@/lib/date'

// The hand-off at the end of a step on today's path (the Play tab's
// `TodayPath`): drop → your church's verse → trivia. A result screen names the
// ONE next thing rather than leaving a player to go back and work out which of
// three cards is next. It renders nothing when the rest of the day is done —
// a finished day says nothing rather than showing a tick.
//
// The church step is offered only to a member of a verified church that set a
// verse today (`useChurchVerse.today`), so everybody else sees exactly the
// trivia line they always did.
export function NextStepCard({ from, delay = 0.5 }: { from: 'drop' | 'church'; delay?: number }) {
  const navigate = useNavigate()
  const mode = useAuth((s) => s.mode)
  const church = useChurchVerse((s) => s.today)
  const churchLoaded = useChurchVerse((s) => s.loaded)
  const loadChurch = useChurchVerse((s) => s.load)
  const date = todayLocalDate()
  const triviaLoaded = useDailyTrivia((s) => s.loaded)
  const loadTrivia = useDailyTrivia((s) => s.load)
  const triviaDone = useDailyTrivia((s) => !!s.done[date])

  useEffect(() => {
    if (!triviaLoaded) loadTrivia()
  }, [triviaLoaded, loadTrivia])
  useEffect(() => {
    if (from === 'drop' && mode === 'online' && !churchLoaded) void loadChurch()
  }, [from, mode, churchLoaded, loadChurch])

  const churchNext = from === 'drop' && church && !church.played
  if (!churchNext && triviaDone) return null
  // Don't flash the trivia line and then swap it for the church a moment later.
  if (from === 'drop' && mode === 'online' && !churchLoaded) return null

  const book = dailyTriviaBook(date) ?? 'the whole Bible'
  const go = churchNext ? '/play/church' : '/play/trivia'
  const accent = churchNext ? 'rgba(154,124,69,0.22)' : 'rgba(93,211,255,0.10)'
  const edge = churchNext ? 'var(--edge)' : 'var(--sky)'

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      onClick={() => navigate(go)}
      className="card"
      data-next-step={churchNext ? 'church' : 'trivia'}
      style={{
        width: '100%', marginTop: 16, display: 'flex', alignItems: 'center', gap: 10,
        textAlign: 'left', cursor: 'pointer', borderColor: edge, background: accent,
      }}
    >
      <span style={{ fontSize: 22, flexShrink: 0 }}>{churchNext ? '⛪' : '✨'}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="faint" style={{ display: 'block', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Next</span>
        {churchNext ? (
          <>
            <b style={{ display: 'block', fontSize: 14, overflowWrap: 'anywhere' }}>{church!.churchName} picked {church!.reference} for today</b>
            <span className="faint" style={{ fontSize: 12 }}>Five questions from your church{church!.series ? ` · ${church!.series}` : ''}</span>
          </>
        ) : (
          <>
            <b style={{ display: 'block', fontSize: 14 }}>Today’s trivia is still waiting</b>
            <span className="faint" style={{ fontSize: 12 }}>Five on {book} — the book itself, not the verse.</span>
          </>
        )}
      </span>
      <span style={{ color: churchNext ? 'var(--gold)' : 'var(--sky)', fontFamily: 'var(--font-display)', fontSize: 18 }}>→</span>
    </motion.button>
  )
}
