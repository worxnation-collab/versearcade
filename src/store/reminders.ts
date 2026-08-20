import { create } from 'zustand'
import {
  applyPlan,
  buildPlan,
  permissionState,
  remindersAvailable,
  requestPermission,
  type ReminderPermission,
  type ReminderPrefs,
} from '@/lib/reminders'
import { useReviews } from './reviews'

// Reminder settings are a property of the DEVICE, not the account: they control
// what this phone's notification centre does, and there is no sensible way to
// sync "9am" to a tablet in another timezone. So unlike reviews or accuracy,
// this store has no online path at all — the same localStorage key in both
// modes, which is what makes it work identically for guests and signed-in
// players. Nothing here calls Supabase.
const KEY = 'va.reminders'

const DEFAULTS: ReminderPrefs = {
  dropEnabled: false,
  dropTime: '09:00',
  studyEnabled: false,
  studyTime: '19:00',
}

function readPrefs(): ReminderPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<ReminderPrefs>
    return { ...DEFAULTS, ...raw }
  } catch {
    return { ...DEFAULTS }
  }
}

// Merge onto what's on DISK, never onto in-memory state — the store can be
// empty when a write lands (deep link straight into a screen, a reload mid
// flow), and merging onto defaults would quietly reset the other toggle.
// Same scar as store/bookAccuracy.ts:record; see CLAUDE.md.
function writePrefs(patch: Partial<ReminderPrefs>): ReminderPrefs {
  const next = { ...readPrefs(), ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* storage full or blocked — keep the in-memory value */
  }
  return next
}

interface RemindersState extends ReminderPrefs {
  /** Native build? Web keeps Web Push instead (lib/push.ts). */
  supported: boolean
  permission: ReminderPermission
  loaded: boolean
  load: () => Promise<void>
  /** Returns false when the toggle could not be turned on (permission refused). */
  setEnabled: (which: 'drop' | 'study', on: boolean) => Promise<boolean>
  setTime: (which: 'drop' | 'study', time: string) => Promise<void>
  reschedule: () => Promise<void>
}

export const useReminders = create<RemindersState>((set, get) => ({
  ...DEFAULTS,
  supported: remindersAvailable(),
  permission: 'unsupported',
  loaded: false,

  async load() {
    const prefs = readPrefs()
    const supported = remindersAvailable()
    set({ ...prefs, supported, loaded: true })
    if (!supported) return
    set({ permission: await permissionState() })
    await get().reschedule()
  },

  async setEnabled(which, on) {
    if (!get().supported) return false

    if (on) {
      // Only ever prompt in response to the player flipping the switch — never
      // on launch, where it reads as a demand before the app has earned it.
      let state = await permissionState()
      if (state === 'prompt') state = (await requestPermission()) ? 'granted' : 'denied'
      set({ permission: state })
      if (state !== 'granted') return false
    }

    const key = which === 'drop' ? 'dropEnabled' : 'studyEnabled'
    set(writePrefs({ [key]: on }))
    await get().reschedule()
    return true
  },

  async setTime(which, time) {
    const key = which === 'drop' ? 'dropTime' : 'studyTime'
    set(writePrefs({ [key]: time }))
    await get().reschedule()
  },

  // Rebuild the whole plan from current state. Safe to call often, and meant to
  // be — every call re-reads the review schedule, so the study nudge stops
  // firing once the player is caught up rather than nagging about cards they've
  // already cleared.
  async reschedule() {
    const s = get()
    if (!s.supported) return
    const prefs: ReminderPrefs = {
      dropEnabled: s.dropEnabled,
      dropTime: s.dropTime,
      studyEnabled: s.studyEnabled,
      studyTime: s.studyTime,
    }
    // Permission can be revoked in iOS Settings long after we stored `true`;
    // scheduling would then silently do nothing, so re-check and reflect it.
    const permission = await permissionState()
    if (permission !== get().permission) set({ permission })
    if (permission !== 'granted') {
      await applyPlan([])
      return
    }
    const reviews = useReviews.getState()
    await applyPlan(
      buildPlan({
        now: new Date(),
        prefs,
        schedule: reviews.schedule,
        dueNow: reviews.dueRefs.length,
      }),
    )
  },
}))
