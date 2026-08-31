// The lending library, and the woman behind its desk.
//
// The Study tab is a shelf you tap. This is the same shelf reached the long way
// round: a room with a librarian in it, who asks what you feel like reading and
// hands you the book. Nothing here is a second set of destinations — every
// checkout ends on a study surface the shelf already offers, so the library can
// never drift into being a menu of its own.
//
// WHY IT EXISTS: some players want the game, not the list. The shelf is faster
// and stays exactly where it was; this is for the ones who would rather be
// somewhere than pick something.
//
// WHAT IT MAY NOT BECOME. It is a Study surface, so the Study tab's rule binds
// it: nothing here ranks anybody. She has no opinion of how much you have read,
// no "you're behind on returns", no count of visits, no due date you can miss.
// A librarian who tuts is the one version of this feature that would be worse
// than no librarian.

/**
 * What the first checkout is worth, once ever.
 *
 * KEEP IN SYNC with `pay` in checkout_library_book (0081). This constant is the
 * GUEST mirror and the number the sheet draws after the fact — it is never sent
 * to the server. Online, the RPC decides what a checkout is worth and the store
 * only reports what came back, because `xp` is the worldwide leaderboard (0006).
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
