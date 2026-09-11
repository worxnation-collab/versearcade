// Every figure the cast can return must have a render, and every verse must
// reach a figure.
//
// Both failures RENDER. A cast id with no PNG is a reader who silently does
// not appear — the post still builds, still captions, still posts, and the
// one thing it is built around is a blank centre. A verse that reaches no
// figure at all is the same hole arriving a different way. Neither throws and
// neither shows up in a diff, which is the `check-trivia` habit: assert it in
// the build.
//
// The rules are re-derived here by reading the data rather than by importing
// the resolver, so a bug in `castFor` cannot mark its own homework.

import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const fail = (m) => { console.error('check-cast:', m); process.exitCode = 1 }

const cast = read('src/data/tiktokCast.ts')
const pool = read('src/data/bible/pool.ts')

// The ids the resolver can return: every value in either table, plus the two
// fallbacks. Pulled by text so this script and the module stay independent.
const ids = new Set()
for (const block of ['SPEAKER_FIGURE', 'BOOK_FIGURE']) {
  const i = cast.indexOf(`export const ${block}`)
  if (i < 0) { fail(`${block} not found`); continue }
  const body = cast.slice(i, cast.indexOf('\n}', i))
  for (const m of body.matchAll(/:\s*'([a-z0-9_]+)'/g)) ids.add(m[1])
}
const fb = cast.slice(cast.indexOf('const FALLBACK'), cast.indexOf('\n', cast.indexOf('const FALLBACK')) + 1)
for (const m of fb.matchAll(/'([a-z0-9_]+)'/g)) ids.add(m[1])
if (ids.size < 20) fail(`only ${ids.size} cast ids parsed — the tables moved`)

const missing = [...ids].filter((id) => !fs.existsSync(path.join(root, 'public/skins', `${id}.png`)))
if (missing.length) fail(`${missing.length} cast figure(s) have no render in public/skins: ${missing.join(', ')}`)

// Every book the pool uses must be in BOOK_FIGURE, because the book map is the
// catch-all: a verse whose speaker is unnamed AND whose book is unmapped is
// the only way to reach the generic fallback, and on a pool this curated that
// is a gap rather than a long tail.
// `book:` sits MID-LINE in the pool (`reference: 'Genesis 1:1', book: 'Genesis', …`),
// so an anchored pattern matches nothing and this check quietly passes on an
// empty set — which it did, reporting "0 books OK". A checker that validates
// nothing is worse than no checker, so the count is asserted below.
const books = new Set([...pool.matchAll(/\bbook:\s*'([^']+)'/g)].map((m) => m[1]))
if (books.size < 40) fail(`only ${books.size} books parsed from the pool — the pattern stopped matching`)
const bookBlock = cast.slice(cast.indexOf('export const BOOK_FIGURE'), cast.indexOf('\n}', cast.indexOf('export const BOOK_FIGURE')))
const mapped = new Set([...bookBlock.matchAll(/(?:^|[{,\s])'?([A-Za-z0-9 ]+?)'?\s*:\s*'[a-z0-9_]+'/gm)].map((m) => m[1].trim()))
const unmapped = [...books].filter((b) => !mapped.has(b))
if (unmapped.length) fail(`${unmapped.length} book(s) in the pool have no figure: ${unmapped.join(', ')}`)

if (!process.exitCode) console.log(`check-cast: ${ids.size} figures, ${books.size} books OK`)
