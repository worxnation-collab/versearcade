// Arrangement check. Runs as part of `npm run build`.
//
// An arrangement moves every anchor in a room by a couple of numbers, and those
// numbers can arrive from the content catalog — so the one thing that must hold
// is that NO arrangement, including a hostile or mistyped one, can move a piece
// off its own mount. A rug on a rafter is not a placement, it is a bug, and it
// renders perfectly.
//
// This drives the REAL `arrangeAnchors` against the REAL surfaces through Vite,
// rather than re-deriving the maths — a transform re-implemented in a checker
// is just a second copy of it to keep in sync, which is the argument
// check-cross.mjs makes about generators.

import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const server = await createServer({ root: resolve(here, '..'), server: { middlewareMode: true }, logLevel: 'error' })

let failed = 0
const fail = (m) => { console.error(`✗ ${m}`); failed += 1 }

try {
  const { ARRANGEMENTS, arrangeAnchors } = await server.ssrLoadModule('/src/data/layouts.ts')
  const { ROOM_SURFACE } = await server.ssrLoadModule('/src/data/room.ts')
  const { KEEP_SURFACE } = await server.ssrLoadModule('/src/data/keep.ts')

  const surfaces = [['the Upper Room', ROOM_SURFACE], ['the keep', KEEP_SURFACE]]

  // Every declared arrangement, plus deliberately absurd ones: the clamp is
  // what makes catalog-shipped numbers safe, so it is tested at the extremes
  // rather than only in range.
  const cases = [
    ...ARRANGEMENTS,
    { id: 'hostile-pull', name: '', line: '', pull: 999, rise: 0 },
    { id: 'hostile-rise', name: '', line: '', pull: 0, rise: -9999 },
    { id: 'hostile-both', name: '', line: '', pull: -999, rise: 9999 },
    { id: 'nan', name: '', line: '', pull: NaN, rise: NaN },
  ]

  let checked = 0
  for (const [label, surface] of surfaces) {
    if (!surface?.anchors?.length) { fail(`${label}: no surface parsed — did an export get renamed?`); continue }
    for (const arr of cases) {
      const moved = arrangeAnchors(surface, arr)
      if (moved.length !== surface.anchors.length) {
        fail(`${label}/${arr.id}: ${moved.length} anchors out of ${surface.anchors.length} — an arrangement may MOVE an anchor, never drop one`)
      }
      const ids = new Set(moved.map((a) => a.id))
      for (const a of surface.anchors) {
        if (!ids.has(a.id)) fail(`${label}/${arr.id}: anchor "${a.id}" disappeared`)
      }
      for (const a of moved) {
        const band = surface.bands?.[a.mount]
        if (!band || a.x == null || a.y == null) continue
        checked += 1
        if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) {
          fail(`${label}/${arr.id}: anchor "${a.id}" landed at a non-finite position`)
        } else if (a.x < band.x0 - 0.01 || a.x > band.x1 + 0.01 || a.y < band.y0 - 0.01 || a.y > band.y1 + 0.01) {
          fail(`${label}/${arr.id}: anchor "${a.id}" (${a.x.toFixed(1)},${a.y.toFixed(1)}) left its "${a.mount}" band`)
        }
      }
    }
  }

  // The default must be a genuine no-op, or every existing room re-composes
  // itself the moment this ships for players who never chose anything.
  const { DEFAULT_ARRANGEMENT, arrangementById } = await server.ssrLoadModule('/src/data/layouts.ts')
  const def = arrangementById(DEFAULT_ARRANGEMENT)
  if (def.pull !== 0 || def.rise !== 0) {
    fail(`the default arrangement "${def.id}" moves things (pull ${def.pull}, rise ${def.rise}) — it has to leave every room exactly as designed`)
  }
  for (const [label, surface] of surfaces) {
    const same = arrangeAnchors(surface, def)
    if (same !== surface.anchors) fail(`${label}: the default arrangement did not return the surface's own anchors untouched`)
  }

  if (failed) {
    console.error(`\ncheck-layouts: ${failed} problem${failed === 1 ? '' : 's'}.`)
    process.exit(1)
  }
  console.log(`✓ layouts: ${ARRANGEMENTS.length} arrangements + 4 hostile ones, ${checked} anchor placements all inside their mount`)
} finally {
  await server.close()
}
