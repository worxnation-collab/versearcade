// Renders the SVG source art in assets/ to the PNGs Capacitor/App Store need.
// Run locally with a prebuilt sharp:  npm i --no-save sharp && node scripts/render-assets.mjs
// (CI regenerates the full icon set from icon.png via @capacitor/assets.)
//
// IT NO LONGER RENDERS THE APP ICON, and that removal is the point. The icon is a
// painting now (`assets/icon-source.jpg` -> `assets/icon.png`), not a drawing, so
// the line that used to rasterise `icon.svg` over the top of it would have
// silently restored the old mark for anyone who ran this — a one-command way to
// ship the wrong icon, with nothing failing and nothing to see in a diff. The old
// drawing is kept as `icon-legacy.svg` so it can't be mistaken for the source.
//
// @capacitor/assets resolves `icon` by extension in the order .png, .webp, .jpg,
// .jpeg, .svg (checked in its own source, not assumed), so the PNG is what the
// build uses either way — which is exactly why the trap was invisible.
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const A = (p) => join(root, 'assets', p)

async function render(svg, out, size) {
  // Flatten to remove the alpha channel — the App Store rejects icons that have
  // one, even when fully opaque. The SVGs already paint an opaque background, so
  // flattening only strips the (unused) alpha channel.
  await sharp(Buffer.from(readFileSync(A(svg))))
    .resize(size, size)
    .flatten({ background: '#0b0720' })
    .png()
    .toFile(A(out))
  const meta = await sharp(A(out)).metadata()
  console.log(`${out}: ${meta.width}x${meta.height} (${meta.channels}ch, alpha=${meta.hasAlpha})`)
}

await render('splash.svg', 'splash.png', 2732) // launch screen source
console.log('done')
