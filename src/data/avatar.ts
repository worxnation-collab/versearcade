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
]

export const itemById = (id?: string | null): ItemDef | undefined => ITEMS.find((i) => i.id === id)
export const itemsBySlot = (slot: ItemSlot): ItemDef[] => ITEMS.filter((i) => i.slot === slot)

// Pick a random item the player doesn't own yet (rarity-weighted), for a chest
// drop. Returns null once everything is collected. Caller supplies a 0..1 roll
// so it stays deterministic/testable.
export function drawChestItem(owned: string[], roll: number): string | null {
  const pool = ITEMS.filter((i) => !owned.includes(i.id))
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
  source: 'earned' | 'paid'
  blurb: string
  shareGoal?: number // earned: distinct shared days required
  referralGoal?: number // earned: referred signups required
  pack?: string // paid: pack sku
  packName?: string // paid: display pack name
  price?: string // paid: display "from" price (pay-what-you-want; no real IAP yet)
  patron?: boolean // paid: high-tier supporter reward
}

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
  {
    id: 'moses',
    name: 'Moses',
    source: 'paid',
    pack: 'exodus',
    packName: 'Exodus Pack',
    price: 'From $4.99',
    blurb: 'The Lawgiver — staff in hand, the tablets at his side.',
  },
  {
    id: 'esther',
    name: 'Esther',
    source: 'paid',
    pack: 'palace',
    packName: 'Palace Pack',
    price: 'From $4.99',
    blurb: 'The queen — “for such a time as this.”',
  },
  {
    id: 'elijah',
    name: 'Elijah',
    source: 'paid',
    pack: 'prophets',
    packName: 'Prophets Pack',
    price: 'From $4.99',
    blurb: 'The prophet of fire — mantle, staff, and a raven.',
  },
  {
    id: 'whale',
    name: 'Jonah’s Whale',
    source: 'paid',
    pack: 'patron',
    packName: 'Founding Patron',
    price: 'From $100',
    patron: true,
    blurb: 'A whale of a thank-you — the founding-supporter skin.',
  },
]

export const skinById = (id?: string | null): SkinDef | undefined => FULL_SKINS.find((s) => s.id === id)

// The effective equipped skin id, honoring the legacy `regalia` field.
export function equippedSkinId(spec?: AvatarSpec | null): string | null {
  if (!spec) return null
  return spec.skinId ?? (spec.regalia === 'baldwin' ? 'baldwin' : null)
}

// Owned/equippable? Earned skins gate on their achievement; paid skins on the
// entitlement set.
export function skinOwned(
  skin: SkinDef,
  ctx: { sharedDays?: string[]; ownedSkins?: string[]; referralCount?: number; admin?: boolean },
): boolean {
  if (ctx.admin) return true // operator account has every skin unlocked
  if (skin.source === 'earned') {
    if (skin.referralGoal != null) return (ctx.referralCount ?? 0) >= skin.referralGoal
    return distinctSharedDays(ctx.sharedDays) >= (skin.shareGoal ?? Number.MAX_SAFE_INTEGER)
  }
  return (ctx.ownedSkins ?? []).includes(skin.id)
}
