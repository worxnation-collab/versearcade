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

import type { AvatarSpec, Build, Figure, LayerSlot, Outfit } from '@/types'
import type { PetProgress } from '@/data/pets'
import { LAYER_BOXES, LAYER_CANVAS, LAYER_ITEMS, type LayerBox, type LayerMeta } from '@/data/avatarLayers'
import { catalogOverlay, type CatalogLayer } from '@/data/catalog'
import { roadById } from '@/data/season'

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
  head_traveler_hat: 'Traveller’s Hat',
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
  top_many_colors: 'Coat of Many Colours',
  head_lion_helm: 'Lion Helm',
  top_lion_armor: 'Lion Armour',
  legs_lion_greaves: 'Lion Greaves',
  held_lion_shield: 'Lion Shield',
  back_lion_cape: 'Lion Cape',
  back_star_wings: 'Starlight Wings',
  top_light_robe: 'Robe of Light',
  held_trumpet: 'Ram’s Horn',
  shoes_winged: 'Winged Sandals',
  shoes_glow_sneakers: 'Glow Sneakers',
  held_bread_basket: 'Loaves and Fishes',
  held_fishing_net: 'Fishing Pole',
  back_elijah_mantle: 'Elijah’s Mantle',
  head_pompom_beanie: 'Pom-pom Beanie',
  back_fish_basket: 'Fish Basket',
  held_hammer: 'Mallet',
  head_flame_crown: 'Crown of Flame',
  // Advent 2026
  head_magi_crown: 'Magi’s Crown',
  top_magi_robe: 'Robe of the East',
  legs_magi_trousers: 'Caravan Trousers',
  shoes_magi_slippers: 'Golden Slippers',
  held_myrrh_casket: 'Casket of Myrrh',
  back_magi_cape: 'Caravan Cape',
  head_shepherd_hood: 'Shepherd’s Headcloth',
  top_fleece_mantle: 'Fleece Mantle',
  belt_shepherd_pouch: 'Shepherd’s Pouch',
  held_newborn_lamb: 'Newborn Lamb',
  held_star_lantern: 'Bethlehem Star Lantern',
}

export const layerName = (id: string): string =>
  NAME_OVERRIDES[id] ??
  catalogLayer(id)?.name ??
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
  /** Reach waystation `n` on a seasonal road. Read from season_progress
   *  (via PetProgress.roads), which outlives the road: a piece earned at
   *  Christmas is still yours in March. Walking a road is free (BATTLE-PASS.md),
   *  so this is earned like everything else here, never bought. */
  | { kind: 'road'; road: string; n: number }

const L = (n: number): LayerReq => ({ kind: 'level', n })
const S = (n: number): LayerReq => ({ kind: 'streak', n })
const W = (n: number): LayerReq => ({ kind: 'cpuWon', n })
const V = (n: number): LayerReq => ({ kind: 'studied', n })
const P = (n: number): LayerReq => ({ kind: 'plays', n })
const ADVENT = (n: number): LayerReq => ({ kind: 'road', road: 'advent', n })

