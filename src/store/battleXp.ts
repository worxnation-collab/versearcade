import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { todayLocalDate } from '@/lib/date'
import { useAuth } from './auth'
import { BATTLE_XP, BATTLE_XP_CAP } from '@/data/battleXp'

// Where you are against today's battle ceiling, and how many live battles you
// have played. Both come from `my_battle_xp` (0086), which answers about the
// CALLER and nobody else — the recipient-only shape my_prayers and my_washings
// use, and the reason no screen here can ever compare two players.
//
// ONLINE ONLY, inherited rather than chosen: a battle needs a second real
// account and the Battle tab already walls a guest. There is no half-built
// guest path to finish, because there is nothing offline for one to do — a CPU
// race (/battle/cpu) writes no battle row and pays no battle XP, deliberately.
//
// IT READS, IT NEVER PAYS. The grant lives inside create_battle/submit_battle
// where every battle path already goes; this store exists so a result screen
// can say what happened without the client ever being the thing that decides.

export interface BattleXpCard {
  /** Battles that paid today. */
  today: number
  /** How many pay in a day. */
  cap: number
  /** What one is worth. */
  pay: number
  /** Live battles played, lifetime — what the Jonathan/Deborah skins count. */
  liveBattles: number
}

const FALLBACK: BattleXpCard = { today: 0, cap: BATTLE_XP_CAP, pay: BATTLE_XP, liveBattles: 0 }

interface BattleXpState {
  loaded: boolean
  card: BattleXpCard | null
  load: () => Promise<void>
}

export const useBattleXp = create<BattleXpState>((set) => ({
  loaded: false,
  card: null,

  async load() {
    const a = useAuth.getState()
    if (!supabase || a.mode !== 'online' || !a.isAuthed) {
      set({ loaded: true, card: null })
      return
    }
    const { data, error } = await supabase.rpc('my_battle_xp', { p_local_date: todayLocalDate() })
    if (error || !data) {
      // A missing RPC (0086 not applied yet) must not put an error on a result
      // screen. Fail to "nothing known" and the line simply doesn't draw — the
      // battle still happened and still counted.
      set({ loaded: true, card: null })
      return
    }
    const raw = data as { today?: number; cap?: number; pay?: number; live_battles?: number }
    set({
      loaded: true,
      card: {
        today: Number(raw.today ?? 0),
        cap: Number(raw.cap ?? FALLBACK.cap),
        pay: Number(raw.pay ?? FALLBACK.pay),
        liveBattles: Number(raw.live_battles ?? 0),
      },
    })
  },
}))
