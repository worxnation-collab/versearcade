// Cut an owner-supplied figure painting out of its magenta backdrop.
//
//   node scripts/key-owner-figure.mjs <in.png> <out.png> [--max-h 400] [--shadow]
//
// --shadow also keys the backdrop's DARK pink — a floor shadow painted into the
// backdrop under the feet — but only where it is connected to the keyed
// backdrop, so a red or purple garment inside the figure is never reached.
//
// gen-art.mjs keys EVERY magenta-ish pixel, which is right for its own renders
// (prompted onto flat #FF00FF) and wrong for paintings made elsewhere: their
// backdrop is a pink-magenta that drifts across the frame, and a purple stole
// is magenta-ish enough to be partly keyed out of the middle of the figure.
// So this keys only the backdrop's own bright pink, ramps the one-pixel rim,
// applies gen-art's 2px despill around the mask, crops to the
// figure and caps the height the way skin renders are capped. The figure's own
// pixels are never changed except the despilled outline.
import sharp from 'sharp'

const [inPath, outPath] = process.argv.slice(2)
const maxH = Number(process.argv[process.argv.indexOf('--max-h') + 1]) || 400
if (!inPath || !outPath) {
  console.error('usage: node scripts/key-owner-figure.mjs <in.png> <out.png> [--max-h 400]')
  process.exit(1)
}

const { data, info } = await sharp(inPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const w = info.width, h = info.height
const mag = (p) => Math.min(data[p * 4], data[p * 4 + 2]) - data[p * 4 + 1]

// Background is the BRIGHT pink-magenta of the backdrop, tested per pixel and
// keyed wherever it is — which also catches pockets the border can't reach
// (between an arm and the body). It is deliberately strict: a purple stole is
// magenta-ish (r~120, g~65, b~125) and a loose test ate half of one.
const isBg = (p) => {
  const r = data[p * 4], g = data[p * 4 + 1], b = data[p * 4 + 2]
  return r > 180 && g < 70 && b > 80 && r - g > 150
}
const bg = new Uint8Array(w * h)
for (let p = 0; p < w * h; p++) if (isBg(p)) { bg[p] = 1; data[p * 4 + 3] = 0 }

// The shadow pink: red-dominant with almost no green and blue well under red.
// A purple garment has b close to r, so it fails the r - b test.
if (process.argv.includes('--shadow')) {
  const isShadow = (p) => {
    const r = data[p * 4], g = data[p * 4 + 1], b = data[p * 4 + 2]
    return r > 80 && g < 55 && r - g > 70 && r - b > 40 && b - g > 10
  }
  const stack = []
  for (let p = 0; p < w * h; p++) if (bg[p]) stack.push(p)
  while (stack.length) {
    const p = stack.pop(), x = p % w, y = (p - x) / w
    for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
      if (q < 0 || bg[q] || !isShadow(q)) continue
      bg[q] = 1; data[q * 4 + 3] = 0; stack.push(q)
    }
  }
}

// Soft edge on the one-pixel RIM only: an anti-aliased pixel next to the
// backdrop is part pink, so its alpha ramps with how magenta it is. Inside the
// figure nothing is ramped, which is what keeps the stole whole.
const SOFT = 40, SOLID = 120
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const p = y * w + x
    if (bg[p]) continue
    const touches = (x > 0 && bg[p - 1]) || (x < w - 1 && bg[p + 1]) || (y > 0 && bg[p - w]) || (y < h - 1 && bg[p + w])
    if (!touches) continue
    const m = mag(p)
    if (m > SOFT) data[p * 4 + 3] = Math.max(0, Math.round(255 * (1 - (m - SOFT) / (SOLID - SOFT))))
  }
}

// Despill within 2px of the mask, so no pink halo survives on the outline.
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const p = y * w + x
    if (bg[p] && data[p * 4 + 3] === 0) continue
    let near = false
    for (let dy = -2; dy <= 2 && !near; dy++)
      for (let dx = -2; dx <= 2 && !near; dx++) {
        const nx = x + dx, ny = y + dy
        if (nx >= 0 && nx < w && ny >= 0 && ny < h && bg[ny * w + nx]) near = true
      }
    if (!near) continue
    const i = p * 4, spill = Math.min(data[i], data[i + 2]) - data[i + 1]
    if (spill > 0) { data[i] -= spill; data[i + 2] -= spill }
  }
}

await sharp(data, { raw: { width: w, height: h, channels: 4 } })
  .png()
  .toBuffer()
  .then((buf) => sharp(buf).trim({ threshold: 1 }).resize({ height: maxH, withoutEnlargement: true }).png({ compressionLevel: 9 }).toFile(outPath))
  .then((o) => console.log(`${outPath} ${o.width}x${o.height} ${(o.size / 1024).toFixed(0)}KB`))
