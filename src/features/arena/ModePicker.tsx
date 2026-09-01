import { motion } from 'framer-motion'
import { useJuice } from '@/juice/useJuice'
import { MODE_BLURB, MODE_LABEL, type BattleMode } from './battle'

// Which round this battle deals — one control, used by every surface where a
// person chooses, so the wording and the shape can't drift between them.
//
// The same choke-point habit as `QuizRunner` and `WashFeetButton`. There are
// only two places today (a challenge and a CPU race) and that is exactly when
// copying is cheapest and worst: a third surface arrives, copies whichever one
// it found first, and now three screens disagree about what a trivia battle is.
//
// It is deliberately NOT on the live screens. A live match derives its mode from
// the room (`modeForRoom`) so that neither device decides for the other, and a
// picker there would be a control that either lies or breaks the rematch rule.
// `ModeNote` is what those screens show instead: the same words, stated rather
// than offered.
export function ModePicker({
  value,
  onChange,
}: {
  value: BattleMode
  onChange: (m: BattleMode) => void
}) {
  const juice = useJuice()
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {(['verse', 'trivia'] as const).map((m) => {
          const on = value === m
          return (
            <motion.button
              key={m}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                if (on) return
                juice.select()
                onChange(m)
              }}
              aria-pressed={on}
              className="card"
              style={{
                padding: '10px 12px',
                textAlign: 'center',
                cursor: 'pointer',
                borderColor: on ? 'var(--gold)' : 'var(--stroke)',
                background: on ? 'rgba(255,210,63,0.10)' : undefined,
                color: 'var(--ink)',
              }}
            >
              <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>{MODE_LABEL[m]}</b>
            </motion.button>
          )
        })}
      </div>
      {/* One line about the CHOSEN one rather than two lines comparing them:
          this is a flavour, not a difficulty, and setting the two side by side
          in prose invites reading one as the harder or better round. */}
      <p className="faint" style={{ fontSize: 12, marginTop: 8, lineHeight: 1.45, textAlign: 'center' }}>
        {MODE_BLURB[value]}
      </p>
    </div>
  )
}

/** The same thing stated, where the room decided it and nobody is choosing. */
export function ModeNote({ mode }: { mode: BattleMode }) {
  return (
    <p className="faint" style={{ fontSize: 12, lineHeight: 1.45, textAlign: 'center', marginTop: 8 }}>
      <b style={{ color: 'var(--ink)' }}>{MODE_LABEL[mode]}</b> — {MODE_BLURB[mode]}
    </p>
  )
}
