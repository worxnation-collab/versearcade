import { create } from 'zustand'
import { useAuth } from './auth'
import { useBible } from './bible'
import { useCollection } from './collection'
import { CHALLENGES, DECOR, bestOwnedTier, decorById, ownedDecor, type KeepCounters } from '@/data/keep'
import { FURNISHINGS, REQUIREMENT_NOUN, ownedFurnishings } from '@/data/room'
import { roomProgress } from '@/lib/roomProgress'
import { pressedSeals, sealFor } from '@/data/seals'

// "You've earned a piece" — for the two rooms.
//
// The keep's fifteen challenges and the room's eighteen furnishings completed
// in SILENCE. Race the CPU once and the Woven Rug is yours; nothing on the
// result screen, the Battle tab or anywhere else said so, and the shelf that
// would show it is behind a sheet behind a row. A reward nobody is told about
// is a reward that didn't happen. This is the one queue both rooms announce
// through, shown by `UnlockToast` wherever the player lands — the same
// park-and-show shape as store/drops.ts and store/skinUnlocks.ts.
//
// Two ways in, because the two rooms learn about progress differently:
//
//  - **The keep is TOLD.** Every counter moves through `useKeep.track()`, so
//    it hands this store the counters before and after and the diff is exact —
//    a new piece, or a piece reaching Fine or Grand.
//  - **The seals are WATCHED too**, by the same diff-against-disk rule. A seal
//    is pressed by the LAST chapter of a book being opened, which happens in
//    the reader with no result screen to hang a reward off — the same problem
//    an async battle's winner has in store/skinUnlocks.ts, and the same answer.
//  - **The room is WATCHED.** Its six requirements are lifetime numbers on the
//    profile and two other stores, written by a dozen call sites; there is no
//    one place to hook. So `checkRoom()` diffs what is owned now against what
//    this device last saw, with the same PRIMING the skin toast uses: a device
//    seeing an account for the first time records silently, or a long-time
//    player would be told about eighteen furnishings at once.
//
// Nothing here counts, ranks or remembers a total. It says one thing happened,
// once, and what to do about it.

export interface Unlock {
  /** Stable, for keys and de-duping: `keep:<decor>:<tier>` or `room:<id>`. */
  id: string
  kind: 'keep' | 'room' | 'seal'
  /** The piece, for the thumb. */
  piece: string
  /** Eyebrow: "New for your keep", "Woven Rug is Fine now". */
  kicker: string
  title: string
  /** Why — the challenge or requirement, in words. */
  line: string
  to: string
}

interface UnlockState {
  pending: Unlock | null
  queue: Unlock[]
  dismiss: () => void
  push: (items: Unlock[]) => void
  /** Keep counters moved — say what that earned. */
  noteKeep: (before: KeepCounters, after: KeepCounters) => void
  /** Re-derive the room's shelf and announce anything new. Cheap to spam. */
  checkRoom: () => void
  /** Re-derive the seal collection and announce anything new. Cheap to spam. */
  checkSeals: () => void
}

const TIER_WORD: Record<number, string> = { 2: 'Fine', 3: 'Grand' }

function roomKey(uid: string) {
  return `va.room.seen.${uid}`
}

function sealKey(uid: string) {
  return `va.seals.seen.${uid}`
}

function readSeen(k: string): string[] | null {
  try {
    const raw = localStorage.getItem(k)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as string[]) : null
  } catch {
    return null
  }
}

function writeSeen(k: string, ids: string[]) {
  try {
    localStorage.setItem(k, JSON.stringify(ids))
  } catch {
    /* private mode: told again next time, which is survivable */
  }
}

