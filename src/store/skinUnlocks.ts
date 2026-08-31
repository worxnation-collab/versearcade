import { create } from 'zustand'
import { allSkins, skinOwned, type SkinDef } from '@/data/avatar'
import { useAuth } from './auth'

// "You've earned a skin" — the notification, and the only place the crusades
// ladder's numbers are ever spoken out loud.
//
// The wardrobe deliberately shows no progress toward a win-gated look (a
// padlock and crossed swords, nothing countable), so this is the moment the
// player finds out both WHICH skin and WHY. Anywhere else it would be a bar to
// grind against; here it is a thing that happened.
//
// WHY IT DIFFS RATHER THAN BEING TOLD: the winner of an async battle is not
// holding their phone when their battle completes — the opponent's submit is
// what decides it — so there is no call on their device to hang a reward off.
// Comparing what is owned now against what was owned last time this device
// looked catches BOTH sides, and catches the challenger whenever they next open
// the app. Same shape as store/drops.ts: park the find, show it wherever they
// land.
//
// PRIMING IS THE TRAP, and it is handled. A device that has never recorded a
// set would otherwise announce every skin the player already had — and 0087's
// backfill hands a long-time player several at once. So the FIRST sight of an
// account records silently and notifies nothing; only changes after that speak.
//
// Device-local (`va.skins.seen.<uid>`), the deliberate break store/looks.ts and
// store/music.ts make: it grants nothing, and being told twice on a second
// phone is a far smaller cost than a table and an RPC for a toast.

/** What a player has to have done to hold this look, in one short line. */
function reasonFor(skin: SkinDef): string {
  if (skin.winGoal != null) return `${skin.winGoal} battles won`
  if (skin.liveGoal != null) return `${skin.liveGoal} live battles played`
  if (skin.referralGoal != null) return `${skin.referralGoal} friends joined with your code`
  if (skin.shareGoal != null) return `shared on ${skin.shareGoal} different days`
  return 'earned'
}

export interface SkinUnlock {
  id: string
  name: string
  /** Why it unlocked — the sentence the wardrobe never shows. */
  reason: string
}

interface SkinUnlockState {
  /** The one waiting to be shown, or null. */
  pending: SkinUnlock | null
  /** More that landed together, shown one after another. */
  queue: SkinUnlock[]
  dismiss: () => void
  /** Re-read what's owned and queue anything new. Cheap and safe to spam. */
  check: () => void
}

function key(uid: string) {
  return `va.skins.seen.${uid}`
}

function readSeen(uid: string): string[] | null {
  try {
    const raw = localStorage.getItem(key(uid))
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as string[]) : null
  } catch {
    return null
  }
}

function writeSeen(uid: string, ids: string[]) {
  try {
    localStorage.setItem(key(uid), JSON.stringify(ids))
  } catch {
    /* private mode: the player is told again next time, which is survivable */
  }
}

export const useSkinUnlocks = create<SkinUnlockState>((set, get) => ({
  pending: null,
  queue: [],

  dismiss() {
    const [next, ...rest] = get().queue
    set({ pending: next ?? null, queue: rest })
  },

  check() {
    const profile = useAuth.getState().profile
    if (!profile?.id) return

    // Only the EARNED axis. A paid or road skin arrives with its own screen
    // saying so, and announcing those here would double up on both.
    const owned = allSkins()
      .filter((s) => s.source === 'earned')
      .filter((s) =>
        skinOwned(s, {
          sharedDays: profile.sharedDays,
          ownedSkins: profile.ownedSkins,
          referralCount: profile.referralCount,
          liveBattles: profile.liveBattles,
          battleWins: profile.battleWins,
          // NOT admin: the operator preview owns every skin, and priming an
          // operator's device would announce the whole wardrobe at once.
        }),
      )

    const ids = owned.map((s) => s.id)
    const seen = readSeen(profile.id)

    // First sight of this account on this device: record, say nothing.
    if (seen === null) {
      writeSeen(profile.id, ids)
      return
    }

    const fresh = owned.filter((s) => !seen.includes(s.id))
    if (!fresh.length) return

    writeSeen(profile.id, [...new Set([...seen, ...ids])])
    const unlocks: SkinUnlock[] = fresh.map((s) => ({ id: s.id, name: s.name, reason: reasonFor(s) }))
    const cur = get()
    if (cur.pending) set({ queue: [...cur.queue, ...unlocks] })
    else set({ pending: unlocks[0], queue: [...cur.queue, ...unlocks.slice(1)] })
  },
}))
