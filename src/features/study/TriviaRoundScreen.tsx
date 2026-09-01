import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { FavoriteButton } from '@/components/FavoriteButton'
import { QuizRunner } from '@/features/daily/QuizRunner'
import { triviaVerseFromBook } from '@/data/bible/questions'
import { triviaBooks, BOOK_TRIVIA } from '@/data/bible/trivia'
import { useJuice } from '@/juice/useJuice'
import type { DailyVerse, PlayResult } from '@/types'

// Bonus trivia, a whole round of it — what Tabitha lends when you want the book
// rather than the verse.
//
// The daily drop ends on ONE bonus question about the book its verse came from
// (see `generateQuestions`). This is the same questions, five at a time, about
// a book you choose. Everything else about the loop is deliberately borrowed
// rather than invented:
//
//  - It runs through `QuizRunner`, like every other quiz in the app, so scoring,
//    the combo, the teach line on a miss and the Bible "studied" mark all come
//    from the one place that already owns them.
//  - It is ANCHORED ON A REAL VERSE from the chosen book, which the runner reads
//    first and the recap offers to keep. A round of Bible facts with no
//    scripture on the screen is a pub quiz — the same rule that makes every
//    arcade machine hand its verse back at the end.
//  - It pays exactly what a study run pays: a relic roll and a step on the road,
//    both handled inside `QuizRunner` by `studyDrop`. **No XP and no standing.**
//    That is the Study tab's rule, and it is why a trivia round can be played
//    all evening without anybody being able to fall behind on it.
//
// There is no CPU racer here on purpose. Focus practice is the mode with someone
// to race; this is the quiet one.

const bookLabel = (book: string | null) => book ?? 'Any book'

function randSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff)
}

export default function TriviaRoundScreen() {
  const navigate = useNavigate()
  const juice = useJuice()
  const [params] = useSearchParams()

  // ?book=Acts (from a bonus question’s recap, or a link) skips the picker.
  const linkedBook = params.get('book')
  const [book, setBook] = useState<string | null>(() => {
    if (linkedBook === null) return null
    return linkedBook === 'any' ? null : linkedBook
  })
  const [phase, setPhase] = useState<'pick' | 'play' | 'recap'>(linkedBook === null ? 'pick' : 'play')
  const [seed, setSeed] = useState(randSeed)
  const [result, setResult] = useState<PlayResult | null>(null)

  const verse = useMemo(() => triviaVerseFromBook(book, seed), [book, seed])

  const startWith = (b: string | null) => {
    juice.coin()
    setBook(b)
    setSeed(randSeed())
    setPhase('play')
  }

  const another = () => {
    juice.whoosh()
    setSeed(randSeed())
    setPhase('play')
  }

  if (phase === 'play') {
    return (
      <QuizRunner
        key={seed}
        verse={verse}
        label={`✨ Bonus trivia · ${bookLabel(book)}`}
        onExit={() => setPhase('pick')}
        studyDrop
        onComplete={async (r) => {
          setResult(r)
          setPhase('recap')
        }}
      />
    )
  }

  if (phase === 'recap' && result) {
    return (
      <Recap
        book={book}
        verse={verse}
        result={result}
        onAnother={another}
        onChange={() => setPhase('pick')}
        onDone={() => navigate('/study')}
      />
    )
  }

  return <BookPicker current={book} onStart={startWith} onExit={() => navigate('/study')} />
}

function BookPicker({
  current,
  onStart,
  onExit,
}: {
  current: string | null
  onStart: (book: string | null) => void
  onExit: () => void
}) {
  const books = useMemo(() => triviaBooks(), [])

  return (
    <Page noNav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <button className="pill" onClick={onExit} aria-label="Back">✕</button>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Bonus trivia</b>
      </div>

      <div className="center" style={{ marginBottom: 16 }}>
        <div className="floaty" style={{ fontSize: 44 }}>✨</div>
        <h1 style={{ fontSize: 26, marginTop: 4 }}>Pick a book to be quizzed on</h1>
        <p className="dim" style={{ marginTop: 4, lineHeight: 1.4 }}>
          Five questions about the book itself — its people, its places and what happens in it.
          Every answer tells you something, right or wrong.
        </p>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <PickRow
          label="🎲 Any book"
          sub="Questions from right across the Bible"
          active={current === null}
          onClick={() => onStart(null)}
        />
        {books.map((b) => (
          <PickRow
            key={b}
            label={b}
            sub={`${BOOK_TRIVIA[b]?.length ?? 0} questions`}
            active={current === b}
            onClick={() => onStart(b)}
          />
        ))}
      </div>
      <div style={{ height: 30 }} />
    </Page>
  )
}

function PickRow({ label, sub, active, onClick }: { label: string; sub: string; active: boolean; onClick: () => void }) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="card"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', width: '100%', padding: '12px 14px',
        borderColor: active ? 'var(--gold)' : 'var(--stroke)',
        background: active ? 'rgba(255,210,63,0.08)' : undefined,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
          {label}
        </b>
        <span className="faint" style={{ fontSize: 12 }}>{sub}</span>
      </div>
      <span className="pill" style={{ background: 'var(--gold)', color: '#241f0a', fontWeight: 800, fontSize: 12 }}>Play</span>
    </motion.button>
  )
}

function Recap({
  book,
  verse,
  result,
  onAnother,
  onChange,
  onDone,
}: {
  book: string | null
  verse: DailyVerse
  result: PlayResult
  onAnother: () => void
  onChange: () => void
  onDone: () => void
}) {
  const { correctCount, totalQuestions } = result

  // Your own number against your own round, and nothing else. No best, no
  // percentage against anybody, nothing shareable — the Study tab's rule.
  return (
    <Page noNav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <button className="pill" onClick={onDone} aria-label="Done">✕</button>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Bonus trivia · {bookLabel(book)}</b>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 16 }}
        style={{ textAlign: 'center', margin: '10px 0 16px' }}
      >
        <div style={{ fontSize: 52 }}>📖</div>
        <h1 className="gradient-text" style={{ fontSize: 28, marginTop: 4 }}>
          {correctCount}/{totalQuestions} on {bookLabel(book)}
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

      <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
        <Button variant="gold" full onClick={onAnother}>▶ Another round</Button>
        <Button variant="secondary" full onClick={onChange}>Change book</Button>
        <Button variant="ghost" full onClick={onDone}>← Back to Study</Button>
      </div>
      <div style={{ height: 30 }} />
    </Page>
  )
}
