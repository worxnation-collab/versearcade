// Church visual-asset template check. Runs as part of `npm run build`.
//
// src/data/churchAssetTemplates.ts is where the real art lands, and its
// failure modes all RENDER or refuse at a leader's tap rather than throwing:
// a template id without its kind's prefix is refused by `generate_church_asset`
// (0133) only when a leader taps Generate; a duplicate id silently draws the
// first one; a slot box past 100% clips its words off the card; an image path
// outside /church-assets/ is a file nobody shipped; two pickable looks on the
// same picture are one look offered twice (Night reading and Lamplight shipped
// that way); and a DEFAULT look that can only set short text puts every long
// verse in 9px type by default. So they fail the build,
// re-derived from the source text rather than importing the checker
// (`checkAssetTemplates()` asserts the same in dev).

import { readFile, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
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
const seenImage = new Map() // kind + sha1 of a pickable look's background -> id (a picker shows one kind)
const firstOfKind = new Map() // kind -> the first pickable block (the default)
// Keep in sync with READABLE_FLOOR / bodyCapacity in churchAssetTemplates.ts.
const FLOOR = 3.2
const DEFAULT_MIN = 240 // characters the default verse and notice look must hold
const capacity = (b) => {
  const body = /body: \{([^}]*)\}/.exec(b)?.[1]
  if (!body) return Infinity
  const size = +(/size: ([\d.]+)/.exec(body)?.[1] ?? 0)
  const min = +(/minScale: ([\d.]+)/.exec(body)?.[1] ?? 1)
  const byType = size * min >= FLOOR ? Infinity : Math.floor(90 * (size / FLOOR) ** 2)
  const max = /bodyMax: (\d+)/.exec(b)?.[1]
  return Math.min(byType, max ? +max : Infinity)
}
for (const b of blocks) {
  const id = /id: '([^']+)'/.exec(b)?.[1]
  const kind = /kind: '([^']+)'/.exec(b)?.[1]
  if (!id || !kind) { errors.push(`a template is missing its id or kind:\n${b.slice(0, 120)}`); continue }
  if (ids.has(id)) errors.push(`${id}: duplicate id`)
  ids.add(id)
  if (!/^[a-z0-9_]{2,40}$/.test(id)) errors.push(`${id}: id must match [a-z0-9_]{2,40} (the server's check)`)
  if (!PREFIX[kind]) { errors.push(`${id}: unknown kind ${kind}`); continue }
  if (!id.startsWith(PREFIX[kind])) errors.push(`${id}: a ${kind} template id must start with ${PREFIX[kind]}`)
  const pickable = !/retired: true/.test(b)
  if (pickable) kinds.add(kind)
  if (pickable && !firstOfKind.has(kind)) firstOfKind.set(kind, { id, b })
  const image = /image: '([^']+)'/.exec(b)?.[1]
  if (image) {
    if (!image.startsWith('/church-assets/')) errors.push(`${id}: image ${image} must live under /church-assets/`)
    else {
      try {
        const path = resolve(here, '../public', image.slice(1))
        await access(path)
        if (pickable) {
          const sum = `${kind}:${createHash('sha1').update(await readFile(path)).digest('hex')}`
          if (seenImage.has(sum)) errors.push(`${id}: same background file as ${seenImage.get(sum)} — one look offered twice; retire one`)
          else seenImage.set(sum, id)
        }
      } catch { errors.push(`${id}: image ${image} is not in public/`) }
    }
  }
  for (const m of b.matchAll(/(\w+): \{ x: ([\d.]+), y: ([\d.]+), w: ([\d.]+), h: ([\d.]+)/g)) {
    const [, slot, x, y, w, h] = m
    if (+x + +w > 100.01 || +y + +h > 100.01) errors.push(`${id}.${slot}: box runs off the card`)
  }
}
for (const k of Object.keys(PREFIX)) if (!kinds.has(k)) errors.push(`${k}: no pickable template`)
for (const k of ['verse_card', 'announcement']) {
  const d = firstOfKind.get(k)
  if (d && capacity(d.b) < DEFAULT_MIN) errors.push(`${d.id}: the default ${k} look sets only ${capacity(d.b)} characters readably (needs ${DEFAULT_MIN}) — put a roomier look first`)
}

if (errors.length) {
  console.error('\n✖ Church asset template check failed:\n')
  for (const e of errors) console.error(`  - ${e}`)
  console.error('')
  process.exit(1)
}
console.log(`✓ Church asset templates: ${ids.size} templates, every kind covered, ids prefixed, boxes on the card, no look twice, defaults hold long text`)
