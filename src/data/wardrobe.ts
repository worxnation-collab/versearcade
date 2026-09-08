// The Wardrobe — one page that says what there is to earn.
//
// Everything wearable in this app lives behind /you → Customize → a pill, which
// is three taps from anywhere and is a page you only open once you already know
// what you are looking for. So the honest state of things was: twenty-two
// skins, six pets, fifteen borders and badges, eleven items — and a player who
// had never opened that screen had no idea any of it existed. You cannot play
// toward something you have never seen.
//
// This gathers all of it into one list, grouped by HOW it is earned, and it
// obeys one rule that is the whole reason it can exist in an app with no
// losers:
//
//   IT SHOWS THE THING AND THE DOOR, NEVER THE DISTANCE.
//
// Every entry carries its art and a sentence saying what earns it. Not one
// carries a count, a bar, a percentage, an "N of M", or an ordering by how
// close you are. That is the same line the crusades set already holds inside
// the customizer ("no 3/10 wins — a screen where you watch yourself being
// behind is the thing this app doesn't build"), the Seals page holds against
// its 66, and the map holds absolutely. A gallery of what exists is an
// invitation; the same gallery with progress bars on it is a list of what you
// are behind on.
//
// It is PURELY DERIVED — no table, no grant, nothing to migrate — and it reads
// the same accessors the customizer does, so the two can never disagree about
// what is owned or what is visible.

import { BADGES, BORDERS, isUnlocked } from './cosmetics'
import { PETS, petRequirementText, petUnlocked } from './pets'
import { allItems, allSkins, itemById, setById, type SkinDef } from './avatar'
import { skinVisible } from '@/lib/commerce'

export type WardrobeKind = 'skin' | 'pet' | 'border' | 'badge' | 'item'

/** How something is come by — the grouping, and the order the page reads in. */
export type WardrobeDoor =
  | 'free'
  | 'reading'
  | 'streak'
  | 'road'
  | 'battle'
  | 'sharing'
  | 'chest'
  | 'code'
  | 'patron'

export interface DoorDef {
  id: WardrobeDoor
  name: string
  /** Where to go and do it. Empty for the doors that aren't a place. */
  to?: string
  /** One line about the door itself, never about the player's progress. */
  line: string
}

export const DOORS: DoorDef[] = [
  { id: 'free', name: 'Yours already', line: 'Free from the first minute — no condition at all.' },
  { id: 'reading', name: 'Earned by reading', to: '/bible', line: 'Open chapters of your Bible. Nothing here can be taken back.' },
  { id: 'streak', name: 'Earned by showing up', to: '/play', line: 'Your longest streak ever, so a missed day never strips one.' },
  { id: 'road', name: 'On the Harvest Road', to: '/season', line: 'Walked, never bought. The road hands these out as you go.' },
  { id: 'battle', name: 'Earned in battle', to: '/battle', line: 'Live matches and wins. Win or lose, a battle always counts for something.' },
  { id: 'sharing', name: 'Earned by sharing', to: '/play', line: 'Share the day’s verse, or bring somebody in.' },
  { id: 'chest', name: 'From the Daily Chest', to: '/play', line: 'Found by playing. The chest opens once the day’s verse is done.' },
  { id: 'code', name: 'With a code', line: 'A creator gives these away. Never sold, and there is no other door.' },
  { id: 'patron', name: 'The founding patron', line: 'The one thing here with a price, and it buys a look and nothing else.' },
]

export const doorById = (id: WardrobeDoor): DoorDef => DOORS.find((d) => d.id === id) ?? DOORS[0]

export interface WardrobeEntry {
  key: string
  kind: WardrobeKind
  /** The id the art is drawn from — a skin id, pet id, border key, item id. */
  id: string
  name: string
  door: WardrobeDoor
  /** What earns it, in words. Never a number about the player. */
  how: string
  owned: boolean
  /** For an item, which slot to crop its drawing to. */
  slot?: string
}

/** Which door a skin comes through, from the fields it already carries. */
function skinDoor(skin: SkinDef): WardrobeDoor {
  if (skin.source === 'free') return 'free'
  if (skin.source === 'pass') return 'road'
  if (skin.exclusive) return 'code'
  if (skin.source === 'paid') return 'patron'
  if (skin.chapterGoal != null) return 'reading'
  if (skin.levelGoal != null) return 'streak'
  if (skin.liveGoal != null || skin.winGoal != null) return 'battle'
  return 'sharing'
}

