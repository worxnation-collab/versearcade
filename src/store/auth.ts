import { create } from 'zustand'
import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
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

  signUpEmail: (email: string, password: string, username: string) => Promise<{ needsConfirmation: boolean }>
  signIn: (identifier: string, password: string) => Promise<void>
  signInOAuth: (provider: 'google' | 'apple') => Promise<void>
  completeNativeOAuth: (url: string) => Promise<void>
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
    supabase.auth.onAuthStateChange(async (_evt, session) => {
      if (session) {
        set({ mode: 'online' })
        await get().refreshProfile()
      } else {
        // Cloud session ended — fall back to any local guest profile so the
        // user isn't kicked back to onboarding.
        const p = localdb.getProfile()
        if (p) syncSettingsFromProfile(p)
        set({ mode: p ? 'local' : 'online', profile: p, isAuthed: !!p })
      }
    })

    const { data } = await supabase.auth.getSession()
    if (data.session) {
      await get().refreshProfile()
      set({ ready: true, mode: 'online', isAuthed: true })
      return
    }

    // No cloud session: restore a guest profile from this device if one exists,
    // so guests (the default onboarding path) survive a refresh.
    const p = localdb.getProfile()
    if (p) syncSettingsFromProfile(p)
    set({ ready: true, mode: p ? 'local' : 'online', profile: p, isAuthed: !!p })
  },

  async refreshProfile() {
    if (!supabase) return
    // Use the LOCAL session (getSession) rather than getUser(): getUser() makes a
    // network round-trip and, called from inside onAuthStateChange, triggers a
    // request storm / loop. getSession reads the already-set token synchronously.
    const { data: s } = await supabase.auth.getSession()
    const user = s.session?.user
    if (!user) {
      set({ profile: null, isAuthed: false })
      return
    }
    // maybeSingle (not single) so a transient 0-row read doesn't throw
    // "Cannot coerce the result to a single JSON object" — which happened when a
    // refresh fired a hair before the auth token was attached to the request.
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()
    if (error) {
      set({ error: error.message })
      return
    }
    if (!data) {
      // Row not visible yet (RLS/timing on a brand-new OAuth user). Don't clear an
      // existing profile or surface an error — a later auth event resolves it.
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
    const emailRedirectTo =
      import.meta.env.VITE_AUTH_REDIRECT_URL || window.location.origin + '/auth/callback'
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username, display_name: username }, emailRedirectTo },
    })
    if (error) {
      set({ error: error.message })
      throw error
    }
    // With email confirmation ON, signUp returns no session — the user must
    // confirm before they're authed. Report that so the UI doesn't bounce them
    // straight into a protected route (which would kick back to onboarding).
    if (!data.session) return { needsConfirmation: true }
    await get().refreshProfile()
    return { needsConfirmation: false }
  },

  async signIn(identifier, password) {
    if (!supabase) throw new Error('Backend not configured')
    set({ error: null })
    const id = identifier.trim()

    // Email path: sign in directly.
    if (id.includes('@')) {
      const { error } = await supabase.auth.signInWithPassword({ email: id, password })
      if (error) {
        set({ error: error.message })
        throw error
      }
      await get().refreshProfile()
      return
    }

    // Username path: an edge function resolves the username to its account and
    // validates the password server-side (email never touches the browser),
    // then we adopt the returned session.
    const { data, error } = await supabase.functions.invoke('username-login', {
      body: { identifier: id, password },
    })
    if (error || !data?.session) {
      const msg = 'Invalid username or password'
      set({ error: msg })
      throw new Error(msg)
    }
    const { error: sessErr } = await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    })
    if (sessErr) {
      set({ error: sessErr.message })
      throw sessErr
    }
    await get().refreshProfile()
  },

  async signInOAuth(provider) {
    if (!supabase) throw new Error('Backend not configured')
    const native = Capacitor.isNativePlatform()
    // Native must return to the app via the custom URL scheme, not the website.
    const redirectTo = native
      ? 'com.versearcade.app://auth/callback'
      : import.meta.env.VITE_AUTH_REDIRECT_URL || window.location.origin + '/auth/callback'
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      // On native we open the provider URL ourselves (in an in-app browser) so we
      // can catch the deep-link redirect back into the app.
      options: { redirectTo, skipBrowserRedirect: native },
    })
    if (error) {
      set({ error: error.message })
      throw error
    }
    if (native && data?.url) {
      // Open in the SYSTEM browser (real Safari), NOT the in-app Safari view.
      // SFSafariViewController (what @capacitor/browser opens) refuses to hand a
      // custom-scheme redirect (com.versearcade.app://) back to the app — it just
      // shows a blank page with a "type a URL" bar. Real Safari opens the app via
      // the registered URL scheme, which fires appUrlOpen -> completeNativeOAuth.
      window.open(data.url, '_system')
    }
    // Web: the browser navigates automatically and detectSessionInUrl finishes it.
  },

  // Called from the native deep-link handler when the provider redirects back to
  // com.versearcade.app://auth/callback?code=... — exchanges the PKCE code for a
  // session, closes the in-app browser, and loads the profile.
  async completeNativeOAuth(url) {
    if (!supabase) return
    try {
      // The redirect can carry the session in one of two shapes:
      //  - PKCE flow:     com.versearcade.app://auth/callback?code=...
      //  - Implicit flow: com.versearcade.app://auth/callback#access_token=...&refresh_token=...
      // Supabase defaults to implicit, so the tokens arrive in the hash — the old
      // code only read ?code= and silently bailed, which is why sign-in returned
      // to the app but never authed. Handle BOTH so either flow works.
      const query = new URLSearchParams(url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : '')
      const hash = new URLSearchParams(url.includes('#') ? url.slice(url.indexOf('#') + 1) : '')

      const code = query.get('code')
      const accessToken = hash.get('access_token')
      const refreshToken = hash.get('refresh_token')

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          set({ error: error.message })
          return
        }
      } else if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (error) {
          set({ error: error.message })
          return
        }
      } else {
        // No usable credentials — surface any provider error, then stop.
        const errDesc = query.get('error_description') || hash.get('error_description')
        if (errDesc) set({ error: errDesc })
        return
      }

      try {
        await Browser.close()
      } catch {
        /* browser may already be closed */
      }
      await get().refreshProfile()
    } catch (e) {
      set({ error: (e as Error).message })
    }
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
