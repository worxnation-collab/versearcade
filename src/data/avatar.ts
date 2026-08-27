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

import type { ArmorSlot, AvatarSpec, ItemSlot } from '@/types'

export type { ArmorSlot, AvatarSpec, ItemSlot }

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

export const SKINS: Swatch[] = [
  { key: 'porcelain', name: 'Porcelain', hex: '#F0C9A8' },
  { key: 'sand', name: 'Sand', hex: '#E0B48C' },
  { key: 'amber', name: 'Amber', hex: '#C68A5E' },
  { key: 'umber', name: 'Umber', hex: '#8A5A38' },
  { key: 'ebony', name: 'Ebony', hex: '#5A3A24' },
]

// Robe / tunic colors — base ones free, one Studio color to show the model.
export const ROBES: Swatch[] = [
  { key: 'linen', name: 'Linen', hex: '#8C7B63', access: { kind: 'free' } },
  { key: 'olive', name: 'Olive', hex: '#6B7350', access: { kind: 'free' } },
  { key: 'indigo', name: 'Indigo', hex: '#5A4CA0', access: { kind: 'free' } },
  { key: 'crimson', name: 'Crimson Royal', hex: '#9A3B3B', access: { kind: 'studio' } },
]

export const DEFAULT_AVATAR: AvatarSpec = {
  skin: 'sand',
  robe: 'linen',
  armor: { breastplate: true }, // everyone starts with the free breastplate
}

export const skinHex = (key: string): string => (SKINS.find((s) => s.key === key) ?? SKINS[1]).hex
export const robeHex = (key: string): string => (ROBES.find((r) => r.key === key) ?? ROBES[0]).hex

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
  const equipped = (Object.keys(spec.armor) as (keyof typeof spec.armor)[]).filter((k) => spec.armor[k])
  return (
    !spec.regalia &&
    spec.skin === DEFAULT_AVATAR.skin &&
    spec.robe === DEFAULT_AVATAR.robe &&
    equipped.length === 1 &&
    equipped[0] === 'breastplate'
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
  /** 'pass' = earned on the seasonal road (data/season). Never sold, never in
   *  the shop, no limitedUntil — road skins are permanent for their owners and
   *  simply never return for anyone else. */
  source: 'earned' | 'paid' | 'pass'
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
  {
    id: 'moses',
    name: 'Moses',
    source: 'paid',
    pack: 'exodus',
    packName: 'Exodus Pack',
    price: 'From $2.99',
    limitedUntil: LIMITED_UNTIL,
    blurb: 'The Lawgiver — staff in hand, the tablets at his side.',
  },
  {
    id: 'esther',
    name: 'Esther',
    source: 'paid',
    pack: 'palace',
    packName: 'Palace Pack',
    price: 'From $2.99',
    limitedUntil: LIMITED_UNTIL,
    blurb: 'The queen — “for such a time as this.”',
  },
  {
    id: 'elijah',
    name: 'Elijah',
    source: 'paid',
    pack: 'prophets',
    packName: 'Prophets Pack',
    price: 'From $2.99',
    limitedUntil: LIMITED_UNTIL,
    blurb: 'The prophet of fire — mantle, staff, and a raven.',
  },
  // ——— The Angel Pack ———
  // A true bundle: these three are `bundleOnly`, so the shop lists the pack —
  // never the pieces — and they can't be bought one at a time. See BUNDLES below.
  {
    id: 'gabriel',
    name: 'Gabriel',
    source: 'paid',
    pack: 'angels',
    packName: 'The Angel Pack',
    bundleOnly: true,
    limitedUntil: LIMITED_UNTIL,
    blurb: 'The announcing messenger — trumpet raised, “Do not be afraid.”',
  },
  {
    id: 'michael',
    name: 'Michael',
    source: 'paid',
    pack: 'angels',
    packName: 'The Angel Pack',
    bundleOnly: true,
    limitedUntil: LIMITED_UNTIL,
    blurb: 'The archangel — helm, shield, and a sword of flame.',
  },
  {
    id: 'seraph',
    name: 'Seraph',
    source: 'paid',
    pack: 'angels',
    packName: 'The Angel Pack',
    bundleOnly: true,
    limitedUntil: LIMITED_UNTIL,
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
]

/** 'ruth_3' -> 'ruth': reactive pass skins bake their state into the equipped
 *  id, so lookups and equality checks normalize through this. */
export const baseSkinId = (id: string): string => id.replace(/_\d+$/, '')

export const skinById = (id?: string | null): SkinDef | undefined =>
  id ? FULL_SKINS.find((s) => s.id === id) ?? FULL_SKINS.find((s) => s.id === baseSkinId(id)) : undefined

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

export const BUNDLES: BundleDef[] = [
  {
    id: 'angels',
    sku: 'pack_angels',
    name: 'The Angel Pack',
    price: '$5.99',
    blurb:
      'Three messengers and the two skies they came out of. Sold as one pack — every piece, one price.',
    skins: ['gabriel', 'michael', 'seraph'],
    cards: ['angels_ladder', 'angels_host'],
    limitedUntil: LIMITED_UNTIL,
  },
]

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
  if (skin.source === 'pass') {
    const u = ctx.seasonUnlocks ?? []
    return u.includes(`skin_${skin.id}`) || u.some((x) => x.startsWith(`skin_${skin.id}_`))
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
