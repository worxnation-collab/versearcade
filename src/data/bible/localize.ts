// A run played in the player's own Bible.
//
// `generateQuestions` deals from the bundled BSB, and seven of its nine
// question kinds are about FACTS no translation changes — who spoke, to whom,
// what happens around it, the theme, the reference, the book. Only the
// fill-in-the-blanks depend on wording, and they are tagged (`Question.blank`).
// So a translated run is the same deal with exactly those rewritten:
//
//   - If the BSB answer is also in the translated verse, the prompt becomes the
//     translated verse with that word blanked. Answer and options unchanged.
//   - If it isn't (a dynamic translation rarely keeps every word), a different
//     word is taken from the translated verse, chosen by a seed of the run's
//     own id + translation, so a reload — or a second player on the same
//     date in the same Bible — gets the identical question. It takes the old
//     answer's SLOT among the options, so option order is unchanged too.
//
// The deal itself (which questions, in what order, which distractors) never
// moves, because the rewrite consumes no rng from the generator. That is the
// property the shared daily drop rests on.
//
// It fails closed as a whole: if any blank cannot be rewritten so that it is
// unambiguously answerable, the run is played in the BSB exactly as before. A
// run with four questions in the NLT and one quoting the BSB would be worse
// than either.

import type { Question } from '@/types'
import { STOP_WORDS, hashString, mulberry32 } from './questions'

const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const wordRe = (w: string) => new RegExp(`\\b${escape(w)}\\b`, 'gi')

/** Lower-case content words a blank could be cut from, in text order. A word
 *  that ever appears capitalised is left out: it is a name or a sentence
 *  opener, and against lower-case distractors a capital gives the answer away. */
function candidates(text: string): string[] {
  const all = text.match(/\b[A-Za-z]{5,}\b/g) ?? []
  const capitalised = new Set(all.filter((w) => /^[A-Z]/.test(w)).map((w) => w.toLowerCase()))
  const seen = new Set<string>()
  const out: string[] = []
  for (const w of all) {
    const lw = w.toLowerCase()
    if (capitalised.has(lw) || STOP_WORDS.has(lw) || seen.has(lw)) continue
    seen.add(lw)
    out.push(lw)
  }
  return out
}

function blanked(text: string, word: string): string {
  return `Fill the blank: "${text.replace(wordRe(word), '_____')}"`
}

/** The rewritten question still asks something with exactly one right answer. */
function answerable(q: Question): boolean {
  const answer = q.options[q.answerIndex]
  if (!q.prompt.includes('_____') || wordRe(answer).test(q.prompt)) return false
  const lower = q.options.map((o) => o.toLowerCase())
  return new Set(lower).size === lower.length
}

/**
 * The questions as they read in `text`, or null to play the run in the BSB.
 * `salt` identifies the deal and the translation (e.g. "daily:2026-10-21|kjv").
 */
export function localizeQuestions(questions: Question[], text: string, salt: string): Question[] | null {
  const clean = text.replace(/¶/g, ' ').replace(/\s+/g, ' ').trim()
  if (!clean) return null
  const pool = candidates(clean)
  const used = new Set<string>()
  const out: Question[] = []

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i]
    if (!q.blank) { out.push(q); continue }

    const answer = q.options[q.answerIndex]
    let next: Question | null = null

    if (!used.has(answer.toLowerCase()) && wordRe(answer).test(clean)) {
      next = { ...q, prompt: blanked(clean, answer) }
    } else {
      const others = new Set(q.options.filter((_, k) => k !== q.answerIndex).map((o) => o.toLowerCase()))
      const open = pool.filter((w) => !used.has(w) && !others.has(w))
      // Prefer a word with some weight to it ("shout", "saviour") over a
      // five-letter connective ("having"), when the verse offers a few.
      const weighty = open.filter((w) => w.length >= 6)
      const choices = weighty.length >= 3 ? weighty : open
      if (choices.length) {
        const rng = mulberry32(hashString(`${salt}#${i}`))
        const word = choices[Math.floor(rng() * choices.length)]
        const options = q.options.slice()
        options[q.answerIndex] = word
        // Only the answer sentence changes; what teachMore added after it
        // (the theme, a fact) is about the verse, not the word, and stays.
        const rest = q.teach.replace(/^The missing word is "[^"]*\."\s*/, '')
        next = { ...q, prompt: blanked(clean, word), options, teach: [`The missing word is "${word}."`, rest].filter(Boolean).join(' ') }
      }
    }

    if (!next || !answerable(next)) return null
    used.add(next.options[next.answerIndex].toLowerCase())
    out.push(next)
  }
  return out
}
