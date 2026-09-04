import { motion } from 'framer-motion'
import { pollShares } from '@/data/poll'

// How the crowd answered one question — four bars under the feedback card.
//
// It shows the SPLIT and marks two things on it: the right answer and the one
// you picked. It never leads with "only 12% got this": the split is the fact,
// the crowd is company, and the reader can do the arithmetic if they want it.
// Rendered only on the feedback phase, only for a question the server has
// released (see data/poll.ts), and the player's own answer is folded in so
// the bars include the tap that was just made.

export function AnswerPoll({
  counts,
  options,
  answerIndex,
  chosenIndex,
}: {
  counts: number[]
  options: string[]
  answerIndex: number
  /** -1 when the clock ran out — then nothing is marked as yours. */
  chosenIndex: number
}) {
  const shares = pollShares(counts)
  const total = counts.reduce((s, n) => s + n, 0)
  if (total <= 0) return null
  const yourShare = chosenIndex >= 0 ? shares[chosenIndex] : null

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <span className="dim" style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase' }}>
          How everyone answered
        </span>
        {/* A wrong answer a quarter of the crowd also gave is company, and
            that is the one thing this line ever says. It never says how
            few. */}
        {yourShare != null && chosenIndex !== answerIndex && yourShare >= 25 && (
          <span className="dim" style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
            you’re in good company
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {options.map((opt, i) => {
          const isAnswer = i === answerIndex
          const isChosen = i === chosenIndex
          const color = isAnswer ? 'var(--good)' : isChosen ? 'var(--grape)' : 'rgba(255,255,255,0.28)'
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '18px 1fr 64px', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{ opacity: 0.6, fontFamily: 'var(--font-display)', fontWeight: 800 }}>{'ABCD'[i]}</span>
              <div style={{ position: 'relative', height: 18, borderRadius: 999, background: 'rgba(0,0,0,0.28)', overflow: 'hidden' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${shares[i]}%` }}
                  transition={{ type: 'spring', stiffness: 120, damping: 20, delay: 0.1 }}
                  style={{ position: 'absolute', inset: 0, width: 0, background: color, borderRadius: 999 }}
                />
                <span
                  style={{
                    position: 'absolute', left: 8, top: 0, lineHeight: '18px', fontWeight: 700,
                    color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 'calc(100% - 16px)',
                    textShadow: '0 1px 2px rgba(0,0,0,0.6)',
                  }}
                >
                  {opt}
                </span>
              </div>
              {/* The marks live OUTSIDE the bar so a long option can't push
                  them off the end: ✅ is the answer, 👉 is the one you gave. */}
              <span style={{ textAlign: 'right', fontFamily: 'var(--font-display)', fontWeight: 800, whiteSpace: 'nowrap', color: isAnswer || isChosen ? '#fff' : 'var(--muted)' }}>
                {isChosen ? '👉' : ''}{isAnswer ? '✅' : ''} {shares[i]}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
