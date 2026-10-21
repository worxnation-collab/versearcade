import { borderRender, badgeByKey } from '@/data/cosmetics'
import { Character } from '@/components/Character'
import { usePlayerCard } from '@/components/PlayerCardModal'
import { GOLD_RING, GOLD_RING_EDGE, PORTRAIT_FILL } from '@/components/portraitTexture'
import type { AvatarSpec } from '@/types'

export function Avatar({
  emoji,
  size = 44,
  ring,
  border = 'default',
  badge,
  character,
  username,
}: {
  emoji: string
  size?: number
  ring?: boolean
  /** Equipped border cosmetic key (see data/cosmetics). */
  border?: string
  /** Equipped badge cosmetic key, or null/undefined for none. */
  badge?: string | null
  /** Composable character avatar; when set it replaces the emoji as the pfp. */
  character?: AvatarSpec | null
  /** Whose avatar this is. When given, tapping it opens their player card. */
  username?: string | null
}) {
  const { open } = usePlayerCard()
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
        overflow: 'hidden',
        // Painted, not flat (components/portraitTexture.ts). The tile is
        // stretched to the face so every size shows the same strokes.
        background: PORTRAIT_FILL,
        backgroundSize: 'cover',
        // A textured ring carries the shadow itself (it is under the face, and a
        // shadow cast by the face would darken the ring it sits on).
        boxShadow: render.type === 'shadow' ? render.boxShadow : render.type === 'textured' ? undefined : '0 6px 16px rgba(0,0,0,0.4)',
        flexShrink: 0,
        position: render.type === 'textured' ? 'relative' : undefined,
      }}
    >
      {character ? <Character spec={character} size={size} /> : emoji}
    </div>
  )

  // Gradient borders (aurora, halo) need a conic-gradient ring wrapping the face.
  const ringPad = Math.max(3, Math.round(size * 0.07))
  const content =
    render.type === 'textured' ? (
      // The textured gold ring sits UNDER the face and 3px outside it, so it
      // shows only as the annulus the old box-shadow ring drew: same footprint,
      // same layout box. `isolation` keeps the ring's stacking local.
      <div style={{ position: 'relative', isolation: 'isolate', borderRadius: '50%', flexShrink: 0, lineHeight: 0 }}>
        <span
          aria-hidden
          style={{
            position: 'absolute',
            inset: -3,
            borderRadius: '50%',
            background: GOLD_RING,
            backgroundSize: 'cover',
            boxShadow: `${GOLD_RING_EDGE}, ${render.boxShadow}`,
            zIndex: 0,
          }}
        />
        <div style={{ position: 'relative', zIndex: 1, borderRadius: '50%' }}>{face}</div>
      </div>
    ) : render.type === 'gradient' ? (
      <div
        className={render.animated ? 'va-halo' : undefined}
        style={{
          borderRadius: '50%',
          padding: ringPad,
          background: render.gradient,
          boxShadow: render.glow
            ? render.glow
            : render.animated
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

  if (!badgeDef) return tappable(content)

  // Overlay the badge emblem at the bottom-right of the avatar.
  const badgeSize = Math.max(16, Math.round(size * 0.42))
  return tappable(
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
    </div>,
  )

  // A pfp with a known owner becomes a button that pulls up their player card.
  // Without a username it stays inert, so decorative avatars aren't clickable.
  function tappable(node: React.ReactNode) {
    if (!username) return node
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); open(username) }}
        aria-label={`View @${username}'s player card`}
        style={{ background: 'none', border: 'none', padding: 0, lineHeight: 0, cursor: 'pointer', flexShrink: 0, borderRadius: '50%' }}
      >
        {node}
      </button>
    )
  }
}