export const LAYER_REQS: Record<string, LayerReq> = {
  // Headwear
  head_cap: L(2), head_beanie: L(3), head_wrap: L(3), head_straw_hat: L(4), head_headphones: L(3),
  head_traveller_hat: L(6), head_flower_crown: S(2), head_laurel: S(7), head_knight_helm: W(3),
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
  // ── The 2026-11-11 drop: three sets and the pieces between them ──
  // Explorer: the whole outfit at one early rung, so a new player has a
  // complete look to aim at in their first fortnight.
  head_explorer_hat: L(7), top_explorer_jacket: L(7), legs_explorer_shorts: L(7),
  shoes_explorer_boots: L(7), back_explorer_pack: L(7), belt_explorer: L(7),
  // Lion of Judah (Revelation 5:5): CPU races won, never a player beaten.
  held_lion_shield: W(12), legs_lion_greaves: W(18), back_lion_cape: W(24),
  top_lion_armor: W(30), head_lion_helm: W(40),
  // Starlight (Daniel 12:3, "they that turn many to righteousness as the
  // stars"): verses studied, the Study tab's own ladder.
  head_star_circlet: V(20), belt_star_sash: V(40), legs_starry: V(75),
  top_light_robe: V(120), back_star_wings: V(200),
  // Between them.
  head_goggles: W(1), head_feather_cap: L(9), head_olive_wreath: S(10), head_flame_crown: S(21),
  top_fisherman_sweater: L(6), top_varsity: L(11), top_many_colors: P(60),
  shoes_glow_sneakers: P(25), shoes_winged: S(30),
  held_fishing_net: L(5), held_trumpet: S(3), held_bread_basket: P(30), held_star_staff: L(45),
  back_scroll_case: V(30), back_lantern_pack: S(14), back_elijah_mantle: S(40),
  // ── The second drop ──
  // Fishers of Galilee (Matthew 4:19): daily verses played, joined by the
  // sweater and the pole already on the shelf.
  head_fisher_cap: P(10), legs_rolled_trousers: P(20), back_fish_basket: P(40),
  // Desert Pilgrim: the middle levels, where the ladder had a gap.
  head_traveler_hat: L(13), shoes_desert_boots: L(14), belt_nomad_sash: L(15),
  back_waterskin: L(16), top_nomad_robe: L(17),
  // The Builder (Nehemiah 4:6): a streak, because a wall goes up a day at a time.
  head_work_bandana: S(5), belt_tool_belt: S(9), held_hammer: S(12),
  top_work_apron: S(18), back_toolbox: S(25),
  // Everyday. The GOOFY pieces (balloon, pompom, goggles, skateboard,
  // glow sneakers, trumpet) are deliberately the EASY ones (2026-11-12, the
  // owner's call): a kid would rather wear the funny thing than the cool one,
  // so it should arrive in the first week, and the armour and wings stay the
  // long climb.
  head_bandana: L(3), head_pompom_beanie: L(2), head_cowboy_hat: L(8),
  top_raincoat: L(5), top_puffer_jacket: L(10), shoes_rain_boots: L(3),
  held_umbrella: L(3), held_balloon: P(2), back_guitar: L(6), back_skateboard: W(3),
  // ── Advent 2026: the first SEASONAL pieces, earned on the Advent Road ──
  // (Nov 29 – Jan 7). The shepherds come first, as they did (Luke 2:8-20);
  // the Magi arrive at the end of the road, at Epiphany (Matthew 2:1-11).
  // A player on an older build who walks the road still earns these: the
  // waystation is recorded server-side, and the pieces open on update.
  head_shepherd_hood: ADVENT(3), belt_shepherd_pouch: ADVENT(6), top_fleece_mantle: ADVENT(9),
  held_newborn_lamb: ADVENT(12), held_star_lantern: ADVENT(15),
  shoes_magi_slippers: ADVENT(18), legs_magi_trousers: ADVENT(20), held_myrrh_casket: ADVENT(23),
  back_magi_cape: ADVENT(25), top_magi_robe: ADVENT(28), head_magi_crown: ADVENT(30),
}

/** Named sets. A set is a NAME and nothing else: it grants nothing, draws no
 *  bar and puts no "3 of 5" in front of anybody — the same rule ITEM_SETS
 *  and the Seals page follow. The tile says which set a piece belongs to. */
export const LAYER_SETS: Record<string, { name: string; ids: string[] }> = {
  explorer: { name: 'Explorer', ids: ['head_explorer_hat', 'top_explorer_jacket', 'legs_explorer_shorts', 'shoes_explorer_boots', 'back_explorer_pack', 'belt_explorer'] },
  lion: { name: 'Lion of Judah', ids: ['head_lion_helm', 'top_lion_armor', 'legs_lion_greaves', 'held_lion_shield', 'back_lion_cape'] },
  galilee: { name: 'Fishers of Galilee', ids: ['head_fisher_cap', 'top_fisherman_sweater', 'legs_rolled_trousers', 'held_fishing_net', 'back_fish_basket'] },
  nomad: { name: 'Desert Pilgrim', ids: ['head_traveler_hat', 'top_nomad_robe', 'belt_nomad_sash', 'shoes_desert_boots', 'back_waterskin'] },
  builder: { name: 'The Builder', ids: ['head_work_bandana', 'top_work_apron', 'belt_tool_belt', 'held_hammer', 'back_toolbox'] },
  starlight: { name: 'Starlight', ids: ['head_star_circlet', 'top_light_robe', 'legs_starry', 'belt_star_sash', 'back_star_wings'] },
  // Advent 2026
  shepherds: { name: 'Shepherds’ Watch', ids: ['head_shepherd_hood', 'top_fleece_mantle', 'belt_shepherd_pouch', 'held_newborn_lamb'] },
  magi: { name: 'The Magi', ids: ['head_magi_crown', 'top_magi_robe', 'legs_magi_trousers', 'shoes_magi_slippers', 'held_myrrh_casket', 'back_magi_cape'] },
}
export const layerSetName = (id: string): string | undefined =>
  Object.values(LAYER_SETS).find((s) => s.ids.includes(id))?.name ?? catalogLayer(id)?.set

// ── Pieces a season ships as data (content catalog) ──
// A catalog layer (CatalogLayer in data/catalog.ts) is the bundled shape with
// an https URL per figure and build, so a road can hand out a hat without a
// release. Everything below reads the bundle FIRST: a catalog row can add a
// piece but never replace one that shipped, so nobody's worn art can change
// under them. Functions rather than constants because the overlay arrives at
// runtime (the allItems() lesson in CLAUDE.md).
function catalogLayer(id: string): CatalogLayer | undefined {
  if (LAYER_ITEMS[id]) return undefined
  return catalogOverlay().layers.find((l) => l.id === id)
}
function layerMeta(id: string): LayerMeta | undefined {
  const m = LAYER_ITEMS[id]
  if (m) return m
  const c = catalogLayer(id)
  return c ? { slot: c.slot, tint: c.tint, starter: false } : undefined
}
const allLayerIds = (): string[] => [
  ...Object.keys(LAYER_ITEMS),
  ...catalogOverlay().layers.map((l) => l.id).filter((id) => !LAYER_ITEMS[id]),
]
/** What earns a piece, bundled or catalog. Undefined means locked. */
export function layerReq(id: string): LayerReq | undefined {
  return LAYER_REQS[id] ?? catalogLayer(id)?.req
}
/** A road's wardrobe piece shown beside its waystation's rewards. DISPLAY
 *  ONLY: never in a waystation's data, never sent to claim_season_reward. */
