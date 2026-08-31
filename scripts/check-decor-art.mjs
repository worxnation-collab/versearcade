#!/usr/bin/env node
// Do the keep's decorations render at the aspect ratio they were drawn at?
// Runs as part of `npm run build`.
//
// Why this exists: RASTER_DECOR (src/data/keepArt.ts) gives every picture-backed
// decoration a display box in viewBox units, and the hall stretches the file to
// fill it. So the width is not a taste — it is derived, w = h x (png width /
// png height) — and a width that disagrees with the file squashes the prop.
//
// That failure is the shape this project's worst bugs always take: nothing
// throws, the app builds, the picture is simply a little wrong forever. It is
// also the one that happens by ITSELF, because a generated render replaces a
// drawing whose proportions it was never asked to match: the crossed spears
// shipped 5% wide and the barrel stack 7% wide, and neither was noticed until
// the whole shelf was looked at side by side.
//
// So the width is checked rather than remembered. Replace a render, run the
// build, and this prints the number to put in the table.
//
// It resolves each file exactly the way decorRaster does — GENERATED_ART wins
// over the hand-placed src — and it runs the REAL table out of the real source
// (transpiled with the esbuild that ships with vite), so the numbers cannot be
// right only in a copy of them.

import { execFileSync } from 'node:child_process'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

// How far a declared box may sit from the render's true ratio before it reads
// as a stretch. Every box that was measured by hand against its own file lands
// within 3%; the two that were left behind when a render replaced a drawing
// were 4.9% and 6.6%. 3% is therefore the line between rounding and a mistake.
const TOLERANCE = 0.03

const fail = (msg) => {
  console.error(`✗ ${msg}`)
  process.exitCode = 1
}

/** Run a plain-TS module out of src/ and hand back its exports. */
function load(rel) {
  const dir = mkdtempSync(join(tmpdir(), 'decorart-'))
  try {
    execFileSync(resolve(root, 'node_modules/.bin/esbuild'), [
      resolve(root, rel),
      '--format=esm',
      `--outfile=${join(dir, 'mod.mjs')}`,
      '--log-level=silent',
    ])
    return import(pathToFileURL(join(dir, 'mod.mjs')).href)
  } finally {
    process.on('exit', () => rmSync(dir, { recursive: true, force: true }))
  }
}

const { RASTER_DECOR } = await load('src/data/keepArt.ts')
const { GENERATED_ART } = await load('src/data/generatedArt.ts')

/** Width and height out of a PNG's IHDR, or a JPEG's first SOF marker. */
function dimensions(file) {
  const d = readFileSync(file)
  if (d[0] === 0x89 && d[1] === 0x50) return [d.readUInt32BE(16), d.readUInt32BE(20)]
  // JPEG: walk the segments to the frame header. No decoder needed for a size.
  let i = 2
  while (i < d.length - 9) {
    if (d[i] !== 0xff) { i++; continue }
    const marker = d[i + 1]
    // SOF0..SOF15, skipping the four that are not frame headers.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc, 0xd8].includes(marker)) {
      return [d.readUInt16BE(i + 7), d.readUInt16BE(i + 5)]
    }
    i += 2 + d.readUInt16BE(i + 2)
  }
  throw new Error('could not read image dimensions')
}

const ids = Object.keys(RASTER_DECOR)
if (ids.length === 0) fail('RASTER_DECOR is empty — did src/data/keepArt.ts move?')

let checked = 0
let pending = 0
for (const id of ids) {
  const def = RASTER_DECOR[id]
  // decorRaster's tiering, restated: a generated render wins over the drawn
  // file underneath it, and an entry with neither is not a picture at all.
  const src = GENERATED_ART[id] ?? def.src
  if (!src) {
    // A row can legitimately land before its render does — decorRaster returns
    // null with nothing to resolve, so the drawn prop is still the whole prop
    // and the width here is not read by anything. Listing it early is what
    // stops the row being the forgotten half of a generated batch; this check
    // starts biting the moment the file exists.
    pending++
    continue
  }
  const file = resolve(root, 'public', src.replace(/^\//, ''))
  let w, h
  try {
    ;[w, h] = dimensions(file)
  } catch (e) {
    fail(`${id} points at ${src}, which could not be read (${e.message})`)
    continue
  }
  checked++
  const want = def.h * (w / h)
  const drift = Math.abs(def.w - want) / want
  if (drift > TOLERANCE) {
    fail(
      `${id} is stretched ${(drift * 100).toFixed(1)}% — ${src} is ${w}x${h}, ` +
        `so with h: ${def.h} the width must be w: ${want.toFixed(1)}, not ${def.w}`,
    )
  }
}

if (process.exitCode) {
  console.error(
    '\nDecor art check FAILED — src/data/keepArt.ts and the renders in public/keep disagree.\n' +
      'Set each width to the value printed above; the hall stretches a prop to whatever box it is given.',
  )
} else {
  console.log(
    `✓ decor art: ${checked} decorations render at the ratio they were drawn at` +
      (pending ? `, ${pending} still drawn and awaiting a render` : ''),
  )
}
