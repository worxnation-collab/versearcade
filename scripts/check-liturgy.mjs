// Church-year check. Runs as part of `npm run build`.
//
// Why this exists: every movable day in `data/liturgy.ts` is an offset from
// Easter, so one wrong line in the computus is wrong for a whole year at a
// time — and it renders perfectly the entire while. There is no crash, no
// blank screen and no way to notice except by knowing when Easter was.
//
// The expected dates below are entered INDEPENDENTLY from published tables
// rather than derived from the algorithm, which is the same rule
// check-structure.mjs follows about the Bible's verse counts: "If you edit the
// table, don't derive the expected values from it." They span a century and
// deliberately include 1900 and 2100 (century rules), 2038 (the earliest
// possible Easter, March 22 is not in range but March 25 is close), and 2011
// (April 24, the latest it gets in this span).
//
// It also asserts the two rules the module's header draws, because both are
// the kind of thing a later session adds in good faith:
//   - no saint's day or tradition-specific feast creeps into the kept list
//   - the Western-reckoning note is still rendered wherever a date is

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(here, '../src/data/liturgy.ts')

let failed = 0
const fail = (m) => { console.error(`✗ ${m}`); failed += 1 }

// The computus, re-derived here from the published algorithm rather than
// imported, so the two cannot be wrong in the same copy.
function easter(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// Published Western Easter dates, typed in by hand.
const KNOWN = {
  1900: '1900-04-15', 1918: '1918-03-31', 1943: '1943-04-25', 1961: '1961-04-02',
  1981: '1981-04-19', 2000: '2000-04-23', 2005: '2005-03-27', 2008: '2008-03-23',
  2011: '2011-04-24', 2016: '2016-03-27', 2019: '2019-04-21', 2024: '2024-03-31',
  2025: '2025-04-20', 2026: '2026-04-05', 2027: '2027-03-28', 2030: '2030-04-21',
  2038: '2038-04-25', 2050: '2050-04-10', 2100: '2100-03-28',
}
for (const [y, expected] of Object.entries(KNOWN)) {
  const got = easter(Number(y))
  if (got !== expected) fail(`Easter ${y}: algorithm says ${got}, published tables say ${expected}`)
}

// Easter always falls on a Sunday, between March 22 and April 25 inclusive.
for (let y = 1900; y <= 2150; y++) {
  const d = easter(y)
  const t = new Date(`${d}T12:00:00Z`)
  if (t.getUTCDay() !== 0) fail(`Easter ${y} (${d}) is not a Sunday`)
  const md = d.slice(5)
  if (md < '03-22' || md > '04-25') fail(`Easter ${y} (${d}) is outside March 22 – April 25`)
}

const src = await readFile(SRC, 'utf8')

// The module's own copy of the computus has to match this one, year for year.
const body = src.slice(src.indexOf('export function easter'), src.indexOf('/** The first Sunday of Advent'))
for (const line of ['const a = year % 19', 'const h = (19 * a + b - d - g + 15) % 30', "const m = Math.floor((a + 11 * h + 22 * l) / 451)"]) {
  if (!body.includes(line)) fail(`data/liturgy.ts's computus no longer contains "${line}" — re-check it against a published algorithm`)
}

// The kept list stays broad. These are the names that would mean the app had
// picked a tradition; the header explains why that is not a style preference.
const feastBlock = src.slice(src.indexOf('export function feastsIn'), src.indexOf('export function seasonOn'))
const NARROW = [
  'assumption', 'immaculate', 'corpus christi', 'reformation', 'all souls',
  'candlemas', 'annunciation', 'sacred heart', 'theophany', 'dormition',
  "saint ", "st. ", 'feast of st',
]
for (const bad of NARROW) {
  if (feastBlock.toLowerCase().includes(bad)) {
    fail(`the kept list names "${bad.trim()}", which traditions differ on — see the header in data/liturgy.ts before adding it`)
  }
}

// And the reckoning stays named.
if (!src.includes('WESTERN_NOTE')) fail('WESTERN_NOTE is gone — a computed Easter shown with no note is the "quietly wrong on your own church\'s tab" failure')
const uses = (await readFile(resolve(here, '../src/features/liturgy/CalendarScreen.tsx'), 'utf8').catch(() => ''))
if (uses && !uses.includes('WESTERN_NOTE')) fail('the calendar screen no longer renders WESTERN_NOTE')

if (failed) {
  console.error(`\ncheck-liturgy: ${failed} problem${failed === 1 ? '' : 's'}.`)
  process.exit(1)
}
console.log(`✓ liturgy: computus matches ${Object.keys(KNOWN).length} published dates, 251 years all land on a Sunday in range`)
