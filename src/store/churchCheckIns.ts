import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth'
import type { AvatarSpec } from '@/data/avatar'

// A leader's check-in note to one member (0137).
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
//
// ONLINE-ONLY, inherited rather than chosen — the store/gifts.ts break with the
// two-mode invariant: a note needs a second real account on the other end, and
// leadership itself is a server-side role a guest cannot hold.

/** KEEP IN SYNC with `church_clean_line(p_message, 280)` in 0137. */
export const CHECK_IN_MAX = 280
/** KEEP IN SYNC with the `v_sent >= 25` check in send_church_check_in. */
export const CHECK_IN_DAILY_CAP = 25
export const CHECK_IN_DRAFT = 'Missed you this week'

export type CheckInReason =
  | 'offline' | 'empty' | 'not_member' | 'self' | 'daily_cap' | 'already_today'
  | 'not_leadership' | 'not_verified' | 'failed'

export interface CheckInNote {
  id: number
  message: string
  createdAt: string
  seen: boolean
  churchName: string
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
  send: (churchId: string, username: string, message: string) => Promise<{ ok: boolean; reason?: CheckInReason }>
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

  async send(churchId, username, message) {
    if (!isOnline()) return { ok: false, reason: 'offline' }
    const text = message.trim().slice(0, CHECK_IN_MAX)
    if (!text) return { ok: false, reason: 'empty' }
    // Awaited: a postgrest-js builder is lazy, and a `void` here would report
    // "sent" for a note that never left the device.
    const { data, error } = await supabase!.rpc('send_church_check_in', {
      p_church_id: churchId,
      p_username: username,
      p_message: text,
    })
    if (error) return { ok: false, reason: 'failed' }
    const r = data as { ok?: boolean; reason?: CheckInReason }
    return r?.ok ? { ok: true } : { ok: false, reason: r?.reason ?? 'failed' }
  },
}))
