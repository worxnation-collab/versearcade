// The lending library, and the woman behind its desk.
//
// THE STUDY TAB IS THIS ROOM. It used to be a grid of book tiles; it is now a
// library you stand in, and everything Study can do is something in the room:
// Tabitha at her desk lends the five things you can practise, the ledger on the
// desk is your reports, and the satchel on the floor is your bag.
//
// WHY: a wall of tiles is a menu, and a menu is the thing this app keeps trying
// not to be. Every other section already opens with the place it is about — the
// road, the hall, the churchyard, your own Upper Room — and Study was the one
// that opened with a list. Now it opens with somewhere.
//
// WHAT IT MAY NOT BECOME. It is a Study surface, so the Study tab's rule binds
// it: nothing here ranks anybody. She has no opinion of how much you have read,
// no "you're behind on returns", no count of visits, no due date you can miss.
// A librarian who tuts is the one version of this feature that would be worse
// than no librarian.

/**
 * One thing you can do in Study, as the room describes it.
 *
 * This replaced `ShelfItem` when the shelf came out. It is the ONE list — the
 * room's hotspots and the librarian's offer are both built from it, so a
 * surface added to Study cannot appear in one and not the other.
 */
export interface StudyBook {
  key: string
  title: string
  /** Fallback icon, and what the Bible uses (it has no painted cover). */
  emblem: string
  /** Cover painting id in `src/assets/study/` (generate-study-covers.mjs). */
  cover?: string
  /** What's inside, in the player's terms. */
  caption: string
  to: string
  /** A count worth seeing before you tap, e.g. verses due. */
  badge?: string
  /**
   * How Tabitha describes it as she hands it over.
   *
   * An entry WITHOUT this is not something she lends — your reports and your
   * bag are your own, not stock, and they stand in the room as themselves.
   * Deciding it here, once, is what stops the room and her desk becoming two
   * lists that can disagree.
   */
  lend?: string
}

/**
 * What the FIRST BOOK OF THE DAY is worth. Every one after it is free.
 *
 * KEEP IN SYNC with `pay` in checkout_library_book (0083). This constant is the
 * GUEST mirror and the number the sheet draws after the fact — it is never sent
 * to the server. Online, the RPC decides what a checkout is worth and the store
 * only reports what came back, because `xp` is the worldwide leaderboard (0006).
 *
 * 5 a day is the smallest payout in the app — the Basin pays 12, praying 30,
 * a daily drop 30-60. And NOTHING COUNTS THE DAYS: there is no streak on the
 * table, no rung in the Journal, and no RPC that asks how many times anybody
 * has been to the library. A daily reward you can fall behind on is the version
 * of this that would be wrong, and the guarantee is in what isn't stored.
 */
export const LIBRARY_XP = 5

/** Her name. Acts 9:36 — a woman known for what she did for other people. */
export const LIBRARIAN_NAME = 'Tabitha'

/**
 * What she says while you are deciding.
 *
 * Drawn at random per opening, so she isn't a recording. Every line is an
 * offer, and none of them is a measurement — she never mentions how long it has
 * been, how much you have read, or anybody else.
 */
export const GREETINGS: readonly string[] = [
  'Evening. The lamps are lit — what are you after tonight?',
  'Come in, come in. Everything on these shelves is free to borrow.',
  'You look like someone with a book in mind. Shall I fetch it?',
  'Take your time. Nothing here is due back, ever.',
  'I keep the good ones behind the desk. Say the word.',
  'Quiet night. Perfect for reading, if you ask me.',
  'Whatever you fancy. I’ll find it.',
]

/** What she says as she hands it over, keyed by nothing — just warmth. */
export const HANDOVER: readonly string[] = [
  'There you are. Enjoy it.',
  'A good choice. Off you go.',
  'Stamped. It’s yours as long as you like.',
  'Mind the step on your way out.',
  'That one’s a favourite of mine.',
]

/** Pick a line from a pool. Plain random: nothing here needs to be seeded. */
export function lineFrom(pool: readonly string[]): string {
  return pool[Math.floor(Math.random() * pool.length)] ?? pool[0]
}
