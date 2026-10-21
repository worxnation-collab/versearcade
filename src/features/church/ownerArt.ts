import type { ChurchTierId } from './levels'

// The owner's own churchyard art (2026-10-21): fourteen plantings and six
// buildings, SUPPLIED as finished paintings rather than generated through
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

// Six buildings over eight tiers and four skins. The stone ladder grows with
// level for the tile and classic skins — the bell-cote chapel (church-modest),
// the spired one (church-small), the tower, then the parish
// church from Parish Church (level 8) up, the same tier the yard switches to
// its parish painting. Modern and glass each have one building of their own,
// at every tier. The tier and skin logic is untouched; this only says which
// picture a (skin, tier) wears.
const B = (name: string) => `/church/buildings/church-${name}.png`
const LADDER: Record<ChurchTierId, string> = {
  gathering: B('modest'),
  chapel: B('small'),
  country: B('tower'),
  parish: B('parish'),
  stone: B('parish'),
  great: B('parish'),
  cathedral: B('parish'),
  basilica: B('parish'),
}

export function ownerBuildingArt(skinId: string, tier: ChurchTierId): string | undefined {
  if (skinId === 'modern') return B('modern')
  if (skinId === 'glass') return B('glass')
  if (skinId === 'tile' || skinId === 'classic') return LADDER[tier]
  return undefined
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
