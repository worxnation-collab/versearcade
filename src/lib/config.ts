// Central config: translations (swappable), feature flags, scoring constants.
// Adding a licensed translation later is a config change here + a data source,
// never a rewrite. `premium: true` gates it behind an Apple in-app purchase.

export interface TranslationDef {
  code: string
  name: string
  shortName: string
  publicDomain: boolean
  premium: boolean
  /** REST endpoint template; {ref} is URL-encoded passage, e.g. "John 3:16". */
  apiTemplate?: string
}

export const TRANSLATIONS: Record<string, TranslationDef> = {
  BSB: {
    code: 'BSB',
    name: 'Berean Standard Bible',
    shortName: 'BSB',
    publicDomain: true,
    premium: false,
    // NOTE: bible-api.com does NOT serve the BSB (its translations are web, kjv,
    // etc.). The chapter reader (lib/bible.ts) reads unsupported translations in
    // WEB instead. Our quiz text is the bundled BSB (data/bible/pool.ts).
    apiTemplate: 'https://bible-api.com/{ref}?translation=web',
  },
  WEB: {
    code: 'WEB',
    name: 'World English Bible',
    shortName: 'WEB',
    publicDomain: true,
    premium: false,
    apiTemplate: 'https://bible-api.com/{ref}?translation=web',
  },
  // Premium slots — wired for the future, gated behind IAP, no live source yet.
  ESV: { code: 'ESV', name: 'English Standard Version', shortName: 'ESV', publicDomain: false, premium: true },
  NLT: { code: 'NLT', name: 'New Living Translation', shortName: 'NLT', publicDomain: false, premium: true },
  CSB: { code: 'CSB', name: 'Christian Standard Bible', shortName: 'CSB', publicDomain: false, premium: true },
}

export const DEFAULT_TRANSLATION =
  import.meta.env.VITE_DEFAULT_TRANSLATION || 'BSB'

// Reading translations — free, public-domain versions the chapter reader can
// fetch live (these codes are the ones bible-api.com actually serves). This is a
// *reading* preference: the daily quiz text stays the bundled BSB, but a player
// can read the full chapter in the version they love. Licensed versions (NIV,
// ESV, NLT…) would be added here once a publisher agreement + source are in place.
export interface ReadingTranslation {
  code: string // bible-api translation code (lowercase)
  name: string
  short: string
}

export const READING_TRANSLATIONS: ReadingTranslation[] = [
  { code: 'web', name: 'World English Bible', short: 'WEB' },
  { code: 'kjv', name: 'King James Version', short: 'KJV' },
  { code: 'bbe', name: 'Bible in Basic English', short: 'BBE' },
]

export const DEFAULT_READING = 'web'
export const readingByCode = (code?: string | null): ReadingTranslation =>
  READING_TRANSLATIONS.find((t) => t.code === code) ?? READING_TRANSLATIONS[0]

// Feature flags — flip these to stage rollouts.
export const FEATURES = {
  groups: true,
  ambientPresence: true,
  collectibles: true,
  dailyReward: true,
  shareCard: true,
}

// Scoring — tuned so speed AND accuracy matter, but accuracy dominates.
export const SCORING = {
  basePerCorrect: 100,
  // Speed bonus decays over the answer window; fast but not frantic.
  maxSpeedBonus: 100,
  // 16.5s — 10% slower than the original 15s window, so the clock feels less
  // frantic. Drives the countdown bar, the auto-miss timeout, and the speed
  // bonus decay in scoreQuestion(), which all read this one value.
  answerWindowMs: 16500,
  // Combo multiplier grows with consecutive correct answers (arcade juice).
  comboStep: 0.25, // +25% per combo level
  comboMax: 2.5,
}

export const isSupabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
)

// Optional "support / founding patron" payment link — a Stripe Payment Link URL
// (or any checkout URL). Kept as a swappable env value so the receiving Stripe
// account can be changed without a code change or redeploy from us; the support
// button is hidden entirely when this is unset. On web it opens in a new tab;
// note that for NATIVE app-store builds, digital-cosmetic purchases must go
// through in-app purchase — this external link is web-only.
export const SUPPORT_URL = import.meta.env.VITE_SUPPORT_URL || ''

// Per-skin checkout links (Stripe Payment Links — public, shareable URLs, not
// secrets). Env vars override the defaults so a link can be swapped without a
// code change. Falls back to SUPPORT_URL, then ''.
//
// ONE ENTRY, and that is the whole shop now. Cosmetics are no longer sold:
// Moses, Esther and Elijah are free, the angels are road rewards, and the
// founding patron is the only thing left with a price on it. Their old
// Payment Links are deleted rather than commented out — a live link with no
// product behind it is a way to take somebody's money for nothing.
//
// THE LINK IS THE SAME ONE THE WHALE USED, AND THAT IS CORRECT. A Payment Link
// is a price, not a product: what a payment GRANTS is decided by
// `client_reference_id` ("<username>-<skinId>", see lib/checkout) and resolved
// by fulfill_skin, so this one now settles as 'cephas'. Reusing it is what
// keeps web sales unbroken the minute this merges — a new link would mean a
// window with the patron card hidden (no URL ⇒ `patronOffer` returns 'hidden').
// What DOES need doing by hand, once, is renaming the product in the Stripe
// dashboard: the name on the checkout page is Stripe's, not ours, and it is the
// one place a buyer would still be told they are buying a whale. Same price,
// same link, no code change.
//
// The old `whale` key is gone with the retirement. Nothing asks for it — the
// support card asks for PATRON_SKU and the Skins grid never opens a checkout
// for a retired skin — and leaving a live $9.99 link keyed to a withdrawn
// product is exactly the "take somebody's money for nothing" case above.
export const SKIN_BUY_URLS: Record<string, string> = {
  cephas: import.meta.env.VITE_BUY_CEPHAS || 'https://buy.stripe.com/9B6fZh1Uk1lHdzC2Wda3u06',
}

export const skinBuyUrl = (id: string): string => SKIN_BUY_URLS[id] || SUPPORT_URL || ''

// Per-BUNDLE checkout links (see data/avatar BUNDLES). Empty, because BUNDLES
// is: the Angel Pack's skins are road rewards now. Kept, along with its lookup,
// so selling a pack again is a row here rather than a rebuilt code path. No
// SUPPORT_URL fallback, then or now — a pack must never quietly check out at a
// different price.
export const BUNDLE_BUY_URLS: Record<string, string> = {}

export const bundleBuyUrl = (id: string): string => BUNDLE_BUY_URLS[id] || ''

// Web Push (VAPID). This PUBLIC key is safe to ship — it's how the browser
// authenticates our push server. The matching PRIVATE key lives only as a
// Supabase Edge Function secret (VAPID_PRIVATE_KEY) and is never in the client.
// Overridable via env so the pair can be rotated without a code change.
export const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ||
  'BMjBZZ-dKxm_J-ARiuH3TPX1kjGbR4Uju1JtgZbsdp1P0phqRTiwKiEARyqOD_R0AkYhEDCcAX0tRWkkyvzHW1c'
