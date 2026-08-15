// The Leper King's crown — the icon for whoever holds the #1 rank. A crown that
// slowly turns inside a rotating golden halo, wrapped in a pulsing glow. Used on
// the leaderboard's top row, in the Collection, and anywhere the throne is shown.
// Animation lives in index.css (.va-throne-*), which also tames it under
// prefers-reduced-motion.
export function ThroneIcon({ size = 44 }: { size?: number }) {
  const halo = Math.round(size * 1.28)
  return (
    <div
      style={{
        position: 'relative',
        width: halo,
        height: halo,
        display: 'grid',
        placeItems: 'center',
        flexShrink: 0,
      }}
    >
      {/* Rotating conic halo, masked into a thin ring. */}
      <div
        className="va-throne-halo"
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background:
            'conic-gradient(from 0deg, rgba(255,210,63,0), #ffd23f, #fff6cf, #ffffff, #ffd23f, rgba(255,210,63,0))',
          WebkitMaskImage:
            'radial-gradient(closest-side, transparent 56%, #000 60%, #000 94%, transparent)',
          maskImage:
            'radial-gradient(closest-side, transparent 56%, #000 60%, #000 94%, transparent)',
        }}
      />
      {/* Soft glow disc behind the crown. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,210,63,0.22), transparent 55%)',
        }}
      />
      {/* The turning, glowing crown. */}
      <div
        className="va-throne-crown"
        style={{ position: 'relative', fontSize: size, lineHeight: 1 }}
      >
        👑
      </div>
    </div>
  )
}
