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
// secrets). Each paid skin can have its own; env vars override the defaults so a
// link can be swapped without a code change. Falls back to SUPPORT_URL, then ''.
export const SKIN_BUY_URLS: Record<string, string> = {
  whale: import.meta.env.VITE_BUY_WHALE || 'https://buy.stripe.com/aFa4gz9mM0hD536aoFa3u01',
  moses: import.meta.env.VITE_BUY_MOSES || 'https://buy.stripe.com/dRmcN5cyY7K5brubsJa3u02',
  esther: import.meta.env.VITE_BUY_ESTHER || 'https://buy.stripe.com/dRmcN51Ukd4pbrugN3a3u04',
  elijah: import.meta.env.VITE_BUY_ELIJAH || 'https://buy.stripe.com/9B63cvbuU1lH67absJa3u03',
}

export const skinBuyUrl = (id: string): string => SKIN_BUY_URLS[id] || SUPPORT_URL || ''

// Per-BUNDLE checkout links (see data/avatar BUNDLES). A bundle is one sku at one
// price, so it gets exactly one link — there is intentionally no per-skin link
// for anything sold only as part of a pack, and no SUPPORT_URL fallback here: a
// pack must never quietly check out at a different price. With no link at all
// the sheet says "opening soon" instead.
export const BUNDLE_BUY_URLS: Record<string, string> = {
  angels: import.meta.env.VITE_BUY_PACK_ANGELS || 'https://buy.stripe.com/bJe3cv2Yo9Sdanq0O5a3u05',
}

export const bundleBuyUrl = (id: string): string => BUNDLE_BUY_URLS[id] || ''

// Web Push (VAPID). This PUBLIC key is safe to ship — it's how the browser
// authenticates our push server. The matching PRIVATE key lives only as a
// Supabase Edge Function secret (VAPID_PRIVATE_KEY) and is never in the client.
// Overridable via env so the pair can be rotated without a code change.
export const VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ||
  'BATVXr89OTFcSQOh7Xa0J3d0y2wTqUhez1cxF5XJSPor1vARrhc0jJLGvJr3n7HHDBL0NSAuIEBbHqwNyE9XCec'
