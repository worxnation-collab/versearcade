// Unlocks — noticing the moment something is earned, and making it a moment.
//
// Every earned cosmetic in this app is DERIVED, not granted: skinOwned() and
// isUnlocked() read the player's stats and answer on the spot, which is why
// hitting a goal unlocks a skin with nothing to claim (see data/avatar). That's
// a good model and it stays. What it never had was a *moment* — the tile in the
// customizer quietly changed from "Shared 9/10 days" to "Tap to wear" and the
// share that finished the set passed unmarked. This store is that moment.
//
// How it works: scan() computes everything the player currently has, diffs it
// against what this device has already told them about, and queues the
// difference for features/unlocks to celebrate. Two rules keep it honest:
//
//   • First scan for an account SEEDS silently. An existing player with a
//     40-day streak opening this build must not get twelve popups in a row —
//     nothing is celebrated until something actually changes after the seed.
//   • Two requirements can stop being true (a church you leave, a notification
//     toggle you flip off). Those LATCH into owned_skins the moment they're
//     met — see claimSkin in store/auth — so nothing is ever taken back.
//
// Both modes, as always: the seen-set is per-account localStorage in EVERY mode
// (a celebration is a per-device courtesy, not an entitlement — being reminded
// once per device is the correct behaviour, and it needs no table), while the
// latch goes through the usual online RPC / local-profile split.

import { create } from 'zustand'
import {
  ARMOR,
  BUNDLES,
  FULL_SKINS,
  accessOwned,
  bundleOwned,
  requirementProgress,
  skinOwned,
  type ArmorSlot,
  type UnlockContext,
} from '@/data/avatar'
import { BADGES, BORDERS, isUnlocked } from '@/data/cosmetics'
import { cardBgByKey } from '@/data/playerCards'
import { notificationsEnabled } from '@/lib/notify'
import type { Profile } from '@/types'
import { useAuth } from './auth'

export type UnlockKind = 'skin' | 'pack' | 'border' | 'badge' | 'armor'

export interface UnlockAward {
  /** Namespaced (`skin:moses`) — this is what the seen-set remembers. */
  id: string
  kind: UnlockKind
  name: string
  blurb: string
  /** What earned it, as a sentence: "Reach a 14-day streak". */
  how: string
  /** skin/pack: the look to preview and equip. */
  skinId?: string
  /** pack: everything that came with it, spelled out for the card. */
  contents?: string[]
  borderKey?: string
  badgeKey?: string
  armorSlot?: ArmorSlot
}

const storeKey = (profileId: string) => `va.unlocks.${profileId}`

