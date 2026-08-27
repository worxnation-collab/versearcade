import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useDrops } from '@/store/drops'
import { collectibleByKey, rarityColor } from '@/data/collectibles'
import { useJuice } from '@/juice/useJuice'

// The reveal for something found while studying.
//
// Mounted once, app-wide, because the run that rolled it has already navigated
// by the time there's anything to show — a CPU race lands on its result screen,
// a replay on its recap. A toast follows the player there instead of trying to
// hold a screen open.
//
// It's a nudge, never a wall: it auto-dismisses, it never covers the primary
// action, and the only thing it asks for is the thing the find is actually for.
// Portalled to document.body because half the screens it can appear over sit
// inside a `.card`, and `.card` sets backdrop-filter — a containing block for
// position: fixed (same family as the ChurchDetailSheet and BookOpening notes).

/** How long the find sits there before it slides away on its own. */
const LINGER_MS = 11_000

export function StudyDropToast() {
  const navigate = useNavigate()
  const juice = useJuice()
  const found = useDrops((s) => s.found)
  const dismiss = useDrops((s) => s.dismiss)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  const def = found ? collectibleByKey(found.key) : null

  useEffect(() => {
    clearTimeout(timer.current)
    if (!found) return
    juice.celebrate()
    timer.current = setTimeout(() => useDrops.getState().dismiss(), LINGER_MS)
    return () => clearTimeout(timer.current)
    // juice is rebuilt each render; keying off the find is what matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found])

  if (typeof document === 'undefined') return null

  const glow = def ? rarityColor[def.rarity] : 'var(--gold)'

  return createPortal(
    <AnimatePresence>
      {found && def && (
        <motion.div
          key={`${found.key}-${found.qty ?? 0}`}
          initial={{ opacity: 0, y: -24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          role="status"
          style={{
            position: 'fixed',
            // Top, not bottom: this app anchors its primary action to the
            // bottom of every screen (Rematch, Done, Next), and a toast that
            // lands on the button the player is reaching for is a trap rather
            // than a reward. Nothing competes for the top but a back pill.
            left: 12,
            right: 12,
            top: 'calc(var(--safe-top) + 12px)',
            zIndex: 120,
            margin: '0 auto',
            maxWidth: 496,
            pointerEvents: 'auto',
          }}
        >
          {/* One tappable bar rather than a panel with its own button. The
              screen underneath is a recap the player just earned; a toast that
              buries it is worse than one that says less. Tapping anywhere opens
              the bag, which is the only thing there is to do about a find. */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { juice.coin(); dismiss(); navigate('/study/bag') }}
              className="card"
              style={{
                width: '100%',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '11px 40px 11px 13px',
                cursor: 'pointer',
                borderColor: glow,
                // Opaque, unlike a normal .card: this floats over live content,
                // and the screen showing through made the text hard to read.
                background: 'var(--card-solid)',
                boxShadow: `0 10px 40px rgba(0,0,0,0.5), 0 0 26px ${glow}44`,
              }}
            >
              <motion.span
                initial={{ scale: 0.4, rotate: -14 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 12, delay: 0.05 }}
                style={{ fontSize: 30, flexShrink: 0, lineHeight: 1 }}
              >
                {def.emoji}
              </motion.span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    fontSize: 10,
                    color: 'var(--gold)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  Found while studying
                </span>
                <b style={{ fontFamily: 'var(--font-display)', fontSize: 15, display: 'block' }}>
                  {def.name}
                  <span style={{ color: glow, fontWeight: 400, fontSize: 12 }}>
                    {' · '}{def.rarity}
                  </span>
                </b>
                {/* A first find and a spare are two different things, and both
                    are worth having — say which one this was. */}
                <span className="dim" style={{ display: 'block', fontSize: 11.5, lineHeight: 1.4 }}>
                  {found.newStamp
                    ? '✦ Stamped into your Bible — and it’s in your bag.'
                    : `In your bag${found.qty && found.qty > 1 ? ` — that’s ${found.qty}` : ''}.`}
                </span>
                <span
                  style={{
                    display: 'block',
                    fontSize: 11.5,
                    color: 'var(--gold)',
                    fontWeight: 700,
                    marginTop: 1,
                  }}
                >
                  Give it to your church →
                </span>
              </span>
            </button>
            {/* A sibling, not a child: a button inside a button is invalid and
                the browser drops one of them. */}
            <button
              onClick={() => { juice.select?.(); dismiss() }}
              aria-label="Dismiss"
              className="pill"
              style={{ position: 'absolute', top: 8, right: 8, padding: '3px 9px', fontSize: 12 }}
            >
              ✕
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
