#!/usr/bin/env node
// Fit real phone screenshots to the App Store's 6.7-inch slot (1290 x 2796).
//
//   npm i --no-save sharp
//   node scripts/fit-screenshots.mjs <in-dir-or-files...>   # -> docs/app-store/6.7
//
// (Same deal as render-assets.mjs: sharp is a heavy native dep that only two
// scripts want, so it's installed on demand rather than carried in devDeps.)
//
// WHY THIS EXISTS: App Store Connect rejects a 6.7" screenshot that isn't
// exactly 1290 x 2796. A screenshot taken off a real phone almost never is —
// it's whatever that device's panel is, and anything cropped on the way (a
// share sheet, a trimmed status bar) is shorter still. Apple won't letterbox
// it for you and it won't scale it: the upload just fails.
//
// So each shot is scaled to 1290 wide and the remaining height is made up as
// padding. Two choices in here are deliberate:
//
// PADDING GOES ON TOP. Every screen in this app anchors its content to the top
// and floats the nav bar over the bottom, so the bottom edge of a screenshot is
// almost always mid-card — the Study shelf runs a book cover straight off it.
// Extending downward smears that art into a stripe. The top edge, by contrast,
// is the page background above the title, and measured flat (per-row colour
// variance <= 3 on all five of the first batch), so there is nothing there to
// smear.
//
// THE PAD IS THE IMAGE'S OWN TOP ROW, STRETCHED — not a flat fill. The app's
// background is a gradient, so a fill sampled even one row off bands visibly
// against the real pixels at the seam. Stretching row 0 to fill the pad keeps
// whatever horizontal variation that row has and meets the image at exactly
// its own colour, so the join is invisible.
//
// The script refuses rather than guesses if a source is too tall to fit, since
// the fix there is a judgement call about what to crop.
import sharp from 'sharp'
import { readdirSync, mkdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, extname, basename } from 'node:path'

const W = 1290, H = 2796
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(root, 'docs/app-store/6.7')

const args = process.argv.slice(2)
if (!args.length) {
  console.error('usage: node scripts/fit-screenshots.mjs <dir | file...>')
  process.exit(1)
}

// One directory expands to the image files in it, sorted, so a numbered batch
// keeps the order the listing doc asks for.
const inputs = args.length === 1 && statSync(args[0]).isDirectory()
  ? readdirSync(args[0]).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort().map((f) => join(args[0], f))
  : args

mkdirSync(OUT, { recursive: true })

let failed = 0
for (const src of inputs) {
  const name = basename(src, extname(src))
  const { width, height } = await sharp(src).metadata()

  const bodyH = Math.round(height * (W / width))
  const pad = H - bodyH
  if (pad < 0) {
    console.error(`${name}: SKIPPED — ${width}x${height} scales to ${W}x${bodyH}, ${-pad}px taller than ${H}. Crop it first.`)
    failed++
    continue
  }

  const body = await sharp(src).resize({ width: W, kernel: 'lanczos3' }).toBuffer()
  const topRow = await sharp(src).extract({ left: 0, top: 0, width, height: 1 }).toBuffer()
  const cap = await sharp(topRow).resize({ width: W, height: pad, fit: 'fill' }).toBuffer()

  const out = join(OUT, `${name}.png`)
  await sharp({ create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite([{ input: cap, top: 0, left: 0 }, { input: body, top: pad, left: 0 }])
    .png({ compressionLevel: 9 })
    .toFile(out)

  const pct = Math.round((pad / H) * 100)
  console.log(`${name}.png  ${width}x${height} -> ${W}x${bodyH} + ${pad}px top pad (${pct}%)${pct >= 25 ? '  <- a lot of empty sky; consider a caption there' : ''}`)
}

if (failed) process.exit(1)
console.log(`\n${inputs.length - failed} shot(s) -> ${OUT}`)
