// The one-question challenge's QUESTION for a date and slot — pure, so the
// dashboard, the browser renderer and the two node runners (the morning
// maker and the comment replier) all agree which of the day's five a post
// asked. Two slots sit two apart in the five, so the morning's and the
// afternoon's are never the same question.
//
// No React, no stores, nothing but the verse data: scripts/tiktok-replies.mjs
// bundles this file alone with esbuild and runs it in Node.

import { getVerseForDate } from '@/data/bible/questions'

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

/** Which of the day's five each slot asks: two apart, so the two slots never share one. */
export function challengeIndex(date: string, slot: 1 | 2, n: number): number {
  return (hash(`${date}:challenge`) + (slot - 1) * 2) % Math.max(1, n)
}

export interface ChallengeQuestion {
  reference: string
  index: number
  prompt: string
  options: string[]
  answerIndex: number
  teach: string
}

/** The question a challenge post of that date and slot asked, with its answer and teach line. */
export function challengeQuestion(date: string, slot: 1 | 2): ChallengeQuestion {
  const v = getVerseForDate(date)
  const index = challengeIndex(date, slot, v.questions.length)
  const q = v.questions[index]
  return { reference: v.reference, index, prompt: q.prompt, options: q.options, answerIndex: q.answerIndex, teach: q.teach }
}
