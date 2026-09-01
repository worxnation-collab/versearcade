import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { FavoriteButton } from '@/components/FavoriteButton'
import { QuizRunner } from '@/features/daily/QuizRunner'
import { dailyTriviaBook, dailyTriviaFor } from '@/data/bible/questions'
import { useDailyTrivia } from '@/store/dailyTrivia'
import { useGame } from '@/store/game'
import type { PlayResult } from '@/types'

// The day's trivia round — the second box on the Play tab.
//
// It is deliberately the SAME machinery as the library's bonus-trivia round
// (`features/study/TriviaRoundScreen`), pointed at a book the date picks rather
// than a book you pick, so the two can't drift into different loops:
//
//  - It runs through `QuizRunner`, like every quiz in this app, so scoring, the
//    combo, the teach line on a miss and the Bible "studied" mark all come from
//    the one place that owns them.
//  - It is anchored on a real verse, which the runner reads first and the recap
//    offers to keep. A round of Bible facts with no scripture on screen is a
//    pub quiz — the rule every arcade machine follows when it hands its verse
//    back at the end.
//  - It pays what a study run pays: a relic roll and a step on the road, both
//    handled inside `QuizRunner` by `studyDrop`. **No XP and no standing.**
//    That is what lets a second daily thing sit level with the verse without
//    becoming a second ladder — see the header in `store/dailyTrivia.ts`.
//
// It carries a `runId`, and that is not decoration. The day's five questions
// are the same five for everybody, so walking out of a round going badly and
// starting it again would be a retry with the answers known — exactly what the
// lock in `QuizRunner` exists to close. The park brings you back to the
// question you left, with its clock still running.
export default function DailyTriviaScreen() {
  const navigate = useNavigate()
  const todayDate = useGame((s) => s.todayDate)
  const load = useDailyTrivia((s) => s.load)
  const markPlayed = useDailyTrivia((s) => s.markPlayed)
  const [result, setResult] = useState<PlayResult | null>(null)

  useEffect(() => {
    load()
  }, [load])

  const book = useMemo(() => dailyTriviaBook(todayDate), [todayDate])
  const verse = useMemo(() => dailyTriviaFor(todayDate), [todayDate])

  if (!result) {
    return (
      <QuizRunner
        verse={verse}
        label={`✨ Today’s trivia · ${book ?? 'the whole Bible'}`}
        onExit={() => navigate('/play')}
        studyDrop
        runId={`daily-trivia:${todayDate}`}
        onComplete={async (r) => {
          markPlayed(todayDate)
          setResult(r)
        }}
      />
    )
  }

  const { correctCount, totalQuestions } = result

  // Your own number against your own round, and nothing else. No best, no
  // percentage against anybody, nothing shareable — the same rule the library's
  // recap follows, because this is the same kind of thing.
  return (
    <Page noNav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <button className="pill" onClick={() => navigate('/play')} aria-label="Done">✕</button>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>
          Today’s trivia · {book ?? 'the whole Bible'}
        </b>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 16 }}
        style={{ textAlign: 'center', margin: '10px 0 16px' }}
      >
        <div style={{ fontSize: 52 }}>✨</div>
        <h1 className="gradient-text" style={{ fontSize: 28, marginTop: 4 }}>
          {correctCount}/{totalQuestions} on {book ?? 'the whole Bible'}
        </h1>
        <p className="dim" style={{ marginTop: 4, lineHeight: 1.4 }}>
          {correctCount === totalQuestions
            ? 'Every one. You know this book.'
            : 'The ones you missed came with their answers — that’s the whole point of them.'}
        </p>
      </motion.div>

      {/* The verse the round was read on. It is why this isn't a pub quiz. */}
      <div className="card" style={{ textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 17, flex: 1, minWidth: 0 }}>{verse.reference}</b>
          <FavoriteButton reference={verse.reference} variant="icon" />
        </div>
        <p style={{ marginTop: 8, lineHeight: 1.5 }}>“{verse.text}”</p>
      </div>

      {/* There is no "another round" here on purpose: this one is the DAY's, and
          a button that deals a second one would turn a shared daily thing into a
          grind. Tabitha lends as many as you like, on any book you choose. */}
      <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
        <Button variant="gold" full onClick={() => navigate('/play')}>← Back to Play</Button>
        <Button variant="secondary" full onClick={() => navigate(`/study/trivia?book=${encodeURIComponent(book ?? 'any')}`)}>
          More rounds from Tabitha →
        </Button>
      </div>
      <div style={{ height: 30 }} />
    </Page>
  )
}