export const useUnlocks = create<UnlockState>((set, get) => ({
  pending: null,
  queue: [],

  dismiss() {
    const [next, ...rest] = get().queue
    set({ pending: next ?? null, queue: rest })
  },

  push(items) {
    if (!items.length) return
    const cur = get()
    const known = new Set([cur.pending?.id, ...cur.queue.map((u) => u.id)].filter(Boolean))
    const fresh = items.filter((u) => !known.has(u.id))
    if (!fresh.length) return
    if (cur.pending) set({ queue: [...cur.queue, ...fresh] })
    else set({ pending: fresh[0], queue: [...cur.queue, ...fresh.slice(1)] })
  },

  noteKeep(before, after) {
    const out: Unlock[] = []
    const had = new Set(ownedDecor(before))
    for (const d of DECOR) {
      const b = bestOwnedTier(d.id, before)
      const a = bestOwnedTier(d.id, after)
      if (a <= b) continue
      const ch = CHALLENGES.find((c) => c.decor === d.id)
      if (!had.has(d.id) && a >= 1) {
        out.push({
          id: `keep:${d.id}:1`,
          kind: 'keep',
          piece: d.id,
          kicker: 'New for your keep',
          title: d.name,
          line: ch ? `${ch.text} — done. Tap to put it in the hall →` : 'Tap to put it in the hall →',
          to: '/battle?keep=1',
        })
        if (a === 1) continue
      }
      out.push({
        id: `keep:${d.id}:${a}`,
        kind: 'keep',
        piece: d.id,
        kicker: `${d.name} is ${TIER_WORD[a] ?? 'finer'} now`,
        title: `${TIER_WORD[a] ?? ''} ${d.name}`.trim(),
        line: 'It upgrades where it stands. Tap to see it →',
        to: '/battle?keep=1',
      })
    }
    get().push(out)
  },

  checkRoom() {
    const profile = useAuth.getState().profile
    if (!profile?.id) return
    // Two of the six requirements live in stores that may not be loaded yet;
    // diffing against zeros would hide a piece until they were, and then
    // announce it at the wrong moment — or, worse, treat a loaded-later count
    // as "new". Wait for both.
    if (!useBible.getState().loaded || !useCollection.getState().loaded) return

    const owned = ownedFurnishings(roomProgress())
    const k = roomKey(profile.id)
    const seen = readSeen(k)
    if (seen === null) {
      writeSeen(k, owned)
      return
    }
    const fresh = owned.filter((id) => !seen.includes(id))
    if (!fresh.length) return
    writeSeen(k, [...new Set([...seen, ...owned])])
    get().push(
      fresh.map((id) => {
        const f = FURNISHINGS.find((x) => x.id === id)!
        return {
          id: `room:${id}`,
          kind: 'room' as const,
          piece: id,
          kicker: 'New for your Upper Room',
          title: f.name,
          line: `${REQUIREMENT_NOUN[f.req](f.goal)} — done. Tap to put it in the room →`,
          to: '/you',
        }
      }),
    )
  },

  checkSeals() {
    const profile = useAuth.getState().profile
    if (!profile?.id) return
    // A seal is derived from chapter marks, so an unloaded store reads as zero
    // books finished — and the load that follows would then announce every
    // seal the player already had. Same wait the room makes.
    if (!useBible.getState().loaded) return

    const owned = pressedSeals(useBible.getState().chapters)
    const k = sealKey(profile.id)
    const seen = readSeen(k)
    // Priming: a device meeting an account for the first time records silently.
    // Without it, a reader with forty books finished would be told about forty
    // of them at once — the trap 0087's backfill taught the skin toast.
    if (seen === null) {
      writeSeen(k, owned)
      return
    }
    const fresh = owned.filter((book) => !seen.includes(book))
    if (!fresh.length) return
    writeSeen(k, [...new Set([...seen, ...owned])])
    get().push(
      fresh.map((book) => {
        const seal = sealFor(book)
        return {
          id: `seal:${book}`,
          kind: 'seal' as const,
          piece: book,
          kicker: 'A seal is pressed',
          title: book,
          line: `You've read all ${seal?.chapters ?? 0} chapter${seal?.chapters === 1 ? '' : 's'}. Tap to see your seals →`,
          to: '/bible/seals',
        }
      }),
    )
  },
}))

/** The keep piece the player is closest to, for a result screen's one line. */
export function nearestKeepChallenge(counters: KeepCounters): { text: string; decor: string; name: string; have: number; goal: number } | null {
  const open = CHALLENGES.filter((c) => (counters[c.counter] ?? 0) < c.goal)
  if (!open.length) return null
  const best = open.reduce((a, c) =>
    (counters[c.counter] ?? 0) / c.goal > (counters[a.counter] ?? 0) / a.goal ? c : a,
  )
  return {
    text: best.text,
    decor: best.decor,
    name: decorById(best.decor)?.name ?? best.decor,
    have: Math.min(counters[best.counter] ?? 0, best.goal),
    goal: best.goal,
  }
}
