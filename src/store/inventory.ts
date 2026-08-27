import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth'
import { useSeason } from './season'
import { localdb } from '@/lib/localdb'

// What the player is currently HOLDING, as opposed to what they've collected.
//
// A collectible is two things now (see migration 0049):
//   the stamp — useCollection().owned. Granted once the first time you ever get
//               it, never removed. Drives card backgrounds and set completion.
//   the item  — this store. Duplicates stack, and this is what can be given away.
//
// Donating hands the item to your church and leaves the stamp alone, so giving
// costs you the object and never the record — no cosmetic is ever revoked and no
// set progress is lost. That's what makes it safe to give a thing away.
//
// Persistence follows the house shape: the `user_inventory` table online, a
// per-account localStorage key for guests.

/** collectible key -> how many copies you hold. */
export type Inventory = Record<string, number>

export type DonateReason = 'no_church' | 'not_held' | 'not_donatable' | 'offline' | 'failed'

export interface DonateResult {
  ok: boolean
  reason?: DonateReason
  points?: number
  remaining?: number
  leveledUp?: boolean
  level?: number
}

function localKey(): string {
  const uid = useAuth.getState().profile?.id
  return uid ? `va.inventory.${uid}` : 'va.inventory.guest'
}

function readLocal(): Inventory {
  try {
    return JSON.parse(localStorage.getItem(localKey()) || '{}') as Inventory
  } catch {
    return {}
  }
}

function writeLocal(inv: Inventory) {
  try {
    localStorage.setItem(localKey(), JSON.stringify(inv))
  } catch {
    /* private mode / storage full — in-memory only */
  }
}

function isOnline(): boolean {
  const a = useAuth.getState()
  return !!supabase && a.mode === 'online' && a.isAuthed
}

async function readRemote(uid: string): Promise<Inventory> {
  const { data, error } = await supabase!
    .from('user_inventory')
    .select('collectible_key, qty')
    .eq('user_id', uid)
  if (error || !data) return {}
  const inv: Inventory = {}
  for (const r of data as any[]) inv[r.collectible_key] = Number(r.qty) || 0
  return inv
}

interface InventoryState {
  items: Inventory
  loaded: boolean
  load: () => Promise<void>
  held: (key: string) => number
  /** Guest/offline chest pulls; the server does this itself when online. */
  addLocal: (key: string) => void
  donate: (key: string) => Promise<DonateResult>
}

export const useInventory = create<InventoryState>((set, get) => ({
  items: {},
  loaded: false,

  async load() {
    const uid = useAuth.getState().profile?.id
    const items = isOnline() && uid ? await readRemote(uid) : readLocal()
    set({ items, loaded: true })
  },

  held(key) {
    return get().items[key] ?? 0
  },

  addLocal(key) {
    if (!key) return
    // A chest can be opened before anything read the inventory (a deep link, a
    // reload), so merge onto what's on DISK rather than onto an empty in-memory
    // map — otherwise this write would erase every other item. Same trap as
    // store/bookAccuracy.ts:record.
    const base = get().loaded ? get().items : readLocal()
    const next = { ...base, [key]: (base[key] ?? 0) + 1 }
    set({ items: next })
    writeLocal(next)
  },

  async donate(key) {
    if (!key) return { ok: false, reason: 'failed' }
    if (!isOnline()) return { ok: false, reason: 'offline' }
    if (get().held(key) <= 0) return { ok: false, reason: 'not_held' }

    const { data, error } = await supabase!.rpc('donate_collectible', { p_key: key })
    const payload = data as {
      ok?: boolean
      reason?: DonateReason
      points?: number
      remaining?: number
      leveled_up?: boolean
      level?: number
    } | null

    if (error || !payload?.ok) {
      return { ok: false, reason: payload?.reason ?? 'failed' }
    }

    // The server is the authority on what's left; mirror it rather than guessing.
    const remaining = Number(payload.remaining ?? 0)
    const next = { ...get().items }
    if (remaining > 0) next[key] = remaining
    else delete next[key]
    set({ items: next })

    // Giving to your church walks the road. Note the direction: the road pays
    // the giver miles (which rank nothing), and the church's own points are
    // untouched by anything seasonal — no road reward may ever move church
    // standing. See docs/FORTRESS.md.
    void useSeason.getState().track('donate')

    return {
      ok: true,
      points: Number(payload.points ?? 0),
      remaining,
      leveledUp: !!payload.leveled_up,
      level: Number(payload.level ?? 0),
    }
  },
}))

// Guests keep their own copy so the Inventory isn't empty offline. Their
// collection already lives in localdb; this seeds one item per collected thing
// the first time, matching the server-side backfill in 0049.
export function seedGuestInventoryFromCollection() {
  // Guests only, as the name says. An online account's inventory is the table,
  // and localdb still holds whatever this device collected back when the player
  // was a guest here — seeding from that would write junk under their uid key
  // and race load() for the in-memory state. It only ever came out right
  // because load()'s remote read happened to land second.
  if (isOnline()) return
  const inv = readLocal()
  if (Object.keys(inv).length) return
  const owned = localdb.getCards()
  if (!owned.length) return
  const seeded: Inventory = {}
  for (const k of owned) seeded[k] = 1
  writeLocal(seeded)
  useInventory.setState({ items: seeded, loaded: true })
}
