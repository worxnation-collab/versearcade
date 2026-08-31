// Character avatars — a composable "Armor of God" figure that becomes the
// player's profile picture everywhere the Avatar component renders.
//
// Pieces are gated three ways, mirroring the app's ethos of stickiness without
// shame:
//   free   — always available. The base character looks good; no one is shamed.
//   earned — unlocked by the player's LONGEST streak, exactly like the borders
//            and badges in data/cosmetics (a missed day never strips a piece).
//   studio — the paid layer. Ties to the (future) Studio Pass.
//
// This is the client model + gating. Persisting it for online accounts is a
// follow-up: a profiles.avatar_character column + a server check, the same way
// migration 0010 gates the streak cosmetics. In LOCAL mode it already persists
// to the device via the auth store.

import { catalogArtUrl, catalogOverlay, mergeById, type CatalogSkin } from './catalog'
import type { ArmorSlot, AvatarSpec, Figure, ItemSlot } from '@/types'

export type { ArmorSlot, AvatarSpec, Figure, ItemSlot }

// ── Wearable items (Daily Chest drops) ────────────────────────────────────────
// Free, collected by playing. One item per slot; render lives in Character.
export type ItemRarity = 'common' | 'uncommon' | 'rare'

export interface ItemDef {
  id: string
  slot: ItemSlot
  name: string
  rarity: ItemRarity
  blurb: string
}

export const ITEMS: ItemDef[] = [
  { id: 'item_headwrap', slot: 'hat', name: 'Shepherd’s Headwrap', rarity: 'common', blurb: 'Cloth against the desert sun.' },
  { id: 'item_olive_wreath', slot: 'hat', name: 'Olive Wreath', rarity: 'uncommon', blurb: 'A crown of peace.' },
  { id: 'item_staff', slot: 'held', name: 'Shepherd’s Staff', rarity: 'common', blurb: 'For leading the flock.' },
  { id: 'item_scroll', slot: 'held', name: 'Scroll', rarity: 'common', blurb: 'The Word, close at hand.' },
  { id: 'item_lamp', slot: 'held', name: 'Oil Lamp', rarity: 'uncommon', blurb: 'A lamp unto my feet.' },
  { id: 'item_cloak', slot: 'cape', name: 'Traveler’s Cloak', rarity: 'uncommon', blurb: 'Worn on the long road.' },
  // ——— Harvest Road items ———
  // Earned on the Pilgrimage (data/season), never dropped by the chest: the
  // pool below in drawChestItem deliberately excludes them so the road stays
  // the only way to get one. Granted through the same owned_items set.
  { id: 'item_sickle', slot: 'held', name: 'Harvest Sickle', rarity: 'rare', blurb: 'For the standing grain.' },
  { id: 'item_winnowing_fork', slot: 'held', name: 'Winnowing Fork', rarity: 'rare', blurb: 'Chaff to the wind.' },
  { id: 'item_water_skin', slot: 'held', name: 'Water Skin', rarity: 'uncommon', blurb: 'Drawn for the reapers.' },
  { id: 'item_harvest_headscarf', slot: 'hat', name: 'Harvest Headscarf', rarity: 'uncommon', blurb: 'Cloth for the field.' },
  { id: 'item_gleaner_shawl', slot: 'cape', name: 'Gleaner’s Shawl', rarity: 'rare', blurb: 'Ruth wore one like it.' },
]

/** Item ids that only the seasonal road grants — kept out of the chest pool. */
export const ROAD_ITEM_IDS = new Set([
  'item_sickle',
  'item_winnowing_fork',
  'item_water_skin',
  'item_harvest_headscarf',
  'item_gleaner_shawl',
])

export const itemById = (id?: string | null): ItemDef | undefined => ITEMS.find((i) => i.id === id)

/** Illustration for a chest item, served from public/items. Ids are prefixed
 *  `item_`; the files are not. */
export const itemArt = (id: string): string => `/items/${id.replace(/^item_/, '')}.png`
export const itemsBySlot = (slot: ItemSlot): ItemDef[] => ITEMS.filter((i) => i.slot === slot)

