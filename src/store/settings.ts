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
  /** Whether the how-to-play walkthrough has been shown once automatically. */
  tutorialSeen: boolean
  /** Whether the "add to home screen" nudge has been dismissed (one-time). */
  installPromptDismissed: boolean
  /**
   * Whether the player has ever had the Inventory section open in front of
   * them. Set from InventorySection itself, which only mounts when the section
   * is actually expanded — so this is "saw it", not "walked past it".
   */
  inventorySeen: boolean
  /** Whether the "you're holding relics" nudge has been dismissed (one-time). */
  inventoryNudgeDismissed: boolean
  /** When the App Store bubble was last dismissed (epoch ms, 0 = never). */
  appNudgeSnoozedAt: number
  /** Set once they've tapped through to the store — then we stop asking. */
  appNudgeDone: boolean
  /** Preferred translation for reading the full chapter (bible-api code). */
  readingTranslation: string
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
      tutorialSeen: false,
      installPromptDismissed: false,
      inventorySeen: false,
      inventoryNudgeDismissed: false,
      appNudgeSnoozedAt: 0,
      appNudgeDone: false,
      readingTranslation: 'web',
      set: (patch) => set(patch),
    }),
    { name: 'va.settings', storage: createJSONStorage(() => localStorage) },
  ),
)
