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
          // A thin raised gold frame: a dark gold line, lit on its top edge and
          // shaded on its bottom, with a soft shadow just inside so the row
          // sits up off the page. The fill underneath is the .card material,
          // untouched. Opening it warms the line rather than moving anything.
          border: `1px solid ${open ? '#c99a3a' : '#a87c2c'}`,
          boxShadow: [
            'inset 0 1px 0 rgba(255,236,170,0.38)',
            'inset 0 -1px 0 rgba(48,28,4,0.55)',
            'inset 0 0 12px rgba(0,0,0,0.30)',
            '0 0 0 1px rgba(24,14,4,0.55)',
            'var(--shadow-soft)',
          ].join(', '),
        }}
      >
        <VineRelief corner="tl" />
        <VineRelief corner="br" />
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
        <span
          className="pill"
          style={{ position: 'relative', zIndex: 1, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--gold)', color: '#241f0a', fontWeight: 800, fontSize: 13, padding: '6px 12px', flexShrink: 0 }}
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

// A sprig of vine carved into the frame at two opposite corners — a relief,
// not a border: a dark cut with a lit edge one hair below it, the way a line
// incised in gilt catches light. Two corners rather than all four so it reads
// as ornament on the frame, not a vine wrapped round the row. Drawn, not an
// image, so it stays crisp at any width and costs nothing to load.
function VineRelief({ corner }: { corner: 'tl' | 'br' }) {
  const stem = 'M1 7 C 12 2, 22 9, 34 5 S 52 2, 60 6'
  const leaves = [
    'M10 5.2 c 1.6 -3.2, 4.6 -3.6, 5.4 -3.4 c -0.6 1.6, -2.6 3.6, -5.4 3.4 z',
    'M24 6.8 c 2 2.2, 4.8 2.4, 5.6 2 c -1 -1.6, -3 -2.6, -5.6 -2 z',
    'M40 4.2 c 1.4 -2.8, 4 -3.4, 4.8 -3.2 c -0.6 1.4, -2.4 3.2, -4.8 3.2 z',
    'M52 4.6 c 1.8 1.8, 4 2, 4.8 1.6 c -0.8 -1.4, -2.6 -2.2, -4.8 -1.6 z',
  ]
  const pos: CSSProperties =
    corner === 'tl'
      // Past the corner's curve and onto the straight edge, so the cut follows
      // the frame line instead of floating inside the rounded end.
      ? { top: 1.5, left: 30 }
      : { bottom: 1.5, right: 30, transform: 'rotate(180deg)' }
  const draw = (color: string, dy: number) => (
    <g transform={`translate(0 ${dy})`} stroke={color} fill="none" strokeLinecap="round">
      <path d={stem} strokeWidth={0.9} />
      {leaves.map((d) => <path key={d} d={d} strokeWidth={0.7} fill={color} fillOpacity={0.35} />)}
    </g>
  )
  return (
    <svg
      aria-hidden
      width={62}
      height={11}
      viewBox="0 0 62 11"
      style={{ position: 'absolute', zIndex: 0, pointerEvents: 'none', opacity: 0.85, ...pos }}
    >
      {draw('rgba(255,232,160,0.45)', 0.7)}
      {draw('rgba(92,58,10,0.85)', 0)}
    </svg>
  )
}