// Pick a random item the player doesn't own yet (rarity-weighted), for a chest
// drop. Returns null once everything is collected. Caller supplies a 0..1 roll
// so it stays deterministic/testable.
export function drawChestItem(owned: string[], roll: number): string | null {
  const pool = ITEMS.filter((i) => !owned.includes(i.id) && !ROAD_ITEM_IDS.has(i.id))
  if (pool.length === 0) return null
  const weight = (r: ItemRarity) => (r === 'common' ? 6 : r === 'uncommon' ? 3 : 1)
  const total = pool.reduce((s, i) => s + weight(i.rarity), 0)
  let x = roll * total
  for (const i of pool) {
    x -= weight(i.rarity)
    if (x <= 0) return i.id
  }
  return pool[pool.length - 1].id
}

export type Access =
  | { kind: 'free' }
  | { kind: 'earned'; requiredStreak: number }
  | { kind: 'studio' }

export interface ArmorPieceDef {
  slot: ArmorSlot
  name: string
  verse: string
  access: Access
}

// ── The Armor of God, parked ────────────────────────────────────────────────
// The six pieces are drawn as flat gold overlays on the base figure, and next
// to the character the onboarding picker now builds they read as a costume
// stuck on top of a person rather than as armor. Until there's art that
// actually fits, the whole thing is off: this ONE flag hides the builder grid
// (CustomizeSection) and stops Character drawing the pieces.
//
// Nothing is destroyed. `spec.armor` is still stored, still round-trips through
// the profile, and flipping this back to true brings every equipped piece back
// exactly as it was. The definitions below stay for the same reason.
//
// When it comes back, the likely shape is a full-look skin (the way Baldwin and
// Michael work) rather than six separate overlays — one earned "Armor of God"
// look, drawn as one figure, instead of gold plates layered over a robe.
export const ARMOR_ENABLED = false

// The six pieces of the Armor of God (Ephesians 6:14–17) — a natural collectible
// set. Ordered head-to-toe for the builder grid.
export const ARMOR: ArmorPieceDef[] = [
  { slot: 'helmet', name: 'Helmet of Salvation', verse: 'Ephesians 6:17', access: { kind: 'studio' } },
  { slot: 'breastplate', name: 'Breastplate of Righteousness', verse: 'Ephesians 6:14', access: { kind: 'free' } },
  { slot: 'belt', name: 'Belt of Truth', verse: 'Ephesians 6:14', access: { kind: 'earned', requiredStreak: 7 } },
  { slot: 'shield', name: 'Shield of Faith', verse: 'Ephesians 6:16', access: { kind: 'studio' } },
  { slot: 'sword', name: 'Sword of the Spirit', verse: 'Ephesians 6:17', access: { kind: 'studio' } },
  { slot: 'sandals', name: 'Gospel Sandals', verse: 'Ephesians 6:15', access: { kind: 'earned', requiredStreak: 30 } },
]

export const armorBySlot = (slot: ArmorSlot): ArmorPieceDef => ARMOR.find((a) => a.slot === slot)!

// Skin tones — all free. Identity is never paywalled.
export interface Swatch {
  key: string
  name: string
  hex: string
  access?: Access
}

// Six tones, evenly spaced rather than "a few light ones and a dark one" — the
// gap between amber and umber used to be twice any other step, which made the
// darker half of the row read as an afterthought.
export const SKINS: Swatch[] = [
  { key: 'porcelain', name: 'Porcelain', hex: '#F0C9A8' },
  { key: 'sand', name: 'Sand', hex: '#E0B48C' },
  { key: 'amber', name: 'Amber', hex: '#C68A5E' },
  { key: 'bronze', name: 'Bronze', hex: '#A66E45' },
  { key: 'umber', name: 'Umber', hex: '#8A5A38' },
  { key: 'ebony', name: 'Ebony', hex: '#5A3A24' },
]

