import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useOverlayHold } from '@/store/overlayHold'

// The two held toasts (`NowPlaying`, `UnlockToast`) wait until the player is on
// one of the five tab roots. Everywhere else the top-left corner is a control —
// the run gate's ✕, the Cross Word's ←, a sub-screen's back pill, the auth
// screen's header — and the track card landed exactly there on all of them
// (found by driving the app, 2026-10-29). Holding per screen would mean every
// new screen remembering to; holding everywhere but the tab roots inverts it,
// so a screen added tomorrow is covered by default. The card is not lost: its
// clock restarts when the hold lifts, the way the tutorial's hold works.
const TAB_ROOTS = new Set(['/play', '/battle', '/study', '/church', '/you'])

export function OffTabHold() {
  const { pathname } = useLocation()
  const onTab = TAB_ROOTS.has(pathname.replace(/\/+$/, '') || '/')
  useEffect(() => {
    const { hold, release } = useOverlayHold.getState()
    if (onTab) release('off-tab')
    else hold('off-tab')
  }, [onTab])
  return null
}
