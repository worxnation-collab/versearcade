// Apple in-app purchase state — what the app may sell, and what happened when
// someone bought it.
//
// Same shape as every other store here: a private isOnline(), a load() that
// reads whichever source is authoritative, and writers that update in-memory
// state optimistically so the UI is instant. The StoreKit calls themselves live
// in lib/iap; this is the React-facing half.
//
// Both modes, as always:
//   • ONLINE → fulfill_apple_purchase (migration 0045) writes owned_skins. It
//     has to be an RPC: enforce_skin_entitlement (0043/0044) deliberately blocks
//     a client from writing a paid skin onto its own profile, so the plain
//     `profiles` update that grantSkin() uses for free preview unlocks would be
//     rejected here — correctly.
//   • LOCAL/guest → merged onto what's on DISK, never onto in-memory state. A
//     guest can buy on a fresh load before anything called load(); merging onto
//     an empty object would erase every other skin they own. Same bug as
//     store/bookAccuracy:record — see the note there.

import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { localdb } from '@/lib/localdb'
import {
  configureIap,
  fetchProducts,
  iapAvailable,
  purchaseSku,
  restorePurchases,
  skinsForProductIds,
  skinsForSku,
  type IapProduct,
} from '@/lib/iap'
import { useAuth } from './auth'

const isOnline = (): boolean => useAuth.getState().mode !== 'local' && !!supabase

interface IapState {
  /** True once StoreKit has returned at least one product we can actually sell. */
  ready: boolean
  loading: boolean
  products: Record<string, IapProduct>
  error: string | null
  load: () => Promise<void>
  buy: (sku: string) => Promise<'bought' | 'cancelled' | 'failed'>
  restore: () => Promise<number>
}

export const useIap = create<IapState>((set, get) => ({
  ready: false,
  loading: false,
  products: {},
  error: null,

  async load() {
    if (!iapAvailable() || get().loading) return
    set({ loading: true, error: null })
    try {
      const uid = useAuth.getState().profile?.id ?? null
      await configureIap(isOnline() ? uid : null)
      const list = await fetchProducts()
      set({
        products: Object.fromEntries(list.map((p) => [p.sku, p])),
        // Fail closed: no products, no storefront. lib/commerce reads this.
        ready: list.length > 0,
        loading: false,
      })
    } catch (e) {
      set({ ready: false, loading: false, error: msg(e) })
    }
  },

  async buy(sku) {
    try {
      const outcome = await purchaseSku(sku)
      if (outcome.cancelled) return 'cancelled'
      // Trust Apple's post-purchase entitlement list over the single sku, so a
      // pack lands whole and an interrupted earlier purchase settles up too.
      const skins = outcome.ownedProductIds.length
        ? skinsForProductIds(outcome.ownedProductIds)
        : skinsForSku(sku)
      await persist(skins, sku, outcome.transactionId)
      return 'bought'
    } catch (e) {
      set({ error: msg(e) })
      return 'failed'
    }
  },

  async restore() {
    try {
      const skins = skinsForProductIds(await restorePurchases())
      if (skins.length) await persist(skins, null, null)
      return skins.length
    } catch (e) {
      set({ error: msg(e) })
      return 0
    }
  },
}))

/**
 * Write an entitlement everywhere it has to live, then reflect it in the
 * profile the UI is already rendering so the skin is wearable immediately.
 */
async function persist(skins: string[], sku: string | null, transactionId: string | null) {
  if (!skins.length) return

  if (isOnline() && supabase) {
    const { error } = await supabase.rpc('fulfill_apple_purchase', {
      p_sku: sku,
      p_skins: skins,
      p_transaction_id: transactionId,
    })
    if (error) throw new Error(error.message)
  } else {
    // Guest: merge onto DISK. See the header note.
    const onDisk = localdb.getProfile()
    if (onDisk) {
      const merged = [...new Set([...(onDisk.ownedSkins ?? []), ...skins])]
      localdb.saveProfile({ ...onDisk, ownedSkins: merged })
    }
  }

  const cur = useAuth.getState().profile
  if (cur) {
    useAuth.setState({
      profile: { ...cur, ownedSkins: [...new Set([...(cur.ownedSkins ?? []), ...skins])] },
    })
  }
}

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))
