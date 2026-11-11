// The layered wardrobe: one locked body per figure and every item its own
// transparent layer on a shared 360x728 canvas, so any hat goes with any hair
// goes with any robe. Art and how it is made: docs/AVATAR-LAYERS.md.
//
// Two rules carried over from the character it replaces, and they are the
// whole reason it can sit at the front door:
//
//   * Identity is never paywalled. Every hairstyle, every hair colour, every
//     skin tone and the everyday clothes (`starter` in the art manifest) are
//     free from the first screen, in any colour.
//   * Everything else is EARNED by playing, against numbers that only go up
//     (level, longest streak, plays, verses studied, CPU races won — the same
//     PetProgress the pets read). Nothing here is sold, nothing is a number
//     anybody else sees, and nothing can be taken back by a bad week.
//
// The gate is client-side, like the pets' guest path: a forged look buys a
// picture, never standing. If an earned piece ever needs to be unforgeable,
// it gets a server check the way pets did in 0064.

import type { AvatarSpec, Figure, LayerSlot, Outfit } from '@/types'
import type { PetProgress } from '@/data/pets'
import { LAYER_BOXES, LAYER_CANVAS, LAYER_ITEMS, type LayerBox } from '@/data/avatarLayers'

export type { LayerSlot, Outfit }
export { LAYER_CANVAS }

/** Back to front. `body` is the figure itself. */
export const DRAW_ORDER: (LayerSlot | 'body')[] = ['back', 'body', 'legs', 'shoes', 'top', 'belt', 'hair', 'head', 'held']

/** The builder's tabs, in the order a person dresses. Setup shows the first four. */
export const SLOTS: { slot: LayerSlot; label: string; required?: boolean }[] = [
  { slot: 'hair', label: 'Hair' },
  { slot: 'top', label: 'Top', required: true },
  { slot: 'legs', label: 'Legs', required: true },
  { slot: 'shoes', label: 'Shoes' },
  { slot: 'head', label: 'Headwear' },
  { slot: 'held', label: 'In hand' },
  { slot: 'back', label: 'On the back' },
  { slot: 'belt', label: 'Belt' },
]
export const SETUP_SLOTS: LayerSlot[] = ['hair', 'top', 'legs', 'shoes']

/** Hair colours: the six the old picker offered, then the brighter ones. */
export const HAIR_COLORS = ['#241C1A', '#3E2A1E', '#6B4327', '#8C4A2B', '#B4823C', '#E2C46A', '#9A958C', '#E8E4DC', '#C4622D', '#3D6FD6', '#E07AA8', '#7A4FC2']
export const CLOTH_COLORS = ['#F2ECE0', '#E8D9B0', '#B8322E', '#E0763A', '#D9A63A', '#3F8A4A', '#2F8F8A', '#4F8FD6', '#2A3F7A', '#6B3F8F', '#D97A8A', '#6B4226', '#3A3A40', '#9A958C']

const NAME_OVERRIDES: Record<string, string> = {
  head_helmet_salvation: 'Helmet of Salvation',
  top_breastplate: 'Breastplate of Righteousness',
  belt_truth: 'Belt of Truth',
  shoes_peace: 'Shoes of Peace',
  held_shield_faith: 'Shield of Faith',
  held_sword_spirit: 'Sword of the Spirit',
  head_crown_stars: 'Crown of Stars',
  top_tshirt: 'T-shirt',
  top_buttonup: 'Button-up',
  top_longsleeve: 'Long sleeve',
  shoes_hightops: 'High-tops',
  hair_bob: 'Bob',
}

export const layerName = (id: string): string =>
  NAME_OVERRIDES[id] ??
  id.split('_').slice(1).join(' ').replace(/\b\w/g, (c) => c.toUpperCase())

// ── What earns each piece ────────────────────────────────────────────────
// Every axis is a number that only goes up. The Armor of God (Ephesians 6) is
// the ladder's spine: belt, helmet, breastplate, shield, shoes, sword.
export type LayerReq =
  | { kind: 'level'; n: number }
  | { kind: 'streak'; n: number }
  | { kind: 'plays'; n: number }
  | { kind: 'studied'; n: number }
  | { kind: 'cpuWon'; n: number }

const L = (n: number): LayerReq => ({ kind: 'level', n })
const S = (n: number): LayerReq => ({ kind: 'streak', n })
const W = (n: number): LayerReq => ({ kind: 'cpuWon', n })
const V = (n: number): LayerReq => ({ kind: 'studied', n })

