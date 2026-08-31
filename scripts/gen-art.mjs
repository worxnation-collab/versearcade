#!/usr/bin/env node
// Generate raster skin/item art through Nano Banana (Gemini image models) and
// run it through the keying pipeline in docs/RASTER-SKINS.md:
//
//   1. generate on flat magenta #FF00FF, single figure, no shadow/text/frame
//   2. key magenta -> transparency with a soft edge, then DESPILL every pixel
//      within 2px of transparency (or the magenta-tinted outline survives as a
//      pink halo — invisible on the dark avatar circle, obvious elsewhere)
//   3. isolate by empty-column split, keep the region carrying the most ink
//      (drops the silhouette and any corner watermark)
//   4. pad 8% empty below the feet (the figure sits above the ground shadow
//      Character draws at y=162 of its 170-unit viewBox)
//   5. cap at 400px tall for skins / 220px for items (the avatar never renders
//      above 92 CSS px; bigger is bytes every player downloads and nobody sees)
//
// Usage:
//   GEMINI_API_KEY=... node scripts/gen-art.mjs <manifest.json> [--only id]
//
// The manifest is an array of { id, kind, prompt, refs? }. Skins land in
// public/skins/<id>.png, items in public/items/<id>.png, scenes and props in
// public/keep/<id>.png. Style references (public/skins/moses.png +
// esther.png) ride along on every skin call so a new road matches the ten
// skins it will sit next to; `refs` adds per-entry reference images, which is
// how the keep's halls are held to one composition (see art/keep-halls.json).
//
// Successful renders are written into src/data/generatedArt.ts so the app
// picks them up with no second step.
//
// The API key comes ONLY from the environment (.env.local is gitignored).
// Never write it into this file or any other tracked file.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { PNG } from 'pngjs'
import jpeg from 'jpeg-js'

const KEY = process.env.GEMINI_API_KEY
if (!KEY) {
  console.error('GEMINI_API_KEY is not set. Put it in .env.local and export it.')
  process.exit(1)
}

const MODEL = process.env.GEN_ART_MODEL || 'gemini-3-pro-image'
const manifestPath = process.argv[2]
if (!manifestPath) {
  console.error('usage: node scripts/gen-art.mjs <manifest.json> [--only id]')
  process.exit(1)
}
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

const b64 = (p) => readFileSync(p).toString('base64')
const STYLE_REFS = ['public/skins/moses.png', 'public/skins/esther.png']
  .filter(existsSync)
  .map((p) => ({ inline_data: { mime_type: 'image/png', data: b64(p) } }))

async function generate(prompt, withRefs, refPaths = []) {
  // Per-entry reference images, on top of the skin style refs. A scene needs
  // these for a reason the skins don't: the hall's anchor coordinates
  // (src/data/keep.ts) are measured against ONE painting, so every other hall
  // has to put its hearth, table and arch in the same places or a rug hangs in
  // mid-air. Describing that in words does not do it; showing it does.
  const extra = refPaths
    .filter(existsSync)
    .map((f) => ({ inline_data: { mime_type: f.endsWith('.jpg') ? 'image/jpeg' : 'image/png', data: b64(f) } }))
  const parts = [{ text: prompt }, ...extra, ...(withRefs ? STYLE_REFS : [])]
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ['IMAGE'] },
      }),
    },
  )
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  const data = await res.json()
  const img = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData || p.inline_data)
  const raw = img?.inlineData?.data ?? img?.inline_data?.data
  if (!raw) throw new Error('no image in response: ' + JSON.stringify(data).slice(0, 400))
  return Buffer.from(raw, 'base64')
}

// ── pipeline ─────────────────────────────────────────────────────────────────

/** Step 2: magenta -> alpha with a soft edge, then despill near the edge. */
function keyMagenta(png) {
  const { width: w, height: h, data } = png
  // Pass 1: alpha from magenta-ness. Magenta = high R, high B, low G.
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    const mag = Math.min(r, b) - g // how magenta this pixel is
    if (mag > 96) data[i + 3] = 0 // solidly key color
    else if (mag > 48) data[i + 3] = Math.round(255 * (1 - (mag - 48) / 48)) // soft edge
  }
  // Pass 2: despill every pixel within 2px of transparency. Without this the
  // artwork's own magenta-tinted outline survives as a pink halo.
  const near = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 250) continue
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) near[ny * w + nx] = 1
        }
      }
    }
  }
  for (let p = 0; p < near.length; p++) {
    if (!near[p]) continue
    const i = p * 4
    const g = data[i + 1]
    const spill = Math.min(data[i], data[i + 2]) - g
    if (spill > 0) {
      data[i] = Math.max(0, data[i] - spill)
      data[i + 2] = Math.max(0, data[i + 2] - spill)
    }
  }
  return png
}

