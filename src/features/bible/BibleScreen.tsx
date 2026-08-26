import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { useJuice } from '@/juice/useJuice'
import { useBibleMarks } from './useBibleMarks'
import { TierBar, TierLegend } from './tiers'
import {
  bookTiers,
  percentLabel,
  quizzableInBook,
  shapesByTestament,
  touchedFraction,
  wholeBibleTiers,
} from '@/lib/bibleProgress'
import { TOTAL_VERSES } from '@/data/bible/structure'

// The contents page of the player's own Bible: all 66 books, every one of them
// present from the first day, each carrying a bar of how much of it they've
// touched. Books they've never opened aren't hidden or greyed out of reach —
// they're just quiet, waiting.
//
// Nothing on this page is comparable to another player and nothing is scored.
// It's a map of where you've been in the text, which is the opposite of a
// leaderboard: the only person in it is you.
export default function BibleScreen() {
  const navigate = useNavigate()
  const juice = useJuice()
  const { marks, ready } = useBibleMarks()
  const { OT, NT } = useMemo(() => shapesByTestament(), [])

  const overall = useMemo(() => wholeBibleTiers(marks), [marks])
  const opened = overall.saved + overall.studied + overall.read
  const savedCount = overall.saved

  return (
    <Page noNav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button className="pill" onClick={() => navigate(-1)} aria-label="Back">✕</button>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>My Bible</b>
      </div>

      {/* Where you stand in the whole book. A percentage of 31,102 verses is a
          small number for a long time, so it's shown next to the raw count —
          "412 verses" is an achievement even when it rounds to 1%. */}
      <motion.div
        className="card"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 26 }}>
            {opened.toLocaleString()}
          </b>
          <span className="dim" style={{ fontSize: 14 }}>
            verse{opened === 1 ? '' : 's'} opened
          </span>
          <span className="faint" style={{ fontSize: 12, marginLeft: 'auto' }}>
            {percentLabel(touchedFraction(overall))} of {TOTAL_VERSES.toLocaleString()}
          </span>
        </div>
        <div style={{ marginTop: 10 }}>
          <TierBar counts={overall} height={10} label={`${opened} of ${TOTAL_VERSES} verses opened`} />
        </div>
        <div style={{ marginTop: 10 }}>
          <TierLegend />
        </div>
      </motion.div>

      <button
        onClick={() => { juice.select(); navigate('/bible/highlights') }}
        className="card"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          textAlign: 'left',
          width: '100%',
          marginTop: 12,
          cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 22 }}>{savedCount > 0 ? '🔖' : '🤍'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 14 }}>
            Your highlights
            {savedCount > 0 && <span className="faint" style={{ fontSize: 12 }}> · {savedCount}</span>}
          </b>
          <div className="faint" style={{ fontSize: 12 }}>
            {savedCount > 0
              ? 'Every verse you’ve kept, in one place'
              : 'Tap the heart after a challenge to keep a verse here'}
          </div>
        </div>
        <span style={{ color: 'var(--gold)' }}>›</span>
      </button>

      {!ready && (
        <p className="faint center" style={{ fontSize: 12, marginTop: 12 }}>
          Opening your Bible…
        </p>
      )}

      <Testament title="Old Testament" books={OT} marks={marks} />
      <Testament title="New Testament" books={NT} marks={marks} />

      <p className="faint center" style={{ fontSize: 11, marginTop: 20, lineHeight: 1.45 }}>
        Just for you — your Bible is private and never affects your XP, streak or rank.
      </p>

      <div style={{ height: 40 }} />
    </Page>
  )
}

function Testament({
  title,
  books,
  marks,
}: {
  title: string
  books: { book: string; chapters: number[] }[]
  marks: ReturnType<typeof useBibleMarks>['marks']
}) {
  const navigate = useNavigate()
  const juice = useJuice()

  return (
    <>
      <h3 style={{ fontSize: 16, margin: '20px 0 10px' }} className="dim">{title}</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        {books.map((b) => {
          const counts = bookTiers(b.book, marks)
          const touched = counts.saved + counts.studied + counts.read
          const quizzable = quizzableInBook(b.book)
          return (
            <button
              key={b.book}
              onClick={() => { juice.select(); navigate(`/bible/${encodeURIComponent(b.book)}`) }}
              className="card"
              style={{ padding: 12, textAlign: 'left', width: '100%', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>{b.book}</b>
                <span className="faint" style={{ fontSize: 11 }}>
                  {b.chapters.length} chapter{b.chapters.length === 1 ? '' : 's'}
                </span>
                <span
                  className="faint"
                  style={{ fontSize: 11, marginLeft: 'auto', color: touched ? 'var(--ink-dim)' : undefined }}
                >
                  {touched ? `${touched} opened` : 'not opened yet'}
                </span>
              </div>
              <div style={{ marginTop: 8 }}>
                <TierBar
                  counts={counts}
                  height={6}
                  label={`${b.book}: ${touched} of ${touched + counts.unread} verses opened`}
                />
              </div>
              {quizzable > 0 && (
                <div className="faint" style={{ fontSize: 11, marginTop: 6 }}>
                  ✨ {quizzable} verse{quizzable === 1 ? '' : 's'} here can be played
                </div>
              )}
            </button>
          )
        })}
      </div>
    </>
  )
}