export const LAYER_REQS: Record<string, LayerReq> = {
  // Headwear
  head_cap: L(2), head_beanie: L(3), head_wrap: L(3), head_straw_hat: L(4), head_headphones: L(5),
  head_traveller_hat: L(6), head_flower_crown: S(3), head_laurel: S(7), head_knight_helm: W(3),
  head_centurion: W(8), head_winged_helm: L(12), head_crown: L(15), head_dragon_helm: W(20),
  head_halo: S(30), head_crown_stars: S(60), head_helmet_salvation: L(25),
  // Tops
  top_vest: L(2), top_sash_tunic: L(3), top_shepherd_coat: L(4), top_robe_long: L(5), top_toga: L(6),
  top_cloak: L(8), top_tabard: W(5), top_chainmail: W(10), top_star_robe: V(50), top_royal_robe: L(20),
  top_armor_full: W(25), top_breastplate: L(30),
  // Legs and shoes
  legs_long_skirt: L(2), legs_baggy: L(3), legs_kilt: L(4), legs_greaves: W(15),
  shoes_slippers: L(2), shoes_tall_boots: L(5), shoes_gold_sandals: S(14), shoes_armored: W(12), shoes_peace: L(35),
  // Belts
  belt_rope: L(2), belt_sash: L(3), belt_truth: L(28),
  // In hand
  held_sling: W(2), held_crook: L(4), held_staff: L(6), held_torch: L(8), held_harp: L(10),
  held_book: V(10), held_scroll: V(25), held_lantern: S(5), held_dove: S(10),
  held_shield_faith: L(32), held_sword_spirit: L(40),
  // On the back
  back_backpack: L(2), back_satchel: L(3), back_cape: L(7), back_quiver: W(6), back_banner: L(18),
  back_royal_cape: L(22), back_wings: S(45), back_golden_wings: L(50),
}

export const reqLabel = (r: LayerReq): string => {
  switch (r.kind) {
    case 'level': return `Reach level ${r.n}`
    case 'streak': return `A ${r.n}-day streak`
    case 'plays': return `Play ${r.n} daily verses`
    case 'studied': return `Study ${r.n} verses`
    case 'cpuWon': return `Win ${r.n} CPU races`
  }
}

const reqMet = (r: LayerReq, p: PetProgress): boolean => {
  switch (r.kind) {
    case 'level': return p.level >= r.n
    case 'streak': return p.streak >= r.n
    case 'plays': return p.plays >= r.n
    case 'studied': return p.studied >= r.n
    case 'cpuWon': return p.cpuWon >= r.n
  }
}

export const isStarter = (id: string): boolean => !!LAYER_ITEMS[id]?.starter
export const takesColor = (id: string): boolean => !!LAYER_ITEMS[id]?.tint

/** Free pieces are always open; an earned piece with no listed requirement is
 *  treated as locked rather than free, so a new item can't ship unguarded. */
export function layerUnlocked(id: string, p: PetProgress, admin = false): boolean {
  if (admin || isStarter(id)) return true
  const r = LAYER_REQS[id]
  return !!r && reqMet(r, p)
}

/** The pieces a slot offers for this figure: starter first, then by how soon
 *  they are earned. Pets live elsewhere, so the `pet` slot is never listed. */
export function slotItems(slot: LayerSlot, figure: Figure): string[] {
  const boxes = LAYER_BOXES[figure] ?? {}
  const order = (id: string) => (isStarter(id) ? 0 : 1 + (LAYER_REQS[id]?.n ?? 999) / 1000)
  return Object.keys(LAYER_ITEMS)
    .filter((id) => LAYER_ITEMS[id].slot === slot && boxes[id])
    .sort((a, b) => order(a) - order(b) || a.localeCompare(b))
}

export const layerUrl = (figure: Figure, id: string): string => `/avatar/${figure}/${id}.webp`
export const layerBox = (figure: Figure, id: string): LayerBox | undefined => LAYER_BOXES[figure]?.[id]

/** The body layer for a skin tone; the bases are painted in 'sand'. */
export function bodyId(figure: Figure, tone: string): string {
  const id = `body_${tone}`
  return LAYER_BOXES[figure]?.[id] ? id : 'body'
}

/** A new character's clothes: a t-shirt, jeans and sneakers, and a hairstyle
 *  in the hair colour already chosen. Every piece is a starter piece. */
export function defaultOutfit(figure: Figure, hairColor = HAIR_COLORS[1]): Outfit {
  return {
    hair: { id: figure === 'fem' ? 'hair_long_straight' : 'hair_short', color: hairColor },
    top: { id: 'top_tshirt', color: '#4F8FD6' },
    legs: { id: 'legs_jeans', color: '#2A3F7A' },
    shoes: { id: 'shoes_sneakers', color: '#F2ECE0' },
  }
}

/** Drop any worn piece this account has not earned (or that no longer exists
 *  for the figure) — so switching figure, or a forged spec, degrades to what
 *  is allowed rather than drawing a gap or a locked piece. */
export function cleanOutfit(outfit: Outfit, figure: Figure, p: PetProgress, admin = false): Outfit {
  const out: Outfit = {}
  for (const [slot, piece] of Object.entries(outfit) as [LayerSlot, Outfit[LayerSlot]][]) {
    if (piece && layerBox(figure, piece.id) && layerUnlocked(piece.id, p, admin)) out[slot] = piece
  }
  return out
}

export const isLayered = (spec?: AvatarSpec | null): spec is AvatarSpec & { outfit: Outfit } => !!spec?.outfit
