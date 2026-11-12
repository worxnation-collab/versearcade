import { useId } from 'react'
import { DRAW_ORDER, bodyId, buildOf, layerBox, layerUrl, takesColor } from '@/data/layered'
import { figureOf, skinHex } from '@/data/avatar'
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
  const build = buildOf(spec)
  const outfit = spec.outfit ?? {}
  const body = bodyId(figure, spec.skin)
  const bb = layerBox(figure, body, build) ?? { x: 85, y: 50, w: 190, h: 670 }

  // A piece cut with the light base's own hand, forearm or foot in it carries
  // that skin as a separate `<id>__skin` layer (scripts/avatar/skin-split.py),
  // drawn straight after it in the PLAYER's tone through the same filter a
  // garment colour uses — so a fist on a staff matches the arm it belongs to.
  const tone = skinHex(spec.skin)
  const layers = DRAW_ORDER.flatMap((slot) => {
    if (slot === 'body') return [{ id: body, color: undefined as string | undefined }]
    const piece = outfit[slot]
    if (!piece) return []
    return [
      { id: piece.id, color: takesColor(piece.id) ? piece.color : undefined },
      { id: `${piece.id}__skin`, color: tone },
    ]
  }).filter((l) => !!layerBox(figure, l.id, build))

  const colors = [...new Set(layers.map((l) => l.color).filter((c): c is string => !!c))]
  const filterId = (c: string) => `lt${uid}${c.replace('#', '')}`

  // Framing. Full length: a fixed window centred on the body, the same width
  // for every build so a sturdy character reads broader rather than being
  // zoomed out to the same size (a stretched layer may spill past the canvas,
  // which is why nothing here clamps to it). Portrait: head and shoulders,
  // also build-independent — the head is the one part a build never moves.
  const cx = bb.x + bb.w / 2
  const vb = portrait
    ? [cx - 74.5, bb.y - 6, 149, 149 * 1.42]
    : [cx - 168, Math.max(0, bb.y - 50), 336, bb.h + 56]

  return (
    <svg
      {...(portrait
        ? { x: 5, y: 7, width: 110, height: 156, preserveAspectRatio: 'xMidYMin slice' }
        : { x: 10, y: 20, width: 100, height: 140, preserveAspectRatio: 'xMidYMax meet' })}
      viewBox={vb.map((n) => Math.round(n)).join(' ')}
      // Full length draws past its frame: a balloon, a banner or a tall crown
      // rises above the head's 50px of headroom, and clipping it cut the
      // balloon in half (2026-11-12). The outer 120x170 box has 20 units above
      // this one to spill into, so the figure keeps its size. A portrait chip
      // is a crop by design and stays clipped.
      overflow={portrait ? 'hidden' : 'visible'}
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
        const b = layerBox(figure, l.id, build)!
        return (
          <image
            key={l.id}
            href={layerUrl(figure, l.id, build)}
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
