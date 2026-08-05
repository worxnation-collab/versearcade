// Capacitor native bootstrapping. All calls are guarded so the same code runs
// fine on the web. Wires status bar, splash hide, and push-notification
// registration (the token would be sent to your backend to schedule the daily
// "your verse just dropped" nudge — see docs/ARCHITECTURE.md).

import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import { App as CapApp } from '@capacitor/app'

export async function initNative(onDeepLink?: (url: string) => void) {
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
}

export async function registerPush(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null
  // Deferred: full APNs wiring needs an Apple push key + a backend scheduler.
  // Left as a documented stub so the daily reminder can be turned on later.
  return null
}
