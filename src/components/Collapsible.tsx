import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
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
  icon: ReactNode
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
          position: 'relative', isolation: 'isolate',
          // A quiet warm hairline, lit on its top edge and shaded on its
          // bottom. It was a gold frame with a carved vine at two corners,
          // which beside the gouache art read as busy (2026-11-12); gold is
          // the action's colour, and a fold is not the action. Opening it
          // brightens the line to the brass --edge rather than moving anything.
          border: `1px solid ${open ? 'var(--edge)' : 'var(--stroke-strong)'}`,
          boxShadow: [
            'inset 0 1px 0 rgba(255,236,170,0.38)',
            'inset 0 -1px 0 rgba(48,28,4,0.55)',
            'inset 0 0 12px rgba(0,0,0,0.30)',
            '0 0 0 1px rgba(24,14,4,0.55)',
            'var(--shadow-soft)',
          ].join(', '),
        }}
      >
        {/* One line, always — a wrapped title would slide under the pill. */}
        <span
          style={{
            position: 'relative', zIndex: 1,
            fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, textAlign: 'left',
            minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {icon} {title}
          {meta != null && <span className="faint" style={{ fontWeight: 400, fontSize: 13 }}> · {meta}</span>}
        </span>
        {/* Neutral, not gold: gold is rationed to the thing to do next, and
            a fold is never that (2026-11-11 audit). */}
        <span
          className="pill"
          style={{ position: 'relative', zIndex: 1, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--card-raised)', color: 'var(--ink)', border: '1px solid var(--stroke)', fontWeight: 800, fontSize: 13, padding: '5px 11px', flexShrink: 0 }}
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

