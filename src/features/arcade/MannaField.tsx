import { GENERATED_ART } from '@/data/generatedArt'
import type { TapSurface } from './TapRunner'
import { MANNA_PLOTS } from './manna'

// How Manna Rush looks. Rules are manna.ts; this file is only the picture.
//
// The wilderness is a Nano Banana painting (art/arcade.json) laid OVER the
// drawn sky and ground, which is the house rule every render here follows: a
// build whose generation hasn't run shows a desert at dawn rather than an empty
// box. The painting carries the sky, the horizon and the bare sand and NOTHING
// else — no manna, no people, no footprints — because everything the game puts
// on the ground is drawn on top of it, and a painted flake would sit under the
// real ones and be untappable.
//
// The two things on the ground stay drawn, and that is not laziness. They are
// close in colour on purpose (that is the difficulty), and what separates them
// is shape (round vs irregular), lustre (glowing vs matte) and motion
// (breathing vs twitching) — a pair of baked cut-outs would keep the first two
// and lose the third, which is the channel doing the most work. See the arcade
// block in index.css.

export function mannaSurface({ reduceMotion }: { reduceMotion: boolean }): TapSurface {
  const still = reduceMotion ? ' arcade-still' : ''
  const backdrop = GENERATED_ART['arcade_wilderness']
  return {
    plots: MANNA_PLOTS,
    field: (
      <>
        <div className="arcade-sky" />
        <div className={`arcade-stars${still}`} />
        <div className="arcade-ground" />
        {backdrop && (
          <img
            src={backdrop}
            alt=""
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              // The painted horizon sits two-fifths down, which is where the
              // drawn one is and where MANNA_PLOTS start: anchoring anywhere
              // else stands the flakes in the sky.
              objectPosition: 'center center',
            }}
          />
        )}
      </>
    ),
    renderTarget: ({ kind, taken, leaving }) => (
      <i
        className={
          `tap-flake ${kind === 'kept' ? 'kept' : 'manna'}` +
          (taken ? ' is-taken' : '') +
          (leaving ? ' is-leaving' : '') +
          still
        }
      />
    ),
  }
}
