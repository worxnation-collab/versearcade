import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth'
import { localTimeZone } from '@/lib/date'

// Which kinds of push a player wants (0163). The SERVER is the authority:
// push-send's deliver() reads `profiles.push_prefs` before every send, so this
// store is only the switchboard Settings draws.
//
// Online-only, and that is inherited rather than chosen: every one of these
// five is a note from another account (a battle played, a buddy's yes, a
// washing, an answered prayer, a church check-in), delivered to a
// push_subscriptions / device_tokens row that only an account has. A guest has
// nothing here to switch off.

export type PushKind = 'battle' | 'buddy' | 'gesture' | 'answered' | 'check_in' | 'week'

export const PUSH_KINDS: { kind: PushKind; label: string; line: string }[] = [
  { kind: 'battle', label: 'Battles', line: 'When a friend plays the battle you sent.' },
  { kind: 'buddy', label: 'Buddies', line: 'When somebody says yes to your buddy request.' },
  { kind: 'gesture', label: 'Kindnesses', line: 'A washing or a prayer for you — at most once a day.' },
  { kind: 'answered', label: 'Answered prayers', line: 'When a note you knelt at is marked answered.' },
  { kind: 'check_in', label: 'Church check-ins', line: 'A note from your church’s leaders.' },
  { kind: 'week', label: 'Your week', line: 'On Sunday, one thing you did this week, at the hour you usually play.' },
]

const ALL_ON: Record<PushKind, boolean> = { battle: true, buddy: true, gesture: true, answered: true, check_in: true, week: true }

function isOnline() {
  const a = useAuth.getState()
  return !!supabase && a.mode === 'online' && a.isAuthed
}

/** Quiet hours (0164): local wall-clock 'HH:MM', in the zone saved with them.
 *  Inside the window push-send parks a note and a morning run sends it. */
export interface QuietHours { on: boolean; start: string; end: string }
const QUIET_DEFAULT: QuietHours = { on: false, start: '21:00', end: '07:00' }

interface PushPrefsState {
  prefs: Record<PushKind, boolean>
  loaded: boolean
  /** false against a server without 0163 — Settings then draws no rows. */
  available: boolean
  quiet: QuietHours
  /** false against a server without 0164. */
  quietAvailable: boolean
  load: () => Promise<void>
  set: (kind: PushKind, on: boolean) => Promise<boolean>
  setQuiet: (q: QuietHours) => Promise<boolean>
}

function readQuiet(d: unknown): QuietHours {
  const q = (d ?? {}) as Partial<QuietHours>
  return {
    on: q.on === true,
    start: typeof q.start === 'string' ? q.start : QUIET_DEFAULT.start,
    end: typeof q.end === 'string' ? q.end : QUIET_DEFAULT.end,
  }
}

export const usePushPrefs = create<PushPrefsState>((setState, get) => ({
  prefs: ALL_ON,
  loaded: false,
  available: false,
  quiet: QUIET_DEFAULT,
  quietAvailable: false,
  async load() {
    if (!isOnline()) { setState({ loaded: true, available: false, quietAvailable: false }); return }
    const [p, q] = await Promise.all([supabase!.rpc('my_push_prefs'), supabase!.rpc('my_quiet_hours')])
    setState({
      loaded: true,
      available: !p.error && !!p.data,
      ...(p.error || !p.data ? {} : { prefs: { ...ALL_ON, ...(p.data as Partial<Record<PushKind, boolean>>) } }),
      quietAvailable: !q.error && !!q.data,
      ...(q.error || !q.data ? {} : { quiet: readQuiet(q.data) }),
    })
  },
  async setQuiet(next) {
    if (!isOnline()) return false
    const before = get().quiet
    setState({ quiet: next })
    // The zone is the device's own, sent with every save, so moving house is a re-save.
    const { data, error } = await supabase!.rpc('set_quiet_hours', {
      p_on: next.on, p_start: next.start, p_end: next.end, p_tz: localTimeZone(),
    })
    if (error || !data?.ok) {
      setState({ quiet: before })
      void get().load()
      return false
    }
    setState({ quiet: readQuiet(data.quiet) })
    return true
  },
  async set(kind, on) {
    if (!isOnline()) return false
    const before = get().prefs
    setState({ prefs: { ...before, [kind]: on } })
    const { data, error } = await supabase!.rpc('set_push_pref', { p_kind: kind, p_on: on })
    if (error || !data?.ok) {
      // Don't leave an optimistic lie on screen: re-read what the server holds.
      setState({ prefs: before })
      void get().load()
      return false
    }
    setState({ prefs: { ...ALL_ON, ...(data.prefs as Partial<Record<PushKind, boolean>>) } })
    return true
  },
}))

/** What a test push did, in the words Settings shows. */
export type TestPushOutcome =
  | { state: 'sent'; devices: number }
  | { state: 'muted' }
  | { state: 'held'; until: string }
  | { state: 'nowhere' }
  | { state: 'failed'; detail?: string }

/** "Send me a test push": push-send's `test` action sends to the caller ONLY,
 *  through the same server path every real note takes (kind switch, quiet
 *  hours, both transports), and says which of those decided it. */
export async function sendTestPush(kind: PushKind): Promise<TestPushOutcome> {
  if (!isOnline()) return { state: 'failed' }
  try {
    const { data, error } = await supabase!.functions.invoke('push-send', { body: { action: 'test', kind } })
    if (error || !data) {
      // A non-2xx still carries the function's own { error } body; say it.
      let detail: string | undefined
      try {
        const ctx = (error as { context?: Response } | null)?.context
        const body = ctx ? await ctx.json() : null
        detail = typeof body?.error === 'string' ? body.error.slice(0, 160) : undefined
      } catch { /* no body */ }
      return { state: 'failed', detail }
    }
    const r = data as { pushed?: number; reason?: string; deferred?: boolean; until?: string; devices?: number; web_error?: string; native_error?: string }
    if (r.reason === 'muted') return { state: 'muted' }
    if (r.deferred && r.until) return { state: 'held', until: r.until }
    if ((r.pushed ?? 0) > 0) return { state: 'sent', devices: r.pushed ?? 0 }
    if (r.reason === 'no_subscription' || r.devices === 0) return { state: 'nowhere' }
    return { state: 'failed', detail: r.web_error || r.native_error }
  } catch {
    return { state: 'failed' }
  }
}

/** The hour this person usually plays (median of the device's recent plays),
 *  or the hour it is now when there is no history yet — they are playing now.
 *  Sent once a day so Sunday's line lands when they usually turn up (0166);
 *  the hours themselves never leave the device, only this one number. */
export async function notePlayRhythm(hour: number): Promise<void> {
  if (!isOnline()) return
  const day = new Date().toDateString()
  const key = 'va.playRhythmSent'
  try { if (localStorage.getItem(key) === `${day}|${hour}`) return } catch { /* storage blocked: just send */ }
  const { error } = await supabase!.rpc('note_play_rhythm', { p_hour: hour, p_tz: localTimeZone() })
  if (!error) { try { localStorage.setItem(key, `${day}|${hour}`) } catch { /* ignore */ } }
}
