import { borderRender, badgeByKey } from '@/data/cosmetics'

export function Avatar({
  emoji,
  size = 44,
  ring,
  border = 'default',
  badge,
}: {
  emoji: string
  size?: number
  ring?: boolean
  /** Equipped border cosmetic key (see data/cosmetics). */
  border?: string
  /** Equipped badge cosmetic key, or null/undefined for none. */
  badge?: string | null
}) {
  // `ring={false}` keeps the plain (unringed) look used in a few spots; any
  // explicit border still wins so cosmetics always show.
  const useDefaultRing = ring !== false
  const render = border && border !== 'default' ? borderRender(border) : borderRender(useDefaultRing ? 'default' : 'none')
  const badgeDef = badgeByKey(badge)

  const face = (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        fontSize: size * 0.5,
        background: 'linear-gradient(180deg, var(--grape), var(--grape-deep))',
        boxShadow: render.type === 'shadow' ? render.boxShadow : '0 6px 16px rgba(0,0,0,0.4)',
        flexShrink: 0,
      }}
    >
      {emoji}
    </div>
  )

  // Gradient borders (aurora, halo) need a conic-gradient ring wrapping the face.
  const ringPad = Math.max(3, Math.round(size * 0.07))
  const content =
    render.type === 'gradient' ? (
      <div
        className={render.animated ? 'va-halo' : undefined}
        style={{
          borderRadius: '50%',
          padding: ringPad,
          background: render.gradient,
          boxShadow: render.animated
            ? '0 0 18px 3px rgba(255,210,63,0.55), 0 6px 16px rgba(0,0,0,0.4)'
            : '0 0 14px 2px rgba(160,107,255,0.45), 0 6px 16px rgba(0,0,0,0.4)',
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {face}
      </div>
    ) : (
      face
    )

  if (!badgeDef) return content

  // Overlay the badge emblem at the bottom-right of the avatar.
  const badgeSize = Math.max(16, Math.round(size * 0.42))
  return (
    <div style={{ position: 'relative', flexShrink: 0, display: 'inline-grid', placeItems: 'center' }}>
      {content}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          right: -badgeSize * 0.15,
          bottom: -badgeSize * 0.15,
          width: badgeSize,
          height: badgeSize,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          fontSize: badgeSize * 0.62,
          background: 'var(--card-solid)',
          boxShadow: '0 0 0 2px var(--bg-1), 0 2px 6px rgba(0,0,0,0.5)',
        }}
      >
        {badgeDef.emoji}
      </span>
    </div>
  )
}
