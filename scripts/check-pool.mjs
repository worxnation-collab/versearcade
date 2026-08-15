// Verse-pool integrity check. Runs as part of `npm run build`.
//
// Why this exists: the 246-verse expansion added in PR #56 was silently deleted
// when PR #58 merged from a stale base — nothing failed, nothing warned, and the
// Focus-practice picker quietly went back to showing "1 verse" for most books.
// This script makes that class of regression a build failure instead.
//
// It checks structure too, because a malformed entry degrades quizzes without
// crashing: a keyword that isn't in the verse text produces a fill-in-the-blank
// question whose answer never appears in the blanked sentence.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const POOL = resolve(here, '../src/data/bible/pool.ts')

// pool.ts is a data file: a canonical book list, a floor constant, and one big
// array literal with no type annotations inside it. Rather than pull in a TS
// toolchain, slice out each literal and evaluate it as plain JavaScript.
function literalAfter(src, marker, open, close) {
  const at = src.indexOf(marker)
  if (at === -1) throw new Error(`pool.ts: could not find ${marker}`)
  // Anchor on the assignment, not the first bracket — the type annotation
  // (`: VerseSeed[] =`) carries brackets of its own.
  const eq = src.indexOf(`= ${open}`, at)
  if (eq === -1) throw new Error(`pool.ts: ${marker} is not assigned a ${open}${close} literal`)
  const start = eq + 2
  let depth = 0
  for (let i = start; i < src.length; i++) {
    if (src[i] === open) depth++
    else if (src[i] === close && --depth === 0) {
      return new Function(`return ${src.slice(start, i + 1)}`)()
    }
  }
  throw new Error(`pool.ts: unbalanced ${open}${close} after ${marker}`)
}

const src = await readFile(POOL, 'utf8')
const BIBLE_BOOKS = literalAfter(src, 'export const BIBLE_BOOKS', '[', ']')
const VERSE_POOL = literalAfter(src, 'export const VERSE_POOL', '[', ']')

const minMatch = src.match(/export const MIN_VERSES_PER_BOOK\s*=\s*(\d+)/)
if (!minMatch) throw new Error('pool.ts: MIN_VERSES_PER_BOOK not found')
const MIN_PER_BOOK = Number(minMatch[1])

// Total floor. Raise this when the pool grows; never lower it to make a build
// pass — a drop means verses were lost, which is exactly what we're guarding.
const MIN_TOTAL = 726

const errors = []
const fail = (msg) => errors.push(msg)

// --- coverage ---------------------------------------------------------------
if (VERSE_POOL.length < MIN_TOTAL) {
  fail(`pool has ${VERSE_POOL.length} verses, expected at least ${MIN_TOTAL}. ` +
       `Verses were removed — check for a merge from a stale base.`)
}

const counts = new Map()
for (const v of VERSE_POOL) counts.set(v.book, (counts.get(v.book) ?? 0) + 1)

for (const book of BIBLE_BOOKS) {
  const n = counts.get(book) ?? 0
  if (n < MIN_PER_BOOK) fail(`${book}: ${n} verse(s), expected at least ${MIN_PER_BOOK}`)
}
for (const book of counts.keys()) {
  if (!BIBLE_BOOKS.includes(book)) fail(`unknown book name "${book}" (typo, or missing from BIBLE_BOOKS)`)
}
if (BIBLE_BOOKS.length !== 66) fail(`BIBLE_BOOKS lists ${BIBLE_BOOKS.length} books, expected 66`)

// --- per-entry structure ----------------------------------------------------
const TEXT_FIELDS = ['reference', 'book', 'text', 'speaker', 'audience', 'before', 'after', 'theme', 'keyword']
const seenRefs = new Map()

for (const [i, v] of VERSE_POOL.entries()) {
  const at = v?.reference ? `"${v.reference}"` : `entry #${i}`

  for (const f of TEXT_FIELDS) {
    if (typeof v?.[f] !== 'string' || !v[f].trim()) fail(`${at}: missing or empty "${f}"`)
  }
  if (v?.testament !== 'OT' && v?.testament !== 'NT') fail(`${at}: testament must be "OT" or "NT"`)
  if (!Number.isInteger(v?.chapter) || v.chapter < 1) fail(`${at}: chapter must be a positive integer`)
  if (!Number.isInteger(v?.verseStart) || v.verseStart < 1) fail(`${at}: verseStart must be a positive integer`)
  if (v?.verseEnd !== undefined && !(Number.isInteger(v.verseEnd) && v.verseEnd >= v.verseStart)) {
    fail(`${at}: verseEnd must be an integer no smaller than verseStart`)
  }
  if (!Array.isArray(v?.facts) || v.facts.length === 0 || v.facts.some((f) => typeof f !== 'string' || !f.trim())) {
    fail(`${at}: facts must be a non-empty array of non-empty strings`)
  }

  if (typeof v?.reference === 'string') {
    const dupe = seenRefs.get(v.reference)
    if (dupe !== undefined) fail(`${at}: duplicate reference (also at entry #${dupe})`)
    else seenRefs.set(v.reference, i)

    // "Genesis 1:1" must belong to book Genesis, chapter 1, verse 1. Two house
    // conventions are allowed: the Psalms are cited in the singular ("Psalm
    // 23:1"), and a multi-verse entry may be cited by its opening verse alone.
    const names = v.book === 'Psalms' ? ['Psalms', 'Psalm'] : [v.book]
    const spans = v.verseEnd ? [`${v.verseStart}-${v.verseEnd}`, `${v.verseStart}`] : [`${v.verseStart}`]
    const allowed = names.flatMap((n) => spans.map((s) => `${n} ${v.chapter}:${s}`))
    if (!allowed.includes(v.reference)) {
      fail(`${at}: reference does not match its fields (expected one of ${allowed.map((a) => `"${a}"`).join(', ')})`)
    }
  }

  // The fill-in-the-blank generator blanks out `keyword` with a word-boundary
  // regex; if it isn't in the text, the question is unanswerable.
  if (typeof v?.keyword === 'string' && typeof v?.text === 'string') {
    if (/[\\^$.*+?()[\]{}|]/.test(v.keyword)) {
      fail(`${at}: keyword "${v.keyword}" contains regex characters`)
    } else if (!new RegExp(`\\b${v.keyword}\\b`, 'i').test(v.text)) {
      fail(`${at}: keyword "${v.keyword}" does not appear in the verse text`)
    }
  }
}

// --- report -----------------------------------------------------------------
if (errors.length) {
  console.error(`\n✗ verse pool check failed (${errors.length} problem${errors.length === 1 ? '' : 's'}):\n`)
  for (const e of errors.slice(0, 40)) console.error(`  • ${e}`)
  if (errors.length > 40) console.error(`  … and ${errors.length - 40} more`)
  console.error('')
  process.exit(1)
}

const books = [...counts.keys()].length
const thinnest = Math.min(...counts.values())
console.log(`✓ verse pool: ${VERSE_POOL.length} verses across ${books} books (thinnest book has ${thinnest})`)
