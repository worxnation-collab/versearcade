import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { CountUp } from '@/components/CountUp'
import { FavoriteButton } from '@/components/FavoriteButton'
import { QuizRunner } from '@/features/daily/QuizRunner'
import { MissedList } from '@/features/daily/MissedList'
import { todayLocalDate } from '@/lib/date'
import { useGame } from '@/store/game'
import { churchDailyVerse, markChurchVersePlayed, useChurchVerse } from '@/store/churchPackage'
import type { PlayResult } from '@/types'

// /play/church — the church's own verse for today, ALONGSIDE the everyday drop.
//
// Until 0127 a verified church's verse replaced the drop for its members. It no
// longer does: the drop is the global verse for everybody, and a church's
// verse is a congregation-only extra reached from the church card on the Play
// tab. The server enforces that split (`get_effective_verse` answers null;
// `church_verse_today` returns approved, congregation-visibility days only), so
// a leader's DRAFT can never reach this screen.
//
// It pays what the trivia round pays and less: nothing. No XP, no streak, no
// `plays` row — the streak and the worldwide board belong to the shared drop,
// and a second XP source keyed to one congregation's schedule would be a
// ladder only some players can climb. `QuizRunner` still marks the verse
// studied, which is a fact about the player's own Bible.
//
// It carries a `runId` (`church:<church>:<date>`) for the trivia round's
// reason: the five are fixed for the day, so walking out and back in must not
// re-deal them.
export default function ChurchVerseScreen() {
  const navigate = useNavigate()
  const date = todayLocalDate()
  const ev = useChurchVerse((s) => s.verse)
  const loaded = useChurchVerse((s) => s.loaded)
  const load = useChurchVerse((s) => s.load)
  const playedDrop = useGame((s) => s.playedToday)
  const dropVerse = useGame((s) => s.today)
  const loadToday = useGame((s) => s.loadToday)
  const [result, setResult] = useState<PlayResult | null>(null)

  useEffect(() => {
    void load()
    if (!dropVerse) void loadToday()
  }, [load, loadToday, dropVerse])

  const verse = useMemo(() => (ev ? churchDailyVerse(ev, date) : null), [ev, date])

  if (!loaded) {
    return (
      <Page noNav>
        <div className="skeleton" style={{ height: 220, borderRadius: 18, marginTop: 16 }} />
      </Page>
    )
  }

  if (!ev || !verse) {
    return (
      <Page noNav>
        <div className="card center" style={{ marginTop: 16 }}>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 18, display: 'block' }}>No church verse today</b>
          <p className="dim" style={{ margin: '8px 0 14px', fontSize: 13.5, lineHeight: 1.55 }}>
            Your church hasn’t set one for today. The everyday verse is on the Play tab.
          </p>
          <Button variant="secondary" full onClick={() => navigate('/play')}>Back to Play</Button>
        </div>
      </Page>
    )
  }

  if (!result) {
    return (
      <QuizRunner
        verse={verse}
        label={`⛪ ${ev.churchName}`}
        onExit={() => navigate('/play')}
        runId={`church:${ev.churchId}:${date}`}
        onComplete={async (r) => {
          markChurchVersePlayed(ev.churchId, date, { s: r.score, c: r.correctCount, t: r.totalQuestions })
          setResult(r)
        }}
      />
    )
  }

  return (
    <Page noNav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <button className="pill" onClick={() => navigate('/play')} aria-label="Done">✕</button>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 18, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ev.churchName}
        </b>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 16 }}
        style={{ textAlign: 'center', margin: '10px 0 16px' }}
      >
        <div style={{ fontSize: 52 }}>⛪</div>
        <p className="dim" style={{ marginTop: 2 }}>You scored</p>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 52, lineHeight: 1 }}>
          <CountUp to={result.score} duration={1000} className="gradient-text" />
        </div>
        <h1 style={{ fontSize: 20, marginTop: 6 }}>
          {result.correctCount}/{result.totalQuestions} on {ev.reference}
        </h1>
      </motion.div>

      <MissedList questions={verse.questions} result={result} />

      {!playedDrop && (
        <button
          onClick={() => navigate('/play/run')}
          className="card"
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', margin: '14px 0', cursor: 'pointer', borderColor: 'var(--gold)' }}
        >
          <span style={{ flex: 1, minWidth: 0 }}>
            <b style={{ display: 'block', fontSize: 14 }}>Today’s verse is still waiting</b>
            <span className="faint" style={{ fontSize: 12 }}>
              {dropVerse?.reference ? `${dropVerse.reference} — the drop everyone’s playing.` : 'The drop everyone’s playing.'}
            </span>
          </span>
          <span style={{ color: 'var(--gold)', fontFamily: 'var(--font-display)', fontSize: 18 }}>→</span>
        </button>
      )}

      <div className="card" style={{ textAlign: 'left', marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 17, flex: 1, minWidth: 0 }}>{ev.reference}</b>
          <FavoriteButton reference={ev.reference} variant="icon" />
        </div>
        <p style={{ margin: '8px 0 0', lineHeight: 1.55, overflowWrap: 'anywhere' }}>{ev.text}</p>
        {ev.note && (
          <p className="dim" style={{ margin: '10px 0 0', paddingLeft: 10, borderLeft: '2px solid var(--edge)', fontSize: 13, lineHeight: 1.45, overflowWrap: 'anywhere' }}>
            {ev.note}
          </p>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <Button variant="gold" full onClick={() => navigate('/play')}>← Back to Play</Button>
      </div>
      <div style={{ height: 30 }} />
    </Page>
  )
}
