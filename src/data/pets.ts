// Pets — a companion that stands beside you on your own profile, and for the
// rarer ones, something it actually does.
//
// TWO TIERS, and the split is the whole design. The common pets are company and
// nothing else: no bonus, no number, no advantage. The rarer ones each do one
// small thing, and what a pet does is tied to how hard it was to get, so the
// ladder means something without any of it being a wall.
//
// EARNED, NEVER SOLD. Level plus one challenge, both of which only go up, so a
// pet can't be lost, traded, bought, dropped or promo-coded — which also means
// there is no version of this that becomes a storefront `commerce.ts` has to
// gate.
//
// WHERE THE EFFECTS ARE ALLOWED TO REACH, and this is the load-bearing part:
//
//   • `xp` touches the one number in this app that actually ranks people, so
//     every XP pet is gated on a column THE SERVER WROTE ITSELF (level, longest
//     streak, total plays — all written by submit_play). The bonus is small
//     (3-5% of one daily drop) and it is applied in submit_play, not sent by
//     the client. A pet can never be worth more than a slightly better run.
//   • `glow` and the other cosmetics can be gated on anything, including the
//     keep's counters, because 0059 clamps those rather than verifying them and
//     a forged counter is worth a halo, not standing.
//   • `luck` only moves study-drop odds, and a study drop pays no XP, no points
//     and no standing — its only use is giving a relic to your church. So it
//     can't be farmed into anything rankable either.
//
// The honest caveat, written down rather than glossed: an XP pet does compound
// a little (you need level 33 to get the thing that levels you slightly faster).
// It's bounded at 5% of one play a day, which is why it's tolerable — if these
// numbers ever grow, that argument stops holding.
//
// KEEP IN SYNC with 0064 (`pet_requirements_met`, `pet_xp_bonus`,
// `pet_drop_luck`). The server is the gate; this copy draws the ladder, shows
// progress, and is the guest-mode rule.

/** What a pet does. The common ones do nothing, on purpose. */
export type PetEffect = 'xp' | 'glow' | 'luck'

/** The second thing a pet asks for, on top of a level. */
export type PetReq =
  | { kind: 'streak'; n: number }
  | { kind: 'plays'; n: number }
  | { kind: 'studied'; n: number }
  | { kind: 'cpu_won'; n: number }

export interface PetDef {
  id: string
  name: string
  /** Player level this pet needs. */
  level: number
  /** And one more thing, for everything past the first. */
  extra?: PetReq
  blurb: string
  /** What it does. Empty for the common ones. */
  effects: PetEffect[]
  /** Fraction added to a daily drop's XP. 0 unless `effects` has 'xp'. */
  xpBonus: number
  /** Multiplier on the study-drop chance. 1 unless `effects` has 'luck'. */
  dropLuck: number
  /**
   * Height relative to the figure it stands beside (1 = same height). Kept well
   * under 1 for the big animals on purpose: a camel drawn to real scale is a
   * mount with a person next to it, and the picture is meant to be a person
   * with their companion.
   */
  scale: number
}

export const PETS: PetDef[] = [
  {
    id: 'pet_lamb',
    name: 'Lamb',
    level: 10,
    blurb: 'Follows you everywhere. Knows your voice.',
    effects: [],
    xpBonus: 0,
    dropLuck: 1,
    scale: 0.38,
  },
  {
    id: 'pet_dove',
    name: 'Dove',
    level: 15,
    extra: { kind: 'streak', n: 7 },
    blurb: 'Came back with an olive leaf once.',
    effects: [],
    xpBonus: 0,
    dropLuck: 1,
    scale: 0.26,
  },
  {
    id: 'pet_raven',
    name: 'Raven',
    level: 20,
    extra: { kind: 'studied', n: 250 },
    blurb: 'Brought bread and meat, morning and evening — and still brings things back.',
    effects: ['luck'],
    xpBonus: 0,
    dropLuck: 1.35,
    scale: 0.3,
  },
  {
    // The id keeps its original spelling because 0064 speaks it; the NAME is
    // 'Lion' because the render is a full-grown one. Asking the generator for a
    // cub returned PROHIBITED_CONTENT twice, and a lion beside the lamb is the
    // better picture anyway (Isaiah 11:6).
    id: 'pet_lion_cub',
    name: 'Lion',
    level: 26,
    extra: { kind: 'cpu_won', n: 25 },
    blurb: 'Lies down with the lamb, most days. You walk a little brighter.',
    effects: ['glow'],
    xpBonus: 0,
    dropLuck: 1,
    scale: 0.42,
  },
  {
    id: 'pet_donkey',
    name: 'Donkey',
    level: 33,
    extra: { kind: 'plays', n: 150 },
    blurb: 'Has opinions, and has been known to voice them. Carries some of the load.',
    effects: ['xp'],
    xpBonus: 0.03,
    dropLuck: 1,
    scale: 0.48,
  },
  {
    id: 'pet_camel',
    name: 'Camel',
    level: 40,
    extra: { kind: 'streak', n: 30 },
    blurb: 'Long roads, no complaints. Well — some complaints.',
    effects: ['xp', 'glow'],
    xpBonus: 0.05,
    dropLuck: 1,
    scale: 0.6,
  },
]

