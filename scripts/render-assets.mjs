// Renders the SVG source art in assets/ to the PNGs Capacitor/App Store need.
// Run locally with a prebuilt sharp:  npm i --no-save sharp && node scripts/render-assets.mjs
// (CI regenerates the full icon set from icon.png via @capacitor/assets.)
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

await render('icon.svg', 'icon.png', 1024)   // App Store marketing icon + source for the set
await render('splash.svg', 'splash.png', 2732) // launch screen source
console.log('done')
