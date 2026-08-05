import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import { useJuice } from '@/juice/useJuice'

type Variant = 'primary' | 'secondary' | 'ghost' | 'gold'

const styles: Record<Variant, React.CSSProperties> = {
  primary: {
    background: 'linear-gradient(180deg, var(--grape) 0%, var(--grape-deep) 100%)',
    boxShadow: '0 6px 0 #4b1fb0, 0 12px 24px rgba(122,63,242,0.45)',
    color: '#fff',
  },
  gold: {
    background: 'linear-gradient(180deg, #ffe27a 0%, var(--gold) 60%, var(--tangerine) 100%)',
    boxShadow: '0 6px 0 #c9860a, 0 12px 24px rgba(255,159,28,0.4)',
    color: '#3a2200',
  },
  secondary: {
    background: 'var(--card-solid)',
    boxShadow: '0 5px 0 rgba(0,0,0,0.4)',
    color: '#fff',
  },
  ghost: {
    background: 'transparent',
    border: '1.5px solid var(--stroke)',
    color: 'var(--ink)',
  },
}

interface Props {
  children: ReactNode
  onClick?: () => void
  variant?: Variant
  disabled?: boolean
  full?: boolean
  type?: 'button' | 'submit'
  ariaLabel?: string
}

// The tactile centerpiece: a chunky button with a "3D" bottom edge that
// compresses on press, plus a spring pop and a tap sound/haptic. Everything the
// user taps should feel alive — this is the default channel for that.
export function Button({ children, onClick, variant = 'primary', disabled, full, type = 'button', ariaLabel }: Props) {
  const juice = useJuice()
  return (
    <motion.button
      type={type}
      aria-label={ariaLabel}
      disabled={disabled}
      onPointerDown={() => {
        if (disabled) return
        try {
          juice.unlock()
        } catch {
          /* audio unlock must never block interaction */
        }
      }}
      onClick={() => {
        if (disabled) return
        // Feedback must NEVER be able to block the actual action. If the audio
        // or haptics engine throws on some device, the onClick still fires.
        try {
          juice.tap()
        } catch {
          /* ignore */
        }
        onClick?.()
      }}
      whileTap={{ scale: 0.94, y: 4 }}
      transition={{ type: 'spring', stiffness: 700, damping: 22 }}
      style={{
        ...styles[variant],
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: full ? '100%' : undefined,
        padding: '16px 22px',
        borderRadius: 'var(--r-pill)',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: 18,
        letterSpacing: '-0.01em',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {children}
    </motion.button>
  )
}
