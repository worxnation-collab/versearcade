import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
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
// **It names its first two invitations, and that is the whole change.** It used
// to say "Something is open right now" and nothing else — the answer to "what
// now?" was in scope on this very component and rendered as a secret. So the
// card now shows the first two open doors as rows you can tap, and the compass
// itself is the "and the rest" affordance. The invitation panel's whole design
// is that it is not a checklist — read the header in `invitations.ts` before
// touching this. What that means here:
//
//  - **No count, ever.** Not a badge, not "2 of 6", not "and 4 more", not a
//    ring that fills. Two rows and a compass; the compass knows only whether the
//    list is empty. The word "more" under the rows says nothing about how many.
//  - **Nothing marks it done.** The list shortens through the day on its own,
//    the rows fall away, and the glow simply stops. There is no completed state,
//    no tick, and nothing is remembered about a day that has passed — so an
//    evening with a dark compass is a finished day, never a failed one.
//  - **Rows are doors, not tasks.** They are the same rows the sheet draws,
//    worded as invitations, never as "you haven't".
//
// The sheet is PORTALLED to document.body. `Page` is a `motion.main` and a
// transform is a containing block for `position: fixed`, so a sheet rendered
// inline inside the page can end up positioned against the page rather than the
// viewport — the same family of bug as the `backdrop-filter` note on
// `ChurchDetailSheet` and the `perspective` one in `BookOpening`.

/** How many invitations the card shows before deferring to the sheet. */
const SHOWN = 2

export function MapCompass() {
  const juice = useJuice()
  const navigate = useNavigate()
  const reduceMotion = useSettings((s) => s.reduceMotion)
  const invites = useInvitations()
  const [open, setOpen] = useState(false)

  // One boolean out of the list for the glow, and a fixed slice for the rows.
  // Deliberately never `invites.length` anywhere a player can read it.
  const glowing = invites.length > 0
  const pulsing = glowing && !reduceMotion
  const shown = invites.slice(0, SHOWN)

  const openSheet = () => {
    juice.select?.()
    setOpen(true)
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="card"
        style={{
          width: '100%',
          padding: '14px 14px 12px',
          borderColor: glowing ? 'var(--gold)' : 'var(--stroke)',
          background: glowing ? 'rgba(255,210,63,0.07)' : undefined,
          boxShadow: glowing ? '0 0 0 3px rgba(255,210,63,0.10)' : undefined,
        }}
      >
        {/* The header IS the door to the whole map. Buttons can't nest, so the
            card is a div and the header and each row are their own buttons. */}
        <motion.button
          onClick={openSheet}
          whileTap={{ scale: 0.98 }}
          aria-label="Find your way around"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: 0,
            background: 'none',
            border: 0,
            color: 'inherit',
            textAlign: 'left',
            cursor: 'pointer',
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
              width: 48,
              height: 48,
              flexShrink: 0,
              borderRadius: 999,
              display: 'grid',
              placeItems: 'center',
              fontSize: 24,
              lineHeight: 1,
              background: 'rgba(20,10,52,0.85)',
              border: `1px solid ${glowing ? 'var(--gold)' : 'var(--stroke)'}`,
              boxShadow: glowing
                ? '0 6px 20px rgba(0,0,0,0.45), 0 0 18px rgba(255,210,63,0.28)'
                : '0 6px 20px rgba(0,0,0,0.45)',
            }}
          >
            🧭
          </motion.span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>
              {glowing ? 'Open right now' : 'Find your way around'}
            </b>
            <span className="faint" style={{ fontSize: 12.5, lineHeight: 1.35 }}>
              {glowing
                ? 'Tap the compass for everywhere else'
                : 'Every place in the app, on one screen'}
            </span>
          </span>
          <span style={{ color: glowing ? 'var(--gold)' : 'var(--ink-dim)', fontSize: 18, flexShrink: 0 }}>›</span>
        </motion.button>

        {/* The first two doors, as the sheet draws them. They go straight to
            the place — the sheet is for looking, this is for going. */}
        {shown.length > 0 && (
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {shown.map((inv) => (
              <motion.button
                key={inv.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  juice.select?.()
                  navigate(inv.to)
                }}
                className="card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  textAlign: 'left',
                  padding: '11px 14px',
                  cursor: 'pointer',
                  borderColor: 'var(--gold)',
                  background: 'rgba(255,210,63,0.08)',
                }}
              >
                <span style={{ fontSize: 20, flexShrink: 0 }}>{inv.icon}</span>
                <span style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: 14 }}>{inv.label}</span>
                <span style={{ color: 'var(--gold)', flexShrink: 0 }}>›</span>
              </motion.button>
            ))}
          </div>
        )}
      </motion.div>

      {createPortal(
        <AnimatePresence>{open && <MapSheet key="map" onClose={() => setOpen(false)} />}</AnimatePresence>,
        document.body,
      )}
    </>
  )
}
