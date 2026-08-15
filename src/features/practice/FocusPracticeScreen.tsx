import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { CpuVersusQuiz } from '@/features/arena/CpuVersusQuiz'
import type { CpuProfile } from '@/features/arena/cpu'
import { useFocus, FOCUS_XP_PER_SESSION, type FocusXpOutcome } from '@/store/focus'
import { useAuth } from '@/store/auth'
import { poolBooks, poolBookCounts, practiceVerseFromBook } from '@/data/bible/questions'
import { useJuice } from '@/juice/useJuice'
import type { AvatarSpec, PlayResult } from '@/types'

// Focus practice: pick a book, then drill random verses from just that book —
// reached from the Study tab, alongside the CPU battle and the last-five replay.
// racing a live study companion (real-time versus bar) and earning a little XP
// (5 per session, every session — no daily limit, so it can be farmed toward a
// church offering). The book choice sticks until you change it.
const bookLabel = (book: string | null) => book ?? 'Any book'

// A friendly pace-setter — same sim as the Battle CPU, tuned to "fair fight".
const COMPANION: CpuProfile = {
  level: 'medium', name: 'Scholar', emoji: '📚', blurb: 'Your study partner', accuracy: 0.72, minMs: 2600, maxMs: 6200,
}

function randSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff)
}

interface Outcome {
  player: PlayResult
  cpuScore: number
  xp: FocusXpOutcome
}

export default function FocusPracticeScreen() {
  const navigate = useNavigate()
  const juice = useJuice()
  const [params] = useSearchParams()
  const { book: savedBook, chosen, setBook, awardXp } = useFocus()
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  // ?book=Romans (from the Study tab's accuracy chart) skips the picker and
  // drills that book straight away. Held in local state rather than read from
  // the store so the very first verse is already the right one — the store
  // catches up in an effect, since the choice should still stick afterwards.
  const [linked, setLinked] = useState<{ book: string | null } | null>(() => {
    const b = params.get('book')
    if (b === null) return null
    return { book: b === 'any' ? null : b }
  })
  const book = linked ? linked.book : savedBook

  const [phase, setPhase] = useState<'pick' | 'play' | 'recap'>(linked ? 'play' : 'pick')
  const [seed, setSeed] = useState(randSeed)

  useEffect(() => {
    if (linked) setBook(linked.book)
    // Only on the first render — later picks go through startWith.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const verse = useMemo(() => practiceVerseFromBook(book, seed), [book, seed])

  const startWith = (b: string | null) => {
    juice.coin()
    setLinked(null)
    setBook(b)
    setSeed(randSeed())
    setPhase('play')
  }
  const nextVerse = () => {
    juice.whoosh()
    setSeed(randSeed())
    setPhase('play')
  }
  const onFinish = async (player: PlayResult, cpuScore: number) => {
    const xp = await awardXp()
    setOutcome({ player, cpuScore, xp })
    setPhase('recap')
  }

  if (phase === 'play') {
    return (
      <CpuVersusQuiz
        key={seed}
        verse={verse}
        seed={seed}
        profile={COMPANION}
        label={`🎯 Focus · ${bookLabel(book)}`}
        onExit={() => setPhase('pick')}
        onFinish={onFinish}
      />
    )
  }

  if (phase === 'recap' && outcome) {
    return (
      <RecapScreen
        book={book}
        outcome={outcome}
        onNext={nextVerse}
        onChange={() => setPhase('pick')}
        onDone={() => navigate('/study')}
      />
    )
  }

  return <BookPicker current={book} chosen={chosen} onStart={startWith} onExit={() => navigate('/study')} />
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
          Drill verses from just this book, racing a study partner. Earn {FOCUS_XP_PER_SESSION} XP every
          session, as many as you like — give it to your church whenever you want.
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
  outcome,
  onNext,
  onChange,
  onDone,
}: {
  book: string | null
  outcome: Outcome
  onNext: () => void
  onChange: () => void
  onDone: () => void
}) {
  const me = useAuth((s) => s.profile)
  const you = outcome.player.score
  const cpu = outcome.cpuScore
  const result: 'won' | 'lost' | 'tie' = you > cpu ? 'won' : you < cpu ? 'lost' : 'tie'
  const { xpEarned, dayTotal } = outcome.xp

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
        style={{ textAlign: 'center', margin: '10px 0 16px' }}
      >
        <div style={{ fontSize: 52 }}>{result === 'won' ? '🏆' : result === 'tie' ? '🤝' : '💪'}</div>
        <h1 className="gradient-text" style={{ fontSize: 28, marginTop: 4 }}>
          {result === 'won' ? 'You beat the Scholar!' : result === 'tie' ? "It's a tie!" : 'The Scholar edged you'}
        </h1>
        <p className="dim" style={{ marginTop: 4 }}>
          {outcome.player.correctCount}/{outcome.player.totalQuestions} correct on <b>{bookLabel(book)}</b>
        </p>
      </motion.div>

      <ScoreRow name={me?.username ? `@${me.username}` : 'You'} emoji={me?.avatarEmoji ?? '😇'} character={me?.avatarCharacter} score={you} winner={result === 'won'} />
      <div className="faint center" style={{ fontSize: 12, letterSpacing: '0.3em', margin: '2px 0' }}>VS</div>
      <ScoreRow name={COMPANION.name} emoji={COMPANION.emoji} score={cpu} winner={result === 'lost'} />

      {/* XP reward. Every session pays, so xpEarned is only ever 0 if the award
          didn't reach the server — say that plainly rather than implying a cap. */}
      <div
        className="card"
        style={{
          marginTop: 14, textAlign: 'center',
          borderColor: xpEarned > 0 ? 'var(--gold)' : 'var(--stroke)',
          background: xpEarned > 0 ? 'rgba(255,210,63,0.08)' : undefined,
        }}
      >
        {xpEarned > 0 ? (
          <>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--gold)' }}>+{xpEarned} XP</div>
            <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
              {dayTotal} XP from focus today — keep going, there’s no daily limit
            </div>
          </>
        ) : (
          <>
            <div style={{ fontWeight: 800 }}>XP didn’t save</div>
            <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
              Couldn’t reach the server for this one — check your connection and play another.
            </div>
          </>
        )}
      </div>

      <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
        <Button variant="gold" full onClick={onNext}>▶ Next verse</Button>
        <Button variant="secondary" full onClick={onChange}>Change book</Button>
        <Button variant="ghost" full onClick={onDone}>Done</Button>
      </div>
      <div style={{ height: 30 }} />
    </Page>
  )
}

function ScoreRow({
  name,
  emoji,
  character,
  score,
  winner,
}: {
  name: string
  emoji: string
  character?: AvatarSpec | null
  score: number
  winner: boolean
}) {
  return (
    <div
      className="card"
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        borderColor: winner ? 'var(--gold)' : 'var(--stroke)',
        background: winner ? 'rgba(255,210,63,0.1)' : undefined,
      }}
    >
      <Avatar emoji={emoji} character={character} size={44} ring={false} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{name}</b>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className={winner ? 'gradient-text' : undefined} style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>
          {score.toLocaleString()}
        </div>
        <div className="faint" style={{ fontSize: 10 }}>{winner ? '👑 winner' : 'pts'}</div>
      </div>
    </div>
  )
}
