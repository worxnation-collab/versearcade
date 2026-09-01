// Bonus-trivia integrity check. Runs as part of `npm run build`.
//
// Why this exists: every failure mode in this data renders perfectly.
//
//  - A book with no trivia silently loses its bonus question, and the run just
//    goes back to five verse questions. Nothing warns.
//  - A prompt containing its own answer is a free point.
//  - Two entries sharing an id, or an answerIndex off the end of the options,
//    are invisible until the wrong thing is marked correct.
//  - A thin book can't fill the library's five-question round without asking
//    the same question twice inside one round.
//
// The rules are RE-DERIVED here rather than imported from `checkTriviaData()`,
// on purpose — a checker that imports the thing it checks agrees with it by
// construction. Same reason `check-cross.mjs` re-derives the cross rules and
// `check-structure.mjs` uses independently-entered figures.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const TRIVIA = resolve(here, '../src/data/bible/trivia.ts')
const POOL = resolve(here, '../src/data/bible/pool.ts')

// Both are data files: one big object/array literal with no types inside it.
// Rather than pull in a TS toolchain, slice the literal out and evaluate it.
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

const triviaSrc = await readFile(TRIVIA, 'utf8')
const poolSrc = await readFile(POOL, 'utf8')
const BOOK_TRIVIA = literalAfter(triviaSrc, 'export const BOOK_TRIVIA', '{', '}', 'trivia.ts')
const BIBLE_BOOKS = literalAfter(poolSrc, 'export const BIBLE_BOOKS', '[', ']', 'pool.ts')

const minMatch = triviaSrc.match(/export const MIN_TRIVIA_PER_BOOK\s*=\s*(\d+)/)
if (!minMatch) throw new Error('trivia.ts: MIN_TRIVIA_PER_BOOK not found')
const MIN_PER_BOOK = Number(minMatch[1])

// The library's round size. A book below this can't fill one without repeating
// a question inside a single round, which is why MIN_TRIVIA_PER_BOOK exists.
const ROUND_SIZE = 5

// Total floor. Raise it when the set grows; never lower it to make a build
// pass — a drop means questions were lost, which is what this guards.
const MIN_TOTAL = 400

const errors = []
const fail = (msg) => errors.push(msg)

// --- coverage ---------------------------------------------------------------
const books = Object.keys(BOOK_TRIVIA)
const total = books.reduce((n, b) => n + BOOK_TRIVIA[b].length, 0)

if (total < MIN_TOTAL) {
  fail(`trivia has ${total} questions, expected at least ${MIN_TOTAL}. ` +
       `Questions were removed — check for a merge from a stale base.`)
}

if (MIN_PER_BOOK < ROUND_SIZE + 1) {
  fail(`MIN_TRIVIA_PER_BOOK is ${MIN_PER_BOOK}, which cannot fill a ${ROUND_SIZE}-question ` +
       `round with room to vary. It must be at least ${ROUND_SIZE + 1}.`)
}

for (const book of BIBLE_BOOKS) {
  const list = BOOK_TRIVIA[book]
  if (!list || list.length === 0) {
    fail(`no bonus trivia for ${book} — the daily verse can land on any of the 66 books`)
  } else if (list.length < MIN_PER_BOOK) {
    fail(`${book}: has ${list.length} questions, needs at least ${MIN_PER_BOOK}`)
  }
}

for (const book of books) {
  if (!BIBLE_BOOKS.includes(book)) {
    fail(`"${book}" is not a book name the verse pool uses — its questions can never be reached`)
  }
}

// --- per question -----------------------------------------------------------
const seenIds = new Set()
const seenPrompts = new Map()

for (const book of books) {
  for (const q of BOOK_TRIVIA[book]) {
    const at = `${book} / ${q.id ?? '(no id)'}`

    if (!q.id) fail(`${at}: no id`)
    else if (seenIds.has(q.id)) fail(`${at}: duplicate id`)
    seenIds.add(q.id)

    if (typeof q.prompt !== 'string' || !q.prompt.trim()) fail(`${at}: no prompt`)
    if (!Array.isArray(q.options) || q.options.length !== 4) {
      fail(`${at}: needs exactly 4 options, has ${q.options?.length ?? 0}`)
      continue
    }
    if (new Set(q.options).size !== 4) fail(`${at}: repeats an option`)
    if (q.options.some((o) => typeof o !== 'string' || !o.trim())) fail(`${at}: has an empty option`)

    if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex > 3) {
      fail(`${at}: answerIndex ${q.answerIndex} is not a valid option index`)
      continue
    }

    // A miss has to teach something — that is the rule that lets trivia exist
    // in an app with no losers in it.
    if (typeof q.teach !== 'string' || !q.teach.trim()) fail(`${at}: no teach line`)
    else if (q.teach.trim().length < 20) fail(`${at}: teach line is too short to teach anything`)

    // A question mark anywhere, not at the end — plenty of prompts close on a
    // quoted phrase or trail into the options with an ellipsis.
    if (!q.prompt.includes('?') && !q.prompt.includes('…')) fail(`${at}: the prompt does not ask anything`)

    // The prompt giving away its own answer looks completely fine in review.
    const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
    const answer = norm(q.options[q.answerIndex])
    if (answer.length > 3 && norm(q.prompt).includes(answer)) {
      fail(`${at}: the prompt contains its own answer ("${q.options[q.answerIndex]}")`)
    }

    // Two books asking the identical question is a copy-paste that survives
    // review because each one reads correctly on its own.
    const key = norm(q.prompt)
    if (seenPrompts.has(key)) fail(`${at}: same prompt as ${seenPrompts.get(key)}`)
    else seenPrompts.set(key, at)
  }
}

if (errors.length) {
  console.error('✗ bonus trivia check failed:\n')
  for (const e of errors) console.error(`  - ${e}`)
  console.error('')
  process.exit(1)
}

console.log(`✓ bonus trivia: ${total} questions across ${books.length} books ` +
            `(thinnest book has ${Math.min(...books.map((b) => BOOK_TRIVIA[b].length))})`)
