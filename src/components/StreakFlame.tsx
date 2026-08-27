import { motion } from 'framer-motion'
import { useSeason } from '@/store/season'
import { flameById } from '@/data/season'

// A living streak flame. Grows warmer/bigger with longer streaks so a long
// streak literally looks hotter — a visible thing you don't want to lose.
//
// The glyph and its glow colour come from the equipped seasonal flame skin
// (data/season); the HEAT still comes from the streak itself, so a skin changes
// what the flame looks like and never what it says about you.
export function StreakFlame({ days, size = 22 }: { days: number; size?: number }) {
  const equipped = useSeason((s) => s.equipped.flame)
  const flame = flameById(equipped)
  const hot = days >= 30 ? 1 : days >= 7 ? 0.7 : days >= 3 ? 0.45 : 0.25
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 800 }}>
      <motion.span
        aria-hidden
        animate={{ rotate: [-4, 4, -4], scale: [1, 1.08, 1] }}
        transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
        style={{
          fontSize: size,
          filter: `drop-shadow(0 0 ${6 + hot * 14}px rgba(${flame.rgb},${0.5 + hot * 0.4}))`,
        }}
      >
        {flame.glyph}
      </motion.span>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: size - 2 }}>{days}</span>
    </span>
  )
}
