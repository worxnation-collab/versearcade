import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth'
import { floraUnlocked, unlockedFlora, type FloraDef, type Plantings } from '@/features/church/yard'

// The churchyard: what you've planted in front of your church, and what a
// church's yard looks like to a visitor.
//
// ONLINE-ONLY, and that's inherited rather than chosen. This is a break from
// the two-mode invariant in CLAUDE.md, so it needs saying plainly: the whole
// church feature is online-only (see the header of store/church.ts) because a
// church is a pooled, shared thing with nothing meaningful to keep on one
// device, and a guest has no church to stand a flowerpot in front of. The
// unlock currency is lifetime points GIVEN, which only exists server-side for
// the same reason. Guests get the same sign-in card the rest of the tab shows,
// not a half-working garden.
//
// If a guest churchyard is ever wanted, the shape is the keep's: a `va.yard`
// blob keyed per account, with `given` coming from local lifetime XP. It isn't
// wanted today — a yard nobody else can visit is a houseplant.
//
// Plantings are per-player and per-church-yard, exactly like keep placements:
// you choose your own six plots, and a visitor sees a deterministic per-viewer
// sample of everyone's (church_yard_json, 0061). Nothing here is counted, and
// no plot ever carries a name.

function isOnline(): boolean {
  const a = useAuth.getState()
  return !!supabase && a.mode === 'online' && a.isAuthed
}

export interface PlantResult {
  ok: boolean
  reason?: 'offline' | 'locked' | 'failed'
}

interface YardState {
  loaded: boolean
  /** Lifetime points given, across every church. The unlock ladder's currency. */
  given: number
  /** My own plantings. */
  plantings: Plantings
  /** The yard of the church whose page is open — a blend, not mine. */
  pageYard: Plantings
  pageChurchId: string | null

  load: () => Promise<void>
  /** Put a plant in a plot (null clears it). */
  plant: (plot: string, floraId: string | null) => Promise<PlantResult>
  /**
   * Move a plant to another plot. An occupied plot TRADES places rather than
   * being overwritten, so no tap can lose a plant — the same rule the keep's
   * planMove follows, for the same reason.
   */
  move: (from: string, to: string) => Promise<PlantResult>
  /** What I've earned. */
  unlocked: () => FloraDef[]
  /** Load a church's yard for its page; clears when the sheet closes. */
  loadPageYard: (churchId: string | null) => Promise<void>
}

export const useChurchYard = create<YardState>((set, get) => ({
  loaded: false,
  given: 0,
  plantings: {},
  pageYard: {},
  pageChurchId: null,

  async load() {
    if (!isOnline()) {
      set({ loaded: true, given: 0, plantings: {} })
      return
    }
    const { data, error } = await supabase!.rpc('my_church_yard')
    if (error || !data) {
      set({ loaded: true })
      return
    }
    const raw = data as { given?: number; plantings?: Plantings }
    set({ loaded: true, given: Number(raw.given ?? 0), plantings: raw.plantings ?? {} })
  },

  async plant(plot, floraId) {
    if (!isOnline()) return { ok: false, reason: 'offline' }
    // Mirrors the check in `set_church_yard_placement` (0061) — the server is
    // the one that decides, this is so a locked row can't be tapped into a
    // failed round trip. Keep the thresholds in features/church/yard.ts and the
    // SQL in step.
    if (floraId && !floraUnlocked(floraId, get().given)) return { ok: false, reason: 'locked' }

    const next = { ...get().plantings }
    if (floraId) next[plot] = floraId
    else delete next[plot]
    set({ plantings: next })

    const { error } = await supabase!.rpc('set_church_yard_placement', {
      p_plot: plot,
      p_flora: floraId,
    })
    if (error) {
      // Put it back: an optimistic garden that lies is worse than a slow one.
      await get().load()
      return { ok: false, reason: 'failed' }
    }
    return { ok: true }
  },

  async move(from, to) {
    if (from === to) return { ok: true }
    const cur = get().plantings
    const moving = cur[from]
    if (!moving) return { ok: true }
    if (!isOnline()) return { ok: false, reason: 'offline' }

    const next = { ...cur }
    next[to] = moving
    if (cur[to]) next[from] = cur[to]
    else delete next[from]
    set({ plantings: next })

    // Two rows move, so two calls. Each is idempotent and validated on its own,
    // and a half-applied move is two real plantings rather than a lost one.
    const results = await Promise.all([
      supabase!.rpc('set_church_yard_placement', { p_plot: to, p_flora: next[to] ?? null }),
      supabase!.rpc('set_church_yard_placement', { p_plot: from, p_flora: next[from] ?? null }),
    ])
    if (results.some((r) => r.error)) {
      await get().load()
      return { ok: false, reason: 'failed' }
    }
    return { ok: true }
  },

  unlocked() {
    return unlockedFlora(get().given)
  },

  async loadPageYard(churchId) {
    if (!churchId) {
      set({ pageYard: {}, pageChurchId: null })
      return
    }
    set({ pageChurchId: churchId, pageYard: {} })
    if (!isOnline()) return
    const { data, error } = await supabase!.rpc('church_yard_json', { p_church_id: churchId })
    // A second row tapped before this landed: whatever came back belongs to a
    // sheet that isn't on screen any more, so drop it (store/church.ts does the
    // same for the page itself).
    if (get().pageChurchId !== churchId) return
    if (error || !data) return
    set({ pageYard: (data as { plantings?: Plantings }).plantings ?? {} })
  },
}))
