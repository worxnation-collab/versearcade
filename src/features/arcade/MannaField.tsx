import type { TapSurface } from './TapRunner'
import { MANNA_PLOTS } from './manna'

// How Manna Rush looks. Rules are manna.ts; this file is only the picture.
//
// The wilderness is drawn, not generated — same bargain the Upper Room's
// furnishings make. If it ever becomes a Nano Banana painting it goes in as a
// `kind: 'scene'` manifest layered OVER this, so a build without the render
// still shows a desert at dawn rather than an empty box.
//
// The two things on the ground are close in colour on purpose: that is the
// difficulty. What separates them is shape (round vs irregular), lustre
// (glowing vs matte) and motion (breathing vs twitching), which is why the
// house "never ride on colour alone" rule is satisfied more strictly here than
// anywhere else in the app, not less. See the arcade block in index.css.

export function mannaSurface({ reduceMotion }: { reduceMotion: boolean }): TapSurface {
  const still = reduceMotion ? ' arcade-still' : ''
  return {
    plots: MANNA_PLOTS,
    field: (
      <>
        <div className="arcade-sky" />
        <div className={`arcade-stars${still}`} />
        <div className="arcade-ground" />
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
