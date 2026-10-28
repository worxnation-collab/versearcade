import { motion } from 'framer-motion'
import { useSettings } from '@/store/settings'
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
//
// `featured` is the low-score form (0 or 1 right, ResultScreen decides): on the
// run where a player is likeliest to feel behind, the facts — not the score —
// are the peak of the screen. Each fact becomes its own small card that arrives
// like something handed over (a soft spring, staggered), with a warm header
// that says nothing was lost. Kept tight on purpose: a zero run's five facts
// have to fit on a 390px phone under a compact score without scrolling.
export function MissedList({ questions, result, featured = false }: { questions: Question[]; result: PlayResult; featured?: boolean }) {
  const reduceMotion = useSettings((s) => s.reduceMotion)
  // A run played in another Bible carries its own questions: its blanks were
  // cut from that text, and `choiceIndex` only means anything against those.
  const asPlayed = result.questions ?? questions
  const missed = result.perQuestion
    .map((p, i) => ({ p, q: asPlayed[i] }))
    .filter(({ p, q }) => q && !p.correct)
  if (!missed.length) return null

  if (featured) {
    const all = missed.length === result.perQuestion.length
    return (
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: reduceMotion ? 0 : 0.25 }}
        style={{ marginTop: 14, textAlign: 'left' }}
        aria-label="Things you now know"
      >
        <div style={{ textAlign: 'center', marginBottom: 10 }}>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--sky)', display: 'block', lineHeight: 1.2 }}>
            💡 {missed.length === 1 ? 'One thing you now know' : `${missed.length} things you now know`}
          </b>
          <span className="dim" style={{ fontSize: 13 }}>
            {all ? 'Nothing lost — each one is a fact you hadn’t met yet.' : 'Nothing lost — these are yours now.'}
          </span>
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {missed.map(({ p, q }, i) => (
            <motion.div
              key={i}
              className="card"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.97 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              transition={reduceMotion ? { duration: 0.2, delay: 0.3 } : { type: 'spring', stiffness: 260, damping: 22, delay: 0.35 + i * 0.12 }}
              style={{
                padding: '10px 12px 10px 14px',
                borderColor: 'rgba(94,231,223,0.45)',
                background: 'linear-gradient(135deg, rgba(94,231,223,0.10), rgba(255,209,102,0.06))',
                boxShadow: '0 6px 18px rgba(0,0,0,0.22)',
                position: 'relative',
              }}
            >
              {/* A thin gold ribbon down the left edge: the gift, without a bow. */}
              <span aria-hidden style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 3, background: 'var(--gold)', opacity: 0.8 }} />
              <p style={{ margin: 0, fontSize: 15, fontWeight: 800, lineHeight: 1.3 }}>{q.options[q.answerIndex]}</p>
              <p style={{ margin: '3px 0 0', fontSize: 13.5, lineHeight: 1.4, color: 'var(--ink)' }}>{q.teach}</p>
              <p className="faint" style={{ margin: '3px 0 0', fontSize: 11.5, lineHeight: 1.35 }}>
                {q.prompt}
                {p.choiceIndex >= 0 && p.choiceIndex !== q.answerIndex && <> · you said {q.options[p.choiceIndex]}</>}
              </p>
            </motion.div>
          ))}
        </div>
      </motion.section>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
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
