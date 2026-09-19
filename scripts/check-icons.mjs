// Icon check. Runs as part of `npm run build`.
//
// Why this exists: `<Icon id="…">` renders NOTHING for an id the table does
// not carry — no throw, no console warning, no layout shift worth noticing at
// 20px. So a typo in the bottom nav or in one of the map's three dozen rows
// is an invisible hole, on the one row nobody happened to look at. Same shape
// of failure as a mistyped map route, and the same answer: assert it.
//
// It also holds the line the icon set exists to draw. Emoji were the app's
// loudest "indie" tell — a different typeface on every platform, at a size the
// app does not control, in a colour it cannot set — so the nav and the map are
// checked for having none left. Everywhere else may still use them (the crowd's
// chatter bubbles are emoji ON PURPOSE, and must stay that way).
//
// Read by TEXT rather than imported, like every other checker here.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const ICONS = resolve(here, '../src/data/icons.tsx')
const MAP = resolve(here, '../src/data/map.ts')
const NAV = resolve(here, '../src/components/BottomNav.tsx')

let failed = 0
const fail = (msg) => { console.error(`✗ ${msg}`); failed += 1 }

const iconSrc = await readFile(ICONS, 'utf8')
const table = iconSrc.slice(iconSrc.indexOf('const ICONS: Record<IconId, string[]> = {'))
const defined = new Set()
for (const m of table.matchAll(/^\s{2}'?([a-z]+)'?:\s*\[/gm)) defined.add(m[1])
if (defined.size === 0) fail('no icons parsed out of data/icons.tsx — did the table shape change?')

// Every path has to be real path data. An empty or malformed `d` draws nothing
// and looks exactly like a missing icon.
for (const m of table.matchAll(/'(M[^']*)'/g)) {
  const d = m[1]
  if (d.length < 10) fail(`a path is suspiciously short and will draw nothing: "${d}"`)
  if (/[^MmLlHhVvCcSsQqTtAaZz0-9.,\-\s]/.test(d)) fail(`a path carries something that is not path data: "${d.slice(0, 40)}…"`)
}

// The union has to list exactly what the table defines, or TypeScript accepts
// an id that renders nothing.
const unionBlock = iconSrc.slice(iconSrc.indexOf('export type IconId'), iconSrc.indexOf('/** 24x24 path data'))
const union = new Set([...unionBlock.matchAll(/'([a-z]+)'/g)].map((m) => m[1]))
for (const id of defined) if (!union.has(id)) fail(`icon "${id}" is drawn but missing from the IconId union`)
for (const id of union) if (!defined.has(id)) fail(`IconId lists "${id}", which has no art — every use of it renders nothing`)

// Every id the nav and the map name has to exist.
const used = new Map()
for (const [file, label] of [[MAP, 'data/map.ts'], [NAV, 'BottomNav.tsx']]) {
  const src = await readFile(file, 'utf8')
  for (const m of src.matchAll(/icon: '([a-z]+)'/g)) used.set(m[1], label)
  for (const m of src.matchAll(/<Icon id="([a-z]+)"/g)) used.set(m[1], label)
}
for (const [id, where] of used) {
  if (!defined.has(id)) fail(`${where} names icon "${id}", which has no art — it renders as nothing`)
}

// And neither may go back to emoji. The surrogate ranges below are the
// pictographic blocks; the crowd's CHATTER list is deliberately not checked.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}]/u
for (const [file, label] of [[MAP, 'data/map.ts'], [NAV, 'BottomNav.tsx']]) {
  const src = await readFile(file, 'utf8')
  src.split('\n').forEach((line, i) => {
    if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return
    if (EMOJI.test(line)) fail(`${label}:${i + 1} has an emoji in code: ${line.trim().slice(0, 70)}`)
  })
}

if (failed) {
  console.error(`\ncheck-icons: ${failed} problem${failed === 1 ? '' : 's'}.`)
  process.exit(1)
}
console.log(`✓ icons: ${defined.size} drawn, ${used.size} named by the nav and the map, no emoji left in either`)
