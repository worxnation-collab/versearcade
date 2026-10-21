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
      {/* Both labels sit over the player card's background art, which since the
          painted backgrounds landed can be bright right here — the XP figure is
          in the card's upper right, exactly where a scene puts its light source.
          A shadow costs nothing and keeps them legible on every card. */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 6,
          fontSize: 12,
          fontWeight: 700,
          textShadow: '0 1px 4px rgba(9, 6, 8,0.9), 0 0 10px rgba(9, 6, 8,0.7)',
        }}
      >
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

// The level as a ROW rather than a header: "LVL 9" large on the left, the bar
// taking the rest, and the XP into this level printed INSIDE the bar so the
// figure and the thing it measures are read as one. Used where the card has
// no identity block for the bar to sit under (your own profile, the pop-up).
export function LevelRow({ xp, gold }: { xp: number; gold?: boolean }) {
  const { level, intoLevel, levelSpan, pct } = levelInfo(xp)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <span
        className={gold ? 'gold-text' : undefined}
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          fontWeight: 800,
          lineHeight: 1,
          whiteSpace: 'nowrap',
          color: gold ? undefined : 'var(--gold)',
          textShadow: '0 1px 6px rgba(9, 6, 8,0.8)',
        }}
      >
        LVL {level}
      </span>
      <div
        role="progressbar"
        aria-label={`Level ${level}`}
        aria-valuemin={0}
        aria-valuemax={levelSpan}
        aria-valuenow={intoLevel}
        style={{
          position: 'relative',
          flex: 1,
          minWidth: 0,
          height: 22,
          borderRadius: 999,
          background: 'rgba(0,0,0,0.4)',
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
          }}
        />
        <span
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            fontSize: 11.5,
            fontWeight: 800,
            color: '#fff',
            textShadow: '0 1px 3px rgba(9, 6, 8,0.95), 0 0 6px rgba(9, 6, 8,0.7)',
            whiteSpace: 'nowrap',
          }}
        >
          {intoLevel.toLocaleString()} / {levelSpan.toLocaleString()} XP
        </span>
      </div>
    </div>
  )
}
