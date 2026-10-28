import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth'

// Replies to a join inquiry (0155) — the other half of 0149's "Ask a church's
// leaders something". A church's verified leadership answers once; the answer
// lands here, in the asker's mailbox, and lights the same single mailbox dot a
// check-in does. Nobody but the asker reads it: `my_church_join_replies`
// derives the owner from auth.uid() and takes no user id.
//
// ONLINE-ONLY, inherited — the store/churchCheckIns.ts break with the two-mode
// invariant: an inquiry needs a church's leadership on the other end.

export interface ChurchReply {
  churchId: string
  churchName: string
  /** What you asked. */
  note: string
  reply: string
  repliedAt: string
  seen: boolean
}

function isOnline(): boolean {
  const a = useAuth.getState()
  return !!supabase && a.mode === 'online' && a.isAuthed
}

interface RepliesState {
  loaded: boolean
  replies: ChurchReply[]
  unseen: number
  load: () => Promise<void>
  markSeen: () => Promise<void>
}

export const useChurchReplies = create<RepliesState>((set, get) => ({
  loaded: false,
  replies: [],
  unseen: 0,

  async load() {
    if (!isOnline()) return set({ loaded: true, replies: [], unseen: 0 })
    const { data, error } = await supabase!.rpc('my_church_join_replies')
    // A server without 0155: an empty section, never a crash.
    if (error || !data) return set({ loaded: true })
    const raw = data as { unseen?: number; replies?: any[] }
    set({
      loaded: true,
      unseen: Number(raw.unseen ?? 0),
      replies: (raw.replies ?? []).map((r) => ({
        churchId: String(r.church_id ?? ''),
        churchName: String(r.church_name ?? 'A church'),
        note: String(r.note ?? ''),
        reply: String(r.reply ?? ''),
        repliedAt: String(r.replied_at ?? ''),
        seen: r.seen === true,
      })),
    })
  },

  async markSeen() {
    if (!isOnline() || get().unseen === 0) return
    set({ unseen: 0, replies: get().replies.map((r) => ({ ...r, seen: true })) })
    // Awaited: a postgrest-js builder is lazy (CLAUDE.md → "must be awaited").
    await supabase!.rpc('mark_church_join_replies_seen')
  },
}))
