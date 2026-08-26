import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { useJuice } from '@/juice/useJuice'
import { useBibleMarks } from './useBibleMarks'
import { percentLabel, touchedFraction, wholeBibleTiers } from '@/lib/bibleProgress'

// The player's Bible as an object: a closed book sitting on the profile, gilt
// edge and all, that swings open when you tap it and then hands you the
// contents. The animation is the point — a shelf of verses is a list, but a
// book you open is a place you keep coming back to.
//
// Closed, it still says something true: how much of the book you've opened. That
// number is only ever compared against the Bible, never against another player.
export function BibleCover() {
  const navigate = useNavigate()
  const juice = useJuice()
  const reduceMotion = useReducedMotion()
  const { marks } = useBibleMarks()
  const [opening, setOpening] = useState(false)

  const counts = wholeBibleTiers(marks)
  const opened = counts.saved + counts.studied + counts.read
  const pct = percentLabel(touchedFraction(counts))

  const go = () => {
    juice.select?.()
    if (reduceMotion) {
      navigate('/bible')
      return
    }
    setOpening(true)
    juice.whoosh?.()
    // Long enough for the cover to swing clear; the route change lands as the
    // page underneath comes into view.
    setTimeout(() => navigate('/bible'), 520)
  }

  return (
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
      <div
        style={{
          position: 'relative',
          height: 158,
          transformStyle: 'preserve-3d',
        }}
      >
        {/* The page underneath — what the cover opens onto. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'var(--r-md)',
            background: 'linear-gradient(115deg, #f6efdd, #e8dcc0)',
            border: '1px solid rgba(0,0,0,0.25)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 4,
            color: '#3a2a12',
            padding: 18,
            textAlign: 'center',
          }}
        >
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22 }}>
            {opened.toLocaleString()}
          </div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            verse{opened === 1 ? '' : 's'} opened · {pct} of the Bible
          </div>
        </div>

        {/* The cover, hinged on its spine. */}
        <motion.div
          animate={opening ? { rotateY: -158 } : { rotateY: 0 }}
          transition={{ type: 'spring', stiffness: 120, damping: 18 }}
          style={{
            position: 'absolute',
            inset: 0,
            transformOrigin: 'left center',
            transformStyle: 'preserve-3d',
            borderRadius: 'var(--r-md)',
            background:
              'linear-gradient(135deg, #4a1d6e 0%, #2c1049 45%, #1b0a33 100%)',
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
  )
}
