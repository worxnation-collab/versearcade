// What the church side of the app charges, in one place.
//
// The Stripe price ids are the LIVE ones (the same ids church-billing's PRICES
// names; that function is what actually opens a checkout, and an env var there
// can swap in sandbox prices). Amounts are USD cents and are web prices only — this app never shows a church price in
// the App Store build (`churchPricesVisible` in lib/commerce.ts decides that,
// for the same reason `givingLinkVisible` does), and nothing here grants
// anything: the server's `church_entitlements` (0127, 0136) is what a church
// holds.

export const CHURCH_PRODUCTS = {
  churchLeader: {
    name: 'Church Leader',
    description: 'Leadership tools plus 5 default leader looks.',
    // "Verified Church" (prod_VU9LiqvsmVNmUa)
    priceIdMonthly: 'price_1UTB37HlxD9PZQmbqMEqfOkw',
    priceIdAnnual: 'price_1UTB3HHlxD9PZQmbx5QN6Xa5',
    amountMonthly: 2900, // cents
    amountAnnual: 29000,
  },
  contentGeneration: {
    name: 'Content Generation',
    description: 'Draft questions and notes from a passage or sermon notes.',
    // "Content Generation (church add-on)" (prod_VU9LodsgFJ5Xir)
    priceIdMonthly: 'price_1UTB3BHlxD9PZQmbGFHjSxMP',
    amountMonthly: 1900,
  },
  customLeaderAvatar: {
    name: 'Custom Leader Avatar',
    description: 'Submit reference photos and notes. We’ll generate a custom avatar of you for the virtual sanctuary.',
    // "Custom Leader Avatar" (prod_VVGkrkRfTdTZCo), one-time, created 2026-10-25
    priceId: 'price_1UUGDMHlxD9PZQmbiQYsps27',
    amount: 7900, // $79.00
  },
} as const

/**
 * The five looks every Church Leader gets. The ids are a check constraint in
 * 0136 (`church_admins_leader_look_check`) as well — keep them in sync, and
 * never rename one: a stored look that stops matching draws the default.
 */
export const DEFAULT_LEADER_LOOKS = [
  { id: 'classic-clergy', name: 'Classic Clergy', blurb: 'Black cassock with white clerical collar.' },
  { id: 'liturgical-vestments', name: 'Liturgical Vestments', blurb: 'White alb with a colored stole.' },
  { id: 'professional-suit', name: 'Professional Suit', blurb: 'Dark suit with a subtle clerical touch.' },
  { id: 'robe-stole', name: 'Robe & Stole', blurb: 'Simple dark robe with embroidered stole.' },
  { id: 'contemporary', name: 'Contemporary', blurb: 'Open-collar shirt under a casual blazer.' },
] as const

export type DefaultLeaderLookId = (typeof DEFAULT_LEADER_LOOKS)[number]['id']
/** 'custom' is the delivered Custom Leader Avatar; only the server can make it valid. */
export type LeaderLookId = DefaultLeaderLookId | 'custom'

export const DEFAULT_LEADER_LOOK: DefaultLeaderLookId = 'classic-clergy'

export function isLeaderLookId(v: unknown): v is LeaderLookId {
  return v === 'custom' || DEFAULT_LEADER_LOOKS.some((l) => l.id === v)
}


/** 7900 → "$79", 2950 → "$29.50". */
export function formatUsd(cents: number): string {
  const d = cents / 100
  return `$${Number.isInteger(d) ? d : d.toFixed(2)}`
}

/** How many reference photos a custom avatar request takes, and its notes cap. Mirrors 0136. */
export const AVATAR_PHOTOS_MIN = 1
export const AVATAR_PHOTOS_MAX = 3
export const AVATAR_NOTES_MAX = 500
