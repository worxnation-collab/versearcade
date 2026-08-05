import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth'
import { todayLocalDate } from '@/lib/date'

export interface GroupView {
  id: string
  name: string
  emoji: string
  joinCode: string
  level: number
  currentStreak: number
  memberCount: number
  todayTotal: number
  goal: number
  contributedToday: boolean
}

interface GroupsState {
  groups: GroupView[]
  loading: boolean
  loadGroups: () => Promise<void>
  createGroup: (name: string, emoji: string) => Promise<string | null>
  joinGroup: (code: string) => Promise<boolean>
  contributeToday: (score: number) => Promise<void>
}

const goalFor = (members: number) => Math.max(3000, members * 1500)

// LOCAL demo group so the co-op *idea* is tangible before sign-up. Clearly a
// preview: synthetic teammates, single device. Real co-op needs accounts.
function demoGroups(): GroupView[] {
  return [
    {
      id: 'demo',
      name: 'Youth Group 🙌',
      emoji: '🔥',
      joinCode: 'DEMO01',
      level: 4,
      currentStreak: 6,
      memberCount: 5,
      todayTotal: 4820,
      goal: 7500,
      contributedToday: false,
    },
  ]
}

export const useGroups = create<GroupsState>((set, get) => ({
  groups: [],
  loading: false,

  async loadGroups() {
    const mode = useAuth.getState().mode
    if (mode === 'local' || !supabase) {
      set({ groups: demoGroups() })
      return
    }
    set({ loading: true })
    const { data: u } = await supabase.auth.getUser()
    if (!u.user) return set({ loading: false })
    const date = todayLocalDate()

    const { data: memberships } = await supabase
      .from('group_members')
      .select('group_id, groups(*)')
      .eq('user_id', u.user.id)

    const views: GroupView[] = []
    for (const m of memberships ?? []) {
      const g = (m as any).groups
      if (!g) continue
      const { count } = await supabase
        .from('group_members')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', g.id)
      const { data: plays } = await supabase
        .from('group_plays')
        .select('contributed_score, user_id')
        .eq('group_id', g.id)
        .eq('drop_date', date)
      const total = (plays ?? []).reduce((s, p: any) => s + p.contributed_score, 0)
      const mine = (plays ?? []).some((p: any) => p.user_id === u.user!.id)
      views.push({
        id: g.id,
        name: g.name,
        emoji: g.emoji,
        joinCode: g.join_code,
        level: g.level,
        currentStreak: g.current_streak,
        memberCount: count ?? 1,
        todayTotal: total,
        goal: goalFor(count ?? 1),
        contributedToday: mine,
      })
    }
    set({ groups: views, loading: false })
  },

  async createGroup(name, emoji) {
    if (useAuth.getState().mode === 'local' || !supabase) return null
    const { data, error } = await supabase.rpc('create_group', { p_name: name, p_emoji: emoji })
    if (error) return null
    await get().loadGroups()
    return (data as any).join_code as string
  },

  async joinGroup(code) {
    if (useAuth.getState().mode === 'local' || !supabase) return false
    const { error } = await supabase.rpc('join_group', { p_code: code.trim().toUpperCase() })
    if (error) return false
    await get().loadGroups()
    return true
  },

  async contributeToday(score) {
    const date = todayLocalDate()
    if (useAuth.getState().mode === 'local' || !supabase) {
      // Optimistic demo update.
      set({
        groups: get().groups.map((g) => ({
          ...g,
          todayTotal: g.contributedToday ? g.todayTotal : g.todayTotal + score,
          contributedToday: true,
        })),
      })
      return
    }
    for (const g of get().groups) {
      if (g.contributedToday) continue
      await supabase.rpc('submit_group_play', { p_group_id: g.id, p_drop_date: date, p_score: score })
    }
    await get().loadGroups()
  },
}))
