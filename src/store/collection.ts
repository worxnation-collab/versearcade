import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { localdb } from '@/lib/localdb'
import { drawRelicKey, collectibleByKey } from '@/data/collectibles'
import { useAuth } from './auth'
import { useInventory } from './inventory'

// Collectible unlocks (achievement cards + daily-chest relics) with a single
// source of truth: the account when signed in (persists across devices), or the
// device when playing as a guest. This fixes cards previously resetting because
// they lived only in localStorage.

export interface ChestResult {
  alreadyOpened: boolean
  kind?: 'relic' | 'boost'
  key?: string
  rarity?: string
  /** First time ever seeing this one — it just got stamped into their Bible. */
  newStamp?: boolean
  /** How many copies they now hold, so a duplicate can say what it's good for. */
  qty?: number
}

function isOnline(): boolean {
  const a = useAuth.getState()
  return !!supabase && a.mode === 'online' && a.isAuthed
}

interface CollectionState {
  owned: string[]
  lastChestOn: string | null
  loaded: boolean
  load: () => Promise<void>
  grant: (keys: string[]) => Promise<string[]> // returns keys newly unlocked
  chestOpenedOn: (dropDate: string) => boolean
  openChest: (dropDate: string) => Promise<ChestResult>
}

export const useCollection = create<CollectionState>((set, get) => ({
  owned: [],
  lastChestOn: null,
  loaded: false,

  async load() {
    if (isOnline() && supabase) {
      const { data: u } = await supabase.auth.getUser()
      const uid = u.user?.id
      if (!uid) {
        set({ owned: [], lastChestOn: null, loaded: true })
        return
      }
      const [unlocksRes, profRes] = await Promise.all([
        supabase.from('user_unlocks').select('collectible_key').eq('user_id', uid),
        supabase.from('profiles').select('last_chest_on').eq('id', uid).maybeSingle(),
      ])
      set({
        owned: (unlocksRes.data ?? []).map((r) => r.collectible_key as string),
        lastChestOn: (profRes.data?.last_chest_on as string | null) ?? null,
        loaded: true,
      })
    } else {
      set({ owned: localdb.getCards(), lastChestOn: localdb.getChestDate(), loaded: true })
    }
  },

  async grant(keys) {
    const cur = new Set(get().owned)
    const fresh = keys.filter((k) => !cur.has(k))
    if (!fresh.length) return []
    set({ owned: [...get().owned, ...fresh] })
    if (isOnline() && supabase) {
      supabase.rpc('grant_unlocks', { p_keys: fresh }).then(
        () => {},
        () => {},
      )
    } else {
      fresh.forEach((k) => localdb.addCard(k))
    }
    return fresh
  },

  chestOpenedOn(dropDate) {
    const last = get().lastChestOn
    return !!last && last >= dropDate
  },

  async openChest(dropDate) {
    if (get().chestOpenedOn(dropDate)) return { alreadyOpened: true }
    if (isOnline() && supabase) {
      const { data, error } = await supabase.rpc('open_daily_chest', { p_drop_date: dropDate })
      if (error || !data) return { alreadyOpened: false }
      const raw = data as {
        already_opened?: boolean
        kind?: string
        key?: string
        rarity?: string
        new_stamp?: boolean
        qty?: number
      }
      if (raw.already_opened) return { alreadyOpened: true }
      if (raw.kind === 'boost') {
        set({ lastChestOn: dropDate })
        // xp_boosts changed on the profile — pull the fresh count.
        await useAuth.getState().refreshProfile()
        return { alreadyOpened: false, kind: 'boost' }
      }
      const owned = get().owned
      set({
        lastChestOn: dropDate,
        owned: raw.key && !owned.includes(raw.key) ? [...owned, raw.key] : owned,
      })
      // The server stacked the item; pull the fresh counts so the Inventory and
      // the reveal agree about how many the player now holds.
      void useInventory.getState().load()
      return {
        alreadyOpened: false,
        kind: 'relic',
        key: raw.key,
        rarity: raw.rarity,
        newStamp: raw.new_stamp ?? false,
        qty: raw.qty,
      }
    }
    // Guest (offline) chest — mirror the server's odds locally, incl. the rare boost.
    if (Math.random() < 0.04) {
      const auth = useAuth.getState()
      const prof = auth.profile
      if (prof) auth.setProfileLocal({ ...prof, xpBoosts: prof.xpBoosts + 1 })
      localdb.setChestDate(dropDate)
      set({ lastChestOn: dropDate })
      return { alreadyOpened: false, kind: 'boost' }
    }
    const key = drawRelicKey()
    const rarity = collectibleByKey(key)?.rarity
    const owned = get().owned
    const newStamp = !owned.includes(key)
    localdb.addCard(key)
    localdb.setChestDate(dropDate)
    // The stamp lands once; the item stacks every time. Before this, pulling a
    // relic a guest already had granted nothing at all.
    useInventory.getState().addLocal(key)
    set({ lastChestOn: dropDate, owned: newStamp ? [...owned, key] : owned })
    return { alreadyOpened: false, kind: 'relic', key, rarity, newStamp }
  },
}))
