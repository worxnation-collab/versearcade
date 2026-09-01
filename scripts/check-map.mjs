// Map route check. Runs as part of `npm run build`.
//
// Why this exists: `src/data/map.ts` is a directory of every place in this app,
// and every row in it is a route written out as a string. A typo in one of
// those strings does not throw and does not fail to compile — it falls through
// the router to the catch-all, which redirects to Landing. So a mistyped route
// silently signs somebody out of their own app, and only on the one row nobody
// happened to tap while testing.
//
// The two halves that have to agree are the map's `to` fields and the `<Route
// path=...>` table in `src/App.tsx`. This reads the ROUTES out of App.tsx by
// text, rather than importing the map's own module and trusting it, so neither
// side can be right only in a copy — the same habit `check-cross.mjs` uses when
// it re-derives the cross rules instead of importing the checker.
//
// It also enforces the rule the map's header states: a place may carry an icon,
// a label and a line, and NOT a number. A map with counts on it is a progress
// screen, and a progress screen is a list of the places you are behind on.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const APP = resolve(here, '../src/App.tsx')
const MAP = resolve(here, '../src/data/map.ts')

let failed = 0
const fail = (msg) => {
  console.error(`✗ ${msg}`)
  failed += 1
}

/** Every `path="..."` in the router, minus the catch-all. */
async function appRoutes() {
  const src = await readFile(APP, 'utf8')
  const out = []
  for (const m of src.matchAll(/<Route\s[^>]*path="([^"]+)"/g)) {
    if (m[1] !== '*') out.push(m[1])
  }
  return out
}

/** Every place in the map, as { id, to, hasDigitInCopy }. */
async function mapPlaces() {
  const src = await readFile(MAP, 'utf8')
  // The array literal only — the file also mentions routes in its prose.
  const start = src.indexOf('export const MAP_PLACES')
  if (start < 0) throw new Error('check-map: MAP_PLACES not found in data/map.ts')
  const body = src.slice(start)
  const out = []
  for (const block of body.split(/\n  \{\n/).slice(1)) {
    const id = block.match(/id:\s*'([^']+)'/)?.[1]
    const to = block.match(/to:\s*'([^']+)'/)?.[1]
    const label = block.match(/label:\s*'([^']*)'/)?.[1] ?? ''
    const line = block.match(/line:\s*'([^']*)'/)?.[1] ?? ''
    if (!id || !to) continue
    out.push({ id, to, copy: `${label} ${line}` })
  }
  return out
}

/**
 * Does a concrete path match a route pattern? Only the shapes this router
 * actually uses: literal segments and `:param` segments.
 */
function matches(path, pattern) {
  const p = path.split('/').filter(Boolean)
  const r = pattern.split('/').filter(Boolean)
  if (p.length !== r.length) return false
  return r.every((seg, i) => seg.startsWith(':') || seg === p[i])
}

const routes = await appRoutes()
const places = await mapPlaces()

if (places.length === 0) fail('no places parsed out of data/map.ts — did the file shape change?')
if (routes.length === 0) fail('no routes parsed out of App.tsx — did the router shape change?')

for (const place of places) {
  // Query strings are a parameter the destination screen reads (?pray=1,
  // ?customize=1), not part of the route.
  const path = place.to.split('?')[0]
  if (!routes.some((r) => matches(path, r))) {
    fail(`map place "${place.id}" points at "${path}", which no <Route> in App.tsx matches`)
  }
  // A place says what a thing IS. The moment one says how many you have, the
  // map has started keeping score — see the header in data/map.ts.
  if (/\b\d+\b/.test(place.copy) && !/\b(66|1v1)\b/.test(place.copy)) {
    fail(`map place "${place.id}" has a number in its copy ("${place.copy.trim()}") — the map must not count anything`)
  }
}

// A map row that a guest can reach but the router walls, or vice versa, is not
// checkable from here (the wall table is a separate literal), but a `wall` key
// naming something that isn't in WALL is: it would draw no padlock and give no
// warning before the wall.
const appSrc = await readFile(APP, 'utf8')
const wallBlock = appSrc.slice(appSrc.indexOf('const WALL'), appSrc.indexOf('function RequireAccount'))
const wallKeys = new Set([...wallBlock.matchAll(/^  ([a-z]+):\s*\{/gm)].map((m) => m[1]))
const mapSrc = await readFile(MAP, 'utf8')
for (const m of mapSrc.matchAll(/wall:\s*'([^']+)'/g)) {
  if (!wallKeys.has(m[1])) fail(`map references wall key "${m[1]}", which is not in App.tsx's WALL table`)
}

if (failed) {
  console.error(`\ncheck-map: ${failed} problem${failed === 1 ? '' : 's'}.`)
  process.exit(1)
}
console.log(`✓ map: ${places.length} places, every route resolves against ${routes.length} in App.tsx`)
