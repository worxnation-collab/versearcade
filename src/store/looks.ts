import { create } from 'zustand'
import { useAuth } from './auth'
import type { AvatarSpec } from '@/types'

// Saved looks — a whole outfit under one name, swapped in a tap.
//
// The wardrobe is six shelves deep now (skins, pets, items, card backgrounds,
// borders, badges), and putting a look back together after trying something on
// meant remembering six separate choices and finding six separate tiles. This
// is the standard fix for that in any game with a wardrobe this size: save the
// combination, not the pieces.
//
// DEVICE-LOCAL, in BOTH modes, and that is a deliberate break with the two-mode
// invariant — the same one store/music.ts makes, for the same kind of reason. A
// look is a shortcut for your fingers, not a possession: it grants nothing,
// unlocks nothing, and every piece it names is something the account already
// owns and re-checks on equip (a look naming a skin you no longer have simply
// doesn't apply that part). Syncing it would mean a table, an RPC and a merge
// conflict story for a convenience that costs nothing to rebuild.
//
// If it ever should follow the account, the shape to use is the house one: a
// `looks` jsonb column on profiles, written through a security-definer RPC, with
// this store's array as the local mirror.

export interface Look {
  id: string
  name: string
  spec: AvatarSpec | null
  pet: string | null
  border: string | null
  badge: string | null
  cardBackground: string | null
}

/** Six is plenty for a wardrobe this size, and it bounds the localStorage blob. */
export const MAX_LOOKS = 6

function key(): string {
  const uid = useAuth.getState().profile?.id
  return uid ? `va.looks.${uid}` : 'va.looks.guest'
}

function read(): Look[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key()) || '[]') as Look[]
    return Array.isArray(raw) ? raw.slice(0, MAX_LOOKS) : []
  } catch {
    return []
  }
}

function write(looks: Look[]) {
  try {
    localStorage.setItem(key(), JSON.stringify(looks.slice(0, MAX_LOOKS)))
  } catch {
    /* private mode / storage full — in-memory only */
  }
}

interface LooksState {
  loaded: boolean
  looks: Look[]
  load: () => void
  /** Snapshot what is equipped right now. Returns false when the shelf is full. */
  save: (name: string) => boolean
  /** Put a saved look back on. Pieces the account no longer owns are skipped
   *  by the equip paths themselves, so a stale look degrades rather than fails. */
  apply: (id: string) => Promise<void>
  remove: (id: string) => void
}

export const useLooks = create<LooksState>((set, get) => ({
  loaded: false,
  looks: [],

  load() {
    set({ loaded: true, looks: read() })
  },

  save(name) {
    const p = useAuth.getState().profile
    if (!p) return false
    // Merge onto what's on DISK rather than in-memory state: the customizer can
    // be the first thing a session renders (a ?customize=1 deep link), and
    // writing an empty array back would drop every saved look. Same trap as
    // store/bookAccuracy.ts:record.
    const disk = read()
    if (disk.length >= MAX_LOOKS) return false
    const look: Look = {
      id: `look_${Date.now().toString(36)}`,
      name: name.trim().slice(0, 24) || `Look ${disk.length + 1}`,
      spec: p.avatarCharacter ?? null,
      pet: p.pet ?? null,
      border: p.avatarBorder ?? null,
      badge: p.avatarBadge ?? null,
      cardBackground: p.cardBackground ?? null,
    }
    const next = [...disk, look]
    write(next)
    set({ looks: next })
    return true
  },

  async apply(id) {
    const look = get().looks.find((l) => l.id === id)
    if (!look) return
    // One write, through the profile's own updater, so the online path persists
    // and the local path doesn't — exactly as equipping each piece by hand does.
    await useAuth.getState().updateProfile({
      avatarCharacter: look.spec,
      pet: look.pet,
      avatarBorder: look.border ?? 'default',
      avatarBadge: look.badge,
      cardBackground: look.cardBackground,
    })
  },

  remove(id) {
    const next = read().filter((l) => l.id !== id)
    write(next)
    set({ looks: next })
  },
}))
