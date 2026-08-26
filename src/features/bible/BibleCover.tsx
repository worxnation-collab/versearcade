import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useJuice } from '@/juice/useJuice'
import { BookOpening } from './BookOpening'
import { useBibleMarks } from './useBibleMarks'
import { percentLabel, touchedFraction, wholeBibleTiers } from '@/lib/bibleProgress'

// The player's Bible as an object: a closed book sitting on the profile, gilt
// edge and all. Tapping it doesn't navigate — it lifts the book off the page and
// opens it (see BookOpening), and the route only changes once the open page has
// already taken the screen. A shelf of verses is a list; a book you open is a
// place you keep coming back to.
//
// Closed, it still says something true: how much of the book you've opened. That
// number is only ever compared against the Bible, never against another player.
export function BibleCover() {
  const navigate = useNavigate()
  const juice = useJuice()
  const reduceMotion = useReducedMotion()
  const { marks } = useBibleMarks()
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
          padding: 0,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          perspective: 1100,
          WebkitPerspective: 1100,
        }}
      >
        <div ref={shell} style={{ position: 'relative', height: 158, transformStyle: 'preserve-3d' }}>
          {/* Page edges peeking out from under the cover, so the closed book has
              thickness before anything moves. */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: '4px -3px -4px 8px',
              borderRadius: 'var(--r-md)',
              background: 'linear-gradient(90deg, #d9cfb4, #f3ecd9)',
              boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
            }}
          />

          {/* The cover. It only tilts here; the real swing happens once it has
              left the profile. */}
          <motion.div
            whileTap={{ rotateY: -7 }}
            transition={{ type: 'spring', stiffness: 300, damping: 22 }}
            style={{
              position: 'absolute',
              inset: 0,
              transformOrigin: 'left center',
              transformStyle: 'preserve-3d',
              borderRadius: 'var(--r-md)',
              background: 'linear-gradient(135deg, #4a1d6e 0%, #2c1049 45%, #1b0a33 100%)',
              border: '1px solid rgba(255,210,63,0.35)',
              boxShadow: 'var(--shadow-soft)',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '0 18px 0 26px',
            }}
          >
            {/* Spine */}
            <div
              aria-hidden
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: 14,
                background: 'linear-gradient(90deg, rgba(0,0,0,0.55), rgba(255,255,255,0.06))',
                borderRight: '1px solid rgba(255,210,63,0.25)',
              }}
            />
            {/* Gilt page edge */}
            <div
              aria-hidden
              style={{
                position: 'absolute',
                right: 0,
                top: 8,
                bottom: 8,
                width: 7,
                borderRadius: '0 4px 4px 0',
                background: 'linear-gradient(90deg, rgba(255,210,63,0.75), rgba(255,210,63,0.25))',
              }}
            />

            <div style={{ fontSize: 30 }}>📖</div>
            <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 800,
                  fontSize: 20,
                  color: 'var(--gold)',
                  letterSpacing: '0.01em',
                }}
              >
                My Bible
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-dim)', marginTop: 2, lineHeight: 1.4 }}>
                Every verse you’ve kept, studied and read — lit up in the whole book.
              </div>
              <div style={{ fontSize: 11, color: 'var(--ink-faint)', marginTop: 6 }}>
                {opened > 0
                  ? `${opened.toLocaleString()} verse${opened === 1 ? '' : 's'} opened · ${pct}`
                  : 'Tap to open'}
              </div>
            </div>
          </motion.div>
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
