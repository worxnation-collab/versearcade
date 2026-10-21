// The keep's backdrop rotator. Five painted halls (src/assets/keeps/), and one
// of them is drawn behind the room each time the Keep is opened or the app
// comes back to the foreground.
//
// It is BACKGROUND ONLY: every scene is a bare hall with no figure and nothing
// to tap, so the anchors, the crowd and the gonfalon all sit over it exactly as
// they sat over the tier paintings. The drawn tier hall is still underneath as
// the loading/offline fallback.
//
// The pick is module state rather than per-component, so the hall on the Battle
// tab and the hall in the sheet are the same room at the same moment.

import { useEffect, useSyncExternalStore } from 'react'
import keep1 from '@/assets/keeps/keep1.jpg'
import keep2 from '@/assets/keeps/keep2.jpg'
import keep3 from '@/assets/keeps/keep3.jpg'
import keep4 from '@/assets/keeps/keep4.jpg'
import keep5 from '@/assets/keeps/keep5.jpg'

export const KEEP_BACKDROPS: readonly string[] = [keep1, keep2, keep3, keep4, keep5]

let current = Math.floor(Math.random() * KEEP_BACKDROPS.length)
// The import-time pick IS the first opening's pick; re-rolling on that first
// mount too would swap the painting a frame after it appeared.
let fresh = true
const listeners = new Set<() => void>()

/** Pick a new backdrop — never the one already showing, so a re-roll is seen. */
export function rerollKeepBackdrop() {
  const n = KEEP_BACKDROPS.length
  fresh = false
  if (n < 2) return
  current = (current + 1 + Math.floor(Math.random() * (n - 1))) % n
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

// Returning to the app re-rolls too. One listener for the whole app, attached
// once at import.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') rerollKeepBackdrop()
  })
}

/** The current backdrop URL, re-rolled when the calling hall mounts. */
export function useKeepBackdrop(): string {
  useEffect(() => {
    if (fresh) fresh = false
    else rerollKeepBackdrop()
  }, [])
  const i = useSyncExternalStore(subscribe, () => current, () => current)
  return KEEP_BACKDROPS[i]
}
