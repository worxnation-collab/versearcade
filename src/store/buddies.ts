import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { AvatarSpec } from '@/types'

// A person card returned by the buddy RPCs (buddy_card).
export interface BuddyCard {
  username: string
  avatar_emoji: string
  avatar_character?: AvatarSpec | null
  level: number
  current_streak: number
  last_played_on: string | null
  /** An official/default account that's everyone's buddy — always present, can't be removed. */
  official?: boolean
}

export type BuddyResult = { ok: boolean; status?: 'pending' | 'accepted'; reason?: string }

interface BuddiesState {
  buddies: BuddyCard[]
  requests: BuddyCard[]
  suggested: BuddyCard[]
  loading: boolean
  load: () => Promise<void>
  loadSuggested: (limit?: number) => Promise<BuddyCard[]>
  sendRequest: (username: string) => Promise<BuddyResult>
  respond: (username: string, accept: boolean) => Promise<void>
  remove: (username: string) => Promise<void>
}

export const useBuddies = create<BuddiesState>((set, get) => ({
  buddies: [],
  requests: [],
  suggested: [],
  loading: false,

  async load() {
    if (!supabase) return
    set({ loading: true })
    const [b, r] = await Promise.all([
      supabase.rpc('list_buddies'),
      supabase.rpc('list_buddy_requests'),
    ])
    set({
      buddies: (b.data as BuddyCard[]) ?? [],
      requests: (r.data as BuddyCard[]) ?? [],
      loading: false,
    })
  },

  async loadSuggested(limit = 3) {
    if (!supabase) return []
    const { data } = await supabase.rpc('suggested_buddies', { p_limit: limit })
    const list = (data as BuddyCard[]) ?? []
    set({ suggested: list })
    return list
  },

  async sendRequest(username) {
    if (!supabase) return { ok: false, reason: 'offline' }
    const { data, error } = await supabase.rpc('send_buddy_request', { p_username: username })
    if (error) return { ok: false, reason: error.message }
    const res = data as BuddyResult
    await get().load()
    return res
  },

  async respond(username, accept) {
    if (!supabase) return
    await supabase.rpc('respond_buddy_request', { p_username: username, p_accept: accept })
    await get().load()
  },

  async remove(username) {
    if (!supabase) return
    await supabase.rpc('remove_buddy', { p_username: username })
    await get().load()
  },
}))
