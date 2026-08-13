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

import type { ArmorSlot, AvatarSpec } from '@/types'

export type { ArmorSlot, AvatarSpec }

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

export function accessOwned(access: Access | undefined, longestStreak: number): boolean {
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
