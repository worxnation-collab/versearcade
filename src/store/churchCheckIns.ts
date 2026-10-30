import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth'
import type { AvatarSpec } from '@/data/avatar'

// A leader's check-in note to one member (0137, with today's verse and a
// report action since 0138).
//
// The leader writes it from the People tab's folded "Not active this week"
// section and sends it by hand; it lands in the member's mailbox as words from
// their church, signed by the leader. Two rules carry the whole design:
//
//   * NEVER AUTOMATIC. `send` is called from one button under a text box the
//     leader can see and edit. There is no bulk path and nothing scheduled.
//   * NOTHING SAYS WHY. The server takes a church, a username and the words —
//     no flag, no source, no list name — so the note a member reads can only
//     ever be the leader's own sentence.
//   * THE VERSE IS THE SERVER'S COPY. `attachVerse` asks for the church's own
//     approved verse for today; the client never sends scripture, and the note
//     keeps a snapshot so a later edit to the day never rewrites it.
//   * A REPORT IS ONE TAP AND SAYS NOTHING. It takes the note out of the
//     recipient's mailbox for an operator's look (Admin → Check-ins), stores no
//     reason, tells the sender nothing, and blocks nobody.
//
// A PHONE NUDGE ON TOP (0156). After a note is stored, `pushCheckIn` asks the
// push-send function to send it to the member's own Web Push subscription, if
// they have one. It is never awaited by the send and never reported: the note
// is already in their mailbox, which is the whole delivery. The function pushes
// only a note the caller sent that member in the last fifteen minutes, once.
// Native (APNs) has no sender yet — see docs/NATIVE-PUSH.md — so the iOS build
// gets the in-app note alone until that lands; nothing here needs to change.
//
// A GROUP LEADER can send the same note to their own group's members
// (`sendGroup`, 0156's `send_group_check_in`): same table, same mailbox, same
// one-note-a-day per member, 10 a day.
//
// ONLINE-ONLY, inherited rather than chosen — the store/gifts.ts break with the
// two-mode invariant: a note needs a second real account on the other end, and
// leadership itself is a server-side role a guest cannot hold.

/** KEEP IN SYNC with `church_clean_line(p_message, 280)` in 0137/0138b. */
export const CHECK_IN_MAX = 280
/** KEEP IN SYNC with the `v_sent >= 25` check in send_church_check_in. */
export const CHECK_IN_DAILY_CAP = 25
/** The line under today's verse. Prefilled, editable, and may be cleared. */
export const CHECK_IN_VERSE_DRAFT = 'Thought of you with this one.'
/** The draft on a day the church has no verse to attach — 0137's, unchanged. */
export const CHECK_IN_DRAFT = 'Missed you this week'
/** The draft to a member who HAS played this week — a note, not a check-in. */
export const NOTE_DRAFT = 'Thinking of you this week.'

export type CheckInReason =
  | 'offline' | 'empty' | 'no_verse' | 'not_member' | 'self' | 'daily_cap' | 'already_today'
  | 'not_leadership' | 'not_verified' | 'not_in_group' | 'failed'

/** What each refusal says to the sender — the leadership sheet and the group card. */
export const CHECK_IN_FAIL: Record<CheckInReason, string> = {
  offline: 'You’re offline — nothing was sent.',
  empty: 'Write a few words first.',
  no_verse: 'Today’s verse isn’t available any more, so nothing was sent.',
  not_member: 'They’re no longer a member here, so nothing was sent.',
  self: 'That’s you.',
  daily_cap: 'That’s today’s check-ins. You can send more tomorrow.',
  already_today: 'You’ve already checked in with them today.',
  not_leadership: 'Only this church’s leadership can send these.',
  not_verified: 'Check-ins open once the church is verified.',
  not_in_group: 'They’re not in your group any more, so nothing was sent.',
  failed: 'That didn’t send. Try again in a moment.',
}

export interface CheckInNote {
  id: number
  message: string
  createdAt: string
  seen: boolean
  churchName: string
  verseRef: string | null
  verseText: string | null
  fromUsername: string
  fromAvatar: string | null
  fromCharacter: AvatarSpec | null
}

function isOnline(): boolean {
  const a = useAuth.getState()
  return !!supabase && a.mode === 'online' && a.isAuthed
}

interface CheckInsState {
  loaded: boolean
  notes: CheckInNote[]
  unseen: number
  load: () => Promise<void>
  markSeen: () => Promise<void>
  send: (
    churchId: string,
    username: string,
    message: string,
    opts?: { attachVerse?: boolean; localDate?: string },
  ) => Promise<{ ok: boolean; reason?: CheckInReason }>
  sendGroup: (
    username: string,
    message: string,
    opts?: { attachVerse?: boolean; localDate?: string },
  ) => Promise<{ ok: boolean; reason?: CheckInReason }>
  report: (id: number) => Promise<boolean>
}

