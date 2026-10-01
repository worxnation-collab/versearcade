// The week's two prepack tables, checked against the real files.
//
// Every failure here RENDERS. A moment whose painting is missing draws an
// empty window; a figure whose skin 404s is a post with nobody in it; a
// citation naming a book that does not exist is a wrong reference burned onto
// an end card as scripture. None of it throws and none of it fails to
// compile — the check-trivia habit.
//
// Read by TEXT rather than imported, like check-map, so the rule exists twice.
import fs from 'node:fs'

const BOOKS = fs.readFileSync('src/data/bible/pool.ts', 'utf8')
  .match(/export const BIBLE_BOOKS: string\[\] = \[([\s\S]*?)\n\]/)?.[1]
const books = new Set([...(BOOKS ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]))
if (books.size !== 66) { console.error(`check-week: parsed ${books.size} books, expected 66`); process.exit(1) }
// The pool cites Psalm 23:1 where the book is Psalms; structure.ts translates.
books.add('Psalm')

const problems = []

const mom = fs.readFileSync('src/data/tiktokMoments.ts', 'utf8')
const moments = [...mom.matchAll(/\{ id: '([a-z0-9_]+)', title: '([^']*)', reference: '([^']+)'/g)]
if (moments.length < 10) problems.push(`only ${moments.length} moments parsed — the table moved`)
const seenM = new Set()
for (const [, id, title, ref] of moments) {
  if (seenM.has(id)) problems.push(`moment ${id}: listed twice`)
  seenM.add(id)
  if (!fs.existsSync(`public/cards/${id}.webp`)) problems.push(`moment ${id}: no painting at public/cards/${id}.webp`)
  if (!title.trim()) problems.push(`moment ${id}: no title`)
  const m = /^((?:\d\s)?[A-Za-z][A-Za-z ]*?)\s+\d+:\d+(-\d+)?$/.exec(ref)
  if (!m) problems.push(`moment ${id}: "${ref}" is not a reference`)
  else if (!books.has(m[1].trim())) problems.push(`moment ${id}: "${m[1].trim()}" is not one of the 66 books`)
}

const fig = fs.readFileSync('src/data/tiktokFigures.ts', 'utf8')
const figures = [...fig.matchAll(/\{ skin: '([a-z0-9_]+)', name: '([^']*)', reference: '([^']+)', clues: \[([\s\S]*?)\] \}/g)]
if (figures.length < 5) problems.push(`only ${figures.length} figures parsed — the table moved`)
const seenF = new Set()
for (const [, skin, name, ref, clues] of figures) {
  if (seenF.has(skin)) problems.push(`figure ${skin}: listed twice`)
  seenF.add(skin)
  if (!fs.existsSync(`public/skins/${skin}.png`)) problems.push(`figure ${skin}: no render at public/skins/${skin}.png`)
  if (!name.trim()) problems.push(`figure ${skin}: no name`)
  const n = [...clues.matchAll(/'((?:[^'\\]|\\.)+)'/g)].length
  if (n !== 3) problems.push(`figure ${skin}: ${n} clues, expected exactly 3`)
  const m = /^((?:\d\s)?[A-Za-z][A-Za-z ]*?)\s+\d+:\d+(-\d+)?$/.exec(ref)
  if (!m) problems.push(`figure ${skin}: "${ref}" is not a reference`)
  else if (!books.has(m[1].trim())) problems.push(`figure ${skin}: "${m[1].trim()}" is not one of the 66 books`)
  // A clue that names the answer is not a clue.
  const bare = name.toLowerCase()
  if (new RegExp(`\\b${bare}\\b`, 'i').test(clues)) problems.push(`figure ${skin}: a clue says "${name}"`)
}

// The rotation must cover a whole week, or a weekday falls through to nothing.
const wk = fs.readFileSync('src/data/tiktokWeek.ts', 'utf8')
const week = [...(wk.match(/const WEEK = \[([\s\S]*?)\] as const/)?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((m) => m[1])
if (week.length !== 7) problems.push(`the weekday map has ${week.length} entries, expected 7`)
if (!week.includes('story')) problems.push('the weekday map never reaches `story`')

if (problems.length) {
  console.error('check-week FAILED:')
  for (const p of problems) console.error('  ' + p)
  process.exit(1)
}
console.log(`check-week: ${moments.length} moments, ${figures.length} figures, ${week.length} weekdays OK`)
