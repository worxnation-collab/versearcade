import freezeIcon from '@/assets/icons/freeze.png'

// Painted icons for road rewards that used to be emoji.
//
// These five were SUPPLIED by the app's owner as finished art (2026-10-21),
// not generated through scripts/gen-art.mjs, which is why they are a
// hand-kept table here rather than rows in the generated GENERATED_ART map —
// a generator run must never be able to overwrite or un-wire them. The source
// files had their "transparency" baked in as a painted checkerboard, so each
// was cut out by flood-filling the light neutral pixels from the border and
// saved as a PNG cut-out in public/keep/ (the freeze ring now comes from the
// later painted icon set in src/assets/icons/, so it matches the streak lines).
//
// Every surface that reads this keeps its old glyph as the fallback, so an id
// with no entry draws exactly what it always did.
export const REWARD_ART: Record<string, string> = {
  title_wayfarer: '/keep/reward_title_wayfarer.png',
  chest_sack: '/keep/reward_chest_sack.png',
  // The white-and-gold ring from the painted icon set (components/PaintedIcon),
  // so the road and the streak lines show the same Streak Freeze.
  freeze: freezeIcon,
  boost: '/keep/reward_boost.png',
  confetti_doves: '/keep/reward_confetti_doves.png',
}

export const rewardArt = (id: string): string | undefined => REWARD_ART[id]