/** KEEP IN SYNC with the `v_sent >= 10` check in send_group_check_in (0156). */
export const GROUP_CHECK_IN_DAILY_CAP = 10

// Fire-and-forget: `functions.invoke` is a fetch, so it leaves on the call.
// Any failure (no subscription, no VAPID key, an old function) is silence.
function pushCheckIn(churchId: string, username: string) {
  void supabase!.functions
    .invoke('push-send', { body: { action: 'check_in', church_id: churchId, username } })
    .catch(() => undefined)
}

export const useChurchCheckIns = create<CheckInsState>((set, get) => ({
  loaded: false,
  notes: [],
  unseen: 0,

  async load() {
    if (!isOnline()) {
      set({ loaded: true, notes: [], unseen: 0 })
      return
    }
    const { data, error } = await supabase!.rpc('my_church_check_ins')
    // A server without 0137 errors here: an empty mailbox section, never a crash.
    if (error || !data) {
      set({ loaded: true })
      return
    }
    const raw = data as { unseen?: number; notes?: any[] }
    set({
      loaded: true,
      unseen: Number(raw.unseen ?? 0),
      notes: (raw.notes ?? []).map((n) => ({
        id: Number(n.id),
        message: String(n.message ?? ''),
        createdAt: String(n.created_at),
        seen: !!n.seen,
        churchName: String(n.church_name ?? 'Your church'),
        verseRef: typeof n.verse_ref === 'string' && n.verse_ref ? n.verse_ref : null,
        verseText: typeof n.verse_text === 'string' && n.verse_text ? n.verse_text : null,
        fromUsername: String(n.from_username ?? ''),
        fromAvatar: typeof n.from_avatar === 'string' ? n.from_avatar : null,
        fromCharacter: n.from_character ?? null,
      })),
    })
  },

  async markSeen() {
    if (!isOnline() || get().unseen === 0) return
    set({ unseen: 0, notes: get().notes.map((n) => ({ ...n, seen: true })) })
    await supabase!.rpc('mark_church_check_ins_seen')
  },

  async send(churchId, username, message, opts) {
    if (!isOnline()) return { ok: false, reason: 'offline' }
    const text = message.trim().slice(0, CHECK_IN_MAX)
    const attachVerse = !!opts?.attachVerse
    if (!text && !attachVerse) return { ok: false, reason: 'empty' }
    // Awaited: a postgrest-js builder is lazy, and a `void` here would report
    // "sent" for a note that never left the device.
    const { data, error } = await supabase!.rpc('send_church_check_in', {
      p_church_id: churchId,
      p_username: username,
      p_message: text,
      p_attach_verse: attachVerse,
      p_local_date: opts?.localDate ?? null,
    })
    if (error) return { ok: false, reason: 'failed' }
    const r = data as { ok?: boolean; reason?: CheckInReason }
    if (!r?.ok) return { ok: false, reason: r?.reason ?? 'failed' }
    pushCheckIn(churchId, username)
    return { ok: true }
  },

  async sendGroup(username, message, opts) {
    if (!isOnline()) return { ok: false, reason: 'offline' }
    const text = message.trim().slice(0, CHECK_IN_MAX)
    const attachVerse = !!opts?.attachVerse
    if (!text && !attachVerse) return { ok: false, reason: 'empty' }
    const { data, error } = await supabase!.rpc('send_group_check_in', {
      p_username: username,
      p_message: text,
      p_attach_verse: attachVerse,
      p_local_date: opts?.localDate ?? null,
    })
    if (error) return { ok: false, reason: 'failed' }
    const r = data as { ok?: boolean; reason?: CheckInReason; church_id?: string }
    if (!r?.ok) return { ok: false, reason: r?.reason ?? 'failed' }
    if (r.church_id) pushCheckIn(r.church_id, username)
    return { ok: true }
  },

  // Optimistic: the note leaves the mailbox the moment it is reported. On a
  // failed call it comes back from the server rather than staying a lie.
  async report(id) {
    if (!isOnline()) return false
    const prev = get().notes
    set({ notes: prev.filter((n) => n.id !== id) })
    const { data, error } = await supabase!.rpc('report_church_check_in', { p_id: id })
    if (error || !(data as { ok?: boolean })?.ok) {
      await get().load()
      return false
    }
    return true
  },
}))
