import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth'
import type { Church, ChurchGiver, ChurchInfo, ChurchMember, ChurchPage } from '@/types'
import type { ChurchPlace } from '@/lib/churchSearch'
import type { ChurchSkinChoice } from '@/features/church/skins'

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
    // Set on every church by `church_json` (0051), so board rows, the page and
    // your own church tab all draw the same building.
    skin: raw.skin ?? null,
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

function toMember(raw: any): ChurchMember {
  return {
    username: raw.username,
    avatarEmoji: raw.avatar_emoji ?? '📖',
    avatarCharacter: raw.avatar_character ?? null,
    isMe: !!raw.is_me,
  }
}

function toInfo(raw: any): ChurchInfo | null {
  if (!raw) return null
  const info: ChurchInfo = {
    tagline: raw.tagline ?? null,
    about: raw.about ?? null,
    serviceTimes: raw.serviceTimes ?? null,
    website: raw.website ?? null,
    contact: raw.contact ?? null,
  }
  // A published-but-blank profile is nothing to show; treat it as absent so the
  // page offers the "Add info" pill instead of an empty panel.
  return Object.values(info).some((v) => !!v) ? info : null
}

export interface ContributeResult {
  ok: boolean
  given: number
  leveledUp: boolean
  reason?: string
}

/** Who's asking for a church's page to be filled in. */
export type InfoRequestRole = 'leadership' | 'member'

/** Note length by role — mirrored exactly in `submit_church_info_request` (0050). */
export const INFO_NOTE_MAX: Record<InfoRequestRole, number> = {
  leadership: 500,
  // Someone who just attends is passing on a fact, not writing the page.
  member: 180,
}
export const INFO_NOTE_MIN = 10

export interface InfoRequestInput {
  churchId: string
  role: InfoRequestRole
  note: string
  name?: string
  email?: string
  /**
   * The look the church is asking for — a `ChurchSkinChoice`, or undefined for
   * "no preference". Leadership only: `submit_church_info_request` (0051) drops
   * it on the member path rather than trusting the form, because someone who
   * merely attends doesn't get to redecorate the building.
   */
  skin?: ChurchSkinChoice
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

  /** The church page opened from a board row, or null when the sheet is closed. */
  page: ChurchPage | null
  /** True while the extra detail (info, roster) is still in flight. */
  pageLoading: boolean

  load: () => Promise<void>
  loadBoard: () => Promise<void>
  setRadius: (choice: RadiusChoice) => void
  join: (place: ChurchPlace) => Promise<Church | null>
  leave: () => Promise<void>
  contribute: (points: number) => Promise<ContributeResult>
  openChurch: (church: Church) => Promise<void>
  closeChurch: () => void
  requestInfo: (input: InfoRequestInput) => Promise<{ ok: boolean; reason?: string }>
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
  page: null,
  pageLoading: false,

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

  // --- The church page behind a leaderboard row -----------------------------
  // Seeded from the row that was tapped so the sheet is drawn the instant it
  // opens: rank, level, XP and members are all already in hand. Only the parts
  // we don't have yet — the published info and the congregation to stand
  // outside — wait on the network.
  async openChurch(church) {
    set({
      page: { church, info: null, members: [], memberTotal: church.members, myRequestPending: false },
      pageLoading: true,
    })
    if (!isOnline()) {
      set({ pageLoading: false })
      return
    }
    const { data, error } = await supabase!.rpc('get_church_page', {
      p_church_id: church.id,
      // The server's cap. The scene only draws a dozen or so, but the page also
      // names the congregation, and a name list wants to be as complete as the
      // RPC will give us.
      p_members_limit: 24,
    })
    // Tapping a second row before the first landed: whatever came back belongs
    // to a sheet that isn't on screen any more, so drop it.
    if (get().page?.church.id !== church.id) return
    if (error || !(data as any)?.ok) {
      set({ pageLoading: false })
      return
    }
    const payload = data as any
    set({
      page: {
        // Keep the row's rank: the page RPC doesn't compute one (it would mean
        // ranking the whole board again), and the rank the player just looked at
        // is the right one to keep showing.
        church: { ...(toChurch(payload.church) ?? church), rank: church.rank },
        info: toInfo(payload.info),
        members: ((payload.members ?? []) as any[]).map(toMember),
        memberTotal: Number(payload.member_total ?? church.members),
        myRequestPending: !!payload.my_request_pending,
      },
      pageLoading: false,
    })
  },

  closeChurch() {
    set({ page: null, pageLoading: false })
  },

  async requestInfo({ churchId, role, note, name, email, skin }) {
    if (!isOnline()) return { ok: false, reason: 'offline' }
    const { data, error } = await supabase!.rpc('submit_church_info_request', {
      p_church_id: churchId,
      p_role: role,
      p_note: note.slice(0, INFO_NOTE_MAX[role]),
      p_name: name?.trim() || null,
      p_email: email?.trim() || null,
      p_skin: skin ?? null,
    })
    if (error) return { ok: false, reason: error.message }
    const payload = data as any
    if (!payload?.ok) return { ok: false, reason: payload?.reason ?? 'failed' }
    // The pill stops inviting a second note the moment the first one lands.
    set((s) =>
      s.page?.church.id === churchId ? { page: { ...s.page, myRequestPending: true } } : {},
    )
    return { ok: true }
  },
}))