/** Step 3: split into regions by fully-transparent columns; keep the most ink. */
function isolate(png) {
  const { width: w, height: h, data } = png
  const colInk = new Array(w).fill(0)
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++) if (data[(y * w + x) * 4 + 3] > 24) colInk[x]++
  const regions = []
  let start = null
  for (let x = 0; x <= w; x++) {
    const has = x < w && colInk[x] > 0
    if (has && start === null) start = x
    if (!has && start !== null) {
      let ink = 0
      for (let c = start; c < x; c++) ink += colInk[c]
      regions.push({ start, end: x - 1, ink })
      start = null
    }
  }
  if (regions.length === 0) throw new Error('image is empty after keying')
  const best = regions.reduce((a, b) => (b.ink > a.ink ? b : a))
  // Rows within the winning region.
  let top = h, bottom = 0
  for (let y = 0; y < h; y++)
    for (let x = best.start; x <= best.end; x++)
      if (data[(y * w + x) * 4 + 3] > 24) { top = Math.min(top, y); bottom = Math.max(bottom, y); break }
  const cw = best.end - best.start + 1
  const ch = bottom - top + 1
  const out = new PNG({ width: cw, height: ch })
  PNG.bitblt(png, out, best.start, top, cw, ch, 0, 0)
  return out
}

/** Step 4+5: pad below the feet, then box-downsample to the height cap. */
function padAndCap(png, { padBelowPct, maxH }) {
  const padded = new PNG({ width: png.width, height: Math.round(png.height * (1 + padBelowPct)) })
  PNG.bitblt(png, padded, 0, 0, png.width, png.height, 0, 0)
  if (padded.height <= maxH) return padded
  const scale = maxH / padded.height
  const ow = Math.max(1, Math.round(padded.width * scale))
  const out = new PNG({ width: ow, height: maxH })
  const inv = 1 / scale
  for (let oy = 0; oy < maxH; oy++) {
    for (let ox = 0; ox < ow; ox++) {
      // Average the source box, alpha-weighted so edges stay clean.
      let r = 0, g = 0, b = 0, a = 0, n = 0
      const sy0 = Math.floor(oy * inv), sy1 = Math.min(padded.height, Math.ceil((oy + 1) * inv))
      const sx0 = Math.floor(ox * inv), sx1 = Math.min(padded.width, Math.ceil((ox + 1) * inv))
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * padded.width + sx) * 4
          const pa = padded.data[i + 3] / 255
          r += padded.data[i] * pa; g += padded.data[i + 1] * pa; b += padded.data[i + 2] * pa
          a += padded.data[i + 3]; n++
        }
      }
      const o = (oy * ow + ox) * 4
      const am = a / n / 255
      out.data[o] = am > 0 ? Math.round(r / n / am) : 0
      out.data[o + 1] = am > 0 ? Math.round(g / n / am) : 0
      out.data[o + 2] = am > 0 ? Math.round(b / n / am) : 0
      out.data[o + 3] = Math.round(a / n)
    }
  }
  return out
}

// ── run ──────────────────────────────────────────────────────────────────────

// ── the generated-art map ────────────────────────────────────────────────────
// src/data/generatedArt.ts is written from here so that wiring a render into
// the app is not a second, forgettable step. Existing entries are MERGED, not
// replaced: running one manifest (or one --only id) must never un-wire art an
// earlier batch produced.
const MAP_PATH = 'src/data/generatedArt.ts'

function readMap() {
  if (!existsSync(MAP_PATH)) return {}
  const src = readFileSync(MAP_PATH, 'utf8')
  const body = src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1)
  const out = {}
  for (const m of body.matchAll(/'([^']+)':\s*'([^']+)'/g)) out[m[1]] = m[2]
  return out
}

