import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { useJuice } from '@/juice/useJuice'
import { useBibleMarks } from './useBibleMarks'
import { TierBar, TierLegend } from './tiers'
import {
  bookTiers,
  chapterTiers,
  quizzableInChapter,
  TIER_COLOR,
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
      <Page noNav>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <button className="pill" onClick={() => navigate('/bible')} aria-label="Back">✕</button>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Not a book</b>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <p className="dim" style={{ fontSize: 14, lineHeight: 1.5 }}>
            There’s no book called “{book}” in the Bible. Head back to the contents and pick one.
          </p>
          <div style={{ marginTop: 14 }}>
            <Button variant="gold" full onClick={() => navigate('/bible')}>Back to contents</Button>
          </div>
        </div>
      </Page>
    )
  }

  const touched = counts ? counts.saved + counts.studied + counts.read : 0

  return (
    <Page noNav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button className="pill" onClick={() => navigate('/bible')} aria-label="Back to contents">←</button>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{shape.book}</b>
        <span className="faint" style={{ fontSize: 12, marginLeft: 'auto' }}>
          {shape.verseTotal.toLocaleString()} verses
        </span>
      </div>

      {counts && (
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>{touched.toLocaleString()}</b>
            <span className="dim" style={{ fontSize: 13 }}>opened in {shape.book}</span>
          </div>
          <div style={{ marginTop: 10 }}>
            <TierBar counts={counts} height={8} />
          </div>
          <div style={{ marginTop: 10 }}>
            <TierLegend />
          </div>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))',
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
              initial={{ opacity: 0, scale: 0.9 }}
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
                borderRadius: 'var(--r-sm)',
                border: `1px solid ${tier === 'unread' ? 'var(--stroke)' : TIER_COLOR[tier]}`,
                background: tileWash(tier),
                display: 'grid',
                placeItems: 'center',
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: 16,
                color: tier === 'unread' ? 'var(--ink-faint)' : 'var(--ink)',
                cursor: 'pointer',
              }}
            >
              {chapter}
              {quizzable > 0 && (
                <span
                  aria-hidden
                  style={{ position: 'absolute', top: 3, right: 4, fontSize: 9, opacity: 0.85 }}
                >
                  ✨
                </span>
              )}
            </motion.button>
          )
        })}
      </div>

      <p className="faint center" style={{ fontSize: 11, marginTop: 16, lineHeight: 1.5 }}>
        ✨ marks a chapter with a verse the arcade can quiz. The rest is here to read —
        tap any chapter to open it.
      </p>

      <div style={{ height: 40 }} />
    </Page>
  )
}

/** The brightest tier present — one kept verse makes the whole chapter gold. */
function brightest(counts: TierCounts): VerseTier {
  if (counts.saved > 0) return 'saved'
  if (counts.studied > 0) return 'studied'
  if (counts.read > 0) return 'read'
  return 'unread'
}

function tileWash(tier: VerseTier): string {
  switch (tier) {
    case 'saved':
      return 'linear-gradient(160deg, rgba(255,210,63,0.30), rgba(255,210,63,0.10))'
    case 'studied':
      return 'linear-gradient(160deg, rgba(78,205,196,0.22), rgba(78,205,196,0.06))'
    case 'read':
      return 'linear-gradient(160deg, rgba(184,169,224,0.14), rgba(184,169,224,0.03))'
    default:
      return 'var(--card)'
  }
}

function describe(counts: TierCounts): string {
  const parts: string[] = []
  if (counts.saved) parts.push(`${counts.saved} saved`)
  if (counts.studied) parts.push(`${counts.studied} studied`)
  if (counts.read) parts.push(`${counts.read} read`)
  return parts.length ? parts.join(', ') : 'not opened yet'
}
