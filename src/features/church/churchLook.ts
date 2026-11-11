import { DEFAULT_AVATAR, HAIRS, SKINS, figureOf } from '@/data/avatar'
import { CLOTH_COLORS, HAIR_COLORS } from '@/data/layered'
import type { AvatarSpec, Figure, Outfit } from '@/types'

// The church draws its congregation in the layered wardrobe's art, so a
// churchyard reads as one painting rather than two generations of figures
// standing side by side.
//
// Nothing here is stored and nothing is somebody's choice being overridden in
// their own room: it is how a SCENE draws a member who has not built a layered
// character yet. A member who has one is drawn exactly as they dressed; a
// member wearing a full skin keeps it (a Legendary Look is a choice); anybody
// else is drawn in everyday clothes in their own figure, tone and hair colour.
// The clothes are picked from a hash of the member's seed, so the same person
// looks the same every visit and two people rarely match.

const hash = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

const TOPS = ['top_tshirt', 'top_longsleeve', 'top_buttonup', 'top_sweatshirt', 'top_hoodie', 'top_jacket', 'top_tunic']
const LEGS = ['legs_jeans', 'legs_trousers', 'legs_joggers']
const SHOES = ['shoes_sneakers', 'shoes_hightops', 'shoes_sandals', 'shoes_boots']
const HAIR_MASC = ['hair_short', 'hair_side_part', 'hair_curly_short', 'hair_buzz', 'hair_swept', 'hair_locs']
const HAIR_FEM = ['hair_long_straight', 'hair_long_wavy', 'hair_ponytail', 'hair_bob', 'hair_braids', 'hair_bun']

/** Everyday clothes, every piece a free starter piece, chosen by seed. */
export function everydayOutfit(figure: Figure, seed: string, hairColor?: string): Outfit {
  const h = hash(seed)
  const at = <T,>(a: T[], shift: number) => a[(h >>> shift) % a.length]
  const hairs = figure === 'fem' ? HAIR_FEM : HAIR_MASC
  return {
    hair: { id: at(hairs, 0), color: hairColor ?? at(HAIR_COLORS.slice(0, 8), 3) },
    top: { id: at(TOPS, 6), color: at(CLOTH_COLORS, 9) },
    legs: { id: at(LEGS, 13), color: at(['#2A3F7A', '#3A3A40', '#6B4226', '#9A958C', '#E8D9B0'], 16) },
    shoes: { id: at(SHOES, 19), color: at(['#F2ECE0', '#3A3A40', '#6B4226', '#B8322E'], 22) },
  }
}

/** A member as the churchyard draws them. */
export function churchLook(spec: AvatarSpec | null | undefined, seed: string): AvatarSpec | null | undefined {
  if (!spec || spec.outfit || spec.skinId || spec.regalia) return spec
  const figure = figureOf(spec)
  const hairColor = HAIRS.find((x) => x.key === spec.hair)?.hex
  return { ...spec, outfit: everydayOutfit(figure, seed, hairColor) }
}

/** A stand-in figure for the signed-out church page: plain everyday clothes,
 *  nothing anybody chose, varied by position so the lawn is a crowd rather
 *  than one figure repeated. No skin, pet or frame — see ChurchPageBody. */
export function plainCharacter(i: number, seed: string): AvatarSpec {
  const figure: Figure = i % 2 ? 'fem' : 'masc'
  const tone = SKINS[hash(seed + 't') % SKINS.length].key
  return { ...DEFAULT_AVATAR, skin: tone, figure, outfit: everydayOutfit(figure, seed) }
}
