#!/usr/bin/env node
// Did the magenta key actually take?
//
// The generator asks for a flat magenta backdrop and keys it to transparency
// (docs/RASTER-SKINS.md). When a model ignores that instruction the file still
// looks fine on disk and still wires itself into the app — it just renders as
// an opaque rectangle behind the object, which is easy to miss in a screenshot
// and impossible to miss once it ships. Two of the keep's props shipped that
// way and drew grey boxes on the long table until this script found them.
//
//   node scripts/check-art.mjs              # everything in art/*.json
//   node scripts/check-art.mjs a.png b.png  # specific files
//
// The manifests are the source of truth for what a file is meant to be: a
// `scene` is a full-bleed background and SHOULD be opaque, everything else is a
// cut-out and should have transparent corners. A corner can legitimately be
// subject (a sunflower leaf reaching the edge), so a well-cut file with one
// opaque corner is reported as CHECK rather than failed.
//
// SKINS GET A SECOND CHECK: are they actually a full-length figure?
//
// A skin PNG has to serve two very different frames. In an avatar chip
// Character crops to a portrait (preserveAspectRatio 'xMidYMin slice'), but the
// little worlds — the Harvest Road, the churchyard crowd, ProfileHero — render
// the SAME file with `fullBody`, feet and all. A generator that returns a
// head-and-shoulders bust looks perfectly fine in every avatar circle in the
// app and turns into a floating torso the moment it stands somewhere. That is
// exactly the kind of thing that ships.
//
// The signal is the ink's aspect ratio. Measured across all fifteen skins that
// shipped, the narrowest full figure is 1.08 (Michael, whose wings are as wide
// as he is tall) and most sit between 1.5 and 2.7; a tight bust is roughly
// square or wider. So under 1.05 is reported — as CHECK, not BAD, because a
// wide winged subject can legitimately approach it. It is a nudge to look, not
// a verdict: nothing here can tell a well-drawn bust from a well-drawn figure,
// so open the file.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { PNG } from 'pngjs'

/** id -> kind, from every manifest in art/. */
function manifestKinds() {
  const kinds = {}
  if (!existsSync('art')) return kinds
  for (const f of readdirSync('art').filter((n) => n.endsWith('.json'))) {
    for (const e of JSON.parse(readFileSync(`art/${f}`, 'utf8'))) kinds[e.id] = e.kind ?? 'item'
  }
  return kinds
}

const kinds = manifestKinds()

/** Where gen-art.mjs puts each kind. */
const dirFor = (kind) =>
  kind === 'skin'
    ? 'public/skins'
    : kind === 'road'
      ? 'public/road'
      : kind === 'room'
        ? 'public/room'
      : kind === 'item'
        ? 'public/items'
        : 'public/keep'

// Road and room paintings are written as JPEG (opaque full-bleed; see
// gen-art.mjs), and this script reads PNG only — so they are simply not among
// the files it can check. That is correct rather than a gap: the whole check is
// about whether a chroma key took, and neither one goes through one. They are
// excluded by name rather than left to fall through dirFor, so that a kind
// added later fails loudly here instead of silently checking nothing.
const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : Object.keys(kinds)
      .filter((id) => kinds[id] !== 'road' && kinds[id] !== 'room')
      .map((id) => `${dirFor(kinds[id])}/${id}.png`)
      .filter(existsSync)

if (files.length === 0) {
  console.log('no generated art found — run scripts/gen-art.mjs first')
  process.exit(0)
}

let bad = 0
for (const f of files) {
  const id = f.split('/').pop().replace(/\.png$/, '')
  // A road's painting is a full-bleed background like any other scene.
  const isScene = kinds[id] === 'scene' || kinds[id] === 'road' || kinds[id] === 'room'
  const png = PNG.sync.read(readFileSync(f))
  const { width: w, height: h, data } = png
  const at = (x, y) => data[(y * w + x) * 4 + 3]
  let clear = 0
  for (let i = 3; i < data.length; i += 4) if (data[i] < 16) clear++
  const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)]
  const frac = clear / (w * h)
  const pct = (frac * 100).toFixed(1)

  // Bounding box of everything that isn't transparent, for the full-body check.
  let top = h, bot = -1, left = w, right = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (at(x, y) > 32) {
        if (y < top) top = y
        if (y > bot) bot = y
        if (x < left) left = x
        if (x > right) right = x
      }
    }
  }
  const inkW = right - left + 1
  const inkH = bot - top + 1
  const ratio = inkW > 0 && inkH > 0 ? inkH / inkW : 0
  const isSkin = kinds[id] === 'skin'
  const looksCropped = isSkin && ratio > 0 && ratio < 1.05

  let tag
  if (isScene) {
    // A background is supposed to fill its frame. Transparency here means the
    // key ran on something it shouldn't have.
    tag = frac < 0.01 ? 'OK' : 'BAD'
  } else if (corners.every((c) => c < 16) && frac > 0.05) {
    tag = 'OK'
  } else {
    tag = frac > 0.2 ? 'CHECK' : 'BAD'
  }
  if (tag === 'OK' && looksCropped) tag = 'CHECK'
  if (tag !== 'OK') bad += 1
  const what = isScene ? 'scene' : isSkin ? 'skin' : 'cut-out'
  const shape = isSkin ? `  ratio=${ratio.toFixed(2)}${looksCropped ? ' (BUST?)' : ''}` : ''
  console.log(
    `${tag.padEnd(5)} ${f.padEnd(36)} ${what.padEnd(8)} ${String(pct).padStart(5)}% clear  corners=${corners.join(',')}${shape}`,
  )
}

if (bad > 0) {
  console.log(
    `\n${bad} file(s) to look at.\n` +
      '  BAD   — the key did not take (or a scene came back partly transparent). Regenerate;\n' +
      '          strengthening the background clause in the prompt usually does it.\n' +
      '  CHECK — one corner is opaque on an otherwise clean cut-out (often just the subject\n' +
      '          touching the edge), or a skin came back squarer than any full figure in the\n' +
      '          app (BUST?). A bust renders fine in every avatar circle and becomes a\n' +
      '          floating torso in the scenes that draw it fullBody. Look at it.',
  )
  process.exit(1)
}
console.log(`\nall ${files.length} file(s) look right`)
