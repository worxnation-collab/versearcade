import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'
import { PAPER } from './paper'

// The inside of the book. Every Bible surface renders through this instead of
// the app's normal `Page`, so opening the Bible actually lands you somewhere
// else: a cream page with a gutter where the spine folds and a stack of page
// edges down the outside.
//
// It's a page, not a card on a page — it runs to the edges of the screen and
// scrolls inside itself, so nothing about the arcade shows through except the
// dark behind the book's edges.
export function BookPage({
  header,
  children,
  /** Which way the page turned in, for the chapter-to-chapter slide. */
  turn = 0,
  pageKey,
}: {
  header: ReactNode
  children: ReactNode
  turn?: -1 | 0 | 1
  /** Changing this re-runs the turn animation — normally the chapter or book. */
  pageKey?: string
}) {
  const reduceMotion = useReducedMotion()

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        justifyContent: 'center',
        // The dark the book is lying on.
        background: 'radial-gradient(120% 80% at 50% 0%, #241353 0%, var(--bg-0) 70%)',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 560,
          display: 'flex',
          flexDirection: 'column',
          background: PAPER.page,
          // Page edges: a few hairlines stacked down the outer side, so the page
          // reads as one leaf of many rather than a sheet.
          boxShadow:
            '2px 0 0 rgba(255,255,255,0.55), 4px 0 0 rgba(0,0,0,0.10), 6px 0 0 rgba(255,255,255,0.45),' +
            '8px 0 0 rgba(0,0,0,0.08), 10px 0 0 rgba(255,255,255,0.35), 12px 0 0 rgba(0,0,0,0.06),' +
            '0 0 60px rgba(0,0,0,0.55)',
          overflow: 'hidden',
        }}
      >
        {/* The gutter — where the page dives into the spine. Purely decorative,
            and thin enough that text never sits in the shadow. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 26,
            pointerEvents: 'none',
            zIndex: 2,
            background:
              'linear-gradient(90deg, rgba(58,44,22,0.28) 0%, rgba(58,44,22,0.10) 45%, rgba(58,44,22,0) 100%)',
          }}
        />

        <div
          style={{
            position: 'relative',
            zIndex: 3,
            padding: 'calc(var(--safe-top) + 10px) 16px 10px 30px',
            borderBottom: `1px solid ${PAPER.rule}`,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.5), rgba(255,255,255,0))',
          }}
        >
          {header}
        </div>

        <motion.div
          key={pageKey}
          initial={
            reduceMotion || !turn ? { opacity: 0 } : { opacity: 0, x: turn * 40, rotateY: turn * -6 }
          }
          animate={{ opacity: 1, x: 0, rotateY: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 30 }}
          style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            padding: '14px 16px calc(var(--safe-bottom) + 28px) 30px',
            color: PAPER.ink,
          }}
        >
          {children}
        </motion.div>
      </div>
    </div>
  )
}

/** The header row every Bible page wears: a back control, a title, a note. */
export function BookHeader({
  onBack,
  backLabel,
  title,
  note,
}: {
  onBack: () => void
  backLabel: string
  title: ReactNode
  note?: ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button
        onClick={onBack}
        aria-label={backLabel}
        style={{
          width: 34,
          height: 34,
          flexShrink: 0,
          borderRadius: '50%',
          border: `1px solid ${PAPER.rule}`,
          background: 'rgba(255,255,255,0.5)',
          color: PAPER.inkDim,
          fontSize: 16,
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
        }}
      >
        ←
      </button>
      <b
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 19,
          color: PAPER.ink,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {title}
      </b>
      {note != null && (
        <span style={{ fontSize: 11, color: PAPER.inkFaint, marginLeft: 'auto', flexShrink: 0 }}>
          {note}
        </span>
      )}
    </div>
  )
}
