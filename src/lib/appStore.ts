// The native apps — one place that knows the store links, who should be asked
// what, and how to open it.
//
// Four audiences, three asks:
//   • inside a native app    → they already downloaded it; ask for a review, on
//                              whichever store they got it from.
//   • iOS on the web         → send them to the App Store.
//   • Android on the web     → send them to Play, but only once the listing is
//                              actually live (see PLAY_LISTING_LIVE).
//   • anywhere else          → nothing to ask for, so we never nag with a link
//                              they can't use.

import { Capacitor } from '@capacitor/core'
import { isIOS } from './install'

export const APP_STORE_ID = '6798202287'
export const APP_STORE_URL = `https://apps.apple.com/us/app/verse-arcade/id${APP_STORE_ID}`
/** Deep link that opens the App Store page with the review composer already up. */
export const APP_STORE_REVIEW_URL = `${APP_STORE_URL}?action=write-review`

/** Play listing URL. `id` is the applicationId, which is fixed at com.versearcade.app. */
export const PLAY_PACKAGE = 'com.versearcade.app'
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`
/** Play has no write-a-review deep link; the listing page carries the rating UI. */
export const PLAY_STORE_REVIEW_URL = PLAY_STORE_URL

/**
 * Is the Play listing published yet?
 *
 * FLIP THIS TO `true` ONLY ONCE THE APP IS LIVE ON PLAY (production track, not
 * internal/closed testing — a testing track's listing 404s for anyone not on the
 * tester list). Until then an Android web visitor is offered nothing, which is
 * the same fail-closed rule the storefront uses: never show someone a door that
 * doesn't open. Inside the Android app itself the review ask is fine either way,
 * because getting there at all means they installed it.
 */
export const PLAY_LISTING_LIVE = false

/** Which native shell we're inside, or null on the web. */
export type NativePlatform = 'ios' | 'android'

export type AppStoreAsk =
  | 'review' //   already has the app — a review is the thing that helps
  | 'download' // on a platform we ship to, in a browser — the app is a tap away
  | 'none' //     no app for this platform yet

/** True inside a Capacitor shell — i.e. this *is* one of the store apps. */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/**
 * Which store's app this is. Everything that differs between iOS and Android —
 * the RevenueCat key, the product ids, the store link — resolves through this,
 * so no component ever calls Capacitor.getPlatform() to make a decision.
 */
export function nativePlatform(): NativePlatform | null {
  try {
    if (!Capacitor.isNativePlatform()) return null
    const p = Capacitor.getPlatform()
    return p === 'ios' || p === 'android' ? p : null
  } catch {
    return null
  }
}

export function appStoreAsk(): AppStoreAsk {
  if (isNativeApp()) return 'review'
  if (isIOS()) return 'download'
  if (isAndroidWeb() && PLAY_LISTING_LIVE) return 'download'
  return 'none'
}

/** Android in a browser — not the app. Used only to offer the Play download. */
function isAndroidWeb(): boolean {
  if (isNativeApp()) return false
  try {
    return /android/i.test(navigator.userAgent)
  } catch {
    return false
  }
}

/**
 * Open the store page in a new context, so a player mid-run never loses the app
 * they're standing in.
 *
 * This is a synthetic <a target="_blank"> click rather than `window.open`, and
 * that's deliberate: `window.open(url, '_blank', 'noopener')` returns null by
 * spec, so a "did the popup open?" fallback fires *every* time and navigates the
 * player's own tab to the App Store on top of the new one. The anchor can't lie
 * to us, and Capacitor's WKWebView hands target=_blank to the system browser,
 * which is what bounces an in-app tap into the real App Store.
 */
export function openAppStore(kind: 'download' | 'review' = 'download'): void {
  const url = storeUrl(kind)
  try {
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } catch {
    window.location.href = url
  }
}

/**
 * Which store page to open. Inside a native app it's the store that app came
 * from; in a browser it's the store for the device being browsed on. Defaults to
 * Apple, which is the only place a link can currently be earned — an Android
 * browser only ever reaches here once PLAY_LISTING_LIVE says the page exists.
 */
function storeUrl(kind: 'download' | 'review'): string {
  const android = nativePlatform() === 'android' || (!isNativeApp() && isAndroidWeb())
  if (android) return kind === 'review' ? PLAY_STORE_REVIEW_URL : PLAY_STORE_URL
  return kind === 'review' ? APP_STORE_REVIEW_URL : APP_STORE_URL
}

/**
 * The store this device would be sent to, by name, for use in copy.
 *
 * Exists so no surface hardcodes "App Store" into a sentence the Android build
 * also renders — which is exactly how the review nudge ended up asking Play
 * users for an App Store review.
 */
export function storeName(): 'App Store' | 'Google Play' {
  const android = nativePlatform() === 'android' || (!isNativeApp() && isAndroidWeb())
  return android ? 'Google Play' : 'App Store'
}

/** True when the store we'd link to is Apple's — the only one we draw a mark for. */
export function isAppleStoreTarget(): boolean {
  return storeName() === 'App Store'
}
