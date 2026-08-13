// Local, always-available settings for sound / haptics / motion. This is the
// source of truth the juice engine reads, so feedback works even before login.
// When a user signs in we hydrate these from their profile and mirror changes.

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface SettingsState {
  soundEnabled: boolean
  hapticsEnabled: boolean
  reduceMotion: boolean
  volume: number // 0..1
  /** Whether the "build your character" nudge has been dismissed (one-time). */
  characterPromptDismissed: boolean
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      soundEnabled: true,
      hapticsEnabled: true,
      reduceMotion: false,
      volume: 0.6,
      characterPromptDismissed: false,
      set: (patch) => set(patch),
    }),
    { name: 'va.settings', storage: createJSONStorage(() => localStorage) },
  ),
)
