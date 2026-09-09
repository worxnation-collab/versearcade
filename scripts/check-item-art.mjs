#!/usr/bin/env node
// Every wearable item has a drawing, and the drawing is well-formed.
//
// Items became DATA (src/data/itemArt.tsx) so a season can ship a hat without an
// App Store release. That trade has three failure modes and all of them RENDER:
//
//   * A bundled item with no entry in ITEM_ART is an equippable the player can
//     put on and never see — no error, no warning, just a slot that does
//     nothing.
//   * A colour that isn't `#rgb`/`#rrggbb` is silently dropped by the catalog's
//     sanitiser, so the same object looks different depending on whether it
//     came from the bundle or from an overlay.
//   * A shape with a missing coordinate draws at 0, which puts the object in
//     the top-left corner of the figure rather than in its hand.
//
// So it is asserted here, in the build, re-deriving the rules by reading the
// source rather than importing the module — the same habit check-map.mjs and
// check-trivia.mjs have, and for the same reason: a checker that imports the
// thing it checks agrees with it by construction.

import { readFileSync } from 'node:fs'

const ART = readFileSync(new URL('../src/data/itemArt.tsx', import.meta.url), 'utf8')
const AVATAR = readFileSync(new URL('../src/data/avatar.ts', import.meta.url), 'utf8')

const problems = []

// ── The bundled item ids, from data/avatar's BUNDLED_ITEMS ───────────────────
const itemsBlock = AVATAR.slice(
  AVATAR.indexOf('export const BUNDLED_ITEMS'),
  AVATAR.indexOf('/** Item ids that only the seasonal road grants'),
)
const declared = [...itemsBlock.matchAll(/\{\s*id:\s*'(item_[a-z_]+)'[^}]*slot:\s*'(hat|held|cape)'/g)]
  .map((m) => ({ id: m[1], slot: m[2] }))

if (declared.length < 11) problems.push(`only found ${declared.length} bundled items — parser drift?`)

// ── The art table, from data/itemArt's ITEM_ART ──────────────────────────────
const artBlock = ART.slice(
  ART.indexOf('export const ITEM_ART'),
  ART.indexOf('// The sanitiser for a catalog'),
)

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const REQUIRED = { path: ['d'], rect: ['x', 'y', 'w', 'h'], circle: ['cx', 'cy', 'r'], ellipse: ['cx', 'cy', 'rx', 'ry'] }

for (const { id } of declared) {
  const at = artBlock.indexOf(`\n  ${id}: [`)
  if (at === -1) {
    problems.push(`${id}: no entry in ITEM_ART — it would equip and draw nothing`)
    continue
  }
  // The entry runs to the closing `],` at the same indent.
  const end = artBlock.indexOf('\n  ],', at)
  const body = artBlock.slice(at, end === -1 ? undefined : end)
  const shapes = [...body.matchAll(/\{\s*t:\s*'(path|rect|circle|ellipse)'([^}]*)\}/g)]
  if (!shapes.length) problems.push(`${id}: entry exists but holds no shapes`)
  for (const [, kind, attrs] of shapes) {
    for (const key of REQUIRED[kind]) {
      if (!new RegExp(`(^|[,{\\s])${key}:`).test(attrs)) {
        problems.push(`${id}: a ${kind} is missing \`${key}\` — it would draw at the origin`)
      }
    }
    for (const [, colour] of attrs.matchAll(/(?:fill|stroke):\s*'([^']*)'/g)) {
      if (!HEX.test(colour)) {
        problems.push(`${id}: colour ${colour} is not #rgb/#rrggbb — the catalog sanitiser drops it`)
      }
    }
    // `var(--…)` and `url(#…)` would resolve in the bundle and vanish from an
    // overlay, which is the same object looking different by provenance.
    if (/var\(|url\(/.test(attrs)) problems.push(`${id}: a shape references var()/url()`)
  }
}

// ── No item may still be drawn by hand in Character.tsx ──────────────────────
const CHAR = readFileSync(new URL('../src/components/Character.tsx', import.meta.url), 'utf8')
for (const m of CHAR.matchAll(/items\.(hat|held|cape)\s*===\s*'(item_[a-z_]+)'/g)) {
  problems.push(`Character.tsx still hardcodes ${m[2]} — it belongs in ITEM_ART`)
}

if (problems.length) {
  console.error('check-item-art FAILED:\n  ' + problems.join('\n  '))
  process.exit(1)
}
console.log(`✓ item art: ${declared.length} bundled items, every one drawn from data`)
