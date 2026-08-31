import type { ReactNode } from 'react'

// The verse a machine hands back when the run is over.
//
// Two games end on scripture — the Cross Word reveals the verse its two words
// came out of, and Word Catch shows the whole verse you have just rebuilt a
// word at a time — so this is one card rather than two that drift. The reason
// it exists at all is the same in both places: the game is the way in, and the
// verse read whole at the end is the thing worth having.
//
// Presentational only. The caller supplies its own motion and its own actions,
// because when it should arrive is part of that screen's pacing.
export function VerseCard({
  reference,
  text,
  note,
  children,
}: {
  reference: string
  text: string
  /** A quiet line under the verse — what just happened, in the player's terms. */
  note?: ReactNode
  /** Keep it, read the chapter, play again — whatever this screen offers. */
  children?: ReactNode
}) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 12.5,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--gold)',
        }}
      >
        {reference}
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 16.5, lineHeight: 1.55 }}>“{text}”</p>
      {note && (
        <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--ink-dim)', lineHeight: 1.45 }}>
          {note}
        </p>
      )}
      {children}
    </div>
  )
}
