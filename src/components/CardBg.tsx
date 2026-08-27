import { useState } from 'react'
import { cardArtProps, cardBgImage, cardBgStyle } from '@/data/playerCards'
import { CardArt } from '@/data/cardArt'

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

  if (failedSrc === src) return <CardArt scene={art.scene} palette={art.palette} id={id} />

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
    </>
  )
}