/** What earns a skin, in words and with no counter. */
function skinHow(skin: SkinDef): string {
  if (skin.source === 'free') return 'Yours from the start.'
  if (skin.source === 'pass') return 'A reward on the Harvest Road.'
  if (skin.exclusive) return `Redeemed with a code${skin.packName ? ` — ${skin.packName}` : ''}.`
  if (skin.source === 'paid') return 'Comes with the founding patron.'
  if (skin.chapterGoal != null) return `Earned by opening ${skin.chapterGoal} chapters of your Bible.`
  if (skin.levelGoal != null) return `Earned at level ${skin.levelGoal}.`
  if (skin.liveGoal != null) return 'Earned by playing live battles — win or lose, they all count.'
  if (skin.winGoal != null) return 'Earned by winning battles.'
  if (skin.referralGoal != null) return 'Earned by bringing friends in.'
  return 'Earned by sharing the day’s verse.'
}

export interface WardrobeContext {
  ownedSkins: string[]
  ownedItems: string[]
  longestStreak: number
  chaptersRead: number
  founder?: boolean
  /** `skinOwned` is the customizer's own predicate, passed in so the two agree. */
  isSkinOwned: (skin: SkinDef) => boolean
  petProgress: Parameters<typeof petUnlocked>[1]
  petAdmin?: boolean
}

/**
 * Everything wearable, in door order. Only what the player is ALLOWED to see:
 * `skinVisible` still decides, so a retired skin stays with its owners and a
 * priced one stays off a native shelf that cannot sell it. This page adds a way
 * in, never a way around lib/commerce.
 */
export function wardrobe(ctx: WardrobeContext): WardrobeEntry[] {
  const out: WardrobeEntry[] = []

  for (const skin of allSkins()) {
    const owned = ctx.isSkinOwned(skin)
    if (!skinVisible(skin, owned)) continue
    out.push({
      key: `skin:${skin.id}`,
      kind: 'skin',
      id: skin.id,
      name: skin.name,
      door: skinDoor(skin),
      how: skinHow(skin),
      owned,
    })
  }

  for (const pet of PETS) {
    out.push({
      key: `pet:${pet.id}`,
      kind: 'pet',
      id: pet.id,
      name: pet.name,
      door: 'streak',
      how: `${petRequirementText(pet)}.`,
      owned: petUnlocked(pet.id, ctx.petProgress, ctx.petAdmin),
    })
  }

  for (const b of BORDERS) {
    if (b.pack) continue // the patron ring is listed with its skin
    out.push({
      key: `border:${b.key}`,
      kind: 'border',
      id: b.key,
      name: b.name,
      door: b.requiredChapters != null ? 'reading' : 'streak',
      how: b.blurb,
      owned: isUnlocked(b, ctx.longestStreak, ctx.founder, ctx.chaptersRead),
    })
  }

  for (const b of BADGES) {
    if (b.key === 'none') continue
    out.push({
      key: `badge:${b.key}`,
      kind: 'badge',
      id: b.key,
      name: b.name,
      door: b.requiredChapters != null ? 'reading' : 'streak',
      how:
        b.requiredChapters != null
          ? `${b.requiredChapters.toLocaleString()} chapters of your Bible, opened.`
          : `A ${b.requiredStreak}-day streak, at your longest.`,
      owned: isUnlocked(b, ctx.longestStreak, ctx.founder, ctx.chaptersRead),
    })
  }

  const owns = new Set(ctx.ownedItems)
  for (const item of allItems()) {
    const set = setById(item.set)
    out.push({
      key: `item:${item.id}`,
      kind: 'item',
      id: item.id,
      name: item.name,
      slot: item.slot,
      // The five Harvest pieces come off the road; everything else is the chest.
      door: item.set === 'harvest' ? 'road' : 'chest',
      how: set ? `${item.blurb} Part of ${set.name}.` : item.blurb,
      owned: owns.has(item.id),
    })
  }

  return out
}

/** Entries for one door, owned first — a shelf reads better with yours on it. */
export function atDoor(all: WardrobeEntry[], door: WardrobeDoor): WardrobeEntry[] {
  return all.filter((e) => e.door === door).sort((a, b) => Number(b.owned) - Number(a.owned))
}

/** Named so a caller can label an item's slot without importing data/avatar. */
export const slotOf = (id: string): string => itemById(id)?.slot ?? 'hat'
