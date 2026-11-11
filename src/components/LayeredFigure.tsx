import { useId } from 'react'
import { DRAW_ORDER, bodyId, layerBox, layerUrl, takesColor, LAYER_CANVAS } from '@/data/layered'
import { figureOf } from '@/data/avatar'
import type { AvatarSpec } from '@/types'

// The layered character, drawn INSIDE Character's 120x170 viewBox so every
// surface that already draws a Character — chips, the hero, the crowd scenes,
// the room postcard — gets it with no change of its own.
//
// Each layer is an <image> on the shared 360x728 canvas at its own box
// (data/avatarLayers.ts). A piece that takes a colour is drawn in grey and
// coloured by an SVG filter: its luminance times the chosen colour, clipped to
// its own alpha. A filter rather than a canvas so it costs no script, survives
// the postcard's serialise-to-<img> export, and renders at any size.
//
// LUMA_GAIN undoes the darkening of multiplying by a mid-grey: the garments
// were painted around 60% luminance, so 1/0.6 brings their mid-tones back to
// the chosen colour rather than a shade under it.
const LUMA_GAIN = 1.6

export function LayeredFigure({ spec, portrait }: { spec: AvatarSpec; portrait: boolean }) {
  const uid = useId().replace(/[:]/g, '')
  const figure = figureOf(spec)
  const outfit = spec.outfit ?? {}
  const body = bodyId(figure, spec.skin)
  const bb = layerBox(figure, body) ?? { x: 85, y: 50, w: 190, h: 670 }

  const layers = DRAW_ORDER.map((slot) => {
    if (slot === 'body') return { id: body, color: undefined as string | undefined }
    const piece = outfit[slot]
    return piece ? { id: piece.id, color: takesColor(piece.id) ? piece.color : undefined } : null
  }).filter((l): l is { id: string; color: string | undefined } => !!l && !!layerBox(figure, l.id))

  const colors = [...new Set(layers.map((l) => l.color).filter((c): c is string => !!c))]
  const filterId = (c: string) => `lt${uid}${c.replace('#', '')}`

  // Framing. Full length: the body's own box with room either side for wings,
  // a staff or a cape. Portrait: head and shoulders, for the avatar circle.
  const vb = portrait
    ? [bb.x + bb.w * 0.12, bb.y - 6, bb.w * 0.76, bb.w * 0.76 * 1.42]
    : [Math.max(0, bb.x - 70), Math.max(0, bb.y - 50), Math.min(LAYER_CANVAS.w, bb.w + 140), Math.min(LAYER_CANVAS.h, bb.h + 56)]

  return (
    <svg
      {...(portrait
        ? { x: 5, y: 7, width: 110, height: 156, preserveAspectRatio: 'xMidYMin slice' }
        : { x: 10, y: 20, width: 100, height: 140, preserveAspectRatio: 'xMidYMax meet' })}
      viewBox={vb.map((n) => Math.round(n)).join(' ')}
      overflow="hidden"
    >
      <defs>
        {colors.map((c) => (
          <filter key={c} id={filterId(c)} colorInterpolationFilters="sRGB">
            <feColorMatrix
              type="matrix"
              values=".299 .587 .114 0 0  .299 .587 .114 0 0  .299 .587 .114 0 0  0 0 0 1 0"
              result="luma"
            />
            <feFlood floodColor={c} result="tint" />
            <feComposite in="luma" in2="tint" operator="arithmetic" k1={LUMA_GAIN} result="lit" />
            <feComposite in="lit" in2="SourceGraphic" operator="in" />
          </filter>
        ))}
      </defs>
      {layers.map((l) => {
        const b = layerBox(figure, l.id)!
        return (
          <image
            key={l.id}
            href={layerUrl(figure, l.id)}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            filter={l.color ? `url(#${filterId(l.color)})` : undefined}
          />
        )
      })}
    </svg>
  )
}
