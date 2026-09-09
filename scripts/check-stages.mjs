// Every story stage has a painting, and `own.jpg` is there.
//
// A declared stage with no file does not throw and does not fail to compile:
// Gemini picks it, `sanitizeStages` keeps it (it IS an id this build carries),
// `loadStages` 404s, and the paragraph is quietly told in the library. The
// post looks fine and one of the ten stages simply never appears — the
// check-trivia shape of failure, so it is a build failure here rather than
// something somebody notices in a month of MP4s.
//
// It reads the real list out of src/data/tiktokStages.ts by text rather than
// importing it, for the reason check-map does: a second copy of the rule is
// the point.
import fs from 'node:fs'

const src = fs.readFileSync('src/data/tiktokStages.ts', 'utf8')
const block = src.match(/export const STORY_STAGES: StageDef\[\] = \[([\s\S]*?)\n\]/)
if (!block) { console.error('check-stages: could not find STORY_STAGES'); process.exit(1) }
const ids = [...block[1].matchAll(/\bid:\s*'([a-z0-9_-]+)'/g)].map((m) => m[1])
if (ids.length < 4) { console.error(`check-stages: only ${ids.length} stages parsed — the list moved`); process.exit(1) }

const problems = []
const seen = new Set()
for (const id of ids) {
  if (seen.has(id)) problems.push(`${id}: listed twice`)
  seen.add(id)
  const f = `public/tiktok/stages/${id}.jpg`
  if (!fs.existsSync(f)) problems.push(`${id}: no painting at ${f}`)
  else if (fs.statSync(f).size < 4096) problems.push(`${id}: ${f} is ${fs.statSync(f).size}B — did the render fail?`)
}
// The operator's own stage is not in the list (it is not a place a story is
// set) and is just as load-bearing: without it his half falls back to his
// photo over the library.
if (!fs.existsSync('public/tiktok/stages/own.jpg')) problems.push('own: no dark stage at public/tiktok/stages/own.jpg')

if (problems.length) {
  console.error('check-stages FAILED:')
  for (const p of problems) console.error('  ' + p)
  process.exit(1)
}
console.log(`check-stages: ${ids.length} stages + own OK`)
