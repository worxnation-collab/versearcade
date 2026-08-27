import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useJuice } from '@/juice/useJuice'
import { useBibleMarks } from './useBibleMarks'
import { BookHeader, BookPage } from './BookPage'
import { PaperCard, TierBar, TierLegend } from './tiers'
import { PAPER, PAPER_TIER } from './paper'
import {
  bookTiers,
  chapterTiers,
  quizzableInChapter,
  type TierCounts,
  type VerseTier,
} from '@/lib/bibleProgress'
import { canonBook, shapeOf } from '@/data/bible/structure'

// One book, as a grid of chapters. Each tile is shaded by the brightest thing
// that's happened in that chapter — a chapter with a kept verse reads gold, one
// you've only walked through reads faint — so the whole book's history is one
// glance rather than a list to scroll.
export default function BibleBookScreen() {
  const navigate = useNavigate()
  const juice = useJuice()
  const params = useParams()
  // A citation name in the URL still finds the book — /bible/Psalm/23 is
  // Psalms 23, and every link the app builds already uses the shelf name.
  const book = canonBook(decodeURIComponent(params.book ?? ''))
  const shape = shapeOf(book)
  const { marks } = useBibleMarks()

  const counts = useMemo(() => (shape ? bookTiers(book, marks) : null), [shape, book, marks])

  if (!shape) {
    return (
      <BookPage
        header={<BookHeader onBack={() => navigate('/bible')} backLabel="Back to contents" title="Not a book" />}
      >
        <PaperCard>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: PAPER.inkDim, margin: 0 }}>
            There’s no book called “{book}” in the Bible. Head back to the contents and pick one.
          </p>
        </PaperCard>
      </BookPage>
    )
  }

  const touched = counts ? counts.saved + counts.studied + counts.read : 0

  return (
    <BookPage
      pageKey={book}
      header={
        <BookHeader
          onBack={() => navigate('/bible')}
          backLabel="Back to contents"
          title={shape.book}
          note={`${shape.verseTotal.toLocaleString()} verses`}
        />
      }
    >
      {counts && (
        <PaperCard>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 20, color: PAPER.ink }}>
              {touched.toLocaleString()}
            </b>
            <span style={{ fontSize: 13, color: PAPER.inkDim }}>opened in {shape.book}</span>
          </div>
          <div style={{ marginTop: 10 }}>
            <TierBar counts={counts} height={8} />
          </div>
          <div style={{ marginTop: 10 }}>
            <TierLegend />
          </div>
        </PaperCard>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(54px, 1fr))',
          gap: 8,
          marginTop: 14,
        }}
      >
        {shape.chapters.map((verses, i) => {
          const chapter = i + 1
          const tiers = chapterTiers(book, chapter, marks)
          const tier = brightest(tiers)
          const quizzable = quizzableInChapter(book, chapter)
          return (
            <motion.button
              key={chapter}
              whileTap={{ scale: 0.94 }}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: Math.min(i, 24) * 0.006 }}
              onClick={() => {
                juice.select()
                navigate(`/bible/${encodeURIComponent(book)}/${chapter}`)
              }}
              aria-label={`${book} ${chapter}, ${verses} verses, ${describe(tiers)}`}
              style={{
                position: 'relative',
                aspectRatio: '1 / 1',
                borderRadius: 10,
                border: `1px solid ${tier === 'unread' ? PAPER.rule : PAPER_TIER[tier].rule}`,
                background: tier === 'unread' ? 'rgba(255,255,255,0.5)' : PAPER_TIER[tier].wash,
                display: 'grid',
                placeItems: 'center',
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: 16,
                color: tier === 'unread' ? PAPER.inkFaint : PAPER.ink,
                cursor: 'pointer',
              }}
            >
              {chapter}
              {quizzable > 0 && (
                <span aria-hidden style={{ position: 'absolute', top: 2, right: 3, fontSize: 9 }}>
                  ✨
                </span>
              )}
            </motion.button>
          )
        })}
      </div>

      <p style={{ fontSize: 11, marginTop: 16, lineHeight: 1.5, textAlign: 'center', color: PAPER.inkFaint }}>
        ✨ marks a chapter with a verse the arcade can quiz. The rest is here to read —
        tap any chapter to open it.
      </p>
    </BookPage>
  )
}

/** The brightest tier present — one kept verse makes the whole chapter gold. */
function brightest(counts: TierCounts): VerseTier {
  if (counts.saved > 0) return 'saved'
  if (counts.studied > 0) return 'studied'
  if (counts.read > 0) return 'read'
  return 'unread'
}

function describe(counts: TierCounts): string {
  const parts: string[] = []
  if (counts.saved) parts.push(`${counts.saved} saved`)
  if (counts.studied) parts.push(`${counts.studied} studied`)
  if (counts.read) parts.push(`${counts.read} read`)
  return parts.length ? parts.join(', ') : 'not opened yet'
}
