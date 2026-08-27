import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { useReviews } from '@/store/reviews'
import { useBookAccuracy } from '@/store/bookAccuracy'
import { useDrops } from '@/store/drops'
import { useJuice } from '@/juice/useJuice'
import { FavoriteButton } from '@/components/FavoriteButton'
import { MASTERY_MAX } from '@/lib/review'

type Phase = 'ask' | 'reveal' | 'done'

export default function ReviewScreen() {
  const navigate = useNavigate()
  const juice = useJuice()
  const { queue, loadDue, grade } = useReviews()

  // Recompute the due set on every entry so already-reviewed verses (now
  // scheduled for the future) don't reappear.
  useEffect(() => {
    loadDue()
  }, [loadDue])

  const session = queue

  const [i, setI] = useState(0)
  const [phase, setPhase] = useState<Phase>('ask')
  const [chosen, setChosen] = useState<string | null>(null)
  const [correctCount, setCorrectCount] = useState(0)
  const [masteredNow, setMasteredNow] = useState(0)

  // Grading mutates the store but not `queue`, so the queue reference is stable
  // through a session; it only changes on a fresh load — reset progress then.
  useEffect(() => {
    setI(0)
    setPhase('ask')
    setChosen(null)
    setCorrectCount(0)
    setMasteredNow(0)
  }, [queue])

  const c = session[i]

  const answer = (opt: string) => {
    if (phase !== 'ask' || !c) return
    const correct = opt.toLowerCase() === c.answer.toLowerCase()
    setChosen(opt)
    grade(c.reference, correct)
    // A recall card is one answered question about its book — same tally the
    // quiz feeds, so the Study chart sees "keep it" sessions too.
    useBookAccuracy.getState().record(c.book, correct ? 1 : 0, 1)
    if (correct) {
      setCorrectCount((n) => n + 1)
      if (c.mastery + 1 >= MASTERY_MAX) setMasteredNow((n) => n + 1)
      juice.correct()
    } else {
      juice.wrong()
    }
    setPhase('reveal')
  }

  const next = () => {
    if (i + 1 >= session.length) {
      juice.celebrate()
      setPhase('done')
      // A finished review is a finished study run, so it rolls for a relic like
      // the others. Once per session, not per card — this is the one study
      // surface that doesn't go through QuizRunner, so the roll is here.
      void useDrops.getState().roll()
      return
    }
    setI((n) => n + 1)
    setChosen(null)
    setPhase('ask')
  }

  if (session.length === 0) {
    return (
      <Page noNav>
        <div style={{ textAlign: 'center', paddingTop: 80 }}>
          <div className="floaty" style={{ fontSize: 56 }}>🧠</div>
          <h2 style={{ marginTop: 12 }}>Nothing to review yet</h2>
          <p className="dim" style={{ marginTop: 6 }}>
            Play a few daily drops — they’ll come back here to help you keep them.
          </p>
          <div style={{ marginTop: 20 }}>
            <Button variant="gold" full onClick={() => navigate('/play')}>Back home</Button>
          </div>
        </div>
      </Page>
    )
  }

  if (phase === 'done') {
    return (
      <Page noNav>
        <div style={{ textAlign: 'center', paddingTop: 40 }}>
          <motion.div initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 240, damping: 12 }} style={{ fontSize: 60 }}>
            {correctCount === session.length ? '💎' : '🧠'}
          </motion.div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 30, marginTop: 8 }}>Nice keeping.</h1>
          <p className="dim" style={{ marginTop: 6 }}>
            {correctCount}/{session.length} recalled{masteredNow > 0 ? ` · ${masteredNow} verse${masteredNow > 1 ? 's' : ''} mastered! 💎` : ''}
          </p>
          <p className="faint" style={{ marginTop: 14, fontSize: 13 }}>
            The ones you nailed come back later; the tricky ones come back sooner. That spacing is what makes them stick.
          </p>
          <div style={{ marginTop: 22 }}>
            <Button variant="gold" full onClick={() => navigate('/play')}>Done</Button>
          </div>
        </div>
      </Page>
    )
  }

  if (!c) return null

  return (
    <Page noNav>
      {/* HUD */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button className="pill" onClick={() => navigate('/play')} aria-label="Back">✕</button>
        <span className="pill">🧠 Keep it</span>
        <span className="faint" style={{ fontSize: 13 }}>{i + 1}/{session.length}</span>
      </div>

      {/* progress bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {session.map((_, k) => (
          <div key={k} style={{ flex: 1, height: 6, borderRadius: 999, background: k < i ? 'var(--good)' : k === i ? 'var(--gold)' : 'rgba(255,255,255,0.12)' }} />
        ))}
      </div>

      <div className="card" style={{ padding: 22 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{c.reference}</b>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <MasteryPips level={phase === 'reveal' && chosen?.toLowerCase() === c.answer.toLowerCase() ? c.mastery + 1 : c.mastery} />
            {/* Only once the word is revealed — during the prompt it would just
                pull attention off the recall. */}
            {phase === 'reveal' && <FavoriteButton reference={c.reference} variant="icon" />}
          </div>
        </div>
        <p style={{ fontSize: 20, lineHeight: 1.5, fontWeight: 700, marginTop: 14, fontFamily: 'var(--font-display)' }}>
          {phase === 'reveal' ? renderFilled(c.blanked, c.answer) : `“${c.blanked}”`}
        </p>
        <p className="faint" style={{ marginTop: 10, fontSize: 12 }}>📖 {c.translation} · fill in the missing word</p>
      </div>

      <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
        {c.options.map((opt) => {
          const showState = phase === 'reveal'
          const isAnswer = opt.toLowerCase() === c.answer.toLowerCase()
          const isChosen = chosen === opt
          let bg = 'var(--card-solid)'
          let border = '1px solid var(--stroke)'
          if (showState && isAnswer) { bg = 'linear-gradient(180deg, var(--good), var(--good-deep))'; border = '1px solid var(--good)' }
          else if (showState && isChosen && !isAnswer) { bg = 'linear-gradient(180deg, #6b3f8f, #4a2a63)'; border = '1px solid var(--grape)' }
          return (
            <motion.button
              key={opt}
              disabled={showState}
              whileTap={{ scale: 0.97 }}
              onClick={() => answer(opt)}
              style={{ textAlign: 'left', padding: '15px 18px', borderRadius: 'var(--r-md)', background: bg, border, color: '#fff', fontWeight: 700, fontSize: 16, display: 'flex', alignItems: 'center', gap: 10 }}
            >
              <span style={{ flex: 1 }}>{opt}</span>
              {showState && isAnswer && <span>✅</span>}
              {showState && isChosen && !isAnswer && <span>💡</span>}
            </motion.button>
          )
        })}
      </div>

      <AnimatePresence>
        {phase === 'reveal' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 16 }}>
            <Button variant="gold" full onClick={next}>
              {i + 1 >= session.length ? 'Finish →' : 'Next →'}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </Page>
  )
}

function renderFilled(blanked: string, answer: string) {
  const parts = blanked.split('_____')
  return (
    <>
      “{parts[0]}
      <span style={{ color: 'var(--gold)', textDecoration: 'underline' }}>{answer}</span>
      {parts[1] ?? ''}”
    </>
  )
}

function MasteryPips({ level }: { level: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3 }} aria-label={`Mastery ${level} of ${MASTERY_MAX}`}>
      {Array.from({ length: MASTERY_MAX }).map((_, k) => (
        <span key={k} style={{ width: 8, height: 8, borderRadius: 999, background: k < level ? 'var(--gold)' : 'rgba(255,255,255,0.18)' }} />
      ))}
    </span>
  )
}
