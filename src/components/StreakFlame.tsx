import { motion } from 'framer-motion'

// A living streak flame. Grows warmer/bigger with longer streaks so a long
// streak literally looks hotter — a visible thing you don't want to lose.
export function StreakFlame({ days, size = 22 }: { days: number; size?: number }) {
  const hot = days >= 30 ? 1 : days >= 7 ? 0.7 : days >= 3 ? 0.45 : 0.25
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 800 }}>
      <motion.span
        aria-hidden
        animate={{ rotate: [-4, 4, -4], scale: [1, 1.08, 1] }}
        transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
        style={{
          fontSize: size,
          filter: `drop-shadow(0 0 ${6 + hot * 14}px rgba(255,${Math.round(120 - hot * 60)},40,${0.5 + hot * 0.4}))`,
        }}
      >
        🔥
      </motion.span>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: size - 2 }}>{days}</span>
    </span>
  )
}