// Hair — all free, all six the same cut. Identity is never paywalled and never
// a difficulty setting: what changes here is colour, never how much character
// you get. Values are picked to separate against every skin tone above (the
// lightest hair is darker than the lightest skin, so a blonde on porcelain
// still reads as hair rather than as more forehead).
export const HAIRS: Swatch[] = [
  { key: 'jet', name: 'Jet', hex: '#241C1A' },
  { key: 'espresso', name: 'Espresso', hex: '#3E2A1E' },
  { key: 'chestnut', name: 'Chestnut', hex: '#6B4327' },
  { key: 'auburn', name: 'Auburn', hex: '#8C4A2B' },
  { key: 'honey', name: 'Honey', hex: '#B4823C' },
  { key: 'ash', name: 'Ash', hex: '#9A958C' },
]

// Male / female, and that is the entire axis. Both figures are the SAME
// character — same head, same arms, same legs, same palette — differing only in
// the robe's hem and the length of the hair, so switching reads as "that's me"
// rather than as picking a different avatar.
export interface FigureDef {
  key: Figure
  name: string
}

export const FIGURES: FigureDef[] = [
  { key: 'masc', name: 'Male' },
  { key: 'fem', name: 'Female' },
]

// Robe / tunic colors — base ones free, one Studio color to show the model.
export const ROBES: Swatch[] = [
  { key: 'linen', name: 'Linen', hex: '#8C7B63', access: { kind: 'free' } },
  { key: 'olive', name: 'Olive', hex: '#6B7350', access: { kind: 'free' } },
  { key: 'indigo', name: 'Indigo', hex: '#5A4CA0', access: { kind: 'free' } },
  { key: 'crimson', name: 'Crimson Royal', hex: '#9A3B3B', access: { kind: 'studio' } },
]

// The starter look. No armor: the pieces are parked (see ARMOR_ENABLED), and a
// character somebody picked in onboarding shouldn't arrive already wearing
// something they didn't choose.
export const DEFAULT_AVATAR: AvatarSpec = {
  skin: 'sand',
  robe: 'linen',
  hair: 'espresso',
  figure: 'masc',
  armor: {},
}

export const skinHex = (key: string): string => (SKINS.find((s) => s.key === key) ?? SKINS[1]).hex
export const robeHex = (key: string): string => (ROBES.find((r) => r.key === key) ?? ROBES[0]).hex
/** Falls back to Espresso, so a spec stored before hair existed still gets hair
 *  rather than a bald head. */
export const hairHex = (key?: string | null): string =>
  (HAIRS.find((h) => h.key === key) ?? HAIRS[1]).hex
export const figureOf = (spec: AvatarSpec): Figure => (spec.figure === 'fem' ? 'fem' : 'masc')

// Prototype flag: Studio pieces are treated as OWNED so the full armored look can
// be previewed without a purchase flow. Flip to false once IAP/entitlements land
// and `accessOwned` will gate Studio items behind a real Studio Pass.
export const PREVIEW_STUDIO = true

export function accessOwned(access: Access | undefined, longestStreak: number, admin = false): boolean {
  if (admin) return true // operator account has everything unlocked
  if (!access || access.kind === 'free') return true
  if (access.kind === 'earned') return longestStreak >= access.requiredStreak
  return PREVIEW_STUDIO // studio
}

export interface AccessLabel {
  text: string
  tone: 'free' | 'earned' | 'studio'
}

export function accessLabel(access: Access | undefined): AccessLabel {
  if (!access || access.kind === 'free') return { text: 'Free', tone: 'free' }
  if (access.kind === 'earned') return { text: `${access.requiredStreak}-day streak`, tone: 'earned' }
  return { text: 'Studio', tone: 'studio' }
}

// True when the player is still on the untouched starter look — used to nudge
// existing (emoji-only) players to build a character for the first time.
export function isDefaultAvatar(spec?: AvatarSpec | null): boolean {
  if (!spec) return true
  return (
    !spec.regalia &&
    !spec.skinId &&
    spec.skin === DEFAULT_AVATAR.skin &&
    spec.robe === DEFAULT_AVATAR.robe &&
    (spec.hair ?? DEFAULT_AVATAR.hair) === DEFAULT_AVATAR.hair &&
    figureOf(spec) === DEFAULT_AVATAR.figure
  )
}

