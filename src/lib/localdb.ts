// Tiny localStorage-backed store for LOCAL (offline / pre-auth) mode. Persists
// the guest profile, which days have been played, and earned collectibles.
// In ONLINE mode Supabase is the source of truth and this is unused.

import type { Profile, PlayResult, SubmitOutcome } from '@/types'

const K = {
  profile: 'va.profile',
  plays: 'va.plays', // { [dropDate]: { result, outcome } }
  cards: 'va.cards', // string[] of collectible keys
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
  getCards(): string[] {
    const raw = localStorage.getItem(K.cards)
    return raw ? JSON.parse(raw) : []
  },
  addCard(key: string) {
    const cards = new Set(this.getCards())
    cards.add(key)
    localStorage.setItem(K.cards, JSON.stringify([...cards]))
  },
}
