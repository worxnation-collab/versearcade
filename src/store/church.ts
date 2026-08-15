import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth'
import type { Church, ChurchGiver } from '@/types'
import type { ChurchPlace } from '@/lib/churchSearch'

// Your church, what you've given it, and how it stacks up locally.
//
// This one is ONLINE-only on purpose: a church is a shared, pooled thing, so
// there's nothing meaningful to keep on a single device. Guests see a sign-in
// prompt instead (same as the worldwide leaderboard).

/** What the board can be scoped to: a radius in miles, or every church there is. */
export const RADIUS_CHOICES = [10, 20, 30, 50, 'all'] as const
export type RadiusChoice = (typeof RADIUS_CHOICES)[number]
export const DEFAULT_RADIUS: RadiusChoice = 20
const RADIUS_KEY = 'va.churchRadius'

const isRadiusChoice = (v: unknown): v is RadiusChoice =>
  (RADIUS_CHOICES as readonly unknown[]).includes(v)

function readRadius(): RadiusChoice {
  try {
    const raw = localStorage.getItem(RADIUS_KEY)
    if (raw === 'all') return 'all'
    const n = Number(raw)
    return isRadiusChoice(n) ? n : DEFAULT_RADIUS
  } catch {
    return DEFAULT_RADIUS
  }
}

function isOnline(): boolean {
  const a = useAuth.getState()
  return !!supabase && a.mode === 'online' && a.isAuthed
}

// The RPCs speak snake_case; the app speaks camelCase.
function toChurch(raw: any): Church | null {
  if (!raw) return null
  return {
    id: raw.id,
    name: raw.name,
    address: raw.address ?? null,
    city: raw.city ?? null,
    region: raw.region ?? null,
    lat: Number(raw.lat),
    lng: Number(raw.lng),
    xp: Number(raw.xp ?? 0),
    level: Number(raw.level ?? 1),
    members: Number(raw.members ?? 0),
    miles: raw.miles != null ? Number(raw.miles) : undefined,
    rank: raw.rank != null ? Number(raw.rank) : undefined,
    isMine: raw.is_mine ?? undefined,
  }
}

function toGiver(raw: any): ChurchGiver {
  return {
    username: raw.username,
    avatarEmoji: raw.avatar_emoji ?? '📖',
    avatarCharacter: raw.avatar_character ?? null,
    points: Number(raw.points ?? 0),
    isMe: !!raw.is_me,
  }
}

export interface ContributeResult {
  ok: boolean
  given: number
  leveledUp: boolean
  reason?: string
}

interface ChurchState {
  church: Church | null
  /** Points you can still give: lifetime XP minus everything already given. */
  available: number
  myGiven: number
  givers: ChurchGiver[]
  board: Church[]
  boardMe: Church | null
  boardTotal: number
  radiusMiles: RadiusChoice
  loaded: boolean
  loading: boolean
  boardLoading: boolean
  error: string | null

  load: () => Promise<void>
  loadBoard: () => Promise<void>
  setRadius: (choice: RadiusChoice) => void
  join: (place: ChurchPlace) => Promise<Church | null>
  leave: () => Promise<void>
  contribute: (points: number) => Promise<ContributeResult>
}

export const useChurch = create<ChurchState>((set, get) => ({
  church: null,
  available: 0,
  myGiven: 0,
  givers: [],
  board: [],
  boardMe: null,
  boardTotal: 0,
  radiusMiles: readRadius(),
  loaded: false,
  loading: false,
  boardLoading: false,
  error: null,

  async load() {
    if (!isOnline()) {
      set({ loaded: true, loading: false, church: null })
      return
    }
    set({ loading: true, error: null })
    const { data, error } = await supabase!.rpc('get_my_church', { p_givers_limit: 10 })
    if (error) {
      set({ loading: false, loaded: true, error: error.message })
      return
    }
    const payload = data as any
    set({
      church: toChurch(payload?.church),
      available: Number(payload?.available ?? 0),
      myGiven: Number(payload?.my_given ?? 0),
      givers: ((payload?.givers ?? []) as any[]).map(toGiver),
      loading: false,
      loaded: true,
    })
    if (get().church) void get().loadBoard()
  },

  async loadBoard() {
    if (!isOnline() || !get().church) return
    set({ boardLoading: true })
    const radius = get().radiusMiles
    const worldwide = radius === 'all'
    const { data, error } = await supabase!.rpc('church_leaderboard', {
      // A null radius is the server's "no distance limit" signal.
      p_radius_miles: worldwide ? null : radius,
      // The worldwide ladder is worth showing deeper than the local one.
      p_limit: worldwide ? 50 : 25,
    })
    if (error) {
      set({ boardLoading: false, error: error.message })
      return
    }
    const payload = data as any
    set({
      board: ((payload?.rows ?? []) as any[]).map(toChurch).filter(Boolean) as Church[],
      boardMe: toChurch(payload?.me),
      boardTotal: Number(payload?.total ?? 0),
      boardLoading: false,
    })
  },

  setRadius(choice) {
    if (!isRadiusChoice(choice)) return
    try {
      localStorage.setItem(RADIUS_KEY, String(choice))
    } catch {
      /* private mode — the choice just won't stick */
    }
    set({ radiusMiles: choice })
    void get().loadBoard()
  },

  async join(place) {
    if (!isOnline()) return null
    set({ loading: true, error: null })
    const { data, error } = await supabase!.rpc('join_church', {
      // A church we already know is joined by id — its stored key may be an OSM
      // id we can't reconstruct, and re-deriving one would fork a second row.
      p_church_id: place.churchId ?? null,
      p_place_key: place.placeKey || null,
      p_name: place.name,
      p_lat: place.lat,
      p_lng: place.lng,
      p_address: place.address ?? null,
      p_city: place.city ?? null,
      p_region: place.region ?? null,
    })
    if (error) {
      set({ loading: false, error: error.message })
      return null
    }
    const church = toChurch(data)
    set({ church, loading: false, givers: [], myGiven: 0, board: [], boardMe: null })
    // Pull the real numbers (available budget, who else is here) now that we're in.
    void get().load()
    return church
  },

  async leave() {
    if (!isOnline()) return
    await supabase!.rpc('leave_church')
    set({ church: null, givers: [], myGiven: 0, board: [], boardMe: null, boardTotal: 0 })
    void get().load()
  },

  async contribute(points) {
    if (!isOnline()) return { ok: false, given: 0, leveledUp: false, reason: 'offline' }
    const want = Math.floor(points)
    if (!(want > 0)) return { ok: false, given: 0, leveledUp: false, reason: 'nothing_to_give' }

    const { data, error } = await supabase!.rpc('contribute_to_church', { p_points: want })
    if (error) {
      set({ error: error.message })
      return { ok: false, given: 0, leveledUp: false, reason: error.message }
    }
    const payload = data as any
    if (!payload?.ok) {
      if (payload?.available != null) set({ available: Number(payload.available) })
      return { ok: false, given: 0, leveledUp: false, reason: payload?.reason ?? 'failed' }
    }

    const church = toChurch(payload.church)
    const given = Number(payload.given ?? 0)
    set((s) => ({
      church,
      available: Number(payload.available ?? 0),
      myGiven: s.myGiven + given,
    }))
    // The local board's ranks just moved, and so did our row in "top givers".
    void get().load()
    return { ok: true, given, leveledUp: !!payload.leveled_up }
  },
}))
