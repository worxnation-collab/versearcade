import { motion } from 'framer-motion'
import { useJuice } from '@/juice/useJuice'
import { openAppStore, storeName, targetStore } from '@/lib/appStore'

/** Apple's mark, drawn in the current text color. Decorative — the label says it. */
export function AppleGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M16.365 1.43c0 1.14-.468 2.23-1.223 3.04-.9.96-2.4 1.7-3.63 1.6-.14-1.2.45-2.46 1.2-3.25.84-.9 2.3-1.57 3.55-1.63.03.08.05.16.06.24h.043zM20.5 17.06c-.55 1.27-.82 1.83-1.53 2.95-.99 1.56-2.39 3.5-4.12 3.52-1.54.01-1.93-1-4.02-.99-2.09.01-2.52 1.01-4.06.99-1.73-.02-3.06-1.77-4.05-3.33-2.77-4.36-3.06-9.48-1.35-12.2 1.21-1.93 3.13-3.07 4.93-3.07 1.84 0 2.99 1.01 4.51 1.01 1.47 0 2.37-1.01 4.49-1.01 1.61 0 3.31.88 4.53 2.39-3.98 2.18-3.34 7.86.67 9.74z" />
    </svg>
  )
}

/**
 * A plain play triangle for the Play Store CTA — deliberately NOT a redraw of
 * Google's four-colour mark, which is their trademarked artwork. Same reasoning
 * as the note below: this is Verse Arcade's own badge, not a copy of theirs.
 */
export function PlayGlyph({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M4.5 2.6c-.3.25-.5.66-.5 1.2v16.4c0 .54.2.95.5 1.2l8.6-9.4-8.6-9.4zm10 8.1L6.3 1.9l10.9 6.3-2.7 2.5zm0 2.6l2.7 2.5-10.9 6.3 8.2-8.8zm1.5-1.3l3.4-2c.8-.45.8-1.35 0-1.8l-2-1.15-3.2 3 1.8 1.95z" />
    </svg>
  )
}

/**
 * "Download on the <store>" CTA, drawn in Verse Arcade's own language rather
 * than as a copy of Apple's or Google's badge artwork. Which store it points at
 * follows the device (see targetStore). `compact` is the slimmer version for
 * places where downloading isn't the primary action.
 */
export function AppStoreBadge({ compact }: { compact?: boolean }) {
  const juice = useJuice()
  // One badge, whichever store this device can actually install from. An Apple
  // glyph over a Play link is the kind of detail that reads as "this app was
  // ported carelessly", and it's one boolean to get right.
  const play = targetStore() === 'play'
  return (
    <motion.button
      onClick={() => {
        try {
          juice.tap()
        } catch {
          /* feedback must never block the link */
        }
        openAppStore('download')
      }}
      whileTap={{ scale: 0.95, y: 2 }}
      transition={{ type: 'spring', stiffness: 700, damping: 22 }}
      aria-label={`Download Verse Arcade on ${storeName()}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        width: '100%',
        padding: compact ? '10px 18px' : '13px 22px',
        borderRadius: 'var(--r-pill)',
        background: compact ? 'transparent' : '#000',
        border: compact ? '1.5px solid var(--stroke)' : '1.5px solid rgba(255,255,255,0.22)',
        boxShadow: compact ? 'none' : '0 5px 0 rgba(0,0,0,0.45), 0 12px 26px rgba(0,0,0,0.35)',
        color: '#fff',
        cursor: 'pointer',
      }}
    >
      {play ? <PlayGlyph size={compact ? 16 : 22} /> : <AppleGlyph size={compact ? 16 : 22} />}
      <span style={{ textAlign: 'left', lineHeight: 1.05 }}>
        {!compact && (
          <span className="dim" style={{ display: 'block', fontSize: 10.5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Download on the
          </span>
        )}
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: compact ? 14 : 19, letterSpacing: '-0.01em' }}>
          {storeName()}
        </span>
      </span>
    </motion.button>
  )
}
