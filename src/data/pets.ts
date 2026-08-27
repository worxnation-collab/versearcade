// Pets — a companion that stands beside you on your own profile.
//
// The first thing to say is what a pet ISN'T, because that's what lets it
// exist here at all: it is not a stat, not a bonus, not a multiplier, and not
// something anyone can be beaten by. It doesn't touch XP, points, streaks,
// standing or any board. A pet is company.
//
// EARNED BY LEVEL, and only by level. Player level comes from playing, so a
// pet is the app noticing you've been around a while — nothing here can be
// bought, dropped, promo-coded or traded, which also means there is no version
// of this that turns into a storefront `commerce.ts` would have to gate.
//
// The ladder starts at 10 rather than at 1 on purpose. A companion that arrives
// on day one is a default; one that arrives after a month is a small event, and
// levels only ever go up, so nobody can lose one.
//
// KEEP IN SYNC with `pet_min_level` in 0063 — the server is the gate, this copy
// draws the ladder and greys out what isn't earned. Same pair as the churchyard
// flora and the keep's offering ladder.

export interface PetDef {
  id: string
  name: string
  /** Player level this pet arrives at. */
  level: number
  blurb: string
  /**
   * Height relative to the figure it stands beside (1 = same height). Kept well
   * under 1 for the big animals on purpose: a camel drawn to real scale is a
   * mount with a person next to it, and the picture is meant to be a person
   * with their companion.
   */
  scale: number
}

export const PETS: PetDef[] = [
  { id: 'pet_lamb', name: 'Lamb', level: 10, scale: 0.38, blurb: 'Follows you everywhere. Knows your voice.' },
  { id: 'pet_dove', name: 'Dove', level: 15, scale: 0.26, blurb: 'Came back with an olive leaf once.' },
  { id: 'pet_raven', name: 'Raven', level: 20, scale: 0.3, blurb: 'Brought bread and meat, morning and evening.' },
  { id: 'pet_lion_cub', name: 'Lion Cub', level: 26, scale: 0.42, blurb: 'Lies down with the lamb, most days.' },
  { id: 'pet_donkey', name: 'Donkey', level: 33, scale: 0.48, blurb: 'Has opinions, and has been known to voice them.' },
  { id: 'pet_camel', name: 'Camel', level: 40, scale: 0.6, blurb: 'Long roads, no complaints. Well — some complaints.' },
]

export const petById = (id?: string | null): PetDef | undefined =>
  id ? PETS.find((p) => p.id === id) : undefined

/** The first pet on the ladder — what the "coming at level 10" line names. */
export const FIRST_PET = PETS[0]

export function petUnlocked(id: string, level: number): boolean {
  const p = petById(id)
  return !!p && level >= p.level
}

export function unlockedPets(level: number): PetDef[] {
  return PETS.filter((p) => level >= p.level)
}

/** The next one to earn, for the single line that says what's coming. */
export function nextPet(level: number): PetDef | undefined {
  return PETS.find((p) => level < p.level)
}
