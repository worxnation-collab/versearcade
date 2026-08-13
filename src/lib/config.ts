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
  answerWindowMs: 15000,
  // Combo multiplier grows with consecutive correct answers (arcade juice).
  comboStep: 0.25, // +25% per combo level
  comboMax: 2.5,
}

export const isSupabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
)
