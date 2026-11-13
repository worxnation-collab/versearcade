import type { Question } from '@/types'
import { BIBLE_BOOKS, VERSE_POOL } from './pool'
import { hashString, mulberry32 } from './questions'
import { parseReference } from '@/lib/bibleProgress'

// Five questions from a reference and its words ALONE — for a church leader
// typing a verse by hand that the arcade's library doesn't carry (2026-11-13).
// The hand form was five blank cards of four answers and an explanation each,
// ~3,300px on a phone; the only shortcut was the paid drafting add-on. The
// library's generator needs a seed's speaker, audience and context, which a
// typed verse doesn't have, so this asks only what the words and the citation
// can answer, and every question still teaches on a miss:
//
//   1. which book it is from,   2. its reference,   3-5. three fill-the-blanks.
//
// Deterministic per (reference, text), so the same typed verse gives the same
// five every time. Returns null when the verse has fewer than three words
// worth blanking — the form then asks the leader to write them.

const STOP = new Set(('the and that for with you your yours his her their they them this those these from have has had were was will shall unto upon into over under then than who whom whose what when where which while there here also not but are our ours out all any can may might must one been being him she its it’s it\'s let lord god because before after about every even into just like more most much never only other same such some through very would could should said says says thee thou thy thine hath doth ye yea nor').split(' '))

const clean = (w: string) => w.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '')

/** Words of the pool's verses, by length, as wrong options for a blank. */
let POOL_WORDS: string[] | null = null
function poolWords(): string[] {
  if (POOL_WORDS) return POOL_WORDS
  const seen = new Set<string>()
  for (const v of VERSE_POOL) for (const raw of v.text.split(/\s+/)) {
    const w = clean(raw)
    // ordinary words only: a name ("Hezekiah") lower-cased is a wrong option that looks wrong
    if (w.length >= 4 && /^[a-z]+$/.test(w) && !STOP.has(w)) seen.add(w)
  }
  POOL_WORDS = [...seen]
  return POOL_WORDS
}

function shuffle<T>(xs: T[], rng: () => number): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

function mc(prompt: string, right: string, wrong: string[], teach: string, rng: () => number): Question {
  const options = shuffle([right, ...wrong.slice(0, 3)], rng)
  return { prompt, options, answerIndex: options.indexOf(right), teach }
}

export function autoQuestions(reference: string, text: string): Question[] | null {
  const ref = parseReference(reference)
  const words = text.trim()
  if (!ref || !words) return null
  const rng = mulberry32(hashString(`auto-q:${reference.trim()}:${words}`))
  const cite = reference.trim()

  // 1. the book
  const otherBooks = shuffle(BIBLE_BOOKS.filter((b) => b !== ref.book), rng)
  const q1 = mc('Which book of the Bible is this verse from?', ref.book, otherBooks, `This verse is ${cite}, from the book of ${ref.book}.`, rng)

  // 2. the reference: other citations from the pool, never this one
  const refs = shuffle([...new Set(VERSE_POOL.map((v) => v.reference))].filter((r) => r !== cite), rng)
  const q2 = mc('What is the reference for this verse?', cite, refs, `This verse is ${cite}.`, rng)

  // 3-5. three different words, longest first among the meaningful ones
  const tokens = words.split(/\s+/)
  // letters only (no "LORD’s"), and not a word in capitals (LORD, a name in caps)
  const candidates = [...new Set(tokens.map(clean).filter((w) => w.length >= 4 && /^[A-Za-z]+$/.test(w) && w !== w.toUpperCase() && !STOP.has(w.toLowerCase())))]
  if (candidates.length < 3) return null
  const picks = shuffle(candidates.sort((a, b) => b.length - a.length).slice(0, 8), rng).slice(0, 3)
  const pool = poolWords()
  const blanks = picks.map((w) => {
    const lower = w.toLowerCase()
    const near = shuffle(pool.filter((p) => p !== lower && Math.abs(p.length - w.length) <= 2 && !candidates.some((c) => c.toLowerCase() === p)), rng)
    const caseLike = (p: string) => (w[0] === w[0].toUpperCase() ? p[0].toUpperCase() + p.slice(1) : p)
    const blanked = tokens.map((t) => (clean(t).toLowerCase() === lower ? t.replace(clean(t), '_____') : t)).join(' ')
    return mc(`Fill the blank: "${blanked}"`, w, near.slice(0, 3).map(caseLike), `The missing word is "${w}."`, rng)
  })
  return [q1, q2, ...blanks]
}
