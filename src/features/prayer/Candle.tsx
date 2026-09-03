import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Haptic } from '@/juice/haptics'
import { CANDLE_HOLD_MS } from '@/data/prayerWall'

// Hold to pray.
//
// Not a tap. You press the candle and keep pressing; the wick takes a couple
// of seconds to catch, the flame climbs while it does, and letting go early
// puts it out with nothing recorded. The hold is the whole point — it is the
// smallest possible ritual, long enough to read the verse above it and mean
// the one line under it, and it is what makes kneeling at a stranger's note
// feel like something you DID rather than something you dismissed.
//
// Reduce-motion keeps the hold (it is the gesture, not a flourish) and drops
// the flicker. The haptic tick every ~600ms is what lets somebody hold it
// without watching it.

export function Candle({
  onLit,
  disabled = false,
  /** Draw it already burning — after the prayer has landed. */
  lit = false,
}: {
  onLit: () => void
  disabled?: boolean
  lit?: boolean
}) {
  const reduceMotion = useReducedMotion()
  const [progress, setProgress] = useState(0)
  const holding = useRef(false)
  const startAt = useRef(0)
  const raf = useRef<number | undefined>(undefined)
  const lastTick = useRef(0)
  const firedRef = useRef(false)
  const onLitRef = useRef(onLit)
  onLitRef.current = onLit

  const stop = () => {
    holding.current = false
    if (raf.current) cancelAnimationFrame(raf.current)
    raf.current = undefined
  }

  const release = () => {
    if (!holding.current) return
    stop()
    if (!firedRef.current) setProgress(0)
  }

  const begin = (e: React.PointerEvent) => {
    if (disabled || lit || firedRef.current) return
    e.preventDefault()
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      /* a synthetic or already-released pointer — the hold still works without capture */
    }
    holding.current = true
    startAt.current = performance.now()
    lastTick.current = 0
    void Haptic.light()
    const step = (now: number) => {
      if (!holding.current) return
      const p = Math.min(1, (now - startAt.current) / CANDLE_HOLD_MS)
      setProgress(p)
      if (now - lastTick.current > 600) {
        lastTick.current = now
        void Haptic.light()
      }
      if (p >= 1) {
        stop()
        firedRef.current = true
        void Haptic.success()
        onLitRef.current()
        return
      }
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
  }

  // A fresh note re-arms the candle. The parent remounts this with a key per
  // note, so the ref reset here is belt and braces for the same instance.
  useEffect(() => {
    firedRef.current = lit
    if (!lit) setProgress(0)
    return stop
  }, [lit])

  const flame = lit ? 1 : progress
  const ready = lit || progress >= 1

  return (
    <div style={{ display: 'grid', justifyItems: 'center', gap: 6 }}>
      <motion.button
        type="button"
        aria-label={lit ? 'The candle is lit' : 'Press and hold to pray'}
        onPointerDown={begin}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={release}
        onContextMenu={(e) => e.preventDefault()}
        disabled={disabled}
        whileTap={disabled || lit ? undefined : { scale: 0.97 }}
        style={{
          width: 150,
          height: 150,
          borderRadius: '50%',
          position: 'relative',
          display: 'grid',
          placeItems: 'center',
          background: 'radial-gradient(circle at 50% 40%, rgba(255,210,63,0.12), rgba(255,255,255,0.04) 70%)',
          border: '1.5px solid var(--stroke)',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          cursor: disabled || lit ? 'default' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {/* Progress ring. */}
        <svg viewBox="0 0 150 150" style={{ position: 'absolute', inset: 0 }}>
          <circle cx="75" cy="75" r="70" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
          <circle
            cx="75"
            cy="75"
            r="70"
            fill="none"
            stroke="var(--gold)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 70}`}
            strokeDashoffset={`${2 * Math.PI * 70 * (1 - flame)}`}
            transform="rotate(-90 75 75)"
            style={{ transition: 'stroke-dashoffset 80ms linear' }}
          />
        </svg>

        {/* The candle itself. */}
        <svg viewBox="0 0 80 110" width="72" height="99" style={{ position: 'relative' }}>
          {/* glow */}
          <motion.ellipse
            cx="40"
            cy="34"
            rx={26}
            ry={30}
            fill="rgba(255,190,60,0.35)"
            initial={{ opacity: 0.15, scale: 0.6 }}
            animate={{ opacity: 0.15 + flame * 0.75, scale: 0.6 + flame * 0.5 }}
            transition={{ duration: 0.12 }}
            style={{ transformOrigin: '40px 34px' }}
          />
          {/* flame */}
          <motion.path
            d="M40 12 C 47 24, 52 32, 40 44 C 28 32, 33 24, 40 12 Z"
            fill="url(#candle-flame)"
            initial={{ opacity: 0.25, scaleY: 0.2, scaleX: 0.5 }}
            animate={
              ready && !reduceMotion
                ? { scaleY: [1, 1.08, 0.96, 1], scaleX: [1, 0.94, 1.04, 1], opacity: 1 }
                : { scaleY: 0.2 + flame * 0.8, scaleX: 0.5 + flame * 0.5, opacity: 0.25 + flame * 0.75 }
            }
            transition={ready && !reduceMotion ? { duration: 1.3, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.12 }}
            style={{ transformOrigin: '40px 44px' }}
          />
          <defs>
            <linearGradient id="candle-flame" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff2b0" />
              <stop offset="0.55" stopColor="var(--gold)" />
              <stop offset="1" stopColor="var(--tangerine)" />
            </linearGradient>
          </defs>
          {/* wick */}
          <rect x="38.5" y="40" width="3" height="8" rx="1.5" fill={ready ? '#3b2412' : '#7a6ba8'} />
          {/* wax */}
          <rect x="24" y="47" width="32" height="54" rx="6" fill="#f3e5c2" />
          <path d="M24 53 Q 30 60, 27 68 L24 68 Z" fill="#fff8e6" />
          <ellipse cx="40" cy="47" rx="16" ry="4" fill="#fbf1d6" />
          {/* holder */}
          <rect x="16" y="98" width="48" height="8" rx="4" fill="#b8912e" />
        </svg>
      </motion.button>
      <span className="faint" style={{ fontSize: 12, fontWeight: 700 }}>
        {lit ? 'Lit' : progress > 0 ? 'Keep holding…' : 'Press and hold'}
      </span>
    </div>
  )
}
