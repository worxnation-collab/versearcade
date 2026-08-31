import { PAPER } from '@/features/bible/paper'
import type { TapSurface } from './TapRunner'
import { WORD_PLOTS, type WordCatch } from './wordCatch'

// How Word Catch looks: a page, and the words that came off it.
//
// Manna Rush is a wilderness at dawn; this is paper. That is not decoration —
// it is the app's own rule that the inside of the book looks like a book
// (features/bible/paper.ts), applied to the one arcade game that is made of
// scripture rather than set in it. It also means the two games are told apart
// in a glance from across a room, which matters on a cabinet with a menu.
//
// Every colour here comes from PAPER. The dark-arcade tokens are wrong on cream
// and the paper tokens are wrong everywhere else, which is exactly why they are
// two sets.

/** Deterministic, so a word does not re-tilt on every render. */
const tiltOf = (i: number) => ((i * 37) % 9) - 4

export function wordCatchSurface(
  wc: WordCatch,
  { reduceMotion }: { reduceMotion: boolean },
): TapSurface {
  const { words, lineStarts, lineEnds } = wc

  return {
    plots: WORD_PLOTS,

    field: (
      <>
        <div style={{ position: 'absolute', inset: 0, background: PAPER.page }} />
        <div className={reduceMotion ? 'arcade-rules arcade-still' : 'arcade-rules'} />
        <div className="arcade-gutter" />
      </>
    ),

    // A word is read, not spotted, so its box is as wide as the word and the
    // 46px square a flake wants would clip most of them.
    targetStyle: { width: 'auto', height: 'auto', minHeight: 44, minWidth: 44 },

    // Paper has no horizon. Manna Rush's 44% is where its sky meets its sand;
    // here it would just be 200px of page nothing can land on.
    fieldTop: '26%',

    progress: ({ round, taken }) => {
      const start = lineStarts[round] ?? 0
      const end = lineEnds[round] ?? words.length
      const next = start + taken
      return (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'baseline',
            gap: '10px 9px',
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 20,
            lineHeight: 1.5,
            color: PAPER.ink,
          }}
        >
          <>
            {words.slice(start, end).map((w, i) => {
              const idx = start + i
              if (idx < next) return <span key={idx}>{w}</span>
              const isNext = idx === next
              return (
                <span
                  key={idx}
                  className={isNext ? 'word-slot' : undefined}
                  style={{
                    display: 'inline-block',
                    // The blank is as wide as the word it waits for. Showing
                    // the shape of what is coming is the difference between
                    // recalling a verse and guessing at one.
                    width: Math.max(22, w.length * 10),
                    height: 3,
                    marginBottom: 5,
                    borderRadius: 2,
                    background: isNext ? PAPER.accent : PAPER.rule,
                  }}
                />
              )
            })}
          </>
        </div>
      )
    },

    renderTarget: ({ kind, taken, leaving }) => {
      const idx = Number(kind)
      return (
        <span
          className={`tap-word${taken ? ' is-taken' : ''}${leaving ? ' is-leaving' : ''}${
            reduceMotion ? ' arcade-still' : ''
          }`}
          style={{
            padding: '9px 13px',
            borderRadius: 9,
            background: 'rgba(255,255,255,0.78)',
            border: `1px solid ${PAPER.rule}`,
            boxShadow: '0 2px 0 rgba(58,44,22,0.14), 0 5px 12px rgba(58,44,22,0.12)',
            color: PAPER.ink,
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 17,
            whiteSpace: 'nowrap',
            transform: `rotate(${tiltOf(idx)}deg)`,
          }}
        >
          {words[idx] ?? ''}
        </span>
      )
    },
  }
}
