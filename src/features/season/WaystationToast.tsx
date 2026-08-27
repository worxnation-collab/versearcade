import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useSeason } from '@/store/season'
import { rewardLabel } from '@/data/season'
import { useJuice } from '@/juice/useJuice'

// The reveal for reaching a waystation.
//
// Same reasoning as StudyDropToast, which this deliberately mirrors: a run
// navigates the instant it finishes, so a banner rendered inside the run would
// unmount before anyone saw it. The crossing parks in store/season and this —
// mounted once in App — shows it wherever the player actually lands.
//
// Top of the screen, not the bottom: every screen here anchors its primary
// action to the bottom, and a toast that covers the button someone is reaching
// for is a trap rather than a reward. Portalled to document.body because plenty
// of the screens it appears over sit inside a `.card`, and `.card` sets
// backdrop-filter — a containing block for position: fixed.

const LINGER_MS = 9_000

export function WaystationToast() {
  const navigate = useNavigate()
  const juice = useJuice()
  const pending = useSeason((s) => s.pending)
  const dismiss = useSeason((s) => s.dismiss)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  const milestone = !!pending && pending.waystation % 10 === 0

  useEffect(() => {
    clearTimeout(timer.current)
    if (!pending) return
    // Every tenth waystation is a bigger beat. That's the only thing a
    // milestone is — a louder reveal, never a better reward.
    if (milestone) juice.celebrate()
    else juice.coin()
    timer.current = setTimeout(() => useSeason.getState().dismiss(), LINGER_MS)
    return () => clearTimeout(timer.current)
    // juice is rebuilt every render; the crossing is what matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])

  if (typeof document === 'undefined') return null

  const rewards = pending?.rewards ?? []

  return createPortal(
    <AnimatePresence>
      {pending && (
        <motion.div
          key={pending.waystation}
          initial={{ opacity: 0, y: -24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          role="status"
          style={{
            position: 'fixed',
            left: 12,
            right: 12,
            top: 'calc(var(--safe-top) + 12px)',
            zIndex: 120,
            margin: '0 auto',
            maxWidth: 496,
          }}
        >
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { juice.tap(); dismiss(); navigate('/pilgrimage') }}
              className="card"
              style={{
                width: '100%',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '11px 40px 11px 13px',
                cursor: 'pointer',
                borderColor: 'var(--gold)',
                // Opaque, unlike a normal .card: this floats over live content
                // and the screen showing through made the text hard to read.
                background: 'var(--card-solid)',
                boxShadow: `0 10px 40px rgba(0,0,0,0.5), 0 0 26px rgba(255,210,63,${milestone ? 0.5 : 0.27})`,
              }}
            >
              <motion.span
                initial={{ scale: 0.4, rotate: -14 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 12, delay: 0.05 }}
                style={{ fontSize: 30, flexShrink: 0, lineHeight: 1 }}
              >
                {milestone ? '🌟' : '🌾'}
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
                  Waystation {pending.waystation}
                </span>
                {rewards.length > 0 ? (
                  <>
                    <b style={{ fontFamily: 'var(--font-display)', fontSize: 15, display: 'block' }}>
                      {rewards.map((r) => rewardLabel(r.id).name).join(' · ')}
                    </b>
                    <span className="dim" style={{ display: 'block', fontSize: 11.5, lineHeight: 1.4 }}>
                      Yours for good. Tap to see the road →
                    </span>
                  </>
                ) : (
                  <>
                    <b style={{ fontFamily: 'var(--font-display)', fontSize: 15, display: 'block' }}>
                      Another mile down
                    </b>
                    <span className="dim" style={{ display: 'block', fontSize: 11.5, lineHeight: 1.4 }}>
                      Tap to see what's ahead →
                    </span>
                  </>
                )}
              </span>
            </button>
            {/* A sibling, not a child: a button inside a button is invalid and
                the browser drops one of them. */}
            <button
              onClick={() => { juice.select(); dismiss() }}
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
