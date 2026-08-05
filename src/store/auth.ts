import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/config'
import { localdb } from '@/lib/localdb'
import { newLocalProfile } from '@/lib/progress'
import { useSettings } from './settings'
import type { Profile } from '@/types'

type Mode = 'online' | 'local'

interface DbProfileRow {
  id: string
  username: string
  display_name: string | null
  avatar_emoji: string
  xp: number
  level: number
  current_streak: number
  longest_streak: number
  streak_freezes: number
  last_played_on: string | null
  total_plays: number
  sound_enabled: boolean
  haptics_enabled: boolean
  reduce_motion: boolean
  onboarded: boolean
}

function mapRow(r: DbProfileRow): Profile {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name ?? undefined,
    avatarEmoji: r.avatar_emoji,
    xp: r.xp,
    level: r.level,
    currentStreak: r.current_streak,
    longestStreak: r.longest_streak,
    streakFreezes: r.streak_freezes,
    lastPlayedOn: r.last_played_on,
    totalPlays: r.total_plays,
    soundEnabled: r.sound_enabled,
    hapticsEnabled: r.haptics_enabled,
    reduceMotion: r.reduce_motion,
    onboarded: r.onboarded,
  }
}

// Push profile prefs into the local settings store so juice reflects them.
function syncSettingsFromProfile(p: Profile) {
  useSettings.getState().set({
    soundEnabled: p.soundEnabled,
    hapticsEnabled: p.hapticsEnabled,
    reduceMotion: p.reduceMotion,
  })
}

interface AuthState {
  ready: boolean
  mode: Mode
  profile: Profile | null
  isAuthed: boolean
  error: string | null

  init: () => Promise<void>
  refreshProfile: () => Promise<void>
  setProfileLocal: (p: Profile) => void

  signUpEmail: (email: string, password: string, username: string) => Promise<void>
  signInEmail: (email: string, password: string) => Promise<void>
  signInOAuth: (provider: 'google' | 'apple') => Promise<void>
  startAsGuest: (username: string, emoji: string) => void

  updateProfile: (patch: Partial<Profile>) => Promise<void>
  deleteAccount: () => Promise<void>
  signOut: () => Promise<void>
}

export const useAuth = create<AuthState>((set, get) => ({
  ready: false,
  mode: isSupabaseConfigured ? 'online' : 'local',
  profile: null,
  isAuthed: false,
  error: null,

  async init() {
    if (!supabase) {
      // LOCAL mode: restore any guest profile.
      const p = localdb.getProfile()
      if (p) syncSettingsFromProfile(p)
      set({ ready: true, mode: 'local', profile: p, isAuthed: !!p })
      return
    }
    const { data } = await supabase.auth.getSession()
    if (data.session) {
      await get().refreshProfile()
    }
    supabase.auth.onAuthStateChange(async (_evt, session) => {
      if (session) await get().refreshProfile()
      else set({ profile: null, isAuthed: false })
    })
    set({ ready: true, mode: 'online', isAuthed: !!data.session })
  },

  async refreshProfile() {
    if (!supabase) return
    const { data: u } = await supabase.auth.getUser()
    if (!u.user) {
      set({ profile: null, isAuthed: false })
      return
    }
    const { data, error } = await supabase.from('profiles').select('*').eq('id', u.user.id).single()
    if (error) {
      set({ error: error.message })
      return
    }
    const p = mapRow(data as DbProfileRow)
    syncSettingsFromProfile(p)
    set({ profile: p, isAuthed: true, error: null })
  },

  setProfileLocal(p) {
    if (get().mode === 'local') localdb.saveProfile(p)
    set({ profile: p })
  },

  async signUpEmail(email, password, username) {
    if (!supabase) throw new Error('Backend not configured')
    set({ error: null })
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username, display_name: username } },
    })
    if (error) {
      set({ error: error.message })
      throw error
    }
    await get().refreshProfile()
  },

  async signInEmail(email, password) {
    if (!supabase) throw new Error('Backend not configured')
    set({ error: null })
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      set({ error: error.message })
      throw error
    }
    await get().refreshProfile()
  },

  async signInOAuth(provider) {
    if (!supabase) throw new Error('Backend not configured')
    const redirectTo =
      import.meta.env.VITE_AUTH_REDIRECT_URL || window.location.origin + '/auth/callback'
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } })
    if (error) {
      set({ error: error.message })
      throw error
    }
    // Redirect happens; session picked up by detectSessionInUrl on return.
  },

  startAsGuest(username, emoji) {
    const p = { ...newLocalProfile(username, emoji), onboarded: true }
    localdb.saveProfile(p)
    syncSettingsFromProfile(p)
    set({ profile: p, isAuthed: true, mode: 'local' })
  },

  async updateProfile(patch) {
    const cur = get().profile
    if (!cur) return
    const next = { ...cur, ...patch }
    set({ profile: next })
    // Keep settings store aligned when prefs change.
    if (patch.soundEnabled !== undefined || patch.hapticsEnabled !== undefined || patch.reduceMotion !== undefined) {
      useSettings.getState().set({
        soundEnabled: next.soundEnabled,
        hapticsEnabled: next.hapticsEnabled,
        reduceMotion: next.reduceMotion,
      })
    }
    if (get().mode === 'local' || !supabase) {
      localdb.saveProfile(next)
      return
    }
    const dbPatch: Record<string, unknown> = {}
    if (patch.username !== undefined) dbPatch.username = patch.username
    if (patch.displayName !== undefined) dbPatch.display_name = patch.displayName
    if (patch.avatarEmoji !== undefined) dbPatch.avatar_emoji = patch.avatarEmoji
    if (patch.soundEnabled !== undefined) dbPatch.sound_enabled = patch.soundEnabled
    if (patch.hapticsEnabled !== undefined) dbPatch.haptics_enabled = patch.hapticsEnabled
    if (patch.reduceMotion !== undefined) dbPatch.reduce_motion = patch.reduceMotion
    if (patch.onboarded !== undefined) dbPatch.onboarded = patch.onboarded
    if (Object.keys(dbPatch).length) {
      await supabase.from('profiles').update(dbPatch).eq('id', cur.id)
    }
  },

  async deleteAccount() {
    if (get().mode === 'local' || !supabase) {
      localdb.clear()
      set({ profile: null, isAuthed: false })
      return
    }
    await supabase.rpc('delete_my_account')
    await supabase.auth.signOut()
    set({ profile: null, isAuthed: false })
  },

  async signOut() {
    if (supabase) await supabase.auth.signOut()
    set({ profile: null, isAuthed: false })
  },
}))
