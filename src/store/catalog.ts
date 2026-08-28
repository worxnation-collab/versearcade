import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { catalogOverlay, sanitizeCatalog, setCatalogOverlay, type ContentCatalog } from '@/data/catalog'

// Fetching the content catalog — the overlay that lets a season ship without a
// binary. See the header of data/catalog.ts for what a catalog may and may not
// contain, and docs/CONTENT-CATALOG.md for how to publish one.
//
// THIS STORE IS DIFFERENT FROM EVERY OTHER ONE HERE, in three ways worth
// knowing before you copy it:
//
//   1. IT IS NOT PER-PLAYER. The catalog is the same bytes for everybody, so
//      there is no auth in it, no `isOnline()` gate on identity, and the cache
//      key carries no user id. A signed-out guest gets the same Christmas road
//      a signed-in player does — which is the point, since the seasonal road is
//      one of the few things a guest can still reach.
//
//   2. IT APPLIES ITS CACHE SYNCHRONOUSLY AT IMPORT. Every consumer is a
//      synchronous accessor called from render (`confettiById` inside useJuice,
//      `activeRoad` inside a zustand action), so an await anywhere in that path
//      would mean one frame of bundled content followed by a flash of the real
//      thing. Reading the cache at module scope means the overlay is already in
//      place before React's first render, and the network refresh below only
//      ever changes what a LATER render sees.
//
//   3. IT NEVER FAILS. Not "handles errors" — there is no failure path that
//      reaches a player. No keys, no network, a 500, malformed JSON, a
//      sanitiser rejecting the whole payload: every one of them leaves the
//      bundled catalog in place, which is a complete, playable app. That is the
//      same fail-closed bargain lib/commerce.ts makes about the storefront, and
//      it is what makes publishing to production feel safe.

const CACHE_KEY = 'va.catalog'

/** How stale a cached catalog may be before a refresh is worth blocking on.
 *  Nothing blocks on it today — this only decides whether we bother refetching
 *  within one session, since a season boundary is a date, not a push. */
const REFRESH_MS = 6 * 60 * 60 * 1000

interface CachedCatalog {
  at: number
  catalog: unknown
}

function readCache(): CachedCatalog | null {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') as CachedCatalog | null
    if (raw && typeof raw.at === 'number' && raw.catalog) return raw
  } catch {
    /* private mode, quota, or a half-written value — bundled content is fine */
  }
  return null
}

function writeCache(catalog: unknown) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), catalog }))
  } catch {
    /* the overlay still applies for this session; it just won't survive a reload */
  }
}

// Apply the cache before anything renders. Deliberately at module scope: see
// note 2 above. Sanitising happens again here rather than trusting what we
// wrote last time, because the cache is localStorage — which the player, an
// extension, or a bug in an older build could have put anything into.
const cached = readCache()
if (cached) setCatalogOverlay(cached.catalog)

interface CatalogState {
  /** True once a network fetch has settled, either way. */
  fetched: boolean
  /** The overlay in force. Bundled-only reads as version 0 with empty lists. */
  catalog: ContentCatalog
  load: (force?: boolean) => Promise<void>
}

export const useCatalog = create<CatalogState>((set, get) => ({
  fetched: false,
  catalog: catalogOverlay(),

  async load(force = false) {
    // No Supabase keys at all is the documented way to work on this app
    // (`npm run dev` with no .env.local). There is nothing to fetch from and
    // nothing wrong — the bundled catalog IS the app in that mode.
    if (!supabase) {
      set({ fetched: true })
      return
    }
    if (!force && get().fetched) return
    const fresh = cached && Date.now() - cached.at < REFRESH_MS
    if (!force && fresh && get().catalog.version > 0) {
      // A cached catalog inside the refresh window still refetches in the
      // background — it just doesn't matter if it fails, since what's on screen
      // is already the published content.
      set({ fetched: true })
    }

    try {
      // Readable by `anon`: a guest walking the seasonal road is the whole
      // reason this isn't behind auth. See migration 0066.
      const { data, error } = await supabase.rpc('content_catalog')
      if (error || !data) {
        set({ fetched: true })
        return
      }
      const applied = setCatalogOverlay(data)
      // Cache the RAW payload, not the sanitised view: a later build may
      // understand a field this one drops, and re-sanitising on read (above)
      // means nothing unsafe survives the round trip anyway.
      writeCache(data)
      set({ fetched: true, catalog: applied })
    } catch {
      // Offline, DNS, a proxy — the bundled catalog is already on screen.
      set({ fetched: true })
    }
  },
}))

/** What sanitising a payload would yield, without applying it. For the admin
 *  side and for checking a draft before it goes live. */
export const previewCatalog = (raw: unknown): ContentCatalog => sanitizeCatalog(raw)
