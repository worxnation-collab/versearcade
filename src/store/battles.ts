import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import type { AvatarSpec } from '@/types'

export interface BattleSide {
  username: string
  avatar_emoji: string
  avatar_character?: AvatarSpec | null
  score: number | null
  time_ms: number | null
}

export interface Battle {
  id: string
  seed: number
  status: 'pending' | 'complete'
  winner: 'challenger' | 'opponent' | 'tie' | null
  created_at: string
  is_challenger: boolean
  is_opponent: boolean
  challenger: BattleSide
  opponent: BattleSide | null
}

export interface BattleRankRow {
  rank: number
  username: string
  avatar_emoji: string
  avatar_character?: AvatarSpec | null
  wins: number
  battles: number
}
export interface BattleBoard {
  top: BattleRankRow[]
  me: { rank: number; wins: number; battles: number } | null
}

interface BattlesState {
  mine: Battle[]
  loadingMine: boolean
  loadMine: () => Promise<void>
  getBattle: (id: string) => Promise<Battle | null>
  createBattle: (seed: number, score: number, timeMs: number) => Promise<string | null>
  submitBattle: (id: string, score: number, timeMs: number) => Promise<Battle | null>
  leaderboard: () => Promise<BattleBoard | null>
}

export const useBattles = create<BattlesState>((set) => ({
  mine: [],
  loadingMine: false,

  async loadMine() {
    if (!supabase) return
    set({ loadingMine: true })
    const { data } = await supabase.rpc('list_my_battles')
    set({ mine: (data as Battle[]) ?? [], loadingMine: false })
  },

  async getBattle(id) {
    if (!supabase) return null
    const { data, error } = await supabase.rpc('get_battle', { p_id: id })
    if (error || !data) return null
    return data as Battle
  },

  async createBattle(seed, score, timeMs) {
    if (!supabase) return null
    const { data, error } = await supabase.rpc('create_battle', { p_seed: seed, p_score: score, p_time_ms: timeMs })
    if (error || !data) return null
    return data as string
  },

  async submitBattle(id, score, timeMs) {
    if (!supabase) return null
    const { data, error } = await supabase.rpc('submit_battle', { p_id: id, p_score: score, p_time_ms: timeMs })
    if (error || !data) return null
    return data as Battle
  },

  async leaderboard() {
    if (!supabase) return null
    const { data, error } = await supabase.rpc('battle_leaderboard', { p_limit: 50 })
    if (error || !data) return null
    return data as BattleBoard
  },
}))
