// Placement grammar check. Runs as part of `npm run build`.
//
// Why this exists: the wire format for "where a thing stands" is written by ONE
// pair of functions in the client (packDecor / packPercent in
// src/data/placement.ts) and validated by regexes in migrations 0083 (the
// keep's hall, the Upper Room) and 0084 (the churchyard's plants and
// monuments). Those two halves live in different languages, in different
// repositories of thought, and nothing makes them agree.
//
// When they disagree the failure is invisible in the way this project's worst
// bugs always are: the client updates optimistically, so the piece moves on
// screen and looks saved, and the RPC quietly raises 'bad decor' — the position
// is simply gone on the next load. That is exactly what a client deployed
// against un-applied migrations does, which is why the migrations say APPLY
// FIRST and why this asserts the agreement at build time.
//
// It takes the regexes from the migration files themselves, and runs the REAL
// packers out of the real source (transpiled with the esbuild that ships with
// vite), so neither side can be right only in a copy.

import { execFileSync } from 'node:child_process'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(here, '../src/data/placement.ts')
const MIGRATIONS = resolve(here, '../supabase/migrations')

const fail = (msg) => {
  console.error(`✗ ${msg}`)
  process.exitCode = 1
}

/** Every `!~ '...'` value pattern in a migration, by the RPC it guards. */
async function regexesIn(file) {
  const sql = await readFile(resolve(MIGRATIONS, file), 'utf8')
  const out = []
  for (const m of sql.matchAll(/!~ '(\^[^']+\$)'/g)) out.push(m[1])
  return out
}

/**
 * Postgres POSIX regex -> JS RegExp.
 *
 * The two dialects agree on everything these patterns use (anchors, classes,
 * bounded repeats, alternation, groups), so this is a straight lift — and if a
 * future pattern uses something they do NOT share, this script is the thing
 * that has to learn about it rather than the format quietly diverging.
 */
const toJs = (pg) => new RegExp(pg)

async function loadPlacement() {
  const dir = await mkdtemp(join(tmpdir(), 'placement-'))
  const out = join(dir, 'placement.mjs')
  execFileSync(resolve(here, '../node_modules/.bin/esbuild'), [
    SRC,
    '--format=esm',
    '--platform=neutral',
    '--log-level=silent',
    `--outfile=${out}`,
  ])
  const mod = await import(pathToFileURL(out).href)
  await rm(dir, { recursive: true, force: true })
  return mod
}

const { packDecor, unpackDecor, packPercent, unpackPercent } = await loadPlacement()

// ── The values the client can actually write ────────────────────────────────
// Both worlds, every shape of suffix, at the bounds and past them: the packers
// are supposed to clamp, so "past them" must still come out well-formed.
const SCENE_IDS = ['keep_woven_rug', 'room_reed_mat']
const YARD_IDS = ['yard_ivy', 'statue_shepherd']

const scene = []
for (const id of SCENE_IDS) {
  for (const tier of [1, 2, 3, 0, 9]) {
    scene.push(packDecor(id, tier))
    for (const [x, y] of [[0, 0], [7, 3], [412, 188], [559, 299], [999, 999], [-40, -1]]) {
      scene.push(packDecor(id, tier, { x, y }))
      for (const s of [0.7, 1, 1.1, 1.4, 0.1, 9]) {
        scene.push(packDecor(id, tier, { x, y, s }))
        scene.push(packDecor(id, tier, { s }))
      }
    }
  }
}

const yard = []
for (const id of YARD_IDS) {
  for (const [x, b] of [[0, 0], [4, 1], [41.2, 18.8], [96, 30], [99.94, 99.99], [-5, -5], [150, 150]]) {
    yard.push(packPercent(id, { x, b }))
    for (const s of [0.7, 1, 1.4]) yard.push(packPercent(id, { x, b }, s))
  }
}

// ── They must all pass the server's regexes ─────────────────────────────────
const keepRx = (await regexesIn('0083_free_placement.sql')).map(toJs)
const yardRx = (await regexesIn('0084_yard_free_placement.sql')).map(toJs)

if (keepRx.length !== 4) fail(`0083: expected 4 value patterns, found ${keepRx.length}`)
// One shared value pattern (in yard_placement_id) plus the plot and plinth
// row-key patterns — three, and a fourth would mean somebody wrote a second
// copy of the grammar.
if (yardRx.length !== 3) fail(`0084: expected 3 patterns (value, plot, plinth), found ${yardRx.length}`)

// 0083's decor/item patterns are the 2nd and 4th (the 1st and 3rd are anchors).
const keepValue = keepRx[1]
const roomValue = keepRx[3]
// 0084 validates every yard value through one shared pattern, in
// yard_placement_id — the first in the file.
const yardValue = yardRx[0]

for (const v of scene) {
  const rx = v.startsWith('keep_') ? keepValue : roomValue
  if (!rx.test(v)) fail(`the client writes "${v}", which ${rx} rejects`)
  // And it has to survive the round trip, or the position is lost on read.
  const u = unpackDecor(v)
  if (!v.startsWith(u.id)) fail(`unpackDecor("${v}") lost its id`)
  if (packDecor(u.id, u.tier, { x: u.x, y: u.y, s: u.s }) !== v) {
    fail(`"${v}" does not survive a pack/unpack round trip`)
  }
}

for (const v of yard) {
  if (!yardValue.test(v)) fail(`the client writes "${v}", which ${yardValue} rejects`)
  const u = unpackPercent(v)
  if (!v.startsWith(u.id)) fail(`unpackPercent("${v}") lost its id`)
  if (u.x !== undefined && (u.x < 0 || u.x > 99.9 || u.b < 0 || u.b > 99.9)) {
    fail(`"${v}" unpacks to an out-of-range percent (${u.x}, ${u.b})`)
  }
}

// ── And the server must refuse what the client can never write ──────────────
// The point of the regex is not the happy path; it is that the RPC takes a
// string from a client that could send anything.
const BAD = [
  'yard ivy',
  'yard_ivy; drop table x',
  'yard_ivy~x1234y1',
  'yard_ivy~xy',
  'yard_ivy~x10y10~x20y20',
  'YARD_IVY',
  '',
  'keep_rug~x1y1s1',
  "keep_rug'--",
]
for (const v of BAD) {
  for (const [name, rx] of [['keep', keepValue], ['room', roomValue], ['yard', yardValue]]) {
    if (rx.test(v)) fail(`${name}'s pattern accepts "${v}", which no client writes`)
  }
}

if (process.exitCode) {
  console.error('\nPlacement grammar check FAILED — the client and the migrations disagree.')
} else {
  console.log(
    `✓ placement grammar: ${scene.length} scene values, ${yard.length} yard values, ` +
      `${BAD.length} rejects — client and migrations 0083/0084 agree`,
  )
}
