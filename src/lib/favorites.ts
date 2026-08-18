// Favorite verses — the keepsake shelf. Any verse challenge (daily drop,
// practice replay, focus drill, CPU or real battle, a review card) ends with a
// heart the player can tap, and everything they keep lands on /favorites.
//
// Nothing here is competitive and nothing is scored: favoriting costs no XP,
// awards none, and is never shown to anyone else. It's the "I want to come back
// to this one" gesture, so it has to be one tap and instantly reversible.
//
// Only the reference is stored. The text, book, theme and facts are rehydrated
// from VERSE_POOL, so a favorite stays correct if a verse's prose is ever
// corrected, and a reference that later leaves the pool still renders (and can
// still be removed) rather than crashing the list.

import { VERSE_POOL, type VerseSeed } from '@/data/bible/pool'

/** reference -> ISO timestamp the player saved it. */
export type FavoriteMap = Record<string, string>

export interface FavoriteVerse {
  reference: string
  savedAt: string
  /** Pool metadata, when the reference is still in the pool. */
  seed?: VerseSeed
}

// A generous ceiling that a real player will never hit — it exists so a stuck
// button or a scripted client can't write unbounded rows. Keep in sync with the
// same cap in set_verse_favorite (migration 0045).
export const FAVORITES_CAP = 500

export function seedByReference(reference: string): VerseSeed | undefined {
  return VERSE_POOL.find((v) => v.reference === reference)
}

/** Newest keep first — the shelf reads as a history of what struck you lately. */
export function toList(map: FavoriteMap): FavoriteVerse[] {
  return Object.entries(map)
    .sort((a, b) => (a[1] < b[1] ? 1 : a[1] > b[1] ? -1 : 0))
    .map(([reference, savedAt]) => ({ reference, savedAt, seed: seedByReference(reference) }))
}

/** "Saved today" / "Saved 3 days ago" — friendly, never a bare timestamp. */
export function savedLabel(savedAt: string, now = new Date()): string {
  const then = new Date(savedAt)
  if (Number.isNaN(then.getTime())) return 'Saved'
  const days = Math.floor((startOfDay(now) - startOfDay(then)) / 86400000)
  if (days <= 0) return 'Saved today'
  if (days === 1) return 'Saved yesterday'
  if (days < 7) return `Saved ${days} days ago`
  if (days < 30) return `Saved ${Math.floor(days / 7)} week${days < 14 ? '' : 's'} ago`
  return `Saved ${then.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}
