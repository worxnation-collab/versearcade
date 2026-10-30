import { create } from 'zustand'
import { shared } from '@/lib/inflight'
import { supabase } from '@/lib/supabase'
import { flushOutbox, rpcOrQueue } from '@/lib/outbox'
import { useAuth } from './auth'
import { useSeason } from './season'
import { FAVORITES_CAP, type FavoriteMap } from '@/lib/favorites'

// Verses the player has kept. Persistence mirrors the reviews / bookAccuracy
// stores:
//  - ONLINE: the `favorite_verses` table, written through set_verse_favorite
//    (security definer, so the cap is enforced server-side too), and
//  - LOCAL/guest: localStorage, keyed per account so accounts don't mix.
// The in-memory copy moves first either way, so the heart fills instantly.

function localKey(): string {
  const uid = useAuth.getState().profile?.id
  return uid ? `va.favorites.${uid}` : 'va.favorites.guest'
}

function readLocal(): FavoriteMap {
  try {
    return JSON.parse(localStorage.getItem(localKey()) || '{}') as FavoriteMap
  } catch {
    return {}
  }
}

function writeLocal(map: FavoriteMap) {
  try {
    localStorage.setItem(localKey(), JSON.stringify(map))
  } catch {
    /* private mode / storage full — in-memory only */
  }
}

function isOnline(): boolean {
  const a = useAuth.getState()
  return !!supabase && a.mode === 'online' && a.isAuthed
}

// Null when the server can't be reached, so the shelf shows the device's copy.
async function readRemote(uid: string): Promise<FavoriteMap | null> {
  const { data, error } = await supabase!
    .from('favorite_verses')
    .select('reference, created_at')
    .eq('user_id', uid)
  if (error || !data) return null
  const map: FavoriteMap = {}
  for (const r of data as any[]) map[r.reference] = r.created_at ?? new Date().toISOString()
  return map
}

/** What a tap did — 'full' means the cap was already reached, so nothing changed. */
export type ToggleResult = 'added' | 'removed' | 'full'

interface FavoritesState {
  map: FavoriteMap
  loaded: boolean
  load: () => Promise<void>
  isFavorite: (reference: string) => boolean
  toggle: (reference: string) => ToggleResult
}

export const useFavorites = create<FavoritesState>((set, get) => ({
  map: {},
  loaded: false,

  load: shared(async () => {
    const uid = useAuth.getState().profile?.id
    if (!(isOnline() && uid)) {
      set({ map: readLocal(), loaded: true })
      return
    }
    // A keep (or un-keep) made offline goes first, so the read reflects it. A
    // favourite can be removed, so unlike Bible marks this does NOT merge — the
    // server's answer after the flush is the whole truth, and the device's
    // copy is only what is shown when there is no answer.
    await flushOutbox()
    const remote = await readRemote(uid)
    if (remote) writeLocal(remote)
    set({ map: remote ?? readLocal(), loaded: true })
  }),

  isFavorite(reference) {
    return !!get().map[reference]
  },

  toggle(reference) {
    if (!reference) return 'removed'
    const online = isOnline()
    // A challenge can end before anything has read the shelf (deep-linking
    // straight into a quiz, or a reload mid-session), so a guest merges onto
    // what's on disk rather than an empty in-memory map — otherwise the write
    // below would replace every other favorite with just this one. See the same
    // note in store/bookAccuracy.ts:record. ONLINE never writes the whole map
    // (set_verse_favorite touches one row), so in-memory is enough there and
    // the next load() re-reads the authoritative copy.
    const base = get().loaded || online ? get().map : readLocal()
    const has = !!base[reference]

    // Mirror of the cap in set_verse_favorite (0045) — same rule, both sides.
    if (!has && Object.keys(base).length >= FAVORITES_CAP) return 'full'

    const map = { ...base }
    if (has) delete map[reference]
    else map[reference] = new Date().toISOString()
    set({ map })

    // Keeping a verse walks the road; un-keeping one doesn't take it back.
    if (!has) void useSeason.getState().track('save_verse')

    // The device's copy moves either way; online, the write is sent now or
    // parked (lib/outbox.ts). Keyed by verse, so keep-then-unkeep offline sends
    // only the last word.
    writeLocal(map)
    if (online) void rpcOrQueue('set_verse_favorite', { p_reference: reference, p_favorite: !has }, `fav:${reference}`)
    return has ? 'removed' : 'added'
  },
}))
