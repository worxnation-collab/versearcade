import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { todayLocalDate } from '@/lib/date'
import { useAuth } from './auth'
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
  broadcast: boolean
  is_welcome: boolean
  /** Which round this battle deals (0094). Absent on a row written before it and
   *  on a server without it — `asBattleMode` reads both as 'verse', which is
   *  what those battles actually are. */
  mode?: 'verse' | 'trivia'
  is_challenger: boolean
  is_opponent: boolean
  is_invited: boolean
  invited: string | null
  challenger: BattleSide
  opponent: BattleSide | null
  /** XP this submission was worth (0086). Only ever present on the object
   *  submit_battle hands back — a battle read from a list has no payout to
   *  report, and undefined is the normal case rather than an error. */
  xp_awarded?: number
}

export interface PoolUser {
  username: string
  avatar_emoji: string
  avatar_character?: AvatarSpec | null
  level: number
}

export interface BattleRankRow {
  rank: number
  username: string
  avatar_emoji: string
  avatar_character?: AvatarSpec | null
  denomination?: string | null
  wins: number
  battles: number
}
export interface BattleBoard {
  top: BattleRankRow[]
  me: { rank: number; wins: number; battles: number } | null
}

export interface DenomRankRow {
  rank: number
  denomination: string
  members: number
  wins: number
  battles: number
}
export interface DenomBoard {
  top: DenomRankRow[]
  me: DenomRankRow | null
}

interface BattlesState {
  mine: Battle[]
  loadingMine: boolean
  loadMine: () => Promise<void>
  getBattle: (id: string) => Promise<Battle | null>
  createBattle: (
    seed: number,
    score: number,
    timeMs: number,
    invited?: string,
    broadcast?: boolean,
    live?: boolean,
    mode?: 'verse' | 'trivia',
  ) => Promise<string | null>
  submitBattle: (id: string, score: number, timeMs: number) => Promise<Battle | null>
  userPool: (search?: string) => Promise<PoolUser[]>
  leaderboard: () => Promise<BattleBoard | null>
  denominationBoard: () => Promise<DenomBoard | null>
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

  // `live` marks a battle played face to face — a room code or a quick match —
  // and it is the ONLY place that fact is recorded, because the two sides submit
  // through the same RPCs an async challenge does. The server reads it back off
  // the row for the guest's half, so neither device declares it twice.
  async createBattle(seed, score, timeMs, invited, broadcast, live, mode) {
    if (!supabase) return null
    const { data, error } = await supabase.rpc('create_battle', {
      p_seed: seed,
      p_score: score,
      p_time_ms: timeMs,
      p_invited: invited ?? null,
      p_broadcast: broadcast ?? false,
      p_live: live ?? false,
      p_local_date: todayLocalDate(),
      // Named, and defaulted server-side: a server without 0094 has no p_mode
      // and would reject the call outright, so this is sent as 'verse' rather
      // than omitted only when it is actually a trivia battle.
      ...(mode === 'trivia' ? { p_mode: 'trivia' } : {}),
    })
    if (error || !data) return null
    // The server may have paid for this run (award_battle_xp, 0086). It never
    // says so here — create_battle returns a uuid and an approved build is
    // reading that shape — so pull the profile rather than guessing, and every
    // XP bar in the app is right immediately.
    await useAuth.getState().refreshProfile()
    return data as string
  },

  async userPool(search) {
    if (!supabase) return []
    const { data } = await supabase.rpc('battle_user_pool', { p_search: search ?? null, p_limit: 100 })
    return (data as PoolUser[]) ?? []
  },

  async submitBattle(id, score, timeMs) {
    if (!supabase) return null
    const { data, error } = await supabase.rpc('submit_battle', {
      p_id: id,
      p_score: score,
      p_time_ms: timeMs,
      p_local_date: todayLocalDate(),
    })
    if (error || !data) return null
    const battle = data as Battle
    // Same as createBattle: the payout happened server-side, so re-read rather
    // than trusting `xp_awarded` to move a number the client keeps its own copy
    // of. The key is there for the screens that want to say "+10 XP".
    if ((battle.xp_awarded ?? 0) > 0) await useAuth.getState().refreshProfile()
    return battle
  },

  async leaderboard() {
    if (!supabase) return null
    const { data, error } = await supabase.rpc('battle_leaderboard', { p_limit: 50 })
    if (error || !data) return null
    return data as BattleBoard
  },

  async denominationBoard() {
    if (!supabase) return null
    const { data, error } = await supabase.rpc('battle_denomination_board', { p_limit: 20 })
    if (error || !data) return null
    return data as DenomBoard
  },
}))
