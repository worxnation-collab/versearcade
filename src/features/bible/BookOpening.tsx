import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { PAPER } from './paper'

// The transition that makes this a book rather than a screen.
//
// Tapping the Bible on the profile doesn't navigate — it lifts the book off the
// page. The closed book flies from exactly where it was sitting to the middle of
// the screen, grows, the cover swings open on its spine with the leaves fanning
// behind it, and the open page then expands to fill everything. Only once the
// screen is already cream does the route change, so the arrival is invisible:
// you were looking at a book, and now you're looking at its contents.
//
// Three phases on a short clock. They advance when the motion LOOKS finished
// rather than when the spring has fully settled — a spring this soft takes over
// a second to stop ringing, and waiting for that made opening the book a
// two-second wait you'd feel every single day. The whole sequence is under a
// second now; the springs still ring out underneath it.
type Phase = 'lift' | 'open' | 'fill'

const LIFT_MS = 260
const OPEN_MS = 380
const FILL_MS = 260

export function BookOpening({
  from,
  onDone,
}: {
  /** Where the closed book is sitting right now, so it flies from itself. */
  from: DOMRect
  onDone: () => void
}) {
  const [phase, setPhase] = useState<Phase>('lift')

  // The book's destination: as large as the screen politely allows, in the
  // proportions of a real one.
  const vw = typeof window === 'undefined' ? 390 : window.innerWidth
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight
  const width = Math.min(vw - 48, 360)
  const height = Math.min(vh - 160, width * 1.38)
  const left = (vw - width) / 2
  const top = (vh - height) / 2

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase('open'), LIFT_MS),
      setTimeout(() => setPhase('fill'), LIFT_MS + OPEN_MS),
      setTimeout(onDone, LIFT_MS + OPEN_MS + FILL_MS),
    ]
    return () => timers.forEach(clearTimeout)
  }, [onDone])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        perspective: 1600,
        WebkitPerspective: 1600,
        background: 'radial-gradient(120% 90% at 50% 40%, rgba(20,8,44,0.82), rgba(6,3,16,0.94))',
        pointerEvents: 'all',
      }}
    >
      <motion.div
        initial={{ top: from.top, left: from.left, width: from.width, height: from.height }}
        animate={
          phase === 'fill'
            ? { top: 0, left: 0, width: vw, height: vh }
            : { top, left, width, height }
        }
        transition={
          phase === 'fill'
            ? { type: 'spring', stiffness: 320, damping: 30 }
            : { type: 'spring', stiffness: 300, damping: 24 }
        }
        style={{ position: 'absolute', transformStyle: 'preserve-3d' }}
      >
        {/* The leaves, fanned behind the cover so the book has thickness. */}
        {[3, 2, 1].map((i) => (
          <motion.div
            key={i}
            animate={
              phase === 'lift'
                ? { rotateZ: 0, x: 0 }
                : { rotateZ: -1.2 * i, x: 2 * i }
            }
            transition={{ type: 'spring', stiffness: 200, damping: 18, delay: 0.03 * i }}
            style={{
              position: 'absolute',
              inset: 0,
              transformOrigin: 'left center',
              borderRadius: phase === 'fill' ? 0 : 'var(--r-md)',
              background: '#efe6cf',
              border: '1px solid rgba(0,0,0,0.10)',
            }}
          />
        ))}

        {/* The page the book opens onto. It becomes the screen. */}
        <motion.div
          animate={{ opacity: 1 }}
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: phase === 'fill' ? 0 : 'var(--r-md)',
            background: PAPER.page,
            border: phase === 'fill' ? 'none' : '1px solid rgba(0,0,0,0.22)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 10,
          }}
        >
          {/* The gutter, matching the page the route is about to render. */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 26,
              background:
                'linear-gradient(90deg, rgba(58,44,22,0.30) 0%, rgba(58,44,22,0.10) 45%, rgba(58,44,22,0) 100%)',
            }}
          />
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: phase === 'lift' ? 0 : 1, y: phase === 'lift' ? 6 : 0 }}
            transition={{ delay: 0.12 }}
            style={{ textAlign: 'center', padding: 20 }}
          >
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: 22,
                color: PAPER.ink,
                letterSpacing: '0.04em',
              }}
            >
              My Bible
            </div>
            <div style={{ fontSize: 12, color: PAPER.inkFaint, marginTop: 6 }}>
              66 books · 1,189 chapters
            </div>
          </motion.div>
        </motion.div>

        {/* The front cover, hinged on its spine. This is the swing. */}
        <motion.div
          animate={{ rotateY: phase === 'lift' ? 0 : -172 }}
          transition={{ type: 'spring', stiffness: 190, damping: 21 }}
          style={{
            position: 'absolute',
            inset: 0,
            transformOrigin: 'left center',
            transformStyle: 'preserve-3d',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            borderRadius: 'var(--r-md)',
            background: 'linear-gradient(135deg, #4a1d6e 0%, #2c1049 45%, #1b0a33 100%)',
            border: '1px solid rgba(255,210,63,0.35)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
            overflow: 'hidden',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <div
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
          <div
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
          <div style={{ textAlign: 'center', padding: 20 }}>
            <div style={{ fontSize: 34 }}>📖</div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: 20,
                color: 'var(--gold)',
                marginTop: 8,
                letterSpacing: '0.03em',
              }}
            >
              My Bible
            </div>
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}
