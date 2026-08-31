// Cross Word integrity check. Runs as part of `npm run build`.
//
// Why this exists: every way this data can be wrong is INVISIBLE on screen. A
// crossbar one letter too low still renders — as a plus sign. A word that isn't
// in the verse still solves — and then reveals a verse that doesn't contain it,
// which quietly turns the whole payoff into a non sequitur. A clue containing
// its own answer just makes the puzzle free. None of that throws, so the app
// looks fine and the feature is broken.
//
// It re-derives every rule from src/data/crossword.ts's own comment block
// rather than importing the module's checker, so a mistake in the checker
// itself doesn't get to pass the build.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const CROSS = resolve(here, '../src/data/crossword.ts')
const POOL = resolve(here, '../src/data/bible/pool.ts')

// Both are data files: one big array literal with no type annotations inside.
// Slice out the literal and evaluate it as plain JavaScript rather than pulling
// in a TS toolchain (same trick as check-pool.mjs).
function literalAfter(src, marker, open, close, file) {
  const at = src.indexOf(marker)
  if (at === -1) throw new Error(`${file}: could not find ${marker}`)
  const eq = src.indexOf(`= ${open}`, at)
  if (eq === -1) throw new Error(`${file}: ${marker} is not assigned a ${open}${close} literal`)
  const start = eq + 2
  let depth = 0
  for (let i = start; i < src.length; i++) {
    if (src[i] === open) depth++
    else if (src[i] === close && --depth === 0) {
      return new Function(`return ${src.slice(start, i + 1)}`)()
    }
  }
  throw new Error(`${file}: unbalanced ${open}${close} after ${marker}`)
}

const CROSS_PUZZLES = literalAfter(
  await readFile(CROSS, 'utf8'),
  'export const CROSS_PUZZLES',
  '[',
  ']',
  'crossword.ts',
)
const VERSE_POOL = literalAfter(
  await readFile(POOL, 'utf8'),
  'export const VERSE_POOL',
  '[',
  ']',
  'pool.ts',
)

// Never lower this to make a build pass — a drop means puzzles were lost, which
// is the regression check-pool.mjs exists for and this one inherits.
const MIN_PUZZLES = 50

const errors = []
const fail = (msg) => errors.push(msg)

if (CROSS_PUZZLES.length < MIN_PUZZLES) {
  fail(`only ${CROSS_PUZZLES.length} puzzles — expected at least ${MIN_PUZZLES}`)
}

const byRef = new Map(VERSE_POOL.map((v) => [v.reference, v]))
const seen = new Set()

for (const p of CROSS_PUZZLES) {
  const at = `${p.id ?? '(no id)'}`
  if (!p.id || typeof p.id !== 'string') fail(`${at}: missing id`)
  if (seen.has(p.id)) fail(`${at}: duplicate id`)
  seen.add(p.id)

  const down = p.down?.word ?? ''
  const across = p.across?.word ?? ''
  if (!/^[A-Z]{5,9}$/.test(down)) fail(`${at}: upright "${down}" must be 5–9 letters, A–Z`)
  if (!/^[A-Z]{3,8}$/.test(across)) fail(`${at}: crossbar "${across}" must be 3–8 letters, A–Z`)

  // The shape. A crossbar below the upper third of the upright reads as a plus
  // sign; one off-centre on its own word reads as a lopsided stick.
  if (!(p.downIndex >= 1 && p.downIndex < down.length)) {
    fail(`${at}: downIndex ${p.downIndex} out of range for "${down}"`)
  } else if (p.downIndex > Math.ceil(down.length / 3)) {
    fail(`${at}: crossbar sits too low on the upright (${p.downIndex} of ${down.length})`)
  }
  if (!(p.acrossIndex >= 0 && p.acrossIndex < across.length)) {
    fail(`${at}: acrossIndex ${p.acrossIndex} out of range for "${across}"`)
  } else if (Math.abs(p.acrossIndex - (across.length - 1) / 2) > 1) {
    fail(`${at}: arms are lopsided (${p.acrossIndex} of ${across.length})`)
  }
  if (down[p.downIndex] !== across[p.acrossIndex]) {
    fail(
      `${at}: "${down}"[${p.downIndex}]=${down[p.downIndex]} but "${across}"[${p.acrossIndex}]=${across[p.acrossIndex]}`,
    )
  }

  // The verse is the reveal, so it has to exist and to hold both words.
  const verse = byRef.get(p.reference)
  if (!verse) {
    fail(`${at}: ${p.reference} is not in VERSE_POOL`)
  } else {
    const text = verse.text.replace(/[‘’']/g, '').toUpperCase()
    for (const w of [down, across]) {
      if (!new RegExp(`\\b${w}\\b`).test(text)) fail(`${at}: "${w}" is not in ${p.reference}`)
    }
  }

  for (const side of [p.down, p.across]) {
    if (side?.clue && side.clue.toUpperCase().includes(side.word)) {
      fail(`${at}: the clue for "${side.word}" contains the answer`)
    }
    if (!side?.clue || side.clue.length < 8) fail(`${at}: "${side?.word}" needs a real clue`)
  }
}

if (errors.length) {
  console.error(`\ncheck-cross: ${errors.length} problem(s) in src/data/crossword.ts\n`)
  for (const e of errors) console.error(`  • ${e}`)
  console.error('')
  process.exit(1)
}

console.log(`check-cross: ${CROSS_PUZZLES.length} crosses OK`)
