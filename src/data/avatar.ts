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
// A skin is a whole look — it overrides the base character, armor and items
// (render lives in Character). All but one are EARNED by playing; the Founding
// Patron whale is the only thing in this app that costs money.
//
// How a skin is come by is ONE field — `requirement` — rather than a `source`
// flag plus four optional goal numbers, because every surface (the grid, the
// celebration, the collection wall) has to say the same sentence about it and
// they used to each branch their own way.

export type SkinRequirement =
  | { kind: 'share'; goal: number } // distinct days the daily verse was shared
  | { kind: 'referral'; goal: number } // signups with this account's code
  | { kind: 'streak'; goal: number } // LONGEST streak, so a miss never strips it
  | { kind: 'level'; goal: number }
  | { kind: 'plays'; goal: number } // lifetime daily drops played
  | { kind: 'church' } // has joined a church (profiles.church_id)
  | { kind: 'notifications' } // daily reminders switched on, on this device
  | { kind: 'code' } // free promo/live-drop code — never sold (redeem_code)
  | { kind: 'purchase' } // the one paid thing left

/**
 * Everything a requirement can be measured against. Assembled once by
 * store/unlocks and passed down, so no component has to know which store a
 * given number comes from.
 */
export interface UnlockContext {
  sharedDays?: string[]
  referralCount?: number
  longestStreak?: number
  level?: number
  totalPlays?: number
  /** Joined a church. Online-only fact — a guest has no church to join. */
  hasChurch?: boolean
  /** Daily reminders on: local notifications on native, Web Push on the web. */
  notificationsOn?: boolean
  /** Entitlements: bought, redeemed, or latched (see `latching` below). */
  ownedSkins?: string[]
  admin?: boolean
}

export interface RequirementProgress {
  /** Met by the live stats right now, before any latch is considered. */
  met: boolean
  /** Countable requirements only: where the player is, capped at the goal. */
  count?: number
  goal?: number
  /** The whole ask, as a sentence: "Share on 10 different days". */
  label: string
  /** Where they are against it: "Shared 7/10 days". */
  progressLabel: string
  /**
   * The ask in the past tense, for the moment it lands: "A 14-day streak".
   * `label` reads as an instruction, which is wrong on a celebration card —
   * telling someone to add the church they just added.
   */
  earnedLabel: string
  /**
   * True when the criterion can stop being true after it starts. Leaving a
   * church or switching notifications off must never take a skin back — this
   * app doesn't do that (a missed day doesn't strip a border either; see
   * cosmetics.ts) — so these are written to owned_skins the moment they're met
   * and are permanent from then on. store/unlocks does the latching.
   *
   * The rest are monotonic — a longest streak, a level, a lifetime play count
   * and a distinct-share count only ever go up — so they need no latch and
   * re-derive correctly on any device.
   */
  latching: boolean
}

const clamp = (n: number, goal: number): number => Math.max(0, Math.min(n, goal))

export function requirementProgress(req: SkinRequirement, ctx: UnlockContext): RequirementProgress {
  switch (req.kind) {
    case 'share': {
      const n = distinctSharedDays(ctx.sharedDays)
      return {
        met: n >= req.goal,
        count: clamp(n, req.goal),
        goal: req.goal,
        label: `Share the daily verse on ${req.goal} different days`,
        progressLabel: `Shared ${clamp(n, req.goal)}/${req.goal} days`,
        earnedLabel: `Shared on ${req.goal} different days`,
        latching: false,
      }
    }
    case 'referral': {
      const n = ctx.referralCount ?? 0
      return {
        met: n >= req.goal,
        count: clamp(n, req.goal),
        goal: req.goal,
        label: `Invite ${req.goal} friends with your code`,
        progressLabel: `${clamp(n, req.goal)}/${req.goal} friends joined`,
        earnedLabel: `${req.goal} friends joined with your code`,
        latching: false,
      }
    }
    case 'streak': {
      const n = ctx.longestStreak ?? 0
      return {
        met: n >= req.goal,
        count: clamp(n, req.goal),
        goal: req.goal,
        label: `Reach a ${req.goal}-day streak`,
        progressLabel: `${clamp(n, req.goal)}/${req.goal}-day streak`,
        earnedLabel: `A ${req.goal}-day streak`,
        latching: false,
      }
    }
    case 'level': {
      const n = ctx.level ?? 1
      return {
        met: n >= req.goal,
        count: clamp(n, req.goal),
        goal: req.goal,
        label: `Reach level ${req.goal}`,
        progressLabel: `Level ${clamp(n, req.goal)}/${req.goal}`,
        earnedLabel: `Reached level ${req.goal}`,
        latching: false,
      }
    }
    case 'plays': {
      const n = ctx.totalPlays ?? 0
      return {
        met: n >= req.goal,
        count: clamp(n, req.goal),
        goal: req.goal,
        label: `Play ${req.goal} daily drops`,
        progressLabel: `${clamp(n, req.goal)}/${req.goal} drops played`,
        earnedLabel: `${req.goal} daily drops played`,
        latching: false,
      }
    }
    case 'church':
      return {
        met: !!ctx.hasChurch,
        label: 'Add your church',
        progressLabel: 'Add your church',
        earnedLabel: 'For putting your church on the map',
        latching: true,
      }
    case 'notifications':
      return {
        met: !!ctx.notificationsOn,
        label: 'Turn on daily reminders',
        progressLabel: 'Turn on daily reminders',
        earnedLabel: 'For switching the daily nudge on',
        latching: true,
      }
    case 'code':
      return {
        met: false,
        label: 'Redeem a code',
        progressLabel: 'Redeem a code',
        earnedLabel: 'Redeemed with a code',
        latching: false,
      }
    case 'purchase':
      return {
        met: false,
        label: 'Founding Patron',
        progressLabel: 'Founding Patron',
        earnedLabel: 'Founding Patron — thank you',
        latching: false,
      }
  }
}

