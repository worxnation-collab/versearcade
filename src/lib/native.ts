// Capacitor native bootstrapping. All calls are guarded so the same code runs
// fine on the web. Wires status bar, splash hide, deep links, and the
// foreground callback that reminders hang off.
//
// The daily verse and study nudges are LOCAL notifications now (lib/reminders),
// scheduled on the device because their content is deterministic. Remote push
// is still unbuilt and is only needed for things another human triggers —
// battle invites — which is what registerPush below is a placeholder for.

import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import { App as CapApp } from '@capacitor/app'

export async function initNative(onDeepLink?: (url: string) => void, onResume?: () => void) {
  if (!Capacitor.isNativePlatform()) return
  try {
    await StatusBar.setStyle({ style: Style.Dark })
  } catch {
    /* ignore */
  }
  try {
    await SplashScreen.hide()
  } catch {
    /* ignore */
  }
  // Handle OAuth redirect deep links (Sign in with Apple/Google on device).
  CapApp.addListener('appUrlOpen', (event) => {
    if (event.url) onDeepLink?.(event.url)
  })
  // Every return to the foreground is a chance to re-derive scheduled
  // reminders: the horizon needs topping up as days pass, and the study nudge
  // must stop firing once the player has caught up on their reviews.
  CapApp.addListener('appStateChange', ({ isActive }) => {
    if (isActive) onResume?.()
  })
}

/**
 * APNs device-token registration — still a stub.
 *
 * Deliberately NOT what powers the daily verse or study nudges; those are local
 * (lib/reminders.ts) and need none of this. What this is for is battle invites,
 * where another player triggers the notification and only a server can deliver
 * it. Turning it on needs an Apple push key, the Push Notifications capability
 * on the App ID, the aps-environment entitlement patched into the regenerated
 * Xcode project in codemagic.yaml, a device-token table (push_subscriptions is
 * Web-Push shaped and won't hold one), and an Edge Function that signs for APNs.
 */
export async function registerPush(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null
  return null
}
