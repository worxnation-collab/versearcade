// Web Push subscribe/unsubscribe helpers for the browser.
//
// Flow: the service worker (public/sw.js, registered in main.tsx) owns the
// PushManager. Here we request notification permission, subscribe with our
// VAPID public key, and persist the resulting subscription server-side via the
// save_push_subscription RPC so the push-send Edge Function can reach it.

import { supabase } from './supabase'
import { VAPID_PUBLIC_KEY } from './config'

export type PushState = 'unsupported' | 'default' | 'denied' | 'granted'

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function pushPermission(): PushState {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission as PushState
}

// VAPID public keys are base64url; PushManager wants a Uint8Array.
function urlB64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

// The push service returns keys as ArrayBuffers; encode them base64url for the DB.
function bufToB64url(buf: ArrayBuffer | null): string {
  if (!buf) return ''
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null
  try {
    // main.tsx registers /sw.js on load; ready resolves once it's active.
    return await navigator.serviceWorker.ready
  } catch {
    return null
  }
}

export async function isPushSubscribed(): Promise<boolean> {
  const reg = await readyRegistration()
  if (!reg) return false
  const sub = await reg.pushManager.getSubscription()
  return !!sub
}

// Ask permission (if needed), subscribe, and persist. Returns true on success.
// Throws only for unexpected errors; a denied permission resolves to false.
export async function enablePush(): Promise<boolean> {
  if (!pushSupported() || !supabase) return false

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false

  const reg = await readyRegistration()
  if (!reg) return false

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    })
  }

  const json = sub.toJSON()
  const keys = json.keys || {}
  const p256dh = keys.p256dh || bufToB64url(sub.getKey('p256dh'))
  const auth = keys.auth || bufToB64url(sub.getKey('auth'))

  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: navigator.userAgent,
  })
  if (error) throw error
  return true
}

// Unsubscribe locally and remove the row server-side.
export async function disablePush(): Promise<void> {
  const reg = await readyRegistration()
  if (!reg) return
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  try {
    await sub.unsubscribe()
  } catch {
    /* ignore */
  }
  if (supabase) {
    await supabase.rpc('delete_push_subscription', { p_endpoint: endpoint })
  }
}