export interface SkinDef {
  id: string
  name: string
  requirement: SkinRequirement
  blurb: string
  pack?: string // the set it belongs to (see BUNDLES)
  packName?: string // display name of that set
  /** Comes only with its pack — never listed or unlocked on its own. */
  bundleOnly?: boolean
  price?: string // purchase only: the web/Stripe display price, in USD
  patron?: boolean // purchase only: high-tier supporter reward
  limitedUntil?: string // limited edition: ISO date after which it vanishes for good
}

/** What kind of thing this is, for the surfaces that still care. */
export type SkinSource = 'earned' | 'code' | 'paid'
export const skinSource = (skin: SkinDef): SkinSource =>
  skin.requirement.kind === 'purchase' ? 'paid' : skin.requirement.kind === 'code' ? 'code' : 'earned'

// Limited-edition window — the paid patron skin disappears from the shop for
// good after this moment. Owners keep what they unlocked.
//
// It is deliberately NOT on the earned skins any more. A window makes sense for
// a drop you can buy today; it makes no sense at all for a goal someone is 40
// days into working toward, and having Esther evaporate mid-streak would be the
// exact shame this app is built to avoid.
export const LIMITED_UNTIL = '2026-10-12T04:00:00Z'
export const skinExpired = (skin: SkinDef, now: number = Date.now()): boolean =>
  skin.limitedUntil != null && now >= new Date(skin.limitedUntil).getTime()

export const FULL_SKINS: SkinDef[] = [
  {
    id: 'baldwin',
    name: 'King Baldwin',
    requirement: { kind: 'share', goal: 10 },
    blurb: 'The masked Leper King — remembered for showing up, not for conquest.',
  },
  {
    id: 'david',
    name: 'David',
    requirement: { kind: 'share', goal: 25 },
    blurb: 'The giant-slayer — a shepherd underneath it all.',
  },
  {
    id: 'cross',
    name: 'Take Up Your Cross',
    requirement: { kind: 'referral', goal: 5 },
    blurb: 'Carry your cross — “daily,” as Luke 9:23 has it.',
  },
  {
    id: 'moses',
    name: 'Moses',
    requirement: { kind: 'plays', goal: 25 },
    blurb: 'The Lawgiver — staff in hand, the tablets at his side.',
  },
  {
    id: 'esther',
    name: 'Esther',
    requirement: { kind: 'streak', goal: 14 },
    blurb: 'The queen — “for such a time as this.”',
  },
  {
    id: 'elijah',
    name: 'Elijah',
    requirement: { kind: 'streak', goal: 60 },
    blurb: 'The prophet of fire — mantle, staff, and a raven.',
  },
  // ——— The Angel Pack ———
  // A set: these three are `bundleOnly`, so the grid shows the PACK — never the
  // pieces — until it's earned, and they arrive together. See BUNDLES below.
  {
    id: 'gabriel',
    name: 'Gabriel',
    requirement: { kind: 'church' },
    pack: 'angels',
    packName: 'The Angel Pack',
    bundleOnly: true,
    blurb: 'The announcing messenger — trumpet raised, “Do not be afraid.”',
  },
  {
    id: 'michael',
    name: 'Michael',
    requirement: { kind: 'church' },
    pack: 'angels',
    packName: 'The Angel Pack',
    bundleOnly: true,
    blurb: 'The archangel — helm, shield, and a sword of flame.',
  },
  {
    id: 'seraph',
    name: 'Seraph',
    requirement: { kind: 'church' },
    pack: 'angels',
    packName: 'The Angel Pack',
    bundleOnly: true,
    blurb: 'Six wings and a live coal — the burning one of Isaiah 6.',
  },
  {
    id: 'eden',
    name: 'Eden',
    requirement: { kind: 'notifications' },
    packName: 'Daily Reminder',
    // No `limitedUntil`, and it never had one: this is a standing reward, not a
    // drop. Retire it by changing its requirement, not by expiring it.
    blurb: 'Eve reaching for the fruit — the garden at first light.',
  },
  {
    id: 'shades',
    name: 'Day One',
    requirement: { kind: 'code' },
    packName: 'Live Exclusive',
    // The one skin with no goal behind it, on purpose: it's the surprise the
    // admin panel can hand out at a live drop (promo_codes → redeem_code), and
    // it's free. Keeping one code-only skin is what keeps that whole path — and
    // the Redeem entry point in the customizer — alive and testable.
    limitedUntil: LIMITED_UNTIL,
    blurb: 'Shades on. The day-one look — redeem the code from the live drop.',
  },
  {
    id: 'whale',
    name: 'Jonah’s Whale',
    requirement: { kind: 'purchase' },
    pack: 'patron',
    packName: 'Founding Patron',
    price: 'From $100',
    patron: true,
    limitedUntil: LIMITED_UNTIL,
    blurb: 'A whale of a thank-you — the founding-supporter skin.',
  },
]

