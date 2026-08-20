// The native iOS app — one place that knows the store link, who should be asked
// what, and how to open it.
//
// Three audiences, three asks:
//   • inside the native app  → they already downloaded it; ask for a review.
//   • iOS on the web         → send them to the App Store.
//   • anywhere else          → nothing to ask for yet (no Android build), so we
//                              never nag with a link they can't use.

import { Capacitor } from '@capacitor/core'
import { isIOS } from './install'

export const APP_STORE_ID = '6798202287'
export const APP_STORE_URL = `https://apps.apple.com/us/app/verse-arcade/id${APP_STORE_ID}`
/** Deep link that opens the App Store page with the review composer already up. */
export const APP_STORE_REVIEW_URL = `${APP_STORE_URL}?action=write-review`

export type AppStoreAsk =
  | 'review' //   already has the app — a review is the thing that helps
  | 'download' // on iOS in a browser — the app is a tap away
  | 'none' //     no app for this platform yet

/** True inside the Capacitor shell — i.e. this *is* the App Store app. */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

export function appStoreAsk(): AppStoreAsk {
  if (isNativeApp()) return 'review'
  if (isIOS()) return 'download'
  return 'none'
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
  const url = kind === 'review' ? APP_STORE_REVIEW_URL : APP_STORE_URL
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