function writeMap(map) {
  const header = readFileSync(MAP_PATH, 'utf8').split('export const GENERATED_ART')[0]
  const rows = Object.keys(map)
    .sort()
    .map((k) => `  '${k}': '${map[k]}',`)
    .join('\n')
  mkdirSync(dirname(MAP_PATH), { recursive: true })
  writeFileSync(
    MAP_PATH,
    `${header}export const GENERATED_ART: Record<string, string> = {${rows ? `\n${rows}\n` : ''}}\n`,
  )
}

const artMap = readMap()
let produced = 0

for (const entry of manifest) {
  if (only && entry.id !== only) continue
  const isSkin = entry.kind === 'skin'
  // `road` is a scene by every pipeline rule — full-bleed, no key, capped at
  // 640 — and differs only in where it lands. The season's painting belongs in
  // public/road/ next to harvest.jpg, not in the keep's folder.
  // Scenes that live somewhere of their own. All three are full-bleed opaque
  // paintings that differ from a plain `scene` only in where they land and how
  // they encode — the keep's folder is a different place entirely, and a road,
  // a room and a churchyard each belong next to their own feature. Adding the
  // fourth is one row here rather than another level of ternary.
  const SCENE_DIRS = { road: 'public/road', room: 'public/room', church: 'public/church' }
  const sceneDir = SCENE_DIRS[entry.kind]
  const isScene = entry.kind === 'scene' || !!sceneDir
  const isProp = entry.kind === 'prop'
  // A road's painting is full-bleed and fully opaque, so PNG buys nothing and
  // costs a lot: the first two came back at ~1MB each against the 88KB of the
  // hand-made harvest.jpg they sit beside, and every user downloads them.
  // JPEG at 82 is visually indistinguishable on a soft painted gradient.
  const dest = isSkin
    ? `public/skins/${entry.id}.png`
    : sceneDir
      ? `${sceneDir}/${entry.id}.jpg`
      : isScene || isProp
        ? `public/keep/${entry.id}.png`
        : `public/items/${entry.id}.png`
  process.stdout.write(`${entry.id} … `)
  try {
    const raw = await generate(entry.prompt, isSkin, entry.refs ?? [])
    // The API returns JPEG or PNG depending on the model; sniff the magic bytes.
    let png
    if (raw[0] === 0x89 && raw[1] === 0x50) {
      png = PNG.sync.read(raw)
    } else {
      const j = jpeg.decode(raw, { maxMemoryUsageInMB: 1024 })
      png = new PNG({ width: j.width, height: j.height })
      j.data.copy(png.data)
    }
    if (isScene) {
      // A full-bleed background: no key, no isolate — just cap the width.
      png = padAndCap(png, { padBelowPct: 0, maxH: 640 })
    } else {
      png = keyMagenta(png)
      png = isolate(png)
      png = padAndCap(
        png,
        isSkin ? { padBelowPct: 0.08, maxH: 400 } : isProp ? { padBelowPct: 0, maxH: 150 } : { padBelowPct: 0, maxH: 220 },
      )
    }
    // Anything with a folder of its own encodes as JPEG, and for one reason: a
    // full-bleed opaque painting gains nothing from PNG and costs a lot. The
    // five room tiers came back at ~750KB each as PNG against ~80KB as JPEG,
    // and these are backgrounds every player downloads. (A plain `scene` — the
    // keep's halls — predates this and is still PNG; same argument applies to
    // it whenever somebody wants to re-encode them.)
    const buf = sceneDir
      ? jpeg.encode({ data: png.data, width: png.width, height: png.height }, 82).data
      : PNG.sync.write(png)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, buf)
    // The app serves public/ from the root, so the URL is the path minus it.
    artMap[entry.id] = dest.replace(/^public/, '')
    produced += 1
    console.log(`ok → ${dest} (${png.width}x${png.height}, ${(buf.length / 1024).toFixed(0)}KB)`)
  } catch (e) {
    console.log(`FAILED: ${e.message.slice(0, 300)}`)
  }
}

if (produced > 0) {
  writeMap(artMap)
  console.log(`\nwired ${produced} render${produced === 1 ? '' : 's'} into ${MAP_PATH}`)
} else {
  console.log('\nnothing produced — generatedArt.ts left alone')
}
