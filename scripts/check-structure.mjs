// Bible-structure integrity check. Runs as part of `npm run build`.
//
// src/data/bible/structure.ts carries 1,189 hand-entered verse counts, and a
// single typo there is invisible: the app still renders, the reader still works,
// and the only symptom is a player's "you've opened 12% of the Bible" being
// quietly wrong forever. So the counts are checked here against figures entered
// independently — chapters per book, verses per book, and the grand total. A
// mistyped chapter row breaks its book's total; a mistyped book breaks the sum.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const FILE = resolve(here, '../src/data/bible/structure.ts')

// Published KJV/WEB figures: [chapters, verses] per book, in canonical order.
// Entered from a reference table, NOT derived from structure.ts — that's the
// whole point. Grand total: 1,189 chapters and 31,102 verses.
const EXPECTED = {
  'Genesis': [50, 1533], 'Exodus': [40, 1213], 'Leviticus': [27, 859],
  'Numbers': [36, 1288], 'Deuteronomy': [34, 959], 'Joshua': [24, 658],
  'Judges': [21, 618], 'Ruth': [4, 85], '1 Samuel': [31, 810],
  '2 Samuel': [24, 695], '1 Kings': [22, 816], '2 Kings': [25, 719],
  '1 Chronicles': [29, 942], '2 Chronicles': [36, 822], 'Ezra': [10, 280],
  'Nehemiah': [13, 406], 'Esther': [10, 167], 'Job': [42, 1070],
  'Psalms': [150, 2461], 'Proverbs': [31, 915], 'Ecclesiastes': [12, 222],
  'Song of Solomon': [8, 117], 'Isaiah': [66, 1292], 'Jeremiah': [52, 1364],
  'Lamentations': [5, 154], 'Ezekiel': [48, 1273], 'Daniel': [12, 357],
  'Hosea': [14, 197], 'Joel': [3, 73], 'Amos': [9, 146], 'Obadiah': [1, 21],
  'Jonah': [4, 48], 'Micah': [7, 105], 'Nahum': [3, 47], 'Habakkuk': [3, 56],
  'Zephaniah': [3, 53], 'Haggai': [2, 38], 'Zechariah': [14, 211],
  'Malachi': [4, 55], 'Matthew': [28, 1071], 'Mark': [16, 678],
  'Luke': [24, 1151], 'John': [21, 879], 'Acts': [28, 1007],
  'Romans': [16, 433], '1 Corinthians': [16, 437], '2 Corinthians': [13, 257],
  'Galatians': [6, 149], 'Ephesians': [6, 155], 'Philippians': [4, 104],
  'Colossians': [4, 95], '1 Thessalonians': [5, 89], '2 Thessalonians': [3, 47],
  '1 Timothy': [6, 113], '2 Timothy': [4, 83], 'Titus': [3, 46],
  'Philemon': [1, 25], 'Hebrews': [13, 303], 'James': [5, 108],
  '1 Peter': [5, 105], '2 Peter': [3, 61], '1 John': [5, 105],
  '2 John': [1, 13], '3 John': [1, 14], 'Jude': [1, 25], 'Revelation': [22, 404],
}

const TOTAL_CHAPTERS = 1189
const TOTAL_VERSES = 31102

const src = await readFile(FILE, 'utf8')
const errors = []

// Pull the `'Book': '31,25,...'` rows straight out of the source. No TS
// toolchain needed — the table is deliberately one flat literal.
const table = src.slice(src.indexOf('VERSES_PER_CHAPTER'))
const rows = [...table.matchAll(/'([^']+)':\s*'([\d,]+)',/g)]
const actual = new Map()
for (const [, book, row] of rows) {
  if (actual.has(book)) errors.push(`${book}: listed twice`)
  actual.set(book, row.split(',').map(Number))
}

for (const [book, [chapters, verses]] of Object.entries(EXPECTED)) {
  const got = actual.get(book)
  if (!got) {
    errors.push(`${book}: missing from the table`)
    continue
  }
  if (got.length !== chapters) {
    errors.push(`${book}: ${got.length} chapters, expected ${chapters}`)
  }
  const sum = got.reduce((s, n) => s + n, 0)
  if (sum !== verses) {
    errors.push(`${book}: ${sum} verses, expected ${verses} (off by ${sum - verses})`)
  }
  const bad = got.findIndex((n) => !Number.isInteger(n) || n < 1)
  if (bad !== -1) errors.push(`${book} ${bad + 1}: not a positive verse count (${got[bad]})`)
}

for (const book of actual.keys()) {
  if (!(book in EXPECTED)) errors.push(`${book}: not a book of the Bible (typo?)`)
}

const chapterSum = [...actual.values()].reduce((s, c) => s + c.length, 0)
const verseSum = [...actual.values()].reduce((s, c) => s + c.reduce((a, b) => a + b, 0), 0)
if (chapterSum !== TOTAL_CHAPTERS) errors.push(`total chapters ${chapterSum}, expected ${TOTAL_CHAPTERS}`)
if (verseSum !== TOTAL_VERSES) errors.push(`total verses ${verseSum}, expected ${TOTAL_VERSES}`)

// Every verse the quiz pool cites has to have a real slot in the structure
// above, or it can never light up in a player's Bible. This is exactly how the
// Psalms mismatch surfaced: the pool cites "Psalm 23:1" while the book on the
// shelf is "Psalms", so the lookup has to normalize — and if a future entry
// cites a book, chapter or verse that doesn't exist, that's a typo, not a
// naming convention.
const CANON_NAME = {
  'Psalm': 'Psalms',
  'Song of Songs': 'Song of Solomon',
  'Canticles': 'Song of Solomon',
  'Revelations': 'Revelation',
}

const poolSrc = await readFile(resolve(here, '../src/data/bible/pool.ts'), 'utf8')
// pool.ts mixes quote styles — roughly a third of its entries are single-quoted
// and the rest double-quoted — so match both or the check silently covers a
// fraction of the pool while reporting success.
const cited = [...poolSrc.matchAll(/reference: (?:'([^']+)'|"([^"]+)")/g)].map((m) => m[1] ?? m[2])
if (!cited.length) errors.push('pool.ts: no references found — did its shape change?')

for (const reference of cited) {
  const m = /^(.+)\s+(\d+):(\d+)(?:[-–](\d+))?$/.exec(reference)
  if (!m) {
    errors.push(`pool reference "${reference}": not a Book Chapter:Verse citation`)
    continue
  }
  const book = CANON_NAME[m[1]] ?? m[1]
  const chapters = actual.get(book)
  if (!chapters) {
    errors.push(`pool reference "${reference}": no book called "${book}" in the structure table`)
    continue
  }
  const chapter = Number(m[2])
  if (chapter > chapters.length) {
    errors.push(`pool reference "${reference}": ${book} has only ${chapters.length} chapters`)
    continue
  }
  const last = m[4] ? Number(m[4]) : Number(m[3])
  if (last > chapters[chapter - 1]) {
    errors.push(`pool reference "${reference}": ${book} ${chapter} has only ${chapters[chapter - 1]} verses`)
  }
}

if (errors.length) {
  console.error('\n✖ Bible structure check failed:\n')
  for (const e of errors) console.error(`  - ${e}`)
  console.error('')
  process.exit(1)
}

console.log(
  `✓ Bible structure: ${actual.size} books, ${chapterSum} chapters, ${verseSum} verses; ` +
    `all ${cited.length} pool references land in it`,
)
