import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { QuizRunner } from '@/features/daily/QuizRunner'
import { useFocus } from '@/store/focus'
import { poolBooks, poolBookCounts, practiceVerseFromBook } from '@/data/bible/questions'
import { useJuice } from '@/juice/useJuice'
import type { PlayResult } from '@/types'

// Focus practice: before a session, pick a book to concentrate on. Every run then
// draws a random verse from just that book (or any book) until you change it. Pure
// study — no streaks or scores on the line, just reps on the verses you choose.
const bookLabel = (book: string | null) => book ?? 'Any book'

function randSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff)
}

export default function FocusPracticeScreen() {
  const navigate = useNavigate()
  const juice = useJuice()
  const { book, chosen, setBook } = useFocus()
  const [phase, setPhase] = useState<'pick' | 'play' | 'recap'>('pick')
  const [seed, setSeed] = useState(randSeed)
  const [last, setLast] = useState<PlayResult | null>(null)

  const verse = useMemo(() => practiceVerseFromBook(book, seed), [book, seed])

  const startWith = (b: string | null) => {
    juice.coin()
    setBook(b)
    setSeed(randSeed())
    setPhase('play')
  }
  const nextVerse = () => {
    juice.whoosh()
    setSeed(randSeed())
    setPhase('play')
  }

  if (phase === 'play') {
    return (
      <QuizRunner
        verse={verse}
        label={`🎯 Focus · ${bookLabel(book)}`}
        onExit={() => setPhase('pick')}
        onComplete={async (r) => {
          setLast(r)
          setPhase('recap')
        }}
      />
    )
  }

  if (phase === 'recap') {
    return (
      <RecapScreen
        book={book}
        result={last}
        onNext={nextVerse}
        onChange={() => setPhase('pick')}
        onDone={() => navigate('/play')}
      />
    )
  }

  return <BookPicker current={book} chosen={chosen} onStart={startWith} onExit={() => navigate('/play')} />
}

function BookPicker({
  current,
  chosen,
  onStart,
  onExit,
}: {
  current: string | null
  chosen: boolean
  onStart: (book: string | null) => void
  onExit: () => void
}) {
  const books = useMemo(() => poolBooks(), [])
  const counts = useMemo(() => poolBookCounts(), [])

  return (
    <Page noNav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <button className="pill" onClick={onExit} aria-label="Back">✕</button>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Focus practice</b>
      </div>

      <div className="center" style={{ marginBottom: 16 }}>
        <div className="floaty" style={{ fontSize: 44 }}>🎯</div>
        <h1 style={{ fontSize: 26, marginTop: 4 }}>Pick a book to focus on</h1>
        <p className="dim" style={{ marginTop: 4, lineHeight: 1.4 }}>
          You’ll get verses from just this book until you change it — great for learning a favorite.
        </p>
      </div>

      {/* Jump back into the remembered book. */}
      {chosen && (
        <div style={{ marginBottom: 14 }}>
          <Button variant="gold" full onClick={() => onStart(current)}>
            ▶ Continue — {bookLabel(current)}
          </Button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 12px' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--stroke)' }} />
        <span className="faint" style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em' }}>
          {chosen ? 'OR SWITCH BOOKS' : 'CHOOSE A BOOK'}
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--stroke)' }} />
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        <PickRow
          label="🎲 Any book"
          sub="Random from the whole Bible"
          active={chosen && current === null}
          onClick={() => onStart(null)}
        />
        {books.map((b) => (
          <PickRow
            key={b}
            label={b}
            sub={`${counts[b]} verse${counts[b] === 1 ? '' : 's'}`}
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
          {label}{active && <span style={{ color: 'var(--gold)', fontSize: 11, marginLeft: 6 }}>focused</span>}
        </b>
        <span className="faint" style={{ fontSize: 12 }}>{sub}</span>
      </div>
      <span className="pill" style={{ background: 'var(--gold)', color: '#241f0a', fontWeight: 800, fontSize: 12 }}>Play</span>
    </motion.button>
  )
}

function RecapScreen({
  book,
  result,
  onNext,
  onChange,
  onDone,
}: {
  book: string | null
  result: PlayResult | null
  onNext: () => void
  onChange: () => void
  onDone: () => void
}) {
  const correct = result?.correctCount ?? 0
  const total = result?.totalQuestions ?? 0

  return (
    <Page noNav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <button className="pill" onClick={onDone} aria-label="Done">✕</button>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Focus · {bookLabel(book)}</b>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 16 }}
        style={{ textAlign: 'center', margin: '14px 0 18px' }}
      >
        <div style={{ fontSize: 52 }}>🎯</div>
        <h1 className="gradient-text" style={{ fontSize: 30, marginTop: 4 }}>
          {result ? result.score.toLocaleString() : 0} pts
        </h1>
        <p className="dim" style={{ marginTop: 4 }}>
          {correct}/{total} correct · focusing on <b>{bookLabel(book)}</b>
        </p>
      </motion.div>

      <div style={{ display: 'grid', gap: 10 }}>
        <Button variant="gold" full onClick={onNext}>▶ Next verse</Button>
        <Button variant="secondary" full onClick={onChange}>Change book</Button>
        <Button variant="ghost" full onClick={onDone}>Done</Button>
      </div>
      <div style={{ height: 30 }} />
    </Page>
  )
}
