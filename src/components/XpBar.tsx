import { motion } from 'framer-motion'

// XP curve mirrored from the server's level_from_xp(): each level costs ~35%
// more than the last. Kept in sync so the client can render progress without a
// round-trip. If you change the curve, change it in 0003_functions.sql too.
export function levelInfo(xp: number) {
  let level = 1
  let threshold = 100
  let remaining = Math.max(0, xp)
  let spentForLevel = 0
  while (remaining >= threshold) {
    remaining -= threshold
    spentForLevel = threshold
    level += 1
    threshold = Math.round(threshold * 1.35)
  }
  return {
    level,
    intoLevel: remaining,
    levelSpan: threshold,
    pct: Math.min(1, remaining / threshold),
    _spentForLevel: spentForLevel,
  }
}

export function XpBar({ xp }: { xp: number }) {
  const { level, intoLevel, levelSpan, pct } = levelInfo(xp)
  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, fontWeight: 700 }}>
        <span className="dim">LVL {level}</span>
        <span className="faint">
          {intoLevel}/{levelSpan} XP
        </span>
      </div>
      <div
        style={{
          height: 14,
          borderRadius: 999,
          background: 'rgba(0,0,0,0.35)',
          overflow: 'hidden',
          border: '1px solid var(--stroke)',
        }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct * 100}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          style={{
            height: '100%',
            borderRadius: 999,
            background: 'linear-gradient(90deg, var(--gold), var(--tangerine))',
            boxShadow: '0 0 14px rgba(255,159,28,0.6)',
          }}
        />
      </div>
    </div>
  )
}
