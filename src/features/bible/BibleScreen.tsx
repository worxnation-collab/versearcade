import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useJuice } from '@/juice/useJuice'
import { useBibleMarks } from './useBibleMarks'
import { BookHeader, BookPage } from './BookPage'
import { PaperCard, TierBar, TierLegend } from './tiers'
import { PAPER, PAPER_TIER } from './paper'
import {
  bookTiers,
  percentLabel,
  quizzableInBook,
  shapesByTestament,
  touchedFraction,
  wholeBibleTiers,
  type BibleMarks,
} from '@/lib/bibleProgress'
import { TOTAL_VERSES, type BookShape } from '@/data/bible/structure'

// The contents page of the player's own Bible: all 66 books, every one present
// from the first day, each carrying a bar of how much of it they've touched.
// Books they've never opened aren't hidden or greyed out of reach — they're just
// quiet, waiting.
//
// The two testaments fold, because 66 books is a lot of thumb. A folded section
// still reports what's inside it, so closing one never hides your progress.
//
// Nothing here is comparable to another player and nothing is scored. It's a map
// of where you've been in the text, which is the opposite of a leaderboard: the
// only person in it is you.

// Which testaments were left open, remembered across visits — reopening the book
// where you left it is the whole point of a bookmark.
const FOLD_KEY = 'va.bible.open'

function readFold(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(FOLD_KEY) || '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}

export default function BibleScreen() {
  const navigate = useNavigate()
  const juice = useJuice()
  const { marks, ready } = useBibleMarks()
  const { OT, NT } = useMemo(() => shapesByTestament(), [])
  const [open, setOpen] = useState<Record<string, boolean>>(readFold)

  const overall = useMemo(() => wholeBibleTiers(marks), [marks])
  const opened = overall.saved + overall.studied + overall.read

  const toggle = (key: string) => {
    juice.select()
    setOpen((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      try {
        localStorage.setItem(FOLD_KEY, JSON.stringify(next))
      } catch {
        /* private mode — the fold just won't be remembered */
      }
      return next
    })
  }

  return (
    <BookPage
      header={
        <BookHeader
          onBack={() => navigate('/you')}
          backLabel="Close my Bible"
          title="My Bible"
          note={`${percentLabel(touchedFraction(overall))} opened`}
        />
      }
    >
      {/* Where you stand in the whole book. A percentage of 31,102 verses stays
          small for a long time, so the raw count leads — "412 verses" is an
          achievement even when it rounds to 1%. */}
      <PaperCard>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: PAPER.ink }}>
            {opened.toLocaleString()}
          </b>
          <span style={{ fontSize: 14, color: PAPER.inkDim }}>
            verse{opened === 1 ? '' : 's'} opened
          </span>
          <span style={{ fontSize: 11, color: PAPER.inkFaint, marginLeft: 'auto' }}>
            of {TOTAL_VERSES.toLocaleString()}
          </span>
        </div>
        <div style={{ marginTop: 10 }}>
          <TierBar counts={overall} height={10} label={`${opened} of ${TOTAL_VERSES} verses opened`} />
        </div>
        <div style={{ marginTop: 10 }}>
          <TierLegend />
        </div>
      </PaperCard>

      <button
        onClick={() => { juice.select(); navigate('/bible/highlights') }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          textAlign: 'left',
          width: '100%',
          marginTop: 12,
          padding: 14,
          borderRadius: 14,
          border: `1px solid ${overall.saved > 0 ? PAPER_TIER.saved.rule : PAPER.rule}`,
          background: overall.saved > 0 ? 'rgba(255,196,0,0.12)' : 'rgba(255,255,255,0.45)',
          cursor: 'pointer',
        }}
      >
        <span style={{ fontSize: 20 }}>{overall.saved > 0 ? '🔖' : '🤍'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 14, color: PAPER.ink }}>
            Your highlights
            {overall.saved > 0 && (
              <span style={{ color: PAPER.inkFaint, fontWeight: 400 }}> · {overall.saved}</span>
            )}
          </b>
          <div style={{ fontSize: 12, color: PAPER.inkFaint, marginTop: 1 }}>
            {overall.saved > 0
              ? 'Every verse you’ve kept, in one place'
              : 'Tap the heart after a challenge to keep a verse here'}
          </div>
        </div>
        <span style={{ color: PAPER.accent }}>›</span>
      </button>

      {!ready && (
        <p style={{ fontSize: 12, marginTop: 12, textAlign: 'center', color: PAPER.inkFaint }}>
          Finding your place…
        </p>
      )}

      <Testament
        title="Old Testament"
        books={OT}
        marks={marks}
        open={!!open.OT}
        onToggle={() => toggle('OT')}
      />
      <Testament
        title="New Testament"
        books={NT}
        marks={marks}
        open={!!open.NT}
        onToggle={() => toggle('NT')}
      />

      <p
        style={{
          fontSize: 11,
          marginTop: 20,
          lineHeight: 1.5,
          textAlign: 'center',
          color: PAPER.inkFaint,
        }}
      >
        Just for you — your Bible is private and never affects your XP, streak or rank.
      </p>
    </BookPage>
  )
}

