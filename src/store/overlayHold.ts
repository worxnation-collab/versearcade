import { create } from 'zustand'

// Who is holding the top of the screen right now.
//
// Two toasts float over live content (`NowPlaying`, `StudyDropToast`), and two
// things they must not float over: the tutorial, which is a whole-screen
// takeover a brand-new player is reading, and a quiz run, whose own header —
// the lock, the score, the combo — sits in exactly the 60px a toast lands in.
// Both shipped: the "Music is on" card arrived over the first tutorial slide,
// and a "New track unlocked" card covered the back control on the review run.
//
// This is a set of reasons rather than a boolean, so two holders releasing in
// either order can't un-hold each other. Nothing here is persisted.
interface OverlayHold {
  reasons: Record<string, true>
  hold: (reason: string) => void
  release: (reason: string) => void
}

export const useOverlayHold = create<OverlayHold>((set) => ({
  reasons: {},
  hold: (reason) => set((s) => (s.reasons[reason] ? s : { reasons: { ...s.reasons, [reason]: true } })),
  release: (reason) =>
    set((s) => {
      if (!s.reasons[reason]) return s
      const next = { ...s.reasons }
      delete next[reason]
      return { reasons: next }
    }),
}))

/** True while anything is asking the toasts to wait. */
export const useHeld = () => useOverlayHold((s) => Object.keys(s.reasons).length > 0)