// ── Royal Regalia: achievement-unlocked sets, separate from the Armor of God ──
// King Baldwin — the young "Leper King" of Jerusalem, remembered less for
// conquest than for showing up and leading through relentless hardship. That
// perseverance is the point: his set is earned by consistency, not payment —
// sharing the daily verse across many different days. (Display name lives here;
// swap it in one place if you want a different framing.)
export const BALDWIN = {
  key: 'baldwin',
  name: 'King Baldwin’s Regalia',
  blurb: 'The masked Leper King. Share the daily verse on 10 different days.',
  shareGoal: 10,
} as const

export const distinctSharedDays = (days?: string[]): number => new Set(days ?? []).size
export const baldwinProgress = (days?: string[]): { count: number; goal: number; unlocked: boolean } => {
  const count = Math.min(distinctSharedDays(days), BALDWIN.shareGoal)
  return { count, goal: BALDWIN.shareGoal, unlocked: distinctSharedDays(days) >= BALDWIN.shareGoal }
}

// ── Full-look skins ───────────────────────────────────────────────────────────
// Earned skins (Baldwin) gate on an achievement; paid skins on an entitlement
// (ownedSkins), sold as themed packs. Render lives in Character; a skin overrides
// the base character + armor + items.
export interface SkinDef {
  id: string
  name: string
  /**
   * 'free'   = everybody has it, always. No goal, no entitlement, no checkout.
   * 'earned' = gated on an achievement (shared days, referrals).
   * 'pass'   = earned on the seasonal road (data/season). Never sold, never in
   *            the shop, no limitedUntil — road skins are permanent for their
   *            owners and simply never return for anyone else.
   * 'paid'   = an entitlement in owned_skins. As of the de-monetisation this is
   *            the founding-patron whale plus the promo-code exclusives, and
   *            nothing else should ever join them without a very good reason.
   */
  source: 'free' | 'earned' | 'paid' | 'pass'
  blurb: string
  shareGoal?: number // earned: distinct shared days required
  referralGoal?: number // earned: referred signups required
  pack?: string // paid: pack sku
  packName?: string // paid: display pack name
  /** paid: sold ONLY as part of its pack — never listed or priced on its own. */
  bundleOnly?: boolean
  price?: string // paid: display "from" price (pay-what-you-want; no real IAP yet)
  patron?: boolean // paid: high-tier supporter reward
  exclusive?: boolean // paid: unlocked by a promo code (redeem), not for sale
  limitedUntil?: string // limited edition: ISO date after which it vanishes for good
  /** pass: a reactive skin with numbered states (ruth_1..ruth_N). The unlock
   *  ids are `skin_<id>_<n>`; the equipped skinId carries the state so every
   *  OTHER viewer renders your Ruth at the right fullness from the spec alone. */
  states?: number
}

// Limited-edition window — premium skins disappear from the shop forever after
// this moment (~60 days from the launch drop). Owners keep what they unlocked.
export const LIMITED_UNTIL = '2026-10-12T04:00:00Z'
export const skinExpired = (skin: SkinDef, now: number = Date.now()): boolean =>
  skin.limitedUntil != null && now >= new Date(skin.limitedUntil).getTime()