/** null means this device has never scanned this account — seed, don't shout. */
function readSeen(profileId: string): string[] | null {
  try {
    const raw = localStorage.getItem(storeKey(profileId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as string[]) : null
  } catch {
    return null
  }
}

function writeSeen(profileId: string, ids: string[]) {
  try {
    localStorage.setItem(storeKey(profileId), JSON.stringify(ids))
  } catch {
    /* storage full or blocked — worst case someone sees a celebration twice */
  }
}

/** Everything a requirement can be measured against, from the profile alone. */
export function unlockContext(profile: Profile, notificationsOn: boolean): UnlockContext {
  return {
    sharedDays: profile.sharedDays,
    referralCount: profile.referralCount,
    longestStreak: profile.longestStreak,
    level: profile.level,
    totalPlays: profile.totalPlays,
    hasChurch: !!profile.churchId,
    notificationsOn,
    ownedSkins: profile.ownedSkins,
    admin: profile.isAdmin,
  }
}

/**
 * Everything this player has right now, as awards. Order matters — it's the
 * order they'd be celebrated in if several land at once.
 */
export function currentAwards(ctx: UnlockContext, longestStreak: number, founder?: boolean): UnlockAward[] {
  const out: UnlockAward[] = []

  // Packs first: the Angel Pack arrives as ONE moment, not three popups, which
  // is also why its skins are skipped below.
  for (const b of BUNDLES) {
    if (!bundleOwned(b, ctx)) continue
    const cards = b.cards.map((k) => cardBgByKey(k).name)
    out.push({
      id: `pack:${b.id}`,
      kind: 'pack',
      name: b.name,
      blurb: b.blurb,
      how: requirementProgress(b.requirement, ctx).earnedLabel,
      skinId: b.skins[0],
      contents: [
        ...b.skins.map((id) => FULL_SKINS.find((s) => s.id === id)?.name ?? id),
        ...cards.map((n) => `${n} card`),
      ],
    })
  }

  for (const skin of FULL_SKINS) {
    if (skin.bundleOnly) continue // celebrated as part of its pack
    if (!skinOwned(skin, ctx)) continue
    out.push({
      id: `skin:${skin.id}`,
      kind: 'skin',
      name: skin.name,
      blurb: skin.blurb,
      how: requirementProgress(skin.requirement, ctx).earnedLabel,
      skinId: skin.id,
    })
  }

  // Streak cosmetics. `requiredStreak: 0` is the starter look everybody has —
  // there's no moment in being given the thing you began with.
  for (const b of BORDERS) {
    if (b.requiredStreak <= 0 || !isUnlocked(b.requiredStreak, longestStreak, founder)) continue
    out.push({
      id: `border:${b.key}`,
      kind: 'border',
      name: b.name,
      blurb: b.blurb,
      how: `A ${b.requiredStreak}-day streak`,
      borderKey: b.key,
    })
  }
  for (const b of BADGES) {
    if (b.requiredStreak <= 0 || !isUnlocked(b.requiredStreak, longestStreak, founder)) continue
    out.push({
      id: `badge:${b.key}`,
      kind: 'badge',
      name: b.name,
      blurb: `${b.emoji} for ${b.requiredStreak} days of showing up.`,
      how: `A ${b.requiredStreak}-day streak`,
      badgeKey: b.key,
    })
  }

  // Armor: only the two EARNED pieces. Free and Studio pieces are already on
  // everyone, so there's nothing to announce.
  for (const piece of ARMOR) {
    if (piece.access.kind !== 'earned') continue
    if (!accessOwned(piece.access, longestStreak, ctx.admin)) continue
    out.push({
      id: `armor:${piece.slot}`,
      kind: 'armor',
      name: piece.name,
      blurb: piece.verse,
      how: `A ${piece.access.requiredStreak}-day streak`,
      armorSlot: piece.slot,
    })
  }

  return out
}

interface UnlocksState {
  /** Seeded for the current account — nothing is celebrated before this. */
  ready: boolean
  profileId: string | null
  seen: string[]
  queue: UnlockAward[]
  notificationsOn: boolean
  /** Re-ask whether daily reminders are on (async on the web — see lib/notify). */
  refreshNotifications: () => Promise<void>
  scan: () => void
  dismiss: () => void
  /** Test/debug seam: forget this account's history so unlocks re-announce. */
  reset: () => void
}

export const useUnlocks = create<UnlocksState>((set, get) => ({
  ready: false,
  profileId: null,
  seen: [],
  queue: [],
  notificationsOn: false,

  async refreshNotifications() {
    const on = await notificationsEnabled()
    if (on === get().notificationsOn) return
    set({ notificationsOn: on })
    get().scan()
  },

  scan() {
    const profile = useAuth.getState().profile
    if (!profile) return

    const ctx = unlockContext(profile, get().notificationsOn)
    const awards = currentAwards(ctx, profile.longestStreak, profile.founder)
    const ids = awards.map((a) => a.id)

    // A different account (or the first look at this one) reloads the history
    // from disk rather than trusting whatever the last account left in memory.
    const switched = get().profileId !== profile.id
    const stored = switched ? readSeen(profile.id) : get().seen

    if (stored === null) {
      // Never seen this account on this device: seed silently. Everything they
      // already have is "known", so only what changes from here celebrates.
      writeSeen(profile.id, ids)
      set({ profileId: profile.id, seen: ids, queue: [], ready: true })
    } else {
      const queued = new Set(get().queue.map((a) => a.id))
      const fresh = awards.filter((a) => !stored.includes(a.id) && !queued.has(a.id))
      const seen = Array.from(new Set([...stored, ...ids]))
      writeSeen(profile.id, seen)
      set({
        profileId: profile.id,
        seen,
        queue: switched ? fresh : [...get().queue, ...fresh],
        ready: true,
      })
    }

    // Latch anything that could stop being true. Fire-and-forget: if the write
    // fails the skin is still owned (the requirement is met right now), and the
    // next scan tries again.
    for (const skin of FULL_SKINS) {
      const req = requirementProgress(skin.requirement, ctx)
      if (req.latching && req.met) void useAuth.getState().claimSkin(skin.id)
    }
  },

  dismiss() {
    set({ queue: get().queue.slice(1) })
  },

  reset() {
    const profile = useAuth.getState().profile
    if (profile) {
      try {
        localStorage.removeItem(storeKey(profile.id))
      } catch {
        /* ignore */
      }
    }
    set({ ready: false, profileId: null, seen: [], queue: [] })
  },
}))