function Testament({
  title,
  books,
  marks,
  open,
  onToggle,
}: {
  title: string
  books: BookShape[]
  marks: BibleMarks
  open: boolean
  onToggle: () => void
}) {
  const navigate = useNavigate()
  const juice = useJuice()

  // Computed for the closed header too — a folded section still has to say
  // what's inside it, or folding would feel like losing something.
  const rows = useMemo(
    () => books.map((b) => ({ shape: b, counts: bookTiers(b.book, marks) })),
    [books, marks],
  )
  const touched = rows.reduce((s, r) => s + r.counts.saved + r.counts.studied + r.counts.read, 0)
  const booksStarted = rows.filter(
    (r) => r.counts.saved + r.counts.studied + r.counts.read > 0,
  ).length

  return (
    <div style={{ marginTop: 18 }}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 14px',
          borderRadius: 14,
          border: `1px solid ${PAPER.rule}`,
          background: open ? 'rgba(255,255,255,0.62)' : 'rgba(255,255,255,0.38)',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 17, color: PAPER.ink }}>{title}</b>
          <span style={{ display: 'block', fontSize: 11, color: PAPER.inkFaint, marginTop: 2 }}>
            {books.length} books
            {booksStarted > 0
              ? ` · ${booksStarted} started · ${touched.toLocaleString()} verses opened`
              : ' · not opened yet'}
          </span>
        </span>
        <span
          aria-hidden
          style={{
            fontSize: 13,
            color: PAPER.inkDim,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
          }}
        >
          ▾
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ display: 'grid', gap: 6, paddingTop: 8 }}>
              {rows.map(({ shape, counts }) => {
                const opened = counts.saved + counts.studied + counts.read
                const quizzable = quizzableInBook(shape.book)
                return (
                  <button
                    key={shape.book}
                    onClick={() => {
                      juice.select()
                      navigate(`/bible/${encodeURIComponent(shape.book)}`)
                    }}
                    style={{
                      padding: '10px 12px',
                      textAlign: 'left',
                      width: '100%',
                      cursor: 'pointer',
                      background: 'none',
                      border: 'none',
                      borderBottom: `1px solid ${PAPER.ruleSoft}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <b style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: PAPER.ink }}>
                        {shape.book}
                      </b>
                      <span style={{ fontSize: 11, color: PAPER.inkFaint }}>
                        {shape.chapters.length} ch
                      </span>
                      {quizzable > 0 && (
                        <span aria-hidden style={{ fontSize: 10 }} title={`${quizzable} playable verses`}>
                          ✨
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: 11,
                          marginLeft: 'auto',
                          color: opened ? PAPER.inkDim : PAPER.inkFaint,
                        }}
                      >
                        {opened ? `${opened} opened` : '—'}
                      </span>
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <TierBar
                        counts={counts}
                        height={5}
                        label={`${shape.book}: ${opened} of ${shape.verseTotal} verses opened`}
                      />
                    </div>
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