export const FULL_SKINS: SkinDef[] = [
  {
    id: 'baldwin',
    name: 'King Baldwin',
    source: 'earned',
    shareGoal: 10,
    blurb: 'The masked Leper King — earned by sharing on 10 different days.',
  },
  {
    id: 'david',
    name: 'David',
    source: 'earned',
    shareGoal: 25,
    blurb: 'The giant-slayer — earned by sharing on 25 different days.',
  },
  {
    id: 'cross',
    name: 'Take Up Your Cross',
    source: 'earned',
    referralGoal: 5,
    blurb: 'Carry your cross (Luke 9:23) — earned when 5 friends join with your code.',
  },
  // ——— The Pilgrimage (seasonal road) ———
  {
    id: 'ruth',
    name: 'Ruth the Gleaner',
    source: 'pass',
    states: 4,
    blurb: 'Walk the Harvest Road. Her basket fills as you go — waystations 1, 20, 35 and 50.',
  },
  {
    id: 'boaz',
    name: 'Boaz',
    source: 'pass',
    blurb: 'Lord of the harvest — the end of the Harvest Road, waystation 50.',
  },
  // ——— The launch trio, now free ———
  // These were the $2.99 skins. Cosmetics are no longer sold (the founding
  // patron whale is the one exception), and rather than leave three good skins
  // behind a checkout that no longer exists they simply belong to everybody.
  // `limitedUntil` is gone with the price: a free skin that vanishes on a date
  // is a worse deal than a paid one, and it would take them from the people who
  // bought them. Existing buyers keep their owned_skins rows, which now say the
  // same thing everyone else's absence of a row says.
  {
    id: 'moses',
    name: 'Moses',
    source: 'free',
    blurb: 'The Lawgiver — staff in hand, the tablets at his side.',
  },
  {
    id: 'esther',
    name: 'Esther',
    source: 'free',
    blurb: 'The queen — “for such a time as this.”',
  },
  {
    id: 'elijah',
    name: 'Elijah',
    source: 'free',
    blurb: 'The prophet of fire — mantle, staff, and a raven.',
  },
  // ——— The angels, now road rewards ———
  // These were The Angel Pack ($5.99, bundleOnly). They are a themed set of
  // three, which is exactly the shape a season wants, so instead of being
  // retired they become inventory: a road grants `skin_gabriel` and the rest
  // at a waystation. Anybody who bought the pack keeps it — skinOwned's
  // `admin`/unlock checks aside, an owned_skins row still reads as owned
  // through the pass branch's fallback below.
  //
  // No `limitedUntil`: a pass skin never expires for its owner, and the way it
  // stops being obtainable is the road closing.
  {
    id: 'gabriel',
    name: 'Gabriel',
    source: 'pass',
    blurb: 'The announcing messenger — trumpet raised, “Do not be afraid.”',
  },
  {
    id: 'michael',
    name: 'Michael',
    source: 'pass',
    blurb: 'The archangel — helm, shield, and a sword of flame.',
  },
  {
    id: 'seraph',
    name: 'Seraph',
    source: 'pass',
    blurb: 'Six wings and a live coal — the burning one of Isaiah 6.',
  },
  {
    id: 'whale',
    name: 'Jonah’s Whale',
    source: 'paid',
    pack: 'patron',
    packName: 'Founding Patron',
    price: 'From $100',
    patron: true,
    limitedUntil: LIMITED_UNTIL,
    blurb: 'A whale of a thank-you — the founding-supporter skin.',
  },
  {
    id: 'eden',
    name: 'Eden',
    source: 'paid',
    exclusive: true,
    packName: 'Share Reward',
    // No `limitedUntil` on purpose. The limited-edition skins vanish from the
    // grid — for owners too — once their window closes (see skinExpired and the
    // filter in CustomizeSection). This one is the share promo and has to keep
    // working for as long as the code is being handed out, so it never expires;
    // retire it by toggling its promo code off in the admin panel.
    blurb: 'Eve reaching for the fruit — share Verse Arcade to unlock it. Redeem your code.',
  },
  {
    id: 'shades',
    name: 'Day One',
    source: 'paid',
    exclusive: true,
    packName: 'Live Exclusive',
    limitedUntil: LIMITED_UNTIL,
    blurb: 'Shades on. The day-one look — redeem the code from the live drop.',
  },
  {
    id: 'sonshine',
    name: 'Sonshine',
    source: 'paid',
    exclusive: true,
    packName: 'Creator Collab',
    // No `limitedUntil`, for the same reason as 'eden'. The launch skins vanish
    // from the grid once their window closes — for owners too — and a creator
    // skin has to keep working for as long as the partnership does. Retire it
    // by toggling its code off in the admin panel, never by expiring the skin.
    blurb: 'Red hair, black hoodie, red kicks — the Sonshine look. Redeem his code to wear it.',
  },
  {
    id: 'porchlight',
    name: 'Porchlight',
    source: 'paid',
    exclusive: true,
    packName: 'Creator Collab',
    // No `limitedUntil`, for the same reason as 'eden' and 'sonshine'. The
    // launch skins vanish from the grid once their window closes — for owners
    // too — and a creator skin has to keep working for as long as the
    // partnership does. Retire it by toggling its code off in the admin panel,
    // never by expiring the skin.
    //
    // THE UKULELE IS PART OF THE RENDER, not an item. Raster skins don't
    // compose (equip Moses and the shepherd's staff disappears too), so the
    // instrument that makes this look what it is has to be baked in — which is
    // also why the prompt spends three sentences insisting it is a ukulele and
    // not a guitar.
    blurb: 'Curls, a cream knit and a ukulele on the porch. Redeem his code to wear it.',
  },
]

