// Study-topic catalog check. Runs as part of `npm run build`.
//
// src/data/studyTopics.ts anchors each curated topic ("The Beatitudes",
// "Advent") to real passages, and a week of church drafts is built from exactly
// those verses. Every failure here RENDERS: a passage that runs past the end of
// its chapter fetches fewer verses than it names, a two-chapter span is refused
// by `church-draft` only after the leader pressed the button, and a topic over
// the verse budget overflows the function's 6,000-character scripture cap. So
// they are a build failure, re-derived from the source text rather than by
// importing the checker (`checkStudyTopics()` asserts the same in dev).

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const structure = await readFile(resolve(here, '../src/data/bible/structure.ts'), 'utf8')
const src = await readFile(resolve(here, '../src/data/studyTopics.ts'), 'utf8')

const counts = new Map()
for (const [, book, row] of structure.slice(structure.indexOf('VERSES_PER_CHAPTER')).matchAll(/'([^']+)':\s*'([\d,]+)',/g)) {
  counts.set(book, row.split(',').map(Number))
}
const CANON = { 'Psalm': 'Psalms', 'Song of Songs': 'Song of Solomon' }
const VERSES_MAX = Number(/TOPIC_VERSES_MAX = (\d+)/.exec(src)?.[1])
const PASSAGES_MAX = Number(/TOPIC_PASSAGES_MAX = (\d+)/.exec(src)?.[1])

const errors = []
if (!VERSES_MAX || !PASSAGES_MAX) errors.push('could not read TOPIC_VERSES_MAX / TOPIC_PASSAGES_MAX')

const rows = [...src.matchAll(/\{ id: '([^']+)', label: '([^']+)'.*?passages: \[([^\]]*)\]/g)]
if (rows.length < 20) errors.push(`only ${rows.length} curated topics found — did the shape change?`)
const ids = new Set()
for (const [, id, , list] of rows) {
  if (ids.has(id)) errors.push(`${id}: duplicate id`)
  ids.add(id)
  const refs = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1])
  if (!refs.length) errors.push(`${id}: no passages`)
  if (refs.length > PASSAGES_MAX) errors.push(`${id}: ${refs.length} passages, max ${PASSAGES_MAX}`)
  let total = 0
  for (const ref of refs) {
    const m = /^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/.exec(ref)
    if (!m) { errors.push(`${id}: "${ref}" is not a Book Chapter:Start-End citation`); continue }
    const book = CANON[m[1]] ?? m[1]
    const ch = counts.get(book)
    if (!ch) { errors.push(`${id}: "${ref}" names no book in the structure table`); continue }
    const chapter = Number(m[2]), start = Number(m[3]), end = m[4] ? Number(m[4]) : start
    if (chapter < 1 || chapter > ch.length) { errors.push(`${id}: "${ref}": ${book} has ${ch.length} chapters`); continue }
    if (start < 1 || end < start || end > ch[chapter - 1]) { errors.push(`${id}: "${ref}": ${book} ${chapter} has ${ch[chapter - 1]} verses`); continue }
    if (end - start + 1 > 40) errors.push(`${id}: "${ref}" is over 40 verses`)
    total += end - start + 1
  }
  if (total > VERSES_MAX) errors.push(`${id}: ${total} verses in all, over ${VERSES_MAX}`)
}

// Autopilot's default rotation (0179, SQL) drafts from these same passages
// with no leader in the loop, so every entry must BE a curated topic above,
// passage for passage, and its USFM spans must say the same verses.
{
  const sql = await readFile(resolve(here, '../supabase/migrations/0179_church_autopilot_default.sql'), 'utf8')
  const fn = sql.slice(sql.indexOf('function public.church_autopilot_rotation'), sql.indexOf('as r(ord, id, series, passages)'))
  const entries = [...fn.matchAll(/\(\d+, '([^']+)', '([^']+)', '(\[.*?\])'::jsonb\)/g)]
  if (entries.length < 10) errors.push(`autopilot rotation: only ${entries.length} entries found in 0179 — did the shape change?`)
  const curated = new Map(rows.map(([, id, , list]) => [id, [...list.matchAll(/'([^']+)'/g)].map((m) => m[1])]))
  for (const [, id, , json] of entries) {
    const want = curated.get(id)
    if (!want) { errors.push(`autopilot rotation: "${id}" is not a curated study topic`); continue }
    const got = JSON.parse(json)
    if (got.map((p) => p.reference).join('|') !== want.join('|')) errors.push(`autopilot rotation: "${id}" passages differ from studyTopics.ts`)
    for (const p of got) {
      if (`${p.book} ${p.chapter}:${p.start}-${p.end}` !== p.reference) errors.push(`autopilot rotation: "${id}" span doesn't match "${p.reference}"`)
      if (!/^[1-3]?[A-Z]{2,3}$/.test(p.usfm)) errors.push(`autopilot rotation: "${id}" bad usfm ${p.usfm}`)
    }
  }
  if (!errors.length) console.log(`✓ Autopilot rotation: ${entries.length} entries, each a curated topic`)
}

if (errors.length) {
  console.error('\n✖ Study topic check failed:\n')
  for (const e of errors) console.error(`  - ${e}`)
  console.error('')
  process.exit(1)
}
console.log(`✓ Study topics: ${rows.length} curated topics, every passage real and inside one chapter`)
