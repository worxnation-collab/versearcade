// Tiny localStorage-backed store for LOCAL (offline / pre-auth) mode. Persists
// the guest profile, which days have been played, and earned collectibles.
// In ONLINE mode Supabase is the source of truth and this is unused.

import type { Profile, PlayResult, SubmitOutcome } from '@/types'

const K = {
  profile: 'va.profile',
  plays: 'va.plays', // { [dropDate]: { result, outcome } }
  cards: 'va.cards', // string[] of collectible keys (cards + relics)
  guestId: 'va.guestId', // stable anonymous device id, for ambient guest activity
  chestDate: 'va.chestDate', // last drop_date this device opened the daily chest
  pendingClaim: 'va.pendingClaim', // guest snapshot to migrate into a new account
  practice: 'va.practice', // { [dropDate]: { bestScore, lastRewardOn } } practice state
  focusXp: 'va.focusXp', // { [localDay]: xpEarned } — focus-practice XP earned per day (cap)
}

export interface LocalPractice {
  bestScore: number
  lastRewardOn: string | null
}

// A frozen snapshot of the guest's progress, captured when they start creating
// an account, so it survives an OAuth redirect (web reloads the page) and can be
// folded into the freshly-created account on the other side. See the auth store.
export interface PendingClaim {
  profile: Profile
  cards: string[]
  plays: {
    drop_date: string
    score: number
    time_ms: number
    correct_count: number
    total_questions: number
    combo_max: number
    xp_earned: number
  }[]
}

export const localdb = {
  getProfile(): Profile | null {
    const raw = localStorage.getItem(K.profile)
    return raw ? (JSON.parse(raw) as Profile) : null
  },
  saveProfile(p: Profile) {
    localStorage.setItem(K.profile, JSON.stringify(p))
  },
  clear() {
    localStorage.removeItem(K.profile)
    localStorage.removeItem(K.plays)
    localStorage.removeItem(K.cards)
    localStorage.removeItem(K.pendingClaim)
    localStorage.removeItem(K.practice)
    localStorage.removeItem(K.focusXp)
  },
  getPlays(): Record<string, { result: PlayResult; outcome: SubmitOutcome }> {
    const raw = localStorage.getItem(K.plays)
    return raw ? JSON.parse(raw) : {}
  },
  getPlay(dropDate: string) {
    return this.getPlays()[dropDate] ?? null
  },
  savePlay(dropDate: string, result: PlayResult, outcome: SubmitOutcome) {
    const all = this.getPlays()
    all[dropDate] = { result, outcome }
    localStorage.setItem(K.plays, JSON.stringify(all))
  },
  // Stable anonymous id for this device, so a guest's daily activity can be
  // counted once in the ambient pulse. Survives clear() (it's not user data).
  getGuestId(): string {
    let id = localStorage.getItem(K.guestId)
    if (!id) {
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`
      localStorage.setItem(K.guestId, id)
    }
    return id
  },
  getCards(): string[] {
    const raw = localStorage.getItem(K.cards)
    return raw ? JSON.parse(raw) : []
  },
  addCard(key: string) {
    const cards = new Set(this.getCards())
    cards.add(key)
    localStorage.setItem(K.cards, JSON.stringify([...cards]))
  },
  // Practice state per drop_date (guest / offline). ONLINE uses practice_plays.
  getPracticeAll(): Record<string, LocalPractice> {
    const raw = localStorage.getItem(K.practice)
    return raw ? JSON.parse(raw) : {}
  },
  getPractice(dropDate: string): LocalPractice | null {
    return this.getPracticeAll()[dropDate] ?? null
  },
  savePractice(dropDate: string, state: LocalPractice) {
    const all = this.getPracticeAll()
    all[dropDate] = state
    localStorage.setItem(K.practice, JSON.stringify(all))
  },
  // Focus-practice XP earned per local day (guest / offline). ONLINE uses the
  // focus_practice_days table via submit_focus_practice.
  getFocusXpDay(day: string): number {
    const raw = localStorage.getItem(K.focusXp)
    const all = raw ? (JSON.parse(raw) as Record<string, number>) : {}
    return all[day] ?? 0
  },
  addFocusXp(day: string, amount: number) {
    const raw = localStorage.getItem(K.focusXp)
    const all = raw ? (JSON.parse(raw) as Record<string, number>) : {}
    all[day] = (all[day] ?? 0) + amount
    localStorage.setItem(K.focusXp, JSON.stringify(all))
  },
  getChestDate(): string | null {
    return localStorage.getItem(K.chestDate)
  },
  setChestDate(dropDate: string) {
    localStorage.setItem(K.chestDate, dropDate)
  },
  // Pending guest -> account migration snapshot (see auth.beginGuestClaim).
  setPendingClaim(snapshot: PendingClaim) {
    localStorage.setItem(K.pendingClaim, JSON.stringify(snapshot))
  },
  getPendingClaim(): PendingClaim | null {
    const raw = localStorage.getItem(K.pendingClaim)
    return raw ? (JSON.parse(raw) as PendingClaim) : null
  },
  clearPendingClaim() {
    localStorage.removeItem(K.pendingClaim)
  },
}
