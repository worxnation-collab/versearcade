// Apple in-app purchase state — what the app may sell, and what happened when
// someone bought it.
//
// Same shape as every other store here: a private isOnline(), a load() that
// reads whichever source is authoritative, and writers that update in-memory
// state optimistically so the UI is instant. The StoreKit calls themselves live
// in lib/iap; this is the React-facing half.
//
// Both modes, as always:
//   • ONLINE → the `iap-fulfill` Edge Function (migration 0047). Note what is
//     NOT sent: this client never tells the server what it bought. The function
//     asks RevenueCat what the subscriber actually owns, with the secret key,
//     and returns what it granted — so a tampered client gets nothing extra.
//     An RPC can't do this job: verification needs a secret, and a secret can't
//     live somewhere the client can call. See issue #88.
//   • LOCAL/guest → merged onto what's on DISK, never onto in-memory state. A
//     guest can buy on a fresh load before anything called load(); merging onto
//     an empty object would erase every other skin they own. Same bug as
//     store/bookAccuracy:record — see the note there. Unverified by necessity
//     (there's no account to ask about), but also unexploitable: the grant is
//     device-local and claim_guest_progress (0009) does not carry owned_skins
//     into a new account, so it can't be laundered into a real entitlement.

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

/**
 * What happened when someone tapped buy.
 *
 * `unconfirmed` is the one that matters: Apple took the money but the
 * entitlement isn't visible yet — RevenueCat hasn't caught up, or the server
 * couldn't be reached. Reporting that as 'failed' would tell a paying customer
 * their purchase didn't work; reporting it as 'bought' would show them a skin
 * they haven't got. It is its own outcome, and the UI says "give it a moment,
 * then Restore".
 */
export type PurchaseOutcome = 'bought' | 'cancelled' | 'unconfirmed' | 'failed'

/**
 * Restore has to distinguish "you own nothing" from "we couldn't ask".
 * Collapsing them tells a buyer with a real purchase that they have none —
 * which is both a lie and precisely what App Review tests.
 */
export type RestoreOutcome = { ok: true; count: number } | { ok: false }

interface IapState {
  /** True once StoreKit has returned at least one product we can actually sell. */
  ready: boolean
  loading: boolean
  products: Record<string, IapProduct>
  error: string | null
  load: () => Promise<void>
  buy: (sku: string) => Promise<PurchaseOutcome>
  restore: () => Promise<RestoreOutcome>
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
    // Split deliberately in two, because the line between them is the line
    // between "you were not charged" and "you were".
    let outcome
    try {
      outcome = await purchaseSku(sku)
    } catch (e) {
      // StoreKit itself failed: no money moved.
      set({ error: msg(e) })
      return 'failed'
    }
    if (outcome.cancelled) return 'cancelled'

    // Past this point Apple has taken payment. Nothing below may report failure.
    // Apple's post-purchase entitlement list beats the single sku, so a pack
    // lands whole and an interrupted earlier purchase settles up too. Online
    // this is only the GUEST fallback and the optimistic paint — the server
    // re-derives the truth from RevenueCat regardless.
    const claimed = outcome.ownedProductIds.length
      ? skinsForProductIds(outcome.ownedProductIds)
      : skinsForSku(sku)
    try {
      // Two attempts online: the purchase reaches RevenueCat's servers before
      // purchaseSku resolves, but a moment of propagation lag would otherwise
      // read as "you bought nothing" to someone who just paid.
      const granted = await persist(claimed, 2)
      return granted.length ? 'bought' : 'unconfirmed'
    } catch (e) {
      set({ error: msg(e) })
      return 'unconfirmed'
    }
  },

  async restore() {
    try {
      const claimed = skinsForProductIds(await restorePurchases())
      // Online, restore asks the server outright — `claimed` is only the guest
      // path's input, and an empty list there means there is nothing to do.
      if (!isOnline() && !claimed.length) return { ok: true, count: 0 }
      return { ok: true, count: (await persist(claimed, 1)).length }
    } catch (e) {
      // Couldn't ask. Say so, rather than claiming they own nothing.
      set({ error: msg(e) })
      return { ok: false }
    }
  },
}))

/**
 * Settle up, then reflect the result in the profile the UI is already
 * rendering so the skin is wearable immediately.
 *
 * `claimed` is what the CLIENT believes it owns. Online that is used for
 * nothing at all — the server's answer replaces it — and it matters only on the
 * guest path, where there is no server to ask. Returns what was actually
 * granted, which is the server's list when online.
 */
async function persist(claimed: string[], attempts: number): Promise<string[]> {
  let skins: string[]

  if (isOnline() && supabase) {
    skins = []
    for (let i = 0; i < Math.max(1, attempts); i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 1500))
      const { data, error } = await supabase.functions.invoke('iap-fulfill', { body: {} })
      if (error) throw new Error(error.message)
      skins = Array.isArray(data?.granted) ? (data.granted as string[]) : []
      if (skins.length) break
    }
    if (!skins.length) return []
  } else {
    if (!claimed.length) return []
    skins = claimed
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
  return skins
}

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))