/** 'ruth_3' -> 'ruth': reactive pass skins bake their state into the equipped
 *  id, so lookups and equality checks normalize through this. */
export const baseSkinId = (id: string): string => id.replace(/_\d+$/, '')

/**
 * Every skin this build knows: bundled, plus whatever the catalog published.
 *
 * A CatalogSkin is a narrower thing than a SkinDef — it has no price, sku or
 * pack, and its source union excludes 'paid' (see data/catalog.ts). Widening it
 * here is therefore lossless in the direction that matters: a catalog can add a
 * free, earned or road skin and cannot add one that costs money.
 */
const asSkinDef = (c: CatalogSkin): SkinDef => ({
  id: c.id,
  name: c.name,
  source: c.source,
  blurb: c.blurb,
  ...(c.states ? { states: c.states } : {}),
  ...(c.shareGoal ? { shareGoal: c.shareGoal } : {}),
  ...(c.referralGoal ? { referralGoal: c.referralGoal } : {}),
})

export const allSkins = (): SkinDef[] =>
  mergeById(FULL_SKINS, catalogOverlay().skins.map(asSkinDef))

export const skinById = (id?: string | null): SkinDef | undefined => {
  if (!id) return undefined
  const all = allSkins()
  return all.find((s) => s.id === id) ?? all.find((s) => s.id === baseSkinId(id))
}

// ── Raster skin art ──────────────────────────────────────────────────────────
// Moved here from components/Character.tsx so that ONE function decides what a
// skin looks like (skinArtUrl below). Character used to own this map, which
// meant the catalog had no way to reach it — art is content, and content lives
// in data/.
// A skin listed here renders as an image instead of drawn paths. The <image>
// sits inside the same 120×170 viewBox, so sizing, the circular clip in Avatar
// and every call site are untouched — and a skin that isn't listed keeps its
// SVG exactly as before.
//
// This is a preview path, not a decision. Raster can't compose (the free
// starter layers armour and items independently) and it softens badly at the
// 18px presence chip, so anything kept here long-term should be redrawn as
// paths. The file is served from public/, so dropping a PNG in is enough.
const RASTER_SKINS: Record<string, string> = {
  baldwin: '/skins/baldwin.png',
  david: '/skins/david.png',
  esther: '/skins/esther.png',
  moses: '/skins/moses.png',
  elijah: '/skins/elijah.png',
  eden: '/skins/eden.png',
  whale: '/skins/whale.png',
  gabriel: '/skins/gabriel.png',
  michael: '/skins/michael.png',
  seraph: '/skins/seraph.png',
  // The Pilgrimage's reactive skin: the equipped skinId carries the state
  // (ruth_1..ruth_4 — see passSkinEquipId in data/avatar), so each maps to its
  // own file and every viewer renders the right basket from the spec alone.
  ruth_1: '/skins/ruth_1.png',
  ruth_2: '/skins/ruth_2.png',
  ruth_3: '/skins/ruth_3.png',
  ruth_4: '/skins/ruth_4.png',
  boaz: '/skins/boaz.png',
}

