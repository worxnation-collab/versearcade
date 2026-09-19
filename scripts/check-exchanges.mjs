#!/usr/bin/env node
// check:exchanges — the exchange format's four invisible failure modes.
//
// Every one of these RENDERS. Nothing throws, the runner reports a clean
// post, and the video goes out wrong:
//
//   - A cast id with no `_asking`/`_struck`/`_settled` render draws the same
//     face for the whole post. The expression swap on the turn is the only
//     thing this layout has instead of motion, so the beat the format is
//     built around simply does not happen.
//   - Two speakers on the same Gemini voice is one person talking to himself.
//     It sounds like a rendering bug and is a data bug.
//   - A backdrop id with no painting falls back to the Harvest Road, which is
//     a wheat field behind a prison-cell conversation. That fallback exists
//     so a missing file is never a failed post; it is not meant to be the
//     steady state, so it is a build failure here rather than a surprise on
//     a Monday.
//   - And the runner's copy of the calendar drifting from the app's puts the
//     exchange on the wrong days, or on none — `defaultKinds` is decided in
//     Node before the bundle exists, so the duplicate is deliberate and this
//     is what keeps it honest.
//
// Re-derived from the files rather than importing the checker, the
// `check-trivia` habit: a checker that imports what it checks agrees with it
// by construction.
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const src = read('src/data/tiktokExchanges.ts')
const runner = read('scripts/tiktok-daily.mjs')
const fail = []

// ---- the bank -------------------------------------------------------------
const entries = [...src.matchAll(/\{\s*\n\s*id: '([^']+)',([\s\S]*?)\n  \},/g)].map(([, id, body]) => {
  const f = (k) => (body.match(new RegExp(`\\n\\s*${k}: ('|")((?:\\\\.|(?!\\1).)*)\\1`)) ?? [])[2]
  return { id, asker: f('asker'), answerer: f('answerer'), scene: f('scene'), hook: f('hook'), payoff: f('payoff'), reference: f('reference') }
})
if (entries.length < 1) fail.push('no exchanges parsed out of tiktokExchanges.ts — has the shape changed?')

const voices = Object.fromEntries(
  [...src.matchAll(/^\s{2}([a-z_0-9]+): \{ voice: '([A-Za-z]+)'/gm)].map(([, id, v]) => [id, v]),
)

const skins = new Set(fs.readdirSync(path.join(root, 'public/skins')).map((f) => f.replace(/\.png$/, '')))
const scenes = fs.existsSync(path.join(root, 'public/tiktok/exchange'))
  ? new Set(fs.readdirSync(path.join(root, 'public/tiktok/exchange')).map((f) => f.replace(/\.jpg$/, '')))
  : new Set()

const seen = new Set()
for (const e of entries) {
  if (seen.has(e.id)) fail.push(`${e.id}: duplicate id`)
  seen.add(e.id)
  for (const key of ['asker', 'answerer', 'scene', 'hook', 'payoff', 'reference']) {
    if (!e[key]) fail.push(`${e.id}: no ${key}`)
  }
  // Three renders each. The base is fatal; a missing expression is the
  // silent one, so it is named as such.
  for (const [who, extra] of [[e.asker, ['asking', 'struck']], [e.answerer, ['asking', 'settled']]]) {
    if (!who) continue
    if (!skins.has(who)) fail.push(`${e.id}: no render public/skins/${who}.png`)
    for (const x of extra) if (!skins.has(`${who}_${x}`)) fail.push(`${e.id}: no ${who}_${x}.png — that face never changes on screen`)
  }
  if (e.asker && e.answerer && voices[e.asker] && voices[e.asker] === voices[e.answerer]) {
    fail.push(`${e.id}: ${e.asker} and ${e.answerer} both speak in ${voices[e.asker]} — one person talking to himself`)
  }
  if (e.asker && !voices[e.asker]) fail.push(`${e.id}: ${e.asker} has no SPEAKER_VOICE entry`)
  if (e.answerer && !voices[e.answerer]) fail.push(`${e.id}: ${e.answerer} has no SPEAKER_VOICE entry`)
  if (e.scene && !scenes.has(e.scene)) fail.push(`${e.id}: no painting public/tiktok/exchange/${e.scene}.jpg — it would fall back to the wheat field`)
}

// ---- the calendar, both copies --------------------------------------------
const one = (s, re, what) => { const m = s.match(re); if (!m) fail.push(`could not read ${what}`); return m?.[1] }
const appEpoch = one(src, /EXCHANGE_EPOCH = '([\d-]+)'/, "the app's EXCHANGE_EPOCH")
const appDays = one(src, /EXCHANGE_DAYS = \[([\d, ]+)\]/, "the app's EXCHANGE_DAYS")
const runEpoch = one(runner, /EXCHANGE_EPOCH = '([\d-]+)'/, "the runner's EXCHANGE_EPOCH")
const runDays = one(runner, /EXCHANGE_DAYS = \[([\d, ]+)\]/, "the runner's EXCHANGE_DAYS")
if (appEpoch && runEpoch && appEpoch !== runEpoch) fail.push(`epoch drift: app ${appEpoch}, runner ${runEpoch}`)
if (appDays && runDays && appDays.replace(/\s/g, '') !== runDays.replace(/\s/g, '')) fail.push(`day drift: app [${appDays}], runner [${runDays}]`)

// ---- the schedule ---------------------------------------------------------
// An exchange that falls into the `second` slot is scheduled on top of the
// story, and the day still reports three successes.
const times = read('scripts/tiktok-times.mjs')
if (!/OWN_SLOT = \[[^\]]*'exchange'/.test(times)) fail.push("scripts/tiktok-times.mjs: 'exchange' is not in OWN_SLOT — it would be scheduled on top of the story")
if (!/'exchange=\d\d:\d\d'/.test(times)) fail.push('scripts/tiktok-times.mjs: no hour for the exchange')

if (fail.length) {
  console.error(`check-exchanges: ${fail.length} problem${fail.length > 1 ? 's' : ''}`)
  for (const f of fail) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log(`check-exchanges: ${entries.length} exchanges, ${new Set(entries.flatMap((e) => [e.asker, e.answerer])).size} speakers, calendar in sync`)
