import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth'
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

async function readRemote(uid: string): Promise<FavoriteMap> {
  const { data, error } = await supabase!
    .from('favorite_verses')
    .select('reference, created_at')
    .eq('user_id', uid)
  if (error || !data) return {}
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

  async load() {
    const uid = useAuth.getState().profile?.id
    const map = isOnline() && uid ? await readRemote(uid) : readLocal()
    set({ map, loaded: true })
  },

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

    if (online) {
      supabase!
        .rpc('set_verse_favorite', { p_reference: reference, p_favorite: !has })
        .then(({ error }) => {
          // Keep a local copy if the network hiccups, so a keep is never lost.
          if (error) writeLocal(map)
        })
    } else {
      writeLocal(map)
    }
    return has ? 'removed' : 'added'
  },
}))
