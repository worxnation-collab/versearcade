// How big each of the keep's decorations renders, and where it hangs.
//
// This is a plain data module rather than a const inside KeepArt.tsx for one
// reason: scripts/check-decor-art.mjs transpiles THIS FILE and runs the real
// table against the real PNGs at build time. A copy of these numbers in a
// checker would be a second thing to keep in sync, which is the exact failure
// it exists to catch.
//
// `w`/`h` are viewBox units and MUST carry the render's real aspect ratio —
// the hall stretches a prop to whatever box it is given, so a width that
// disagrees with the file squashes the picture and nothing throws. The number
// is therefore derived, not chosen: w = h x (png width / png height). Change a
// render and the width changes with it; `npm run check:decor` says so, and
// prints the value to use.
//
// `mode`: hang = top edge at the anchor (the prop hangs DOWN from its
// hardware), center = centred on it (a wall piece straddles its point),
// stand = the object's base sits ON it.
//
// `src` is the hand-placed file for the props that predate the generator.
// Anything generated since resolves through GENERATED_ART on its id instead
// (see decorRaster in KeepArt.tsx), so a render wires itself in the way it
// does everywhere else, the old file stays as the fallback underneath it, and
// no id can point at a 404.

export type DecorMode = 'hang' | 'center' | 'stand'

export interface DecorArtDef {
  /** Hand-placed file for a prop the generator has not replaced yet. */
  src?: string
  /** Display box in viewBox units. w is derived from the render's aspect. */
  w: number
  h: number
  mode: DecorMode
}

export const RASTER_DECOR: Record<string, DecorArtDef> = {
  keep_sheaf_banner: { src: '/keep/sheaf_banner.png', w: 33.6, h: 52, mode: 'hang' },
  keep_tapestry: { src: '/keep/tapestry.png', w: 33.7, h: 46, mode: 'center' },
  keep_armor_rack: { src: '/keep/armor_rack.png', w: 41.3, h: 48, mode: 'center' },
  keep_chandelier: { src: '/keep/chandelier.png', w: 45.4, h: 46, mode: 'hang' },
  keep_lanterns: { src: '/keep/lanterns.png', w: 12.9, h: 42, mode: 'hang' },
  keep_oil_lamp: { src: '/keep/oil_lamp.png', w: 22.1, h: 13, mode: 'stand' },
  keep_rosary: { src: '/keep/rosary.png', w: 18, h: 13, mode: 'stand' },
  keep_open_bible: { src: '/keep/open_bible.png', w: 30, h: 20, mode: 'stand' },
  keep_chess: { src: '/keep/chess.png', w: 41.5, h: 18, mode: 'stand' },
  keep_brazier: { src: '/keep/brazier.png', w: 46.0, h: 34, mode: 'stand' },
  keep_barrels: { src: '/keep/barrels.png', w: 41.3, h: 38, mode: 'stand' },
  // Generated, and the only entry with no drawn file underneath it: the spears
  // went straight to a render, straddling their point across the ~50-unit span
  // every wall trophy here uses.
  keep_crossed_spears: { w: 47.7, h: 50, mode: 'center' },
  keep_woven_rug: { src: '/keep/rug.png', w: 41.7, h: 20, mode: 'stand' },
  // Awaiting its render, and deliberately listed before one exists. With no
  // file to resolve, decorRaster returns null and the drawn destrier is the
  // whole prop, so nothing here is read yet — which is also why this w/h is
  // only the drawn horse's own span. The moment the render lands, check:decor
  // fails with the real width to put here; adding this row later is the step
  // that gets forgotten. It carries the faction colour through PROP_OVERLAYS
  // rather than in the painting, so it is NOT one of the drawn holdouts.
  keep_destrier: { w: 70.8, h: 59, mode: 'stand' },
}
