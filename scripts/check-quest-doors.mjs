// Quest-door and invitation-route check. Runs as part of `npm run build`.
//
// Why this exists: three files in this app write a ROUTE OUT AS A STRING and
// hand it to `navigate()` — `data/map.ts` (checked by check-map.mjs),
// `data/questDoors.ts` and `features/map/invitations.ts`. A typo in one of those
// strings does not throw and does not fail to compile: it falls through the
// router to the catch-all, which redirects to Landing. So a mistyped door
// silently signs somebody out of their own app, on the one row nobody happened
// to tap. This is check-map.mjs's argument, applied to the two tables it does
// not read.
//
// It also asserts the thing that will actually rot: `KNOWN_VERBS` in
// lib/season.ts is the list of verbs a road may name, and a verb added there
// for a new season with no entry in `questDoors` ships as a quest row that
// tells somebody what to do and not where. That failure RENDERS — the row looks
// exactly as it always did — so it is a build failure, the check-trivia habit.
// A verb that genuinely has nowhere to send anybody goes in `DOORLESS` and says
// so out loud.
//
// Everything is re-derived by TEXT rather than imported, the same habit
// check-map.mjs and check-cross.mjs use: neither side can then be right only in
// a copy of itself.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const APP = resolve(here, '../src/App.tsx')
const SEASON = resolve(here, '../src/lib/season.ts')
const DOORS = resolve(here, '../src/data/questDoors.ts')
const INVITES = resolve(here, '../src/features/map/invitations.ts')

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

/** Literal segments and `:param` segments — the only shapes this router uses. */
function matches(path, pattern) {
  const p = path.split('/').filter(Boolean)
  const r = pattern.split('/').filter(Boolean)
  if (p.length !== r.length) return false
  return r.every((seg, i) => seg.startsWith(':') || seg === p[i])
}

const routes = await appRoutes()
if (routes.length === 0) fail('no routes parsed out of App.tsx — did the router shape change?')

const checkRoute = (to, what) => {
  // A query string is a parameter the destination screen reads (?pray=1,
  // ?chest=1), not part of the route.
  const path = to.split('?')[0]
  if (!routes.some((r) => matches(path, r))) {
    fail(`${what} points at "${path}", which no <Route> in App.tsx matches`)
  }
}

// ── The verbs a road may name ───────────────────────────────────────────────
const seasonSrc = await readFile(SEASON, 'utf8')
const knownStart = seasonSrc.indexOf('export const KNOWN_VERBS')
if (knownStart < 0) throw new Error('check-quest-doors: KNOWN_VERBS not found in lib/season.ts')
const knownBody = seasonSrc.slice(knownStart, seasonSrc.indexOf('])', knownStart))
const known = new Set([...knownBody.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]))
if (known.size === 0) fail('no verbs parsed out of KNOWN_VERBS — did the literal shape change?')

// ── The doors ───────────────────────────────────────────────────────────────
const doorSrc = await readFile(DOORS, 'utf8')
const doorlessBody = doorSrc.slice(doorSrc.indexOf('export const DOORLESS'), doorSrc.indexOf('const DOORS'))
const doorless = new Set([...doorlessBody.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]))

const doorsBody = doorSrc.slice(doorSrc.indexOf('const DOORS'), doorSrc.indexOf('/** Where this quest is done'))
const doors = new Map()
for (const m of doorsBody.matchAll(/^\s{2}([a-z_]+):\s*'([^']+)',/gm)) doors.set(m[1], m[2])
if (doors.size === 0) fail('no doors parsed out of data/questDoors.ts — did the table shape change?')

for (const verb of known) {
  if (doors.has(verb) === doorless.has(verb)) {
    fail(
      doors.has(verb)
        ? `verb "${verb}" is both given a door and listed as DOORLESS — pick one`
        : `verb "${verb}" is in KNOWN_VERBS with no door and no DOORLESS entry: a quest naming it would say what to do and not where`,
    )
  }
}
for (const verb of doors.keys()) {
  if (!known.has(verb)) fail(`questDoors has a door for "${verb}", which is not a verb in KNOWN_VERBS`)
}
for (const verb of doorless) {
  if (!known.has(verb)) fail(`questDoors lists "${verb}" as DOORLESS, which is not a verb in KNOWN_VERBS`)
}
for (const [verb, to] of doors) checkRoute(to, `quest door "${verb}"`)

// ── The compass's invitations ───────────────────────────────────────────────
const inviteSrc = await readFile(INVITES, 'utf8')
const invites = [...inviteSrc.matchAll(/out\.push\(\{\s*id:\s*'([^']+)'[^}]*?to:\s*'([^']+)'/g)]
if (invites.length === 0) fail('no invitations parsed out of features/map/invitations.ts — did the shape change?')
for (const [, id, to] of invites) checkRoute(to, `invitation "${id}"`)

// A deep link only works if the screen behind it reads the parameter. Every
// `?x=1` written here has to be answered somewhere, or the row lands on the
// right tab and does nothing else — which is the exact failure this whole
// change exists to fix, one level quieter.
const params = new Set()
for (const to of [...doors.values(), ...invites.map((m) => m[2])]) {
  const q = to.split('?')[1]
  if (q) for (const pair of q.split('&')) params.add(pair.split('=')[0])
}
const readers = await (async () => {
  const { readdir } = await import('node:fs/promises')
  const root = resolve(here, '../src')
  const out = []
  const walk = async (dir) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const full = resolve(dir, e.name)
      if (e.isDirectory()) await walk(full)
      else if (/\.tsx?$/.test(e.name)) out.push(await readFile(full, 'utf8'))
    }
  }
  await walk(root)
  return out.join('\n')
})()
for (const p of params) {
  if (!new RegExp(`get\\('${p}'\\)`).test(readers)) {
    fail(`deep link "?${p}=…" is never read by any screen — the row would land on the tab and do nothing`)
  }
}

if (failed) {
  console.error(`\ncheck-quest-doors: ${failed} problem${failed === 1 ? '' : 's'}.`)
  process.exit(1)
}
console.log(
  `✓ quest doors: ${doors.size} doors + ${doorless.size} doorless = ${known.size} known verbs; ` +
    `${invites.length} invitations; every route resolves and every deep link is read`,
)
