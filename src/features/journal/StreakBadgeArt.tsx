import { GENERATED_ART } from '@/data/generatedArt'
import type { StreakBadge } from '@/data/streakBadges'

// One streak badge, painted where a render exists and drawn where it doesn't.
//
// The house rule, applied straight: "Generated art layers OVER a drawn
// fallback, never instead of it." A build whose renders have not landed — or a
// phone that 404s one — shows a medallion in the badge's own ribbon colour
// rather than a hole, and the render replaces it the moment it exists with no
// call site knowing which it got.
//
// `earned={false}` draws the SAME art desaturated and dimmed rather than a
// padlock over it, which is the skins grid's own scar: the one surface meant to
// make somebody want a look was the one where they could not see it.
export function StreakBadgeArt({
  badge,
  size = 64,
  earned = true,
}: {
  badge: StreakBadge
  size?: number
  earned?: boolean
}) {
  const src = GENERATED_ART[badge.id]
  const dim = earned ? undefined : { filter: 'grayscale(0.85)', opacity: 0.45 }
  if (src) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden
        width={size}
        height={size}
        loading="lazy"
        draggable={false}
        style={{ width: size, height: size, objectFit: 'contain', display: 'block', ...dim }}
      />
    )
  }
  // The fallback: a ribboned medallion in the badge's own colour. Flat fills
  // and no <defs>, the church kit's rule — it has to survive being serialised
  // into an <img> by lib/postcard.ts, where nothing external loads.
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden style={{ display: 'block', ...dim }}>
      <path d="M17 30h6v13l-3-3-3 3V30Zm8 0h6v13l-3-3-3 3V30Z" fill={badge.hex} opacity={0.85} />
      <circle cx="24" cy="19" r="15" fill={badge.hex} />
      <circle cx="24" cy="19" r="11.5" fill="rgba(0,0,0,0.22)" />
      <circle cx="24" cy="19" r="9" fill={badge.hex} opacity={0.95} />
    </svg>
  )
}
