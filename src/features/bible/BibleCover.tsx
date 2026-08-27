import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useJuice } from '@/juice/useJuice'
import { useAuth } from '@/store/auth'
import { BookOpening } from './BookOpening'
import { BookCoverArt, COVER_BOARD, COVER_RATIO, COVER_REF_WIDTH } from './BookCoverArt'
import { useBibleMarks } from './useBibleMarks'
import { percentLabel, touchedFraction, wholeBibleTiers } from '@/lib/bibleProgress'

// The player's Bible as an object: an actual book, standing centered on the
// profile in the proportions of a real one — leather board, gilt rules, a cross,
// a ribbon slipping out of the bottom, and their own name stamped in gold the
// way a Bible you were given has your name on it. That last part is the whole
// premise of the feature: this is *your* Bible, not a menu item.
//
// Tapping it doesn't navigate — it lifts the book off the page and opens it
// (see BookOpening), and the route only changes once the open page has taken the
// screen. Deliberately not full-bleed: a book you can see the edges of reads as
// an object you own, and a banner does not.
const BOOK_WIDTH = COVER_REF_WIDTH

export function BibleCover() {
  const navigate = useNavigate()
  const juice = useJuice()
  const reduceMotion = useReducedMotion()
  const { marks } = useBibleMarks()
  const name = useAuth((s) => s.profile?.username ?? '')
  // Where the closed book is sitting, so the opening flies from exactly here
  // rather than from a guess at the middle of the screen.
  const shell = useRef<HTMLDivElement | null>(null)
  const [from, setFrom] = useState<DOMRect | null>(null)

  const counts = wholeBibleTiers(marks)
  const opened = counts.saved + counts.studied + counts.read
  const pct = percentLabel(touchedFraction(counts))

  const go = () => {
    juice.select?.()
    // Reduce-motion gets the destination, not a shortened version of the show.
    if (reduceMotion || !shell.current) {
      navigate('/bible')
      return
    }
    juice.whoosh?.()
    setFrom(shell.current.getBoundingClientRect())
  }

  return (
    <>
      <button
        onClick={go}
        aria-label={`Open my Bible — ${opened.toLocaleString()} verses opened`}
        style={{
          width: '100%',
          padding: '6px 0 2px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          perspective: 1000,
          WebkitPerspective: 1000,
        }}
      >
        <motion.div
          ref={shell}
          whileTap={{ rotateY: -9, scale: 0.985 }}
          transition={{ type: 'spring', stiffness: 300, damping: 22 }}
          style={{
            position: 'relative',
            width: BOOK_WIDTH,
            height: BOOK_WIDTH * COVER_RATIO,
            transformOrigin: 'left center',
            transformStyle: 'preserve-3d',
          }}
        >
          {/* The block of pages: gilt edge down the right and along the bottom,
              so the book has a body and not just a face. */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: '3px -5px -5px 10px',
              borderRadius: '3px 7px 7px 3px',
              background:
                'linear-gradient(90deg, #b79a5e 0%, #e8d9a8 35%, #fbf3d9 60%, #d8c48a 100%)',
              boxShadow: '0 10px 26px rgba(0,0,0,0.55)',
            }}
          />

          {/* Ribbon marker. Rendered between the page block and the cover
              board, and run past the bottom edge, so what you see is the tail
              slipping out from inside the book rather than a stripe on it. */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: '58%',
              top: '72%',
              width: 13,
              height: BOOK_WIDTH * COVER_RATIO * 0.34,
              background: 'linear-gradient(180deg, #7a1a26, #b8323f 55%, #8d1f2d)',
              clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 78%, 0 100%)',
              boxShadow: '0 4px 10px rgba(0,0,0,0.55)',
            }}
          />

          {/* The cover board, wearing the same art as the book that flies. */}
          <div style={{ position: 'absolute', inset: 0, ...COVER_BOARD }}>
            <BookCoverArt width={BOOK_WIDTH} name={name} />
          </div>
        </motion.div>

        {/* The caption lives under the book, not on it — a real cover doesn't
            carry statistics. */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--ink-dim)', lineHeight: 1.4 }}>
            {opened > 0
              ? `${opened.toLocaleString()} verse${opened === 1 ? '' : 's'} opened · ${pct}`
              : 'Tap to open your Bible'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 3 }}>
            Every verse you’ve kept, studied and read — lit up in the whole book.
          </div>
        </div>
      </button>

      {/* Portalled to the body on purpose: the button above sets `perspective`
          for the tap tilt, and a perspective creates a containing block for
          fixed children — rendered in place, the overlay would be trapped inside
          the card instead of taking the screen. */}
      {createPortal(
        <AnimatePresence>
          {from && (
            <BookOpening
              from={from}
              name={name}
              onDone={() => {
                navigate('/bible')
                setFrom(null)
              }}
            />
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}