/**
 * Raster art for a skin, or undefined to keep the drawn SVG.
 *
 * THIS IS THE ORDER THAT LETS A SEASON'S ART SHIP WITHOUT A BINARY, and each
 * step is a deliberate fallback rather than a preference:
 *
 *   1. The catalog overlay — an https URL (Supabase Storage, a CDN) published
 *      alongside the road that hands the skin out. The only tier that can
 *      appear after the app was submitted.
 *   2. GENERATED_ART — written by scripts/gen-art.mjs for anything rendered
 *      through Nano Banana and bundled into public/.
 *   3. RASTER_SKINS — the hand-placed files that predate the generator.
 *
 * An id in none of them keeps its drawn paths, which is the same bargain
 * generatedArt.ts makes one level down: a skin with no render is still a skin,
 * and no id can point at a 404 that leaves a hole where a character should be.
 * Character.tsx keeps its own onError fallback on top of this, because a URL
 * that resolves is not the same as a file that decodes.
 */
export function skinArtUrl(skinId?: string | null): string | undefined {
  if (!skinId) return undefined
  return catalogArtUrl(skinId) ?? RASTER_SKINS[skinId]
}

/**
 * Skins that LAYER onto the player's own character instead of replacing it.
 *
 * Every other skin swaps the whole figure out — equip Moses and you are Moses,
 * items and all. "Take Up Your Cross" was never that: the cross is drawn behind
 * YOUR character, in your robe and your skin tone, because the equipped look is
 * "my character carrying a cross" rather than a stranger carrying one. Putting
 * a full-length render behind that id would quietly delete the figure, tone and
 * hair the player built at the front door, which is the whole point of it.
 *
 * So an overlay skin deliberately does NOT resolve through skinArtUrl. The base
 * look underneath stays whatever it would have been with nothing equipped (the
 * starter render, or the drawn pilgrim), and Character draws the overlay behind
 * it — preferring a generated prop, falling back to the drawn paths, the same
 * bargain every other render makes.
 *
 * Adding one here is half the job: Character has to know how to draw it.
 */
const OVERLAY_SKINS = new Set(['cross'])

/** True when this skin layers onto the player's character rather than replacing it. */
export function isOverlaySkin(skinId?: string | null): boolean {
  return !!skinId && OVERLAY_SKINS.has(skinId)
}

// ── Bundles ───────────────────────────────────────────────────────────────────
// A bundle is one shop listing, one price, one checkout — all or nothing. The
// shop shows the BUNDLE tile (never its skins) until it's owned, and the buy
// sheet swipes through everything inside so nobody pays without seeing all of it.
//
// The checkout sku is `pack_<id>`; the server expands that one sku into every
// skin in `skins` on fulfillment (migration 0044), which is what makes owning
// part of a bundle impossible. The card backgrounds come along with it — they
// gate on the pack entitlement (see data/playerCards PACK), so they need no
// separate grant.
export interface BundleDef {
  id: string
  /** Checkout sku the server fulfills. Always `pack_<id>`. */
  sku: string
  name: string
  price: string
  blurb: string
  /** Skin ids included, in preview order. */
  skins: string[]
  /** Card-background keys included, in preview order (see data/playerCards). */
  cards: string[]
  limitedUntil?: string
}

/**
 * EMPTY, and deliberately kept rather than deleted.
 *
 * The Angel Pack was the only bundle and its skins are road rewards now, so
 * nothing is sold as a pack any more. The type, the shop grid and the SQL that
 * expands a pack sku (pack_skins, 0044) all stay: they cost nothing while
 * empty, every surface already renders an empty list as "no packs", and
 * deleting them would mean rebuilding the whole path if a pack is ever sold
 * again. `pack_skins('pack_angels')` also still resolves server-side, so a
 * historical Stripe or Apple receipt replayed against it fulfils exactly as it
 * always did.
 */
