// Church visual-asset template check. Runs as part of `npm run build`.
//
// src/data/churchAssetTemplates.ts is where the real art lands, and its
// failure modes all RENDER or refuse at a leader's tap rather than throwing:
// a template id without its kind's prefix is refused by `generate_church_asset`
// (0133) only when a leader taps Generate; a duplicate id silently draws the
// first one; a slot box past 100% clips its words off the card; an image path
// outside /church-assets/ is a file nobody shipped. So they fail the build,
// re-derived from the source text rather than importing the checker
// (`checkAssetTemplates()` asserts the same in dev).

import { readFile, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const src = await readFile(resolve(here, '../src/data/churchAssetTemplates.ts'), 'utf8')
const table = src.slice(src.indexOf('export const ASSET_TEMPLATES'), src.indexOf('export function defaultTemplate'))
const PREFIX = { verse_card: 'verse_', series_header: 'series_', announcement: 'notice_' }

const errors = []
const blocks = table.split(/\n  \{\n/).slice(1)
if (blocks.length < 3) errors.push(`only ${blocks.length} templates found — did the shape change?`)
const ids = new Set()
const kinds = new Set()
for (const b of blocks) {
  const id = /id: '([^']+)'/.exec(b)?.[1]
  const kind = /kind: '([^']+)'/.exec(b)?.[1]
  if (!id || !kind) { errors.push(`a template is missing its id or kind:\n${b.slice(0, 120)}`); continue }
  if (ids.has(id)) errors.push(`${id}: duplicate id`)
  ids.add(id)
  if (!/^[a-z0-9_]{2,40}$/.test(id)) errors.push(`${id}: id must match [a-z0-9_]{2,40} (the server's check)`)
  if (!PREFIX[kind]) { errors.push(`${id}: unknown kind ${kind}`); continue }
  if (!id.startsWith(PREFIX[kind])) errors.push(`${id}: a ${kind} template id must start with ${PREFIX[kind]}`)
  if (!/retired: true/.test(b)) kinds.add(kind)
  const image = /image: '([^']+)'/.exec(b)?.[1]
  if (image) {
    if (!image.startsWith('/church-assets/')) errors.push(`${id}: image ${image} must live under /church-assets/`)
    else {
      try { await access(resolve(here, '../public', image.slice(1))) } catch { errors.push(`${id}: image ${image} is not in public/`) }
    }
  }
  for (const m of b.matchAll(/(\w+): \{ x: ([\d.]+), y: ([\d.]+), w: ([\d.]+), h: ([\d.]+)/g)) {
    const [, slot, x, y, w, h] = m
    if (+x + +w > 100.01 || +y + +h > 100.01) errors.push(`${id}.${slot}: box runs off the card`)
  }
}
for (const k of Object.keys(PREFIX)) if (!kinds.has(k)) errors.push(`${k}: no pickable template`)

if (errors.length) {
  console.error('\n✖ Church asset template check failed:\n')
  for (const e of errors) console.error(`  - ${e}`)
  console.error('')
  process.exit(1)
}
console.log(`✓ Church asset templates: ${ids.size} templates, every kind covered, ids prefixed, boxes on the card`)
