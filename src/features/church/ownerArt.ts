import type { ChurchTierId } from './levels'

// The owner's own churchyard art (2026-10-21): fourteen plantings (and, until
// 2026-11-12, six buildings), SUPPLIED as finished paintings rather than generated through
// scripts/gen-art.mjs. So this is a hand-kept table and not rows in
// GENERATED_ART, the rewardArt.ts rule: a generator run must never be able to
// overwrite or un-wire them. Each reader checks here first and falls back to
// GENERATED_ART, then to its drawing, so nothing about what a plant or a
// building IS changed: only the picture it is drawn with.
//
// The files arrived as JPEGs with a checkerboard painted in where transparency
// was meant to be. They were cut to real alpha before landing in public/.

const FLORA: Record<string, string> = {
  yard_planters: '/keep/churchyard/planters.png',
  yard_ivy: '/keep/churchyard/ivy.png',
  yard_marigolds: '/keep/churchyard/marigolds.png',
  yard_lavender: '/keep/churchyard/lavender.png',
  yard_lilies: '/keep/churchyard/lilies.png',
  yard_olive: '/keep/churchyard/olive.png',
  yard_rosebush: '/keep/churchyard/roses.png',
  yard_bench: '/keep/churchyard/bench.png',
  yard_hedge: '/keep/churchyard/hedge.png',
  yard_birdbath: '/keep/churchyard/birdbath.png',
  yard_lamp: '/keep/churchyard/lamp.png',
  yard_wisteria: '/keep/churchyard/wisteria.png',
  yard_sunflowers: '/keep/churchyard/sunflowers.png',
  yard_dogwood: '/keep/churchyard/dogwood.png',
}

export const ownerFloraArt = (id: string): string | undefined => FLORA[id]

// The buildings (2026-11-12): one painting per (skin, tier), 32 in all, from
// scripts/gen-churchyard.py `ladder` — every tier an edit of the one below it,
// so a church visibly GROWS as it levels and each skin looks like its blurb.
// They replaced the owner's six, which drew levels 8-26 as one building (the
// twin spires, the cathedral and the golden dome the ladder promises were
// never drawn) and gave the tile and classic skins the same stone chapel.
// An unknown skin (null, `custom`) falls through to GENERATED_ART and then to
// the drawn kit, by the road it always took.
const SKINS_DRAWN = new Set(['tile', 'classic', 'modern', 'glass'])

export function ownerBuildingArt(skinId: string, tier: ChurchTierId): string | undefined {
  return SKINS_DRAWN.has(skinId) ? `/church/buildings/${skinId}-${tier}.png` : undefined
}

// The owner's statues (2026-10-21), the same hand-kept rule as the plantings.
const S = (name: string) => `/keep/churchyard/statues/${name}.png`
const STATUES: Record<string, string> = {
  statue_shepherd: S('good-shepherd'),
  statue_mary: S('virgin-mary'),
  statue_moses: S('moses'),
  statue_angel: S('guardian-angel'),
  statue_david: S('david'),
  statue_dove: S('descending-dove'),
  statue_tomb: S('empty-tomb'),
  statue_lion_lamb: S('lion-and-lamb'),
  statue_praying: S('praying-figure'),
  statue_cross: S('stone-cross'),
}

export const ownerStatueArt = (id: string): string | undefined => STATUES[id]
