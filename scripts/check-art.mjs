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
  kind === 'skin' ? 'public/skins' : kind === 'item' ? 'public/items' : 'public/keep'

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : Object.keys(kinds)
      .map((id) => `${dirFor(kinds[id])}/${id}.png`)
      .filter(existsSync)

if (files.length === 0) {
  console.log('no generated art found — run scripts/gen-art.mjs first')
  process.exit(0)
}

let bad = 0
for (const f of files) {
  const id = f.split('/').pop().replace(/\.png$/, '')
  const isScene = kinds[id] === 'scene'
  const png = PNG.sync.read(readFileSync(f))
  const { width: w, height: h, data } = png
  const at = (x, y) => data[(y * w + x) * 4 + 3]
  let clear = 0
  for (let i = 3; i < data.length; i += 4) if (data[i] < 16) clear++
  const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)]
  const frac = clear / (w * h)
  const pct = (frac * 100).toFixed(1)

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
  if (tag !== 'OK') bad += 1
  const what = isScene ? 'scene' : 'cut-out'
  console.log(
    `${tag.padEnd(5)} ${f.padEnd(36)} ${what.padEnd(8)} ${String(pct).padStart(5)}% clear  corners=${corners.join(',')}`,
  )
}

if (bad > 0) {
  console.log(
    `\n${bad} file(s) to look at.\n` +
      '  BAD   — the key did not take (or a scene came back partly transparent). Regenerate;\n' +
      '          strengthening the background clause in the prompt usually does it.\n' +
      '  CHECK — one corner is opaque on an otherwise clean cut-out, which is often just\n' +
      '          the subject touching the edge. Look at it.',
  )
  process.exit(1)
}
console.log(`\nall ${files.length} file(s) look right`)
