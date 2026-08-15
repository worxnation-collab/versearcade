// "Add to Home Screen" plumbing.
//
// Chrome/Edge/Samsung fire `beforeinstallprompt` once they decide the app is
// installable — and they fire it *early*, often before React has mounted. So we
// capture the event at module load (main.tsx imports this) and hand it to the UI
// later via a tiny subscribe/snapshot store.
//
// iOS Safari has no such API: installing is a manual Share → "Add to Home
// Screen". There we show instructions instead of a one-tap button.

import { useSyncExternalStore } from 'react'
import { Capacitor } from '@capacitor/core'

// Not in lib.dom yet — the event Chrome hands us to defer/re-fire the prompt.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

/** True when we're already running as an installed app (or inside the native shell). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  if (Capacitor.isNativePlatform()) return true
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone
  return window.matchMedia('(display-mode: standalone)').matches || iosStandalone === true
}

/** iOS (including iPadOS 13+, which reports itself as a Mac with a touchscreen). */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) return true
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Stop the browser's own mini-infobar so our card is the only ask.
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    deferred = null
    emit()
  })
}

export type InstallMode =
  | 'unavailable' // already installed, native shell, or browser can't do it
  | 'prompt' //     one tap — we hold a deferred beforeinstallprompt
  | 'ios' //        show the manual Share-sheet instructions

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

function snapshot(): InstallMode {
  if (installed || isStandalone()) return 'unavailable'
  if (deferred) return 'prompt'
  if (isIOS()) return 'ios'
  return 'unavailable'
}

/** Re-renders when the browser offers (or retracts) the install prompt. */
export function useInstallMode(): InstallMode {
  return useSyncExternalStore(subscribe, snapshot, () => 'unavailable' as InstallMode)
}

/**
 * Fire the deferred prompt. Resolves to the user's choice, or 'unavailable' if
 * the event is gone (it's single-use — the browser re-fires it on a later visit
 * if the user dismissed it).
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const evt = deferred
  if (!evt) return 'unavailable'
  deferred = null
  emit()
  try {
    await evt.prompt()
    const { outcome } = await evt.userChoice
    return outcome
  } catch {
    return 'unavailable'
  }
}