export const PIECE_PREFIX = 'piece_'

/** Every piece a seasonal road hands out (at waystation `n`, if given), for
 *  the road screen to show beside that waystation's own rewards. */
export function roadPieces(road: string, n?: number): string[] {
  return allLayerIds().filter((id) => {
    const r = layerReq(id)
    return r?.kind === 'road' && r.road === road && (n === undefined || r.n === n)
  })
}
/** The roads any piece is earned on, so the season store knows whose
 *  progress to read after the road itself has ended. */
export function piecesRoads(): string[] {
  const out = new Set<string>()
  for (const id of allLayerIds()) {
    const r = layerReq(id)
    if (r?.kind === 'road') out.add(r.road)
  }
  return [...out]
}

export const reqLabel = (r: LayerReq): string => {
  switch (r.kind) {
    case 'level': return `Reach level ${r.n}`
    case 'streak': return `A ${r.n}-day streak`
    case 'plays': return `Play ${r.n} daily verses`
    case 'studied': return `Study ${r.n} verses`
    case 'cpuWon': return `Win ${r.n} CPU races`
    case 'road': return `Waystation ${r.n} · ${roadById(r.road)?.name ?? 'a seasonal road'}`
  }
}

const reqMet = (r: LayerReq, p: PetProgress): boolean => {
  switch (r.kind) {
    case 'level': return p.level >= r.n
    case 'streak': return p.streak >= r.n
    case 'plays': return p.plays >= r.n
    case 'studied': return p.studied >= r.n
    case 'cpuWon': return p.cpuWon >= r.n
    case 'road': return (p.roads?.[r.road] ?? 0) >= r.n
  }
}

export const isStarter = (id: string): boolean => !!LAYER_ITEMS[id]?.starter
export const takesColor = (id: string): boolean => !!layerMeta(id)?.tint

/** Free pieces are always open; an earned piece with no listed requirement is
 *  treated as locked rather than free, so a new item can't ship unguarded. */
export function layerUnlocked(id: string, p: PetProgress, admin = false): boolean {
  if (admin || isStarter(id)) return true
  const r = layerReq(id)
  return !!r && reqMet(r, p)
}

/** The pieces a slot offers for this figure: starter first, then by how soon
 *  they are earned. Pets live elsewhere, so the `pet` slot is never listed. */
export function slotItems(slot: LayerSlot, figure: Figure): string[] {
  const order = (id: string) => (isStarter(id) ? 0 : 1 + (layerReq(id)?.n ?? 999) / 1000)
  return allLayerIds()
    .filter((id) => layerMeta(id)?.slot === slot && boxIn(figure, id))
    .sort((a, b) => order(a) - order(b) || a.localeCompare(b))
}

/** The three builds, in the order the picker shows them. */
export const BUILDS: { key: Build; name: string }[] = [
  { key: 'slim', name: 'Slim' },
  { key: 'standard', name: 'Standard' },
  { key: 'sturdy', name: 'Sturdy' },
]
export const buildOf = (spec?: AvatarSpec | null): Build =>
  spec?.build === 'slim' || spec?.build === 'sturdy' ? spec.build : 'standard'

/** Where a layer's art lives: the build's own folder when it has that piece,
 *  else the standard figure's (a build that lacks a piece draws the standard
 *  one rather than a gap). */
/** A catalog piece's box under one art key, its `__skin` companion included. */
function catalogBox(key: string, id: string) {
  const [base, part] = id.split('__')
  const c = catalogLayer(base)
  if (!c) return undefined
  return part === 'skin' ? c.skin?.[key] : part ? undefined : c.art[key]
}
function boxIn(key: string, id: string): LayerBox | undefined {
  return LAYER_BOXES[key]?.[id] ?? catalogBox(key, id)
}
const artKey = (figure: Figure, id: string, build: Build = 'standard'): string => {
  const k = `${figure}_${build}`
  return build !== 'standard' && boxIn(k, id) ? k : figure
}
export const layerUrl = (figure: Figure, id: string, build?: Build): string => {
  const k = artKey(figure, id, build)
  if (LAYER_BOXES[k]?.[id]) return `/avatar/${k}/${id}.webp`
  return catalogBox(k, id)?.url ?? `/avatar/${k}/${id}.webp`
}
export const layerBox = (figure: Figure, id: string, build?: Build): LayerBox | undefined => {
  const b = boxIn(artKey(figure, id, build), id)
  return b ? { x: b.x, y: b.y, w: b.w, h: b.h } : undefined
}

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
