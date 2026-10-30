// Capacitor native bootstrapping. All calls are guarded so the same code runs
// fine on the web. Wires status bar, splash hide, deep links, and the
// foreground callback that reminders hang off.
//
// The daily verse and study nudges are LOCAL notifications (lib/reminders),
// scheduled on the device because their content is deterministic. Remote push
// (APNs, iOS only) carries what another human triggers — a church check-in
// note, an operator broadcast — and is registerPush below plus push-send.

import { Capacitor } from '@capacitor/core'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import { App as CapApp } from '@capacitor/app'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from './supabase'

export async function initNative(
  onDeepLink?: (url: string) => void,
  onResume?: () => void,
  onPushOpen?: (path: string) => void,
) {
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
  // Tapping a remote notification opens the screen it names. push-send puts a
  // root-relative `url` beside `aps`; anything else is ignored rather than
  // navigated to, since the payload is the one string here a server wrote.
  if (nativePushPlatform()) {
    void PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
      const url = a.notification?.data?.url
      if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) onPushOpen?.(url)
    })
  }
}

/**
 * Remote push is iOS only. Android would need Firebase (google-services.json),
 * which is not set up, and PushNotifications.register() without it crashes the
 * app — so Android never reaches register().
 */
export function nativePushPlatform(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

/** 'prompt' | 'granted' | 'denied', or null off iOS. Never prompts. */
export async function nativePushPermission(): Promise<'prompt' | 'granted' | 'denied' | null> {
  if (!nativePushPlatform()) return null
  try {
    const s = await PushNotifications.checkPermissions()
    return s.receive === 'granted' ? 'granted' : s.receive === 'denied' ? 'denied' : 'prompt'
  } catch {
    return null
  }
}

/**
 * Re-register silently when permission is ALREADY granted, so the server holds
 * a fresh token for whoever is signed in now. iOS can reissue a token, and the
 * reminders' local-notification permission is the same iOS permission — so a
 * player who allowed reminders gets remote push with no second prompt. Never
 * asks: with no permission it does nothing.
 */
export async function refreshPushToken(): Promise<void> {
  if ((await nativePushPermission()) !== 'granted') return
  await registerPush()
}

/**
 * APNs device-token registration (iOS).
 *
 * Deliberately NOT what powers the daily verse or study nudges; those are local
 * (lib/reminders.ts). This is for what another human triggers, where only a
 * server can deliver the message — push-send reads device_tokens and signs for
 * APNs. The App ID capability, the APNs key and the aps-environment
 * entitlement (codemagic.yaml, written only when the profile carries it) are
 * docs/NATIVE-PUSH.md.
 *
 * It must NOT be called on startup for a player who hasn't granted permission:
 * `requestPermissions()` is the OS dialog, iOS offers it once, and it belongs
 * to a deliberate opt-in (PushNudge, the Settings toggle). refreshPushToken is
 * the startup path and never prompts.
 *
 * Returns the token on success, or null if unsupported, denied, or unfinished
 * (a build without the entitlement never calls back; the timeout covers it).
 */
export async function registerPush(): Promise<string | null> {
  if (!nativePushPlatform()) return null

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
    // Listeners are removed once it settles, or every call would stack another.
    const token = await new Promise<string | null>((resolve) => {
      let settled = false
      const handles: Promise<{ remove: () => Promise<void> }>[] = []
      const done = (v: string | null) => {
        if (settled) return
        settled = true
        for (const h of handles) void h.then((x) => x.remove()).catch(() => {})
        resolve(v)
      }
      handles.push(PushNotifications.addListener('registration', (t) => done(t.value)))
      handles.push(PushNotifications.addListener('registrationError', () => done(null)))
      void PushNotifications.register()
      // A device with no APNs capability never calls back at all; don't hang.
      setTimeout(() => done(null), 15000)
    })
    if (!token) return null

    if (supabase) {
      // Awaited and checked: a postgrest builder sends nothing until awaited,
      // and a token the server never stored is a phone that never rings.
      const { error } = await supabase.rpc('save_device_token', {
        p_token: token,
        p_platform: Capacitor.getPlatform() === 'android' ? 'android' : 'ios',
        // Debug builds get sandbox tokens, which 400 against production APNs.
        p_environment: import.meta.env.DEV ? 'development' : 'production',
      })
      if (error) return null
    }
    try { localStorage.setItem('va.apnsToken', token) } catch { /* only a hint for Settings */ }
    return token
  } catch {
    return null
  }
}

/**
 * The screen a link into the app names, or null. A sign-in callback is not one
 * (App.tsx handles that first). Before this, every `com.versearcade.app://` link
 * that wasn't a sign-in was ignored, so a church or battle link opened from
 * Notes or Messages opened the app on whatever screen it was last left on.
 * Accepted: the app's own scheme (`com.versearcade.app://church/<id>` →
 * `/church/<id>`) and the site's own https host, should universal links ever
 * be switched on. Anything else is refused rather than navigated to — this
 * string comes from outside the app.
 */
export function inAppPath(url: string): string | null {
  let u: URL
  try { u = new URL(url) } catch { return null }
  let path: string
  if (u.protocol === 'com.versearcade.app:') path = '/' + u.host + u.pathname
  else if (u.protocol === 'https:' && /^(www\.)?versearcade\.org$/.test(u.hostname)) path = u.pathname
  else return null
  path = path.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1')
  if (!path.startsWith('/') || path === '/auth/callback' || path.startsWith('/auth/native')) return null
  return path + u.search + u.hash
}
