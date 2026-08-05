// Haptics via Capacitor on device, with a graceful navigator.vibrate fallback
// on the web. Respects the user's haptics toggle. Never throws.

import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

let enabled = true
export function configureHaptics(opts: { enabled?: boolean }) {
  if (opts.enabled !== undefined) enabled = opts.enabled
}

const isNative = Capacitor.isNativePlatform()

function webVibrate(ms: number | number[]) {
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(ms)
    } catch {
      /* ignore */
    }
  }
}

export const Haptic = {
  async impact(style: ImpactStyle = ImpactStyle.Light) {
    if (!enabled) return
    if (isNative) {
      try {
        await Haptics.impact({ style })
      } catch {
        /* ignore */
      }
    } else {
      webVibrate(style === ImpactStyle.Heavy ? 30 : style === ImpactStyle.Medium ? 18 : 10)
    }
  },
  light() {
    return this.impact(ImpactStyle.Light)
  },
  medium() {
    return this.impact(ImpactStyle.Medium)
  },
  heavy() {
    return this.impact(ImpactStyle.Heavy)
  },
  async selection() {
    if (!enabled) return
    if (isNative) {
      try {
        await Haptics.selectionStart()
        await Haptics.selectionChanged()
        await Haptics.selectionEnd()
      } catch {
        /* ignore */
      }
    } else webVibrate(6)
  },
  async success() {
    if (!enabled) return
    if (isNative) {
      try {
        await Haptics.notification({ type: NotificationType.Success })
      } catch {
        /* ignore */
      }
    } else webVibrate([12, 40, 18])
  },
  async warning() {
    if (!enabled) return
    if (isNative) {
      try {
        await Haptics.notification({ type: NotificationType.Warning })
      } catch {
        /* ignore */
      }
    } else webVibrate([10, 30, 10])
  },
}
