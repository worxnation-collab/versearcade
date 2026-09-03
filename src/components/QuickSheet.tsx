import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useJuice } from '@/juice/useJuice'

// A small bottom sheet for something that used to be a card.
//
// The Play tab is now four things — the two daily boxes, the road and the
// compass — and everything else that earned a place there is a BUTTON that
// opens its own content here instead. That is the same move First Light already
// made (a row, tapped, opening the player card) generalised, rather than three
// screens each inventing a sheet.
//
// House rules it inherits, so a caller can't get them wrong: it sits at the
// app's 100 sheet tier, closes on Escape and on the backdrop, freezes the page
// behind it, and is PORTALLED to document.body — `Page` is a `motion.main` and
// a transform is a containing block for `position: fixed`, the same family of
// bug as the `backdrop-filter` note on `ChurchDetailSheet`.
export function QuickSheet({
  title,
  onClose,
  children,
  zIndex = 100,
}: {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  /**
   * 100 is the sheet tier. A sheet the PLAYER CARD opens (which sits at 110)
   * passes 112 — the "opened from the card" tier RoomVisitSheet uses — or it
   * paints under the card that opened it.
   */
  zIndex?: number
}) {
  const juice = useJuice()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="quicksheet-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex,
          background: 'rgba(8,3,24,0.78)',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
        }}
      >
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          style={{
            width: '100%',
            maxWidth: 520,
            maxHeight: '88dvh',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            background: 'var(--bg-1)',
            borderRadius: 'var(--r-lg) var(--r-lg) 0 0',
            border: '1px solid var(--stroke)',
            borderBottom: 'none',
            padding: '14px 14px calc(var(--safe-bottom) + 20px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 18, flex: 1, minWidth: 0 }}>{title}</b>
            <button
              className="pill"
              onClick={() => {
                juice.select?.()
                onClose()
              }}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          {children}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}
