import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useMusic } from '@/store/music'
import { useSettings } from '@/store/settings'
import { useDrops } from '@/store/drops'
import { trackById } from '@/data/music'

// The track card — a new tune turning up, announced the way the game this
// borrows from announces one.
//
// It shows twice in a player's life per track and then never again: once for
// the very first note the app ever plays (which is also where the mute lives,
// so nobody has to go hunting for it) and once for each track they walk into.
// Eight cards total, then silence. A chip on every tab switch would be noise.
//
// Portalled to document.body for the usual reason — half the screens it can
// appear over sit inside a `.card`, and `.card` sets backdrop-filter, which is
// a containing block for position: fixed.

const LINGER_INTRO = 9_000
const LINGER_NEW = 6_000

export function NowPlaying() {
  const announced = useMusic((s) => s.announced)
  const dismiss = useMusic((s) => s.dismiss)
  const setSettings = useSettings((s) => s.set)
  // A study find is the bigger moment and owns the top of the screen; this
  // slides down under it rather than fighting it for the same 90 pixels.
  const dropShowing = useDrops((s) => !!s.found)

  const linger = announced?.intro ? LINGER_INTRO : LINGER_NEW

  useEffect(() => {
    if (!announced) return
    const left = announced.at + linger - Date.now()
    if (left <= 0) {
      dismiss()
      return
    }
    const t = setTimeout(() => useMusic.getState().dismiss(), left)
    return () => clearTimeout(t)
  }, [announced, linger, dismiss])

  if (typeof document === 'undefined') return null
  const def = trackById(announced?.id)

  return createPortal(
    <AnimatePresence>
      {announced && def && (
        <motion.div
          key={`${announced.id}-${announced.at}`}
          initial={{ opacity: 0, x: -18 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ type: 'spring', stiffness: 340, damping: 30 }}
          role="status"
          style={{
            position: 'fixed',
            left: 12,
            // Under the study-find bar when there is one, in its place when not.
            top: dropShowing ? 'calc(var(--safe-top) + 112px)' : 'calc(var(--safe-top) + 12px)',
            zIndex: 115,
            maxWidth: 'min(320px, calc(100vw - 24px))',
            transition: 'top 0.25s ease',
          }}
        >
          <div
            className="card"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '9px 11px',
              // Opaque: this floats over live content and the screen showing
              // through made the track name hard to read.
              background: 'var(--card-solid)',
              borderColor: 'var(--gold)',
              boxShadow: '0 10px 34px rgba(0,0,0,0.5), 0 0 20px rgba(255,210,63,0.22)',
            }}
          >
            <motion.span
              aria-hidden
              animate={{ y: [0, -3, 0] }}
              transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
              style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}
            >
              ♪
            </motion.span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  display: 'block',
                  fontSize: 9.5,
                  color: 'var(--gold)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontWeight: 800,
                }}
              >
                {announced.intro ? 'Music is on' : 'New track unlocked'}
              </span>
              <b
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 14.5,
                  display: 'block',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {def.name}
              </b>
              {announced.intro && (
                <span className="dim" style={{ display: 'block', fontSize: 11, lineHeight: 1.35 }}>
                  Tap 🔇 to turn it off — it stays off.
                </span>
              )}
            </span>
            {/* The mute is on the thing that just started making noise, which
                is where somebody who doesn't want it is already looking. */}
            <button
              onClick={() => {
                setSettings({ musicEnabled: false })
                dismiss()
              }}
              aria-label="Turn music off"
              className="pill"
              style={{ fontSize: 14, padding: '5px 9px', flexShrink: 0 }}
            >
              🔇
            </button>
            <button
              onClick={dismiss}
              aria-label="Dismiss"
              className="pill"
              style={{ fontSize: 11, padding: '5px 8px', flexShrink: 0 }}
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
