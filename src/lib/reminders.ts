// Local notifications — the daily drop nudge and the "your study is calling"
// nudge, scheduled ON THE DEVICE rather than pushed from a server.
//
// Why local and not push: both of these are predictable. `getVerseForDate` is
// deterministic (see CLAUDE.md), so the device already knows which verse lands
// on which day, months ahead — there is nothing a server could tell it that it
// can't work out itself. That buys a lot: no APNs key, no scheduler, no
// delivery failures, it works in airplane mode, and crucially it works for
// GUESTS, who have no row in push_subscriptions and would otherwise get
// nothing. Battle invites are the opposite case — another human triggers them —
// and those genuinely need remote push. This file is not that.
//
// Web keeps Web Push (lib/push.ts). This is native-only: the Capacitor plugin
// has no meaningful web implementation, and the SDK is imported lazily so it
// never enters the web bundle — same reasoning as the RevenueCat import in
// lib/iap.ts.

import { getVerseForDate } from '@/data/bible/questions'
import type { ReviewSchedule } from '@/lib/review'
import { isNativeApp } from './appStore'

type LocalNotificationsModule = typeof import('@capacitor/local-notifications')
let sdk: LocalNotificationsModule | null = null

async function loadSdk(): Promise<LocalNotificationsModule> {
  if (!sdk) sdk = await import('@capacitor/local-notifications')
  return sdk
}

/** Can this build schedule local notifications at all? */
export function remindersAvailable(): boolean {
  return isNativeApp()
}

// Notification ids are ours to choose, and we must be able to recognise our own
// so a reschedule cancels only what this file created. Two fixed blocks, wide
// enough for the horizons below and far from anything else.
const DROP_ID_BASE = 41_000
const STUDY_ID_BASE = 42_000

// How far ahead to schedule. iOS keeps at most 64 pending local notifications
// per app and silently drops the rest, so these two must stay well under it.
// 21 + 14 = 35 leaves room to spare.
const DROP_HORIZON_DAYS = 21
const STUDY_HORIZON_DAYS = 14

const isOurId = (id: number): boolean =>
  (id >= DROP_ID_BASE && id < DROP_ID_BASE + DROP_HORIZON_DAYS) ||
  (id >= STUDY_ID_BASE && id < STUDY_ID_BASE + STUDY_HORIZON_DAYS)

export type ReminderPermission = 'granted' | 'denied' | 'prompt' | 'unsupported'

export interface PlannedReminder {
  id: number
  title: string
  body: string
  at: Date
}

export interface ReminderPrefs {
  dropEnabled: boolean
  /** 'HH:MM', the player's local wall clock. */
  dropTime: string
  studyEnabled: boolean
  studyTime: string
}

/** Local date string for a Date, matching lib/date's todayLocalDate format. */
function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** A Date at `time` ('HH:MM') on the day `offset` days after `from`, local. */
function slot(from: Date, offset: number, time: string): Date {
  const [h, m] = time.split(':').map(Number)
  const d = new Date(from)
  d.setDate(d.getDate() + offset)
  d.setHours(h || 0, m || 0, 0, 0)
  return d
}

/**
 * Work out exactly which notifications should be pending right now.
 *
 * Pure and side-effect free so it can be reasoned about (and tested) without a
 * device. `applyPlan` is the only thing that talks to the plugin.
 */
export function buildPlan(opts: {
  now: Date
  prefs: ReminderPrefs
  /** The player's SRS map — future due dates are knowable, so we use them. */
  schedule: ReviewSchedule
  /** Verses due right now. Anything overdue stays overdue until reviewed. */
  dueNow: number
}): PlannedReminder[] {
  const { now, prefs, schedule, dueNow } = opts
  const out: PlannedReminder[] = []

  if (prefs.dropEnabled) {
    for (let i = 0; i < DROP_HORIZON_DAYS; i++) {
      const at = slot(now, i, prefs.dropTime)
      if (at <= now) continue // today's slot has already passed
      out.push({
        id: DROP_ID_BASE + i,
        title: 'A new verse is live',
        // Deterministic content is the whole reason this works offline — the
        // device can name the verse weeks before it drops.
        body: `${getVerseForDate(localDate(at)).reference} — today's drop is ready when you are.`,
        at,
      })
    }
  }

  if (prefs.studyEnabled) {
    const entries = Object.values(schedule)
    for (let i = 0; i < STUDY_HORIZON_DAYS; i++) {
      const at = slot(now, i, prefs.studyTime)
      if (at <= now) continue
      // Something is waiting on day D if the player is already behind (overdue
      // never clears itself) or if a card comes due on or before that day.
      const day = localDate(at)
      const waiting = dueNow > 0 || entries.some((e) => e.due <= day)
      if (!waiting) continue
      out.push({
        id: STUDY_ID_BASE + i,
        title: 'Your study is calling',
        // No count: the number would be a guess made days early, and a wrong
        // number reads as a lie. The plan is rebuilt every time the app opens.
        body: 'A verse or two are ready to review whenever you are.',
        at,
      })
    }
  }

  return out
}

export async function permissionState(): Promise<ReminderPermission> {
  if (!remindersAvailable()) return 'unsupported'
  try {
    const { LocalNotifications } = await loadSdk()
    const res = await LocalNotifications.checkPermissions()
    return res.display === 'granted' ? 'granted' : res.display === 'denied' ? 'denied' : 'prompt'
  } catch {
    return 'unsupported'
  }
}

/** Ask iOS for permission. Returns whether we ended up allowed. */
export async function requestPermission(): Promise<boolean> {
  if (!remindersAvailable()) return false
  try {
    const { LocalNotifications } = await loadSdk()
    const res = await LocalNotifications.requestPermissions()
    return res.display === 'granted'
  } catch {
    return false
  }
}

/**
 * Make the device's pending notifications match `plan`.
 *
 * Cancels only ids in our own blocks, so anything scheduled elsewhere survives,
 * then schedules the plan. Cheap enough to run on every app resume, which is
 * what keeps the study nudge honest as cards get reviewed.
 */
export async function applyPlan(plan: PlannedReminder[]): Promise<void> {
  if (!remindersAvailable()) return
  const { LocalNotifications } = await loadSdk()

  const pending = await LocalNotifications.getPending()
  const ours = pending.notifications.filter((n) => isOurId(n.id)).map((n) => ({ id: n.id }))
  if (ours.length) await LocalNotifications.cancel({ notifications: ours })

  if (!plan.length) return
  await LocalNotifications.schedule({
    notifications: plan.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      schedule: { at: n.at, allowWhileIdle: true },
    })),
  })
}
