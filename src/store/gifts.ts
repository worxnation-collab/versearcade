import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { todayLocalDate } from '@/lib/date'
import { useAuth } from './auth'
import { useInventory } from './inventory'
import { useSeason } from './season'

// Giving a relic to another player.
//
// The app had exactly one thing you could do to a person that wasn't a
// challenge (washing their feet), and exactly one thing you could do with a
// relic you were holding (give it to your church). This is the missing pair:
// give the relic to a PERSON.
//
// What moves is the ITEM, never the stamp — see the header of 0070. The sender
// loses one from their bag, the recipient gains one, and neither collection
// record changes. That is what makes it impossible for a gift to inflate the
// `cards` number on anybody's player card.
//
// ONLINE-ONLY, inherited rather than chosen — the same break with the two-mode
// invariant store/churchYard.ts and store/washing.ts make. The gesture needs a
// second real account on the other end of it; a local gift is a person moving
// an object from one of their own pockets to the other. If that ever changes,
// the shape to use is the usual one: a `va.gifts.<uid>` blob merged onto disk,
// and the item move going through useInventory's local path. It should not
// change, for the reason above: with one device there is no second person.

export interface GiftRow {
  id: number
  fromUsername: string
  fromAvatar: string
  collectibleKey: string
  createdAt: string
  seen: boolean
}

export type GiftReason = 'offline' | 'not_found' | 'self' | 'daily_cap' | 'not_held' | 'failed'

export interface GiftResult {
  ok: boolean
  reason?: GiftReason
  /** How many of that relic the sender still holds. */
  remaining?: number
  sentToday?: number
}

/** Ten a day. Nothing rankable is at stake — see 0070 — so this is a spam
 *  bound rather than an economy, and it is enforced in SQL, not in the button.
 *  KEEP IN SYNC with the `v_sent >= 10` check in gift_collectible. */
export const GIFT_DAILY_CAP = 10

function isOnline(): boolean {
  const a = useAuth.getState()
  return !!supabase && a.mode === 'online' && a.isAuthed
}

interface GiftsState {
  loaded: boolean
  received: GiftRow[]
  unseen: number
  load: () => Promise<void>
  give: (username: string, key: string) => Promise<GiftResult>
  markSeen: () => Promise<void>
}

export const useGifts = create<GiftsState>((set, get) => ({
  loaded: false,
  received: [],
  unseen: 0,

  async load() {
    if (!isOnline()) {
      set({ loaded: true, received: [], unseen: 0 })
      return
    }
    const { data, error } = await supabase!.rpc('my_gifts', { p_limit: 30 })
    if (error || !data) {
      set({ loaded: true })
      return
    }
    const raw = data as {
      unseen?: number
      gifts?: {
        id: number
        from_username: string
        from_avatar?: string
        collectible_key: string
        created_at: string
        seen?: boolean
      }[]
    }
    set({
      loaded: true,
      unseen: Number(raw.unseen ?? 0),
      received: (raw.gifts ?? []).map((g) => ({
        id: g.id,
        fromUsername: g.from_username,
        fromAvatar: g.from_avatar ?? '😇',
        collectibleKey: g.collectible_key,
        createdAt: g.created_at,
        seen: !!g.seen,
      })),
    })
  },

  async give(username, key) {
    if (!isOnline()) return { ok: false, reason: 'offline' }

    // Awaited, and `error` checked. A postgrest-js builder is lazy — the
    // request goes out inside its then() — so a `void` here would hand the
    // player a "given!" for a call that never left the device.
    const { data, error } = await supabase!.rpc('gift_collectible', {
      p_username: username,
      p_key: key,
      p_local_date: todayLocalDate(),
    })
    if (error) return { ok: false, reason: 'failed' }
    const raw = data as { ok?: boolean; reason?: GiftReason; remaining?: number; sent_today?: number }
    if (!raw?.ok) return { ok: false, reason: raw?.reason ?? 'failed' }

    // The item left the sender's bag on the server; re-read rather than
    // guessing, so a half-understood response can't leave a phantom relic in
    // the inventory the Give button reads from.
    await useInventory.getState().load()
    void useSeason.getState().track('gift_given') // prepacked verb
    return { ok: true, remaining: Number(raw.remaining ?? 0), sentToday: Number(raw.sent_today ?? 0) }
  },

  async markSeen() {
    if (!isOnline()) return
    // Optimistic: the mailbox clears its dot the moment it is opened, and the
    // write catches up. A failed mark is a dot that comes back, not a loss.
    set({ unseen: 0, received: get().received.map((g) => ({ ...g, seen: true })) })
    await supabase!.rpc('mark_gifts_seen')
  },
}))
