// What the book is called. It's the player's Bible, so it carries the player's
// name — on the title page it opens to, and in the header of every page after.
//
// Falls back to "My Bible" when there's no name yet (a fresh guest, or a profile
// still loading), which is still true and never renders as "’s Bible".
export function bibleTitle(name?: string | null): string {
  const who = (name ?? '').trim()
  if (!who) return 'My Bible'
  // A name already ending in s takes the bare apostrophe — "Thomas’ Bible", not
  // "Thomas’s Bible". Typographic apostrophe, like the rest of the app's copy.
  const suffix = /[sS]$/.test(who) ? '’' : '’s'
  return `${who}${suffix} Bible`
}
