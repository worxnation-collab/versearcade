import { AnimatePresence, motion } from 'framer-motion'

// The combo multiplier — arcade dopamine. Consecutive correct answers stack the
// multiplier; it flashes and grows, and resets (gently) on a miss.
export function ComboMeter({ combo, multiplier }: { combo: number; multiplier: number }) {
  return (
    <AnimatePresence>
      {combo >= 2 && (
        <motion.div
          key={combo}
          initial={{ scale: 0.4, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.6, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 16 }}
          style={{
            display: 'inline-flex',
            alignItems: 'baseline',
            gap: 6,
            padding: '6px 14px',
            borderRadius: 999,
            // Mint, a reward colour (2026-10-29). It was coral — the app's
            // "wrong" colour — on the thing that means you've got several right.
            background: 'linear-gradient(180deg, var(--mint), #2a9d86)',
            boxShadow: '0 0 18px rgba(94,231,200,0.45)',
            color: '#062a22',
            fontFamily: 'var(--font-display)',
          }}
        >
          <span style={{ fontSize: 20, fontWeight: 900 }}>×{multiplier.toFixed(2)}</span>
          <span style={{ fontSize: 12, fontWeight: 800, opacity: 0.9 }}>{combo} COMBO</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
