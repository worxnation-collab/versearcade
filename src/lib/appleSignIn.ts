// Native Sign in with Apple — the system sheet (Face ID, "Hide My Email", the
// whole thing) rather than a web view. iOS only: on Android the same plugin
// opens a web flow of its own, and the in-app browser path in store/auth.ts is
// the better one there.
//
// The shape is Apple's own: the app asks ASAuthorizationController for an
// identity token, then hands that token to Supabase (`signInWithIdToken`),
// which verifies it against Apple's keys and issues a session. No browser, no
// redirect, no bridge page. Two things have to be true outside this repo for
// it to work, and BOTH failure modes fall back to the browser path rather
// than to a dead button:
//
//   · The binary carries the Sign in with Apple ENTITLEMENT (codemagic.yaml
//     writes App.entitlements only when the provisioning profile carries the
//     capability). Without it the sheet never appears and the plugin rejects
//     with AuthorizationError 1000.
//   · Supabase's Apple provider lists the BUNDLE ID (com.versearcade.app)
//     under Client IDs, beside the Services ID the web flow uses. A native
//     token's audience is the bundle id, and a Supabase that only knows the
//     Services ID answers 400 "Unacceptable audience".
//
// The nonce is the replay guard Apple and Supabase both document: a random
// value, SHA-256'd for Apple (it lands in the token), raw for Supabase (which
// hashes it again and compares). A web view with no SubtleCrypto sends none,
// which Supabase accepts for a token that carries none.

import { Capacitor } from '@capacitor/core'
import { SignInWithApple } from '@capacitor-community/apple-sign-in'

export const APPLE_BUNDLE_ID = 'com.versearcade.app'

export type NativeAppleResult =
  | { kind: 'token'; token: string; nonce?: string }
  | { kind: 'cancelled' }
  | { kind: 'unavailable'; reason: string }

export function nativeAppleAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
}

function randomNonce(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(s: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return null
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Opens the system Sign in with Apple sheet and returns Apple's identity
 * token, or says why it couldn't. Never throws: every failure is a value so
 * the caller can decide between "stop" (the user cancelled) and "try the
 * browser instead" (anything else).
 */
export async function nativeAppleSignIn(redirectURI: string): Promise<NativeAppleResult> {
  if (!nativeAppleAvailable()) return { kind: 'unavailable', reason: 'not ios' }
  const raw = randomNonce()
  const hashed = await sha256Hex(raw)
  try {
    const { response } = await SignInWithApple.authorize({
      clientId: APPLE_BUNDLE_ID,
      redirectURI,
      scopes: 'email name',
      ...(hashed ? { nonce: hashed } : {}),
    })
    if (!response?.identityToken) return { kind: 'unavailable', reason: 'no identity token' }
    return { kind: 'token', token: response.identityToken, nonce: hashed ? raw : undefined }
  } catch (e) {
    // The plugin rejects with ASAuthorizationError's localizedDescription.
    // 1001 is the user dismissing the sheet — not an error, and NOT a reason to
    // open a browser at somebody who just said no. Everything else (1000 = no
    // entitlement, 1004 = no response) is a reason to try the other door.
    const msg = (e as Error)?.message ?? String(e)
    if (/1001|cancel/i.test(msg)) return { kind: 'cancelled' }
    return { kind: 'unavailable', reason: msg }
  }
}
