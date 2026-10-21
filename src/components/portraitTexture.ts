// The textured portrait treatment (2026-10-21): what sits BEHIND a character in
// a round frame, and the gold ring around it. Both used to be flat: a two-stop
// grape gradient and a 3px ring of solid --gold. They are drawn as CSS
// backgrounds rather than shipped as images, so the same texture serves every
// size from a 26px board row to the player card and nothing new has to load.
//
// The brush strokes are SVG fractal noise stretched along one axis, which reads
// as dragged paint rather than grain. Each one is a data URI, so a browser
// decodes it once and every avatar on a leaderboard shares the decode.
// Character art is untouched: this only changes what is behind it and around it.

// One layer of strokes in one colour. Alpha is read off the noise's red
// channel, offset so about half the tile is clear and the rest varies in
// strength up to roughly `alpha`.
function paint(seed: number, r: number, g: number, b: number, alpha: number, freq: string): string {
  const k = alpha * 4
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128'>` +
    `<filter id='b' x='0' y='0' width='100%' height='100%'>` +
    `<feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='3' seed='${seed}'/>` +
    `<feColorMatrix type='matrix' values='0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} ${k} 0 0 0 ${-k * 0.48}'/>` +
    `</filter><rect width='100%' height='100%' filter='url(%23b)'/></svg>`
  return `url("data:image/svg+xml;utf8,${svg}")`
}

/**
 * Behind the character: the same violet family as before, laid in as paint —
 * a lit upper left, a deeper lower right, and two layers of strokes (light and
 * dark, crossing at slightly different angles) so the tone varies across it.
 */
export const PORTRAIT_FILL = [
  paint(3, 1, 0.94, 1, 0.22, '0.018 0.06'),
  paint(11, 0.2, 0.06, 0.34, 0.3, '0.05 0.016'),
  'radial-gradient(120% 120% at 32% 26%, #b48cf7 0%, #8a5ae6 38%, #6a3fcc 68%, #4d2a9c 100%)',
].join(', ')

/**
 * The gold ring: a conic sweep of dark and bright golds so the light catches
 * it in two places, with brushed streaks over it. Drawn under the face and
 * showing only as the annulus outside it, so it occupies exactly the space the
 * old 3px box-shadow ring did.
 */
export const GOLD_RING = [
  paint(5, 1, 0.97, 0.82, 0.5, '0.09 0.02'),
  paint(9, 0.35, 0.2, 0.02, 0.35, '0.02 0.12'),
  'conic-gradient(from 215deg, #a8761f, #e8bd52 9%, #fff3c2 15%, #d6a63a 24%, #a06c1c 36%, #e3b448 50%, #fde69a 58%, #c08a2a 70%, #9a6a1c 82%, #f0cd66 92%, #a8761f)',
].join(', ')

/** Edge shading that gives the ring a rim on both sides rather than a flat band. */
export const GOLD_RING_EDGE = 'inset 0 0 0 0.6px rgba(70,42,6,0.7), inset 0 1px 1px rgba(255,244,200,0.55), 0 0 0 0.6px rgba(55,32,4,0.55)'
