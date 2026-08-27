// "Are daily reminders switched on?" — one answer, whichever half of the app is
// asking.
//
// The app nudges people two different ways and neither knows about the other:
// native builds schedule LOCAL notifications on the device (lib/reminders), and
// the web subscribes to Web Push (lib/push). Both are "notifications are on" to
// a player, and the Eden skin unlocks on exactly that, so the question needs a
// single answer rather than two half-answers at every call site.
//
// Web Push is the awkward one: the truth is the browser's actual subscription,
// not a flag we stored, so it can only be answered asynchronously — hence the
// promise. Anything that can't be asked (no service worker, permission blocked)
// is a plain false, never a throw.

import { isPushSubscribed, pushPermission, pushSupported } from './push'
import { useReminders } from '@/store/reminders'

export async function notificationsEnabled(): Promise<boolean> {
  // Native: the device's own schedule. `supported` is the native check, so this
  // branch is only taken in the app.
  const r = useReminders.getState()
  if (r.supported) {
    return r.permission === 'granted' && (r.dropEnabled || r.studyEnabled)
  }
  // Web: an actual push subscription, not a stored flag.
  if (!pushSupported() || pushPermission() !== 'granted') return false
  try {
    return await isPushSubscribed()
  } catch {
    return false
  }
}