export const petById = (id?: string | null): PetDef | undefined =>
  id ? PETS.find((p) => p.id === id) : undefined

/** The first pet on the ladder — what the "coming at level 10" line names. */
export const FIRST_PET = PETS[0]

// ── Progress ─────────────────────────────────────────────────────────────────
// Everything a requirement can ask about, gathered once by the caller so this
// file never has to import a store (and so `setPet` can gate without dragging
// the bible and keep stores into the auth store's import graph).

export interface PetProgress {
  level: number
  /** Longest streak ever, not the current one — nothing here can be lost. */
  streak: number
  plays: number
  /** Verses marked studied (any mode). */
  studied: number
  /** Lifetime CPU races won (the keep's counter). */
  cpuWon: number
}

export const EMPTY_PET_PROGRESS: PetProgress = {
  level: 1,
  streak: 0,
  plays: 0,
  studied: 0,
  cpuWon: 0,
}

/** Where the player stands against one requirement. */
export function reqValue(req: PetReq, p: PetProgress): number {
  switch (req.kind) {
    case 'streak':
      return p.streak
    case 'plays':
      return p.plays
    case 'studied':
      return p.studied
    case 'cpu_won':
      return p.cpuWon
  }
}

export function reqText(req: PetReq): string {
  switch (req.kind) {
    case 'streak':
      return `a ${req.n}-day streak`
    case 'plays':
      return `${req.n} days played`
    case 'studied':
      return `${req.n} verses studied`
    case 'cpu_won':
      return `${req.n} CPU races won`
  }
}

/**
 * `admin` is the operator preview, exactly as it works for skins (see
 * `skinOwned`): the account that has to screenshot, demo and sanity-check a
 * companion can't be made to grind 250 verses for the raven first. It is
 * server-authoritative — `profiles.is_admin`, which no client can set — and
 * 0067 mirrors it inside `pet_requirements_met`, so the picker and `set_pet`
 * agree about who may equip what. Without that mirror the grid would offer an
 * admin six pets and the RPC would refuse five of them.
 */
export function petUnlocked(id: string, p: PetProgress, admin = false): boolean {
  const def = petById(id)
  if (!def) return false
  if (admin) return true // operator account has every pet unlocked
  if (p.level < def.level) return false
  if (def.extra && reqValue(def.extra, p) < def.extra.n) return false
  return true
}

export function unlockedPets(p: PetProgress, admin = false): PetDef[] {
  return PETS.filter((def) => petUnlocked(def.id, p, admin))
}

/** The next one to earn, for the single line that says what's coming. */
export function nextPet(p: PetProgress, admin = false): PetDef | undefined {
  return PETS.find((def) => !petUnlocked(def.id, p, admin))
}

/** "Level 33 · 150 days played" — what the row says when it's still locked. */
export function petRequirementText(def: PetDef): string {
  return def.extra ? `Level ${def.level} · ${reqText(def.extra)}` : `Level ${def.level}`
}

// ── Effects ──────────────────────────────────────────────────────────────────
// Read by the reward math on both sides. KEEP IN SYNC with 0064.

/** Fraction added to a daily drop's XP — mirrors `pet_xp_bonus`. */
export function petXpBonus(id?: string | null): number {
  return petById(id)?.xpBonus ?? 0
}

/** Multiplier on the study-drop chance — mirrors `pet_drop_luck`. */
export function petDropLuck(id?: string | null): number {
  return petById(id)?.dropLuck ?? 1
}

/** Whether the character wears an aura. Pure decoration; no number moves. */
export function petGlows(id?: string | null): boolean {
  return !!petById(id)?.effects.includes('glow')
}

/** One short phrase for the picker: what this pet does, or that it doesn't. */
export function petEffectText(def: PetDef): string {
  const parts: string[] = []
  if (def.xpBonus > 0) parts.push(`+${Math.round(def.xpBonus * 100)}% XP on the daily drop`)
  if (def.effects.includes('glow')) parts.push('you glow')
  if (def.dropLuck > 1) parts.push(`+${Math.round((def.dropLuck - 1) * 100)}% study-drop luck`)
  return parts.length ? parts.join(' · ') : 'Just company'
}
