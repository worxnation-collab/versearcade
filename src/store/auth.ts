import { create } from 'zustand'
import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { supabase } from '@/lib/supabase'
import { isSupabaseConfigured } from '@/lib/config'
import { localdb } from '@/lib/localdb'
import { newLocalProfile } from '@/lib/progress'
import { getVerseForDate } from '@/data/bible/questions'
import { petUnlocked, type PetProgress } from '@/data/pets'
import { useSettings } from './settings'
import type { Profile, AvatarSpec } from '@/types'

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
  avatar_border: string | null
  avatar_badge: string | null
  card_background: string | null
  pet?: string | null
  // Not yet a real column — an online account reads back null and falls back to
  // the emoji until a profiles.avatar_character migration lands.
  avatar_character?: AvatarSpec | null
  shared_days?: string[] | null
  owned_items?: string[] | null
  owned_skins?: string[] | null
  xp_boosts: number | null
  founder?: boolean | null
  is_admin?: boolean | null
  denomination?: string | null
  referral_code?: string | null
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
    avatarBorder: r.avatar_border ?? 'default',
    avatarBadge: r.avatar_badge ?? null,
    cardBackground: r.card_background ?? null,
    pet: r.pet ?? null,
    avatarCharacter: r.avatar_character ?? null,
    sharedDays: r.shared_days ?? [],
    ownedItems: r.owned_items ?? [],
    ownedSkins: r.owned_skins ?? [],
    xpBoosts: r.xp_boosts ?? 0,
    founder: r.founder ?? false,
    isAdmin: r.is_admin ?? false,
    denomination: r.denomination ?? null,
    referralCode: r.referral_code ?? null,
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
  loadReferral: () => Promise<void>
  setProfileLocal: (p: Profile) => void

  beginGuestClaim: () => void
  claimGuestProgress: () => Promise<void>

  signUpEmail: (email: string, password: string, username: string) => Promise<{ needsConfirmation: boolean }>
  signIn: (identifier: string, password: string) => Promise<void>
  signInOAuth: (provider: 'google' | 'apple') => Promise<void>
  completeNativeOAuth: (url: string) => Promise<void>
  startAsGuest: (username: string, emoji: string) => void

  updateProfile: (patch: Partial<Profile>) => Promise<void>
  changeUsername: (next: string) => Promise<{ ok: boolean; error?: string }>
  setCosmetics: (patch: { border?: string; badge?: string | null }) => Promise<{ ok: boolean; error?: string }>
  setAvatarCharacter: (spec: AvatarSpec) => void
  setCardBackground: (key: string) => Promise<{ ok: boolean; error?: string }>
  /**
   * Equip a pet, or null for none. The server is the gate (0064); `progress`
   * is the guest-mode gate and comes from the caller — see lib/petProgress for
   * why this store doesn't gather it itself.
   */
  setPet: (id: string | null, progress?: PetProgress) => Promise<{ ok: boolean; error?: string }>
  recordShare: (dropDate: string) => void
  grantItem: (itemId: string) => void
  grantSkin: (skinId: string) => void
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
        // If this session is a guest upgrading, fold their device progress into
        // the freshly-created account before we read it back. No-op otherwise.
        await get().claimGuestProgress()
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
    void get().loadReferral()
  },

  // Apply any pending referral code (captured from a ?ref=… link before signup),
  // then load my code + referral count into the profile.
  async loadReferral() {
    if (!supabase) return
    try {
      const pending = localStorage.getItem('va.ref')
      if (pending) {
        const { data } = await supabase.rpc('apply_referral', { p_code: pending })
        if ((data as { ok?: boolean })?.ok) localStorage.removeItem('va.ref')
      }
      const { data } = await supabase.rpc('my_referral_stats')
      const stats = data as { code?: string; count?: number } | null
      const cur = get().profile
      if (cur && stats) {
        set({ profile: { ...cur, referralCode: stats.code ?? cur.referralCode, referralCount: stats.count ?? 0 } })
      }
    } catch {
      /* referral is non-critical — never block the app on it */
    }
  },

  setProfileLocal(p) {
    if (get().mode === 'local') localdb.saveProfile(p)
    set({ profile: p })
  },

  // Snapshot the current guest's progress just before an account-creation flow.
  // Stored in localStorage so it survives the OAuth redirect (web reloads the
  // page). Consumed once by claimGuestProgress after the session lands.
  beginGuestClaim() {
    if (get().mode !== 'local') return
    const p = get().profile
    if (!p) return
    const plays = Object.entries(localdb.getPlays()).map(([dropDate, v]) => ({
      drop_date: dropDate,
      score: v.result.score,
      time_ms: v.result.timeMs,
      correct_count: v.result.correctCount,
      total_questions: v.result.totalQuestions,
      combo_max: v.result.comboMax,
      xp_earned: v.outcome.xpEarned ?? 0,
    }))
    localdb.setPendingClaim({ profile: p, cards: localdb.getCards(), plays })
  },

  // Fold a pending guest snapshot into the just-created account (username, emoji,
  // XP, streak, cards and completed plays), then clear the local guest mirror so
  // we never re-claim or show stale guest state. Safe to call on every sign-in:
  // the server RPC only writes into a pristine, never-played profile.
  async claimGuestProgress() {
    if (!supabase) return
    const snap = localdb.getPendingClaim()
    if (!snap) return
    const { data: s } = await supabase.auth.getSession()
    if (!s.session) return
    try {
      // Seed the shared verse rows for every completed day first, so the plays
      // FK (plays.drop_date -> daily_verses) resolves. Verse content is derived
      // deterministically from the date, so any client seeds identical rows.
      for (const pl of snap.plays) {
        const v = getVerseForDate(pl.drop_date)
        await supabase.rpc('ensure_daily_verse', {
          p_drop_date: pl.drop_date,
          p_translation: v.translation,
          p_reference: v.reference,
          p_book: v.book,
          p_chapter: v.chapter,
          p_verse_start: v.verseStart,
          p_verse_end: v.verseEnd ?? null,
          p_text: v.text,
          p_theme: v.theme ?? null,
          p_questions: v.questions,
          p_facts: v.facts,
        })
      }
      const p = snap.profile
      const { error } = await supabase.rpc('claim_guest_progress', {
        p_username: p.username,
        p_emoji: p.avatarEmoji,
        p_display_name: p.displayName ?? p.username,
        p_xp: p.xp,
        p_level: p.level,
        p_current_streak: p.currentStreak,
        p_longest_streak: p.longestStreak,
        p_streak_freezes: p.streakFreezes,
        p_last_played_on: p.lastPlayedOn ?? null,
        p_total_plays: p.totalPlays,
        p_cards: snap.cards,
        p_plays: snap.plays,
        // Clear this device's guest_opens rows so the just-migrated progress
        // isn't also counted as a separate guest on the leaderboard.
        p_guest_id: localdb.getGuestId(),
      })
      if (error) {
        // Keep the snapshot for a later retry rather than losing the guest's data.
        set({ error: error.message })
        return
      }
      // Migrated — the account is now the source of truth. Drop the local mirror.
      localdb.clear()
      localdb.clearPendingClaim()
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  async signUpEmail(email, password, username) {
    if (!supabase) throw new Error('Backend not configured')
    set({ error: null })
    // If a guest is upgrading, snapshot their progress before the account lands.
    get().beginGuestClaim()
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
    // Signing up with an address that already has an account comes back as a
    // user with no identities and no session — Supabase's deliberate
    // anti-enumeration shape. Say so, rather than leaving them waiting on a
    // confirmation email that will never arrive (which is what the branch
    // below would tell them).
    if (data.user && (data.user.identities?.length ?? 0) === 0) {
      const msg = 'That email already has an account — try signing in instead.'
      set({ error: msg })
      throw new Error(msg)
    }
    // With email confirmation ON, signUp returns no session — the user must
    // confirm before they're authed. Report that so the UI doesn't bounce them
    // straight into a protected route (which would kick back to onboarding).
    // With it OFF (the intended setup — see docs/SETUP-SUPABASE.md) a session
    // comes back immediately and they go straight into the game.
    if (!data.session) return { needsConfirmation: true }
    await get().refreshProfile()
    return { needsConfirmation: false }
  },

  async signIn(identifier, password) {
    if (!supabase) throw new Error('Backend not configured')
    set({ error: null })
    // A guest may be signing into an account they just made; snapshot in case
    // it's fresh. (The server ignores the claim for established accounts.)
    get().beginGuestClaim()
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
    // Snapshot guest progress now — the web flow reloads the page on redirect,
    // so this must be persisted before we hand off to the provider.
    get().beginGuestClaim()
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
      // Migrate any pending guest snapshot before we read the profile back, so
      // the account shows the user's chosen handle + progress from the first
      // render (idempotent — onAuthStateChange may have already run it).
      await get().claimGuestProgress()
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
    if (patch.avatarCharacter !== undefined) dbPatch.avatar_character = patch.avatarCharacter
    if (patch.denomination !== undefined) dbPatch.denomination = patch.denomination
    if (patch.pet !== undefined) dbPatch.pet = patch.pet
    if (patch.soundEnabled !== undefined) dbPatch.sound_enabled = patch.soundEnabled
    if (patch.hapticsEnabled !== undefined) dbPatch.haptics_enabled = patch.hapticsEnabled
    if (patch.reduceMotion !== undefined) dbPatch.reduce_motion = patch.reduceMotion
    if (patch.onboarded !== undefined) dbPatch.onboarded = patch.onboarded
    if (Object.keys(dbPatch).length) {
      await supabase.from('profiles').update(dbPatch).eq('id', cur.id)
    }
  },

  // Rename. Online, a SECURITY DEFINER RPC validates + enforces uniqueness so we
  // get a clean "taken"/"invalid" reason instead of a raw constraint error.
  // Guests rename freely on-device (no shared namespace to collide with).
  async changeUsername(next) {
    const cur = get().profile
    if (!cur) return { ok: false, error: 'No profile' }
    const clean = next.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
    if (clean.length < 2 || clean.length > 16) {
      return { ok: false, error: '2–16 letters, numbers, or underscores' }
    }
    if (clean === cur.username) return { ok: true }

    if (get().mode === 'local' || !supabase) {
      const p = { ...cur, username: clean, displayName: clean }
      localdb.saveProfile(p)
      set({ profile: p })
      return { ok: true }
    }

    const { data, error } = await supabase.rpc('set_username', { p_username: clean })
    if (error) return { ok: false, error: error.message }
    if (!data?.ok) {
      return { ok: false, error: data?.reason === 'taken' ? 'That username is taken' : 'Invalid username' }
    }
    set({ profile: { ...cur, username: data.username as string, displayName: data.username as string } })
    return { ok: true }
  },

  // Equip an avatar border / badge. The server refuses anything the player's
  // longest streak hasn't unlocked; we optimistically apply then roll back on
  // rejection so the UI feels instant but can't lie.
  async setCosmetics(patch) {
    const cur = get().profile
    if (!cur) return { ok: false, error: 'No profile' }
    const next: Profile = {
      ...cur,
      avatarBorder: patch.border ?? cur.avatarBorder,
      avatarBadge: patch.badge === undefined ? cur.avatarBadge : patch.badge,
    }
    set({ profile: next })

    if (get().mode === 'local' || !supabase) {
      localdb.saveProfile(next)
      return { ok: true }
    }

    const { data, error } = await supabase.rpc('set_cosmetics', {
      p_border: next.avatarBorder,
      p_badge: next.avatarBadge ?? null,
    })
    if (error || !data?.ok) {
      set({ profile: cur }) // roll back the optimistic change
      return { ok: false, error: error?.message ?? 'That’s not unlocked yet' }
    }
    return { ok: true }
  },

  // Equip a player-card background. Like setCosmetics, the server is the gate:
  // it refuses any key whose collectible the account hasn't unlocked, so we
  // apply optimistically and roll back if it says no.
  async setCardBackground(key) {
    const cur = get().profile
    if (!cur) return { ok: false, error: 'No profile' }
    const next: Profile = { ...cur, cardBackground: key === 'default' ? null : key }
    set({ profile: next })

    if (get().mode === 'local' || !supabase) {
      localdb.saveProfile(next)
      return { ok: true }
    }

    const { data, error } = await supabase.rpc('set_card_background', { p_key: key })
    if (error || !data?.ok) {
      set({ profile: cur }) // roll back the optimistic change
      return { ok: false, error: error?.message ?? 'That background isn’t unlocked yet' }
    }
    return { ok: true }
  },

  // Equip a pet. Same shape as setCosmetics/setCardBackground: optimistic, with
  // the server as the gate — it refuses any pet the account's level hasn't
  // reached, so the UI feels instant but can't lie. Guests keep theirs on the
  // device, where the level in the local profile is the same number the ladder
  // reads, so both modes gate on exactly the same thing.
  async setPet(id, progress) {
    const cur = get().profile
    if (!cur) return { ok: false, error: 'No profile' }
    const next: Profile = { ...cur, pet: id }
    set({ profile: next })

    if (get().mode === 'local' || !supabase) {
      // The local gate is the catalog itself — data/pets is the only ladder,
      // and lib/petProgress gathered the numbers it reads.
      if (id && progress && !petUnlocked(id, progress)) {
        set({ profile: cur })
        return { ok: false, error: 'That one isn’t unlocked yet' }
      }
      localdb.saveProfile(next)
      return { ok: true }
    }

    const { data, error } = await supabase.rpc('set_pet', { p_pet: id })
    if (error || !data?.ok) {
      set({ profile: cur }) // roll back the optimistic change
      return { ok: false, error: error?.message ?? 'That one isn’t unlocked yet' }
    }
    return { ok: true }
  },

  // Equip the composable character avatar. Applied optimistically, then
  // persisted — on-device in LOCAL mode, to profiles.avatar_character online.
  setAvatarCharacter(spec) {
    const cur = get().profile
    if (!cur) return
    const next: Profile = { ...cur, avatarCharacter: spec }
    set({ profile: next })
    if (get().mode === 'local' || !supabase) {
      localdb.saveProfile(next)
      return
    }
    void supabase
      .from('profiles')
      .update({ avatar_character: spec })
      .eq('id', cur.id)
      .then(({ error }) => {
        if (error) set({ error: error.message })
      })
  },

  // Record that the player shared a given day's drop (distinct days only). Drives
  // share-count unlocks like the King Baldwin set. Persists on-device in LOCAL
  // mode, to profiles.shared_days online.
  recordShare(dropDate) {
    const cur = get().profile
    if (!cur) return
    const days = cur.sharedDays ?? []
    if (days.includes(dropDate)) return // already counted this day
    const next: Profile = { ...cur, sharedDays: [...days, dropDate] }
    set({ profile: next })
    if (get().mode === 'local' || !supabase) {
      localdb.saveProfile(next)
      return
    }
    void supabase
      .from('profiles')
      .update({ shared_days: next.sharedDays })
      .eq('id', cur.id)
      .then(({ error }) => {
        if (error) set({ error: error.message })
      })
  },

  // Grant a collected wearable item (from a Daily Chest drop). Distinct ids only.
  // Persists on-device in LOCAL mode, to profiles.owned_items online.
  grantItem(itemId) {
    const cur = get().profile
    if (!cur) return
    const owned = cur.ownedItems ?? []
    if (owned.includes(itemId)) return
    const next: Profile = { ...cur, ownedItems: [...owned, itemId] }
    set({ profile: next })
    if (get().mode === 'local' || !supabase) {
      localdb.saveProfile(next)
      return
    }
    void supabase
      .from('profiles')
      .update({ owned_items: next.ownedItems })
      .eq('id', cur.id)
      .then(({ error }) => {
        if (error) set({ error: error.message })
      })
  },

  // Grant entitlement to a full-look skin. Today this is a free "preview" unlock
  // (no IAP yet); real purchases will write this set server-side later. Distinct
  // ids only; persists on-device in LOCAL mode, to profiles.owned_skins online.
  grantSkin(skinId) {
    const cur = get().profile
    if (!cur) return
    const owned = cur.ownedSkins ?? []
    if (owned.includes(skinId)) return
    const next: Profile = { ...cur, ownedSkins: [...owned, skinId] }
    set({ profile: next })
    if (get().mode === 'local' || !supabase) {
      localdb.saveProfile(next)
      return
    }
    void supabase
      .from('profiles')
      .update({ owned_skins: next.ownedSkins })
      .eq('id', cur.id)
      .then(({ error }) => {
        if (error) set({ error: error.message })
      })
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
