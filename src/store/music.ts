// What the player has heard.
//
// A track unlocks by being somewhere — walk into the room, the music is yours,
// exactly the way a region works in the game this is borrowed from. It is the
// one collectible in the app that cannot be missed, cannot be bought and cannot
// be compared: everybody who visits the Study tab has Cloister, and nobody's
// copy of it is better than anybody else's. That is the whole reason it can
// exist next to the rank-free rule — a soundtrack has no loser.
//
// PERSISTENCE — deliberately device-local, both modes, no server side.
// The usual invariant (online → table + RPC, guest → localdb) is about data a
// player would be upset to lose or would expect to follow their account. This
// isn't that: it's a record of what this device has played through, sitting
// beside the volume slider and `va.bible.open` rather than beside XP. Making it
// an account row would mean a migration that has to be hand-applied before the
// client merges, and an online player hitting a missing table would lose their
// music player — a worse failure than a fresh phone re-unlocking a track by
// visiting the tab it plays on. If it ever *should* follow the account, it
// wants a `music_unlocks` table + RPC and the standard load()/optimistic-write
// shape from store/reviews.ts.

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { TRACKS } from '@/data/music'

export interface Announcement {
  id: string
  /** Epoch ms — the banner uses this to time itself out. */
  at: number
  /** First track this device has ever played: the banner says how to mute. */
  intro: boolean
  /** Newly unlocked, rather than one they already had. */
  isNew: boolean
}

interface MusicState {
  /** Track ids this device has heard, in the order they turned up. */
  unlocked: string[]
  /** Chosen in the music player; overrides the room until they move rooms. */
  pinned: string | null
  /** Whether the "music is on, here's the mute" banner has been shown. */
  introSeen: boolean
  /** Drives the now-playing banner. Never persisted. */
  announced: Announcement | null

  /** Called when a track actually starts sounding. */
  heard: (id: string) => void
  pin: (id: string | null) => void
  dismiss: () => void
}

export const useMusic = create<MusicState>()(
  persist(
    (set, get) => ({
      unlocked: [],
      pinned: null,
      introSeen: false,
      announced: null,

      heard: (id) => {
        const { unlocked, introSeen } = get()
        const isNew = !unlocked.includes(id)
        const intro = !introSeen
        set({
          unlocked: isNew ? [...unlocked, id] : unlocked,
          introSeen: true,
          // Only a find (or the very first note this device plays) is worth
          // interrupting for. Announcing every track change would fire on every
          // tab switch forever; this fires eight times in a lifetime and then
          // never again, and the names stay readable in the music player.
          announced: isNew || intro ? { id, at: Date.now(), intro, isNew } : null,
        })
      },

      pin: (id) => set({ pinned: id }),
      dismiss: () => set({ announced: null }),
    }),
    {
      name: 'va.music',
      storage: createJSONStorage(() => localStorage),
      // The banner and the current pick are this-session things; only what the
      // player has found is worth keeping.
      partialize: (s) => ({ unlocked: s.unlocked, introSeen: s.introSeen }),
    },
  ),
)

/** How much of the soundtrack has turned up so far. */
export function musicProgress(unlocked: string[]): { have: number; total: number } {
  const ids = new Set(TRACKS.map((t) => t.id))
  return { have: unlocked.filter((id) => ids.has(id)).length, total: TRACKS.length }
}