export const BUNDLES: BundleDef[] = []

export const bundleById = (id?: string | null): BundleDef | undefined =>
  BUNDLES.find((b) => b.id === id)

export const bundleExpired = (b: BundleDef, now: number = Date.now()): boolean =>
  b.limitedUntil != null && now >= new Date(b.limitedUntil).getTime()

/** How many things a bundle contains — the "5 items" on its tile. */
export const bundleItemCount = (b: BundleDef): number => b.skins.length + b.cards.length

// The effective equipped skin id, honoring the legacy `regalia` field.
export function equippedSkinId(spec?: AvatarSpec | null): string | null {
  if (!spec) return null
  return spec.skinId ?? (spec.regalia === 'baldwin' ? 'baldwin' : null)
}

/**
 * Does this account actually hold a paid PACK? True as soon as any skin in the
 * pack is entitled. Packs can bundle more than skins (the Angel Pack ships two
 * player-card backgrounds), so the pack — not the individual skin — is the unit
 * that gates those extras.
 *
 * No admin bypass on purpose: this is the *entitlement*, and it's what decides
 * whether the shop still lists a pack for sale. An operator who is shown the
 * storefront as though they'd bought everything can't see their own shop —
 * that's how the Angel Pack tile went missing for admins once already. Use
 * packPreviewable() for "may this account wear/equip it".
 */
export function packEntitled(pack: string, ownedSkins?: string[]): boolean {
  const owned = ownedSkins ?? []
  return FULL_SKINS.some((s) => s.pack === pack && owned.includes(s.id))
}

/**
 * May this account use the pack's contents? Same as the entitlement, plus the
 * operator, who previews every paid cosmetic for free (see skinOwned).
 */
export function packPreviewable(pack: string, ownedSkins?: string[], admin = false): boolean {
  return admin || packEntitled(pack, ownedSkins)
}

// Owned/equippable? Earned skins gate on their achievement; paid skins on the
// entitlement set.
export function skinOwned(
  skin: SkinDef,
  ctx: {
    sharedDays?: string[]
    ownedSkins?: string[]
    referralCount?: number
    admin?: boolean
    /** Reward ids unlocked on the seasonal road (store/season). */
    seasonUnlocks?: string[]
  },
): boolean {
  if (ctx.admin) return true // operator account has every skin unlocked
  if (skin.source === 'free') return true
  if (skin.source === 'pass') {
    const u = ctx.seasonUnlocks ?? []
    if (u.includes(`skin_${skin.id}`) || u.some((x) => x.startsWith(`skin_${skin.id}_`))) return true
    // A pass skin that USED to be sold still belongs to whoever bought it. The
    // angels moved from a $5.99 pack to road rewards, and an entitlement row is
    // not something a change of heart about monetisation gets to revoke.
    return (ctx.ownedSkins ?? []).includes(skin.id)
  }
  if (skin.source === 'earned') {
    if (skin.referralGoal != null) return (ctx.referralCount ?? 0) >= skin.referralGoal
    return distinctSharedDays(ctx.sharedDays) >= (skin.shareGoal ?? Number.MAX_SAFE_INTEGER)
  }
  return (ctx.ownedSkins ?? []).includes(skin.id)
}

/**
 * The skinId to store when equipping a pass skin: the highest unlocked state
 * for a reactive skin ('ruth' -> 'ruth_3'), the plain id otherwise. Baking the
 * state into the stored spec is what keeps every OTHER viewer's render correct
 * — a spec that said just 'ruth' would leave the basket's fullness to the
 * viewer, which is wrong for everyone but you.
 */
export function passSkinEquipId(skin: SkinDef, seasonUnlocks?: string[]): string {
  if (!skin.states) return skin.id
  const u = seasonUnlocks ?? []
  for (let n = skin.states; n >= 1; n--) {
    if (u.includes(`skin_${skin.id}_${n}`)) return `${skin.id}_${n}`
  }
  return `${skin.id}_1`
}
