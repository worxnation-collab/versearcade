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
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from './supabase'

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
 * APNs/FCM device-token registration.
 *
 * Deliberately NOT what powers the daily verse or study nudges; those are local
 * (lib/reminders.ts) and need none of this. What this is for is the things
 * another human triggers — a battle invite, a buddy request being accepted —
 * where only a server can deliver the message.
 *
 * The client half is now real: it asks, registers, and persists the token via
 * save_device_token (0054). The rest is not, and cannot be done from a repo:
 *
 *   · an APNs auth key from the Apple Developer account
 *   · the Push Notifications capability on the App ID
 *   · the aps-environment entitlement patched into the Xcode project that
 *     `cap add ios` regenerates on every build (codemagic.yaml)
 *   · an Edge Function that signs for APNs and reads device_tokens
 *
 * See docs/NATIVE-PUSH.md. Until those exist this must NOT be called on
 * startup: `register()` triggers the OS permission dialog, iOS only offers it
 * once, and spending it on notifications nothing can deliver wastes it for
 * good. Call it from a deliberate opt-in, the way PushNudge does on the web.
 *
 * Returns the token on success, or null if unsupported, denied, or unfinished.
 */
export async function registerPush(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null

  try {
    // checkPermissions first: 'denied' is final on iOS and requesting again
    // cannot re-prompt, so there is nothing to gain by asking.
    let status = await PushNotifications.checkPermissions()
    if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') {
      status = await PushNotifications.requestPermissions()
    }
    if (status.receive !== 'granted') return null

    // registration fires asynchronously after register() — wrap it so callers
    // get a plain awaitable token instead of having to wire listeners.
    const token = await new Promise<string | null>((resolve) => {
      let settled = false
      const done = (v: string | null) => {
        if (settled) return
        settled = true
        resolve(v)
      }
      void PushNotifications.addListener('registration', (t) => done(t.value))
      void PushNotifications.addListener('registrationError', () => done(null))
      void PushNotifications.register()
      // A device with no APNs capability never calls back at all; don't hang.
      setTimeout(() => done(null), 15000)
    })
    if (!token) return null

    if (supabase) {
      await supabase.rpc('save_device_token', {
        p_token: token,
        p_platform: Capacitor.getPlatform() === 'android' ? 'android' : 'ios',
        // Debug builds get sandbox tokens, which 400 against production APNs.
        p_environment: import.meta.env.DEV ? 'development' : 'production',
      })
    }
    return token
  } catch {
    return null
  }
}
