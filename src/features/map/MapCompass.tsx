import { useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useJuice } from '@/juice/useJuice'
import { useSettings } from '@/store/settings'
import { MapSheet } from './MapSheet'
import { useInvitations } from './invitations'

// The compass, at full size, standing on the Play tab.
//
// The 46px puck beside the bottom nav is still there and still the way into the
// map from anywhere; this is the same door made big on the one screen everybody
// lands on, because the map is what answers "what now?" and the Play tab is
// where that question gets asked.
//
// **It glows when something is open, and glowing is ALL it does.** The gold is
// driven by `useInvitations()`, and the invitation panel's whole design is that
// it is not a checklist — read the header in `invitations.ts` before touching
// this. So:
//
//  - **No count, ever.** Not a badge, not "3 open", not a ring that fills. The
//    button knows only whether the list is empty, which is the same single,
//    countless signal the nav's dot carries. A number here would turn the one
//    directory in the app into a queue to be cleared, and the sentence under it
//    says "something", never how much.
//  - **Nothing marks it done.** The list shortens through the day on its own and
//    the glow simply stops. There is no completed state, no tick, and nothing is
//    remembered about a day that has passed — so an evening with a dark compass
//    is a finished day, never a failed one.
//
// The sheet is PORTALLED to document.body. `Page` is a `motion.main` and a
// transform is a containing block for `position: fixed`, so a sheet rendered
// inline inside the page can end up positioned against the page rather than the
// viewport — the same family of bug as the `backdrop-filter` note on
// `ChurchDetailSheet` and the `perspective` one in `BookOpening`.
export function MapCompass() {
  const juice = useJuice()
  const reduceMotion = useSettings((s) => s.reduceMotion)
  const invites = useInvitations()
  const [open, setOpen] = useState(false)

  // One boolean out of the list, and deliberately nothing else out of it.
  const glowing = invites.length > 0
  const pulsing = glowing && !reduceMotion

  return (
    <>
      <motion.button
        onClick={() => {
          juice.select?.()
          setOpen(true)
        }}
        whileTap={{ scale: 0.97 }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="card"
        aria-label="Find your way around"
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          padding: '18px 16px',
          cursor: 'pointer',
          borderColor: glowing ? 'var(--gold)' : 'var(--stroke)',
          background: glowing ? 'rgba(255,210,63,0.07)' : undefined,
          boxShadow: glowing ? '0 0 0 3px rgba(255,210,63,0.10)' : undefined,
        }}
      >
        {/* The needle. The gold RING is what carries the meaning and it stays
            either way — a signal that exists only as movement is a signal
            reduce-motion players never get. */}
        <motion.span
          aria-hidden
          animate={pulsing ? { scale: [1, 1.07, 1] } : { scale: 1 }}
          transition={pulsing ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
          style={{
            width: 64,
            height: 64,
            borderRadius: 999,
            display: 'grid',
            placeItems: 'center',
            fontSize: 32,
            lineHeight: 1,
            background: 'rgba(20,10,52,0.85)',
            border: `1px solid ${glowing ? 'var(--gold)' : 'var(--stroke)'}`,
            boxShadow: glowing
              ? '0 10px 30px rgba(0,0,0,0.45), 0 0 24px rgba(255,210,63,0.28)'
              : '0 10px 30px rgba(0,0,0,0.45)',
          }}
        >
          🧭
        </motion.span>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>Find your way around</b>
        <span className="faint" style={{ fontSize: 12.5, textAlign: 'center', lineHeight: 1.4 }}>
          {glowing
            ? 'Something is open right now'
            : 'Every place in the app, on one screen'}
        </span>
      </motion.button>

      {createPortal(
        <AnimatePresence>{open && <MapSheet key="map" onClose={() => setOpen(false)} />}</AnimatePresence>,
        document.body,
      )}
    </>
  )
}
