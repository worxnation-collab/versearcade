import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useJuice } from '@/juice/useJuice'

// The app's one collapsible section: a tappable card header with a gold
// Show/Hide pill, so a closed section still reads as "there's more in here"
// rather than as a dead heading. Used anywhere a whole screen's worth of
// content is folded into another tab (Ranks in Play, Cards & Buddies in You).
export function Collapsible({
  icon,
  title,
  meta,
  children,
  defaultOpen = false,
  onToggle,
}: {
  icon: string
  title: string
  /** Small dimmed text after the title — a count, a rank, a status. */
  meta?: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  /** Fires with the new state on every open/close, for callers that remember it. */
  onToggle?: (open: boolean) => void
}) {
  const juice = useJuice()
  const [open, setOpen] = useState(defaultOpen)

  // A reason to open can arrive after mount — buddy requests are fetched async,
  // so the count that justifies opening isn't known on the first render. Honour
  // defaultOpen when it flips true, but only on the edge, and never force the
  // section closed again: if the player has already opened or dismissed it,
  // that's their call, not the prop's.
  const wasOpenable = useRef(defaultOpen)
  useEffect(() => {
    if (defaultOpen && !wasOpenable.current) setOpen(true)
    wasOpenable.current = defaultOpen
  }, [defaultOpen])

  return (
    <>
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => { juice.select?.(); const next = !open; setOpen(next); onToggle?.(next) }}
        aria-expanded={open}
        className="card"
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between',
          padding: '13px 14px', marginBottom: 10, cursor: 'pointer',
          borderColor: open ? 'var(--gold)' : 'var(--stroke)',
        }}
      >
        {/* One line, always — a wrapped title would slide under the pill. */}
        <span
          style={{
            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, textAlign: 'left',
            minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {icon} {title}
          {meta != null && <span className="faint" style={{ fontWeight: 400, fontSize: 13 }}> · {meta}</span>}
        </span>
        <span
          className="pill"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--gold)', color: '#241f0a', fontWeight: 800, fontSize: 13, padding: '6px 12px', flexShrink: 0 }}
        >
          {open ? 'Hide' : 'Show'}
          <span style={{ fontSize: 15, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
        </span>
      </motion.button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ marginBottom: 14 }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
