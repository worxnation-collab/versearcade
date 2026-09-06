import { motion } from 'framer-motion'
import type { PlayResult, Question } from '@/types'

// What you'll know next time.
//
// Every wrong answer in this app already comes with a teach line, and then the
// run navigated away and the result screen showed a score. The one thing the
// app promises — "a wrong answer still teaches you something" — was never
// collected anywhere. This is that collection: the questions that went wrong,
// with the answer and the fact, on the screen where a player is actually
// looking back.
//
// It is framed as what was LEARNED, never as what was failed. No "3 wrong", no
// red, no ✗: a miss is a fact you now know, so the heading counts facts. A
// perfect run renders nothing — it has nothing to teach and a tick on a clean
// screen is the checklist this app doesn't keep.
export function MissedList({ questions, result }: { questions: Question[]; result: PlayResult }) {
  const missed = result.perQuestion
    .map((p, i) => ({ p, q: questions[i] }))
    .filter(({ p, q }) => q && !p.correct)
  if (!missed.length) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="card"
      style={{ marginTop: 16, textAlign: 'left', borderColor: 'rgba(94,231,223,0.45)', background: 'rgba(94,231,223,0.06)' }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>💡</span>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--sky)' }}>
          {missed.length === 1 ? 'One thing you now know' : `${missed.length} things you now know`}
        </b>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {missed.map(({ p, q }, i) => (
          <div key={i} style={{ paddingTop: i === 0 ? 0 : 10, borderTop: i === 0 ? 0 : '1px solid var(--stroke)' }}>
            <p className="faint" style={{ margin: 0, fontSize: 12, lineHeight: 1.4 }}>{q.prompt}</p>
            <p style={{ margin: '3px 0 0', fontSize: 14.5, fontWeight: 800, lineHeight: 1.35 }}>
              {q.options[q.answerIndex]}
              {p.choiceIndex >= 0 && p.choiceIndex !== q.answerIndex && (
                <span className="faint" style={{ fontWeight: 400, fontSize: 12 }}> · you said {q.options[p.choiceIndex]}</span>
              )}
            </p>
            <p className="dim" style={{ margin: '3px 0 0', fontSize: 13, lineHeight: 1.45 }}>{q.teach}</p>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

/** Wrap in curly quotes unless the text already opens with a quotation mark —
 *  a verse that begins with speech was rendering as “"Futility…"”. */
export function quoted(text: string): string {
  const t = text.trim()
  return /^["“‘']/.test(t) ? t : `“${t}”`
}
