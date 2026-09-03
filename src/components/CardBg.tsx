import { useState } from 'react'
import { cardArtProps, cardBgFx, cardBgImage, cardBgStyle } from '@/data/playerCards'
import { CardArt } from '@/data/cardArt'
import { useSettings } from '@/store/settings'

/**
 * The artwork behind a player card.
 *
 * Painted images, one per background key, served from public/cards. Underneath
 * sits the flat palette gradient so there is never a hole while the image
 * decodes, and if the image is missing or fails the drawn SVG scene renders
 * instead — the art this replaced, kept as a floor rather than deleted.
 *
 * The failure is keyed on the src, not a boolean. One instance can be shown many
 * backgrounds in turn (the picker, a leaderboard row being recycled), and a
 * boolean latched on the first failure would fall back for every background
 * after it until the component remounted.
 */
export function CardBg({
  bgKey,
  id,
  eager = false,
}: {
  bgKey?: string | null
  /** Unique per rendered instance — SVG gradient ids collide otherwise. */
  id: string
  /** True for the one card above the fold; the rest decode lazily. */
  eager?: boolean
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const src = cardBgImage(bgKey)
  const art = cardArtProps(bgKey)
  const fx = cardBgFx(bgKey)

  if (failedSrc === src)
    return (
      <>
        <CardArt scene={art.scene} palette={art.palette} id={id} />
        {fx === 'veins' && <VeinGlow />}
      </>
    )

  return (
    <>
      <div aria-hidden style={{ position: 'absolute', inset: 0, ...cardBgStyle(bgKey) }} />
      <img
        src={src}
        alt=""
        aria-hidden
        decoding="async"
        loading={eager ? 'eager' : 'lazy'}
        onError={() => setFailedSrc(src)}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
      />
      {fx === 'veins' && <VeinGlow />}
    </>
  )
}

/**
 * The Cornerstone's gold veins, lit from inside the rock: a warm light that
 * breathes, and a narrow gleam that travels slowly along the seams. Both layers
 * are `screen`-blended so they brighten the gold and the pale stone around it
 * without ever painting over the texture, and both sit UNDER the host's scrim,
 * so the name and numbers stay as legible as on any other card.
 *
 * Under reduce-motion the breathing layer holds at its mid point and the gleam
 * is not drawn at all — the card is still lit, it just doesn't move. Same rule
 * as the road's bob and the keep's breathe.
 */
function VeinGlow() {
  const reduceMotion = useSettings((s) => s.reduceMotion)
  return (
    <>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          mixBlendMode: 'screen',
          background:
            'radial-gradient(ellipse 70% 80% at 50% 55%, rgba(255,214,107,0.55) 0%, rgba(255,190,70,0.18) 45%, rgba(255,190,70,0) 75%)',
          opacity: reduceMotion ? 0.7 : undefined,
          animation: reduceMotion ? undefined : 'va-vein-breathe 3.8s ease-in-out infinite alternate',
        }}
      />
      {!reduceMotion && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            mixBlendMode: 'screen',
            background:
              'linear-gradient(115deg, rgba(255,240,190,0) 40%, rgba(255,240,190,0.7) 50%, rgba(255,240,190,0) 60%)',
            backgroundSize: '260% 100%',
            animation: 'va-vein-sweep 6.5s ease-in-out infinite',
          }}
        />
      )}
    </>
  )
}
