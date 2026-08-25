// The native apps — one place that knows the store links, who should be asked
// what, and how to open it.
//
// There are two stores now, and the ask depends on which platform is asking:
//   • inside the native app  → they already downloaded it; ask for a review, on
//                              the store they actually got it from.
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

/** The Play listing. `id` is the applicationId in android/app/build.gradle. */
export const PLAY_PACKAGE = 'com.versearcade.app'
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`
/**
 * Play has no ?action=write-review equivalent that works from a browser intent
 * — the listing page is where a review is left, and `&showAllReviews=true` is
 * the closest thing to landing on the right part of it.
 */
export const PLAY_STORE_REVIEW_URL = `${PLAY_STORE_URL}&showAllReviews=true`

/**
 * Flip to true when the Play listing is published to a track the public can
 * reach. Until then an Android browser gets no download nudge, because the URL
 * would 404 for anyone who isn't an opted-in tester. Inside the app this is
 * irrelevant: a player running the Android build necessarily installed it from
 * a listing that exists for them.
 */
export const PLAY_LISTING_LIVE = false

/** 'ios' | 'android' | 'web' — which shell, if any, is running this code. */
const platform = (): string => {
  try {
    return Capacitor.getPlatform()
  } catch {
    return 'web'
  }
}

/** Which store this device's ask refers to. Android in the app or in a browser
 * means Play; everything else means the App Store, which is also the safe
 * default for desktop (where appStoreAsk() returns 'none' and nothing renders).
 */
export function targetStore(): 'apple' | 'play' {
  if (platform() === 'android') return 'play'
  if (isNativeApp()) return 'apple'
  try {
    return /android/i.test(navigator.userAgent) ? 'play' : 'apple'
  } catch {
    return 'apple'
  }
}

/** The store's name, for copy that would otherwise hardcode "App Store". */
export const storeName = (): string =>
  targetStore() === 'play' ? 'Google Play' : 'App Store'

/** What to call the device in a download CTA — "the iPhone app" vs "the Android app". */
export const deviceNoun = (): string => (targetStore() === 'play' ? 'Android' : 'iPhone')

export type AppStoreAsk =
  | 'review' //   already has the app — a review is the thing that helps
  | 'download' // in a mobile browser — the app is a tap away
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
  if (PLAY_LISTING_LIVE && /android/i.test(navigator.userAgent)) return 'download'
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
  // WHICH store. Getting this wrong is not cosmetic: before this check, the
  // Home "enjoying Verse Arcade?" nudge inside the ANDROID app opened
  // apps.apple.com — asking a Play user to review the app on a store they have
  // no account for. Native answers for the shell it's running in; on the web
  // the UA decides, and only Android gets Play (iOS keeps the App Store, and
  // desktop never reaches here because appStoreAsk() returns 'none').
  const url = targetStore() === 'play'
    ? kind === 'review'
      ? PLAY_STORE_REVIEW_URL
      : PLAY_STORE_URL
    : kind === 'review'
      ? APP_STORE_REVIEW_URL
      : APP_STORE_URL
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