export const skinById = (id?: string | null): SkinDef | undefined => FULL_SKINS.find((s) => s.id === id)

// ── Packs ─────────────────────────────────────────────────────────────────────
// A pack is one listing that unlocks several things at once — all or nothing.
// The grid shows the PACK tile (never its skins) until it's earned, and the
// sheet swipes through everything inside so the goal is worth wanting.
//
// The Angel Pack used to be a $5.99 bundle; it's now what you get for putting
// your church on the map. The card backgrounds come along with it — they gate on
// the pack entitlement (see data/playerCards PACK), so they need no separate
// grant, and the server enforces the same rule in set_card_background.
export interface BundleDef {
  id: string
  /** Checkout sku, kept so past purchases still fulfil/restore. Always `pack_<id>`. */
  sku: string
  name: string
  requirement: SkinRequirement
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
    requirement: { kind: 'church' },
    blurb:
      'Three messengers and the two skies they came out of — the whole set, unlocked together.',
    skins: ['gabriel', 'michael', 'seraph'],
    cards: ['angels_ladder', 'angels_host'],
  },
]

export const bundleById = (id?: string | null): BundleDef | undefined =>
  BUNDLES.find((b) => b.id === id)

export const bundleExpired = (b: BundleDef, now: number = Date.now()): boolean =>
  b.limitedUntil != null && now >= new Date(b.limitedUntil).getTime()

/** How many things a pack contains — the "5 items" on its tile. */
export const bundleItemCount = (b: BundleDef): number => b.skins.length + b.cards.length

// The effective equipped skin id, honoring the legacy `regalia` field.
export function equippedSkinId(spec?: AvatarSpec | null): string | null {
  if (!spec) return null
  return spec.skinId ?? (spec.regalia === 'baldwin' ? 'baldwin' : null)
}

/**
 * Does this account actually hold a PACK? True as soon as any skin in the pack
 * is entitled. Packs can bundle more than skins (the Angel Pack ships two
 * player-card backgrounds), so the pack — not the individual skin — is the unit
 * that gates those extras.
 *
 * This reads the ENTITLEMENT (owned_skins), not the live requirement, because
 * the pack's requirement latches: joining a church writes the three skins, and
 * from then on the entitlement is the truth even if the player later leaves.
 *
 * No admin bypass on purpose — an operator shown the shop as though they'd
 * bought everything can't see their own shop (that's how the Angel Pack tile
 * went missing for admins once already). Use packPreviewable() for "may this
 * account wear/equip it".
 */
export function packEntitled(pack: string, ownedSkins?: string[]): boolean {
  const owned = ownedSkins ?? []
  return FULL_SKINS.some((s) => s.pack === pack && owned.includes(s.id))
}

/**
 * May this account use the pack's contents? The entitlement, plus a pack whose
 * requirement is met right now (the latch may not have been written yet), plus
 * the operator, who previews every cosmetic (see skinOwned).
 */
export function packPreviewable(pack: string, ownedSkins?: string[], admin = false, ctx?: UnlockContext): boolean {
  if (admin) return true
  if (packEntitled(pack, ownedSkins)) return true
  if (!ctx) return false
  return FULL_SKINS.some((s) => s.pack === pack && requirementProgress(s.requirement, ctx).met)
}

/**
 * Owned/equippable?
 *
 * An entitlement in owned_skins always wins — that's a purchase, a redeemed
 * code, or a latched earned unlock, and none of those can be taken back. Past
 * that, an earned skin is simply DERIVED from the player's stats, which is why
 * hitting the goal unlocks it with nothing to claim and no server round-trip.
 */
export function skinOwned(skin: SkinDef, ctx: UnlockContext): boolean {
  if (ctx.admin) return true // operator account has every skin unlocked
  if ((ctx.ownedSkins ?? []).includes(skin.id)) return true
  return requirementProgress(skin.requirement, ctx).met
}

/** The same question for a pack, so the grid can ask about the tile it draws. */
export function bundleOwned(bundle: BundleDef, ctx: UnlockContext): boolean {
  if (ctx.admin) return true
  if (packEntitled(bundle.id, ctx.ownedSkins)) return true
  return requirementProgress(bundle.requirement, ctx).met
}
