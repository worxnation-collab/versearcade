// Design-token contrast check. Runs as part of `npm run build`.
//
// Why this exists: a colour value is the one kind of change that renders
// perfectly while saying nothing. `--card` shipped for a year as
// `rgba(255,255,255,0.06)`, which composites over the ground to **1.14:1** —
// so the page, a card on it and a tile inside that card were within a hair of
// each other, and every screen of chrome in this app read as one flat field
// with things floating in it. Nothing threw, nothing looked broken in a diff,
// and it was the single biggest thing separating this app from the ones it is
// judged against.
//
// `--ink-faint` was the same shape of bug with a worse consequence: #7a6ba8
// measured **3.51:1** on the card it prints on, under AA for normal text, and
// it is the colour of every 11-12px caption in the app.
//
// So the ladder is asserted rather than remembered. Values are read out of
// src/index.css by TEXT and the ratios are re-derived here from the WCAG
// formula rather than imported from anywhere the app also uses — the same
// habit check-trivia.mjs and check-map.mjs follow, so neither side can be
// right only in a copy of itself.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const CSS = resolve(here, '../src/index.css')

let failed = 0
const fail = (msg) => { console.error(`✗ ${msg}`); failed += 1 }

const src = await readFile(CSS, 'utf8')
const root = src.slice(src.indexOf(':root {'), src.indexOf('\n}', src.indexOf(':root {')))
const tokens = {}
for (const m of root.matchAll(/^\s*(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/gm)) tokens[m[1]] = m[2]

const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
}
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const need = (name) => {
  const v = tokens[name]
  if (!v) fail(`token ${name} is missing from :root, or is no longer a plain #rrggbb`)
  return v
}

// ── The surface ladder ──────────────────────────────────────────────────────
// Each step has to be visible without being a stripe. The floor is what makes
// a card read as a card; the ceiling stops the "ladder" becoming a zebra.
const LADDER = [
  ['--bg-1', '--card', 1.3, 1.7, 'the page against a card on it'],
  ['--card', '--card-raised', 1.18, 1.5, 'a card against a tile inside it'],
]
for (const [a, b, min, max, what] of LADDER) {
  const [x, y] = [need(a), need(b)]
  if (!x || !y) continue
  const r = ratio(x, y)
  if (r < min) fail(`${what} (${a} ${x} vs ${b} ${y}) is ${r.toFixed(3)}:1 — under ${min}, so the two read as one surface`)
  else if (r > max) fail(`${what} (${a} vs ${b}) is ${r.toFixed(3)}:1 — over ${max}, which reads as stripes rather than depth`)
}

// ── Text on the surfaces it is actually printed on ─────────────────────────
// `.faint` and `.dim` are used at 11-14px, which is "normal text" by WCAG, so
// the bar is 4.5:1 and not 3:1. Checked against BOTH surfaces, because a tile
// inside a card is the lighter of the two and is where it gets closest.
const TEXT = [
  ['--ink', 4.5], ['--ink-dim', 4.5], ['--ink-faint', 4.5],
]
for (const [ink, min] of TEXT) {
  const v = need(ink)
  if (!v) continue
  for (const surface of ['--card', '--card-raised']) {
    const s = need(surface)
    if (!s) continue
    const r = ratio(v, s)
    if (r < min) fail(`${ink} (${v}) on ${surface} (${s}) is ${r.toFixed(2)}:1 — under AA's ${min}:1 for normal text`)
  }
}

// ── The SELECTED surface ───────────────────────────────────────────────────
// Every "this one is on" chip, tile and pill in the app used to be painted
// `--grape`, which is an ACCENT: white ink on it measures 3.37:1 and
// `--ink-faint` 1.63:1, so a selected tile could not carry its own label, let
// alone the line under it. `--select` is the same hue taken down to where the
// two readable inks clear AA. `--ink-faint` is deliberately NOT required to
// pass here — it doesn't, and it must not be used on a selected surface.
const select = need('--select')
if (select) {
  for (const ink of ['--ink', '--ink-dim']) {
    const v = need(ink)
    if (!v) continue
    const r = ratio(v, select)
    if (r < 4.5) fail(`${ink} (${v}) on --select (${select}) is ${r.toFixed(2)}:1 — a selected tile has to carry its own words`)
  }
  const vsCard = ratio(select, need('--card'))
  if (vsCard < 1.5) fail(`--select (${select}) is only ${vsCard.toFixed(2)}:1 from --card — "on" has to be visible without reading the text`)
}

// ── The gold ration ────────────────────────────────────────────────────────
// `--edge` exists so a decorative frame stops competing with the action. If it
// ever drifts close enough to `--gold` to be mistaken for it, the ration has
// quietly been undone and the colour means eight things again.
const gold = need('--gold'), edge = need('--edge')
if (gold && edge) {
  const r = ratio(gold, edge)
  if (r < 1.8) fail(`--edge (${edge}) is only ${r.toFixed(2)}:1 from --gold (${gold}) — it has to read as a dimmer thing, or the ration is undone`)
  const onCard = ratio(edge, need('--card'))
  if (onCard < 3) fail(`--edge (${edge}) is ${onCard.toFixed(2)}:1 on --card — a border nobody can see is not a demotion, it is a deletion`)
}

if (failed) {
  console.error(`\ncheck-contrast: ${failed} problem${failed === 1 ? '' : 's'}.`)
  process.exit(1)
}
const show = (a, b) => `${a}→${b} ${ratio(need(a), need(b)).toFixed(2)}:1`
console.log(`✓ contrast: ${show('--bg-1', '--card')}, ${show('--card', '--card-raised')}; ` +
  `faint on card ${ratio(need('--ink-faint'), need('--card')).toFixed(2)}:1; ` +
  `ink on select ${ratio(need('--ink'), need('--select')).toFixed(2)}:1`)
