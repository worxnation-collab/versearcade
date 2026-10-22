import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { todayLocalDate } from '@/lib/date'
import { useAuth } from './auth'
import type { AssetKind, AssetPayload } from '@/data/churchAssetTemplates'

// A church's visual assets (0133): verse cards, series headers, announcement
// cards — stored as a template id plus the words to draw, rendered by
// `ChurchAssetCard`. Online-only, like every church store.
//
// Leadership: `generate` (Content Generation add-on — the server's
// `church_gen_can` decides, this file gates nothing), `approve` / `discard`
// (base leadership). The client never sends words: it names a kind, a source
// and a template, and the server copies the text from the church's own rows.
//
// Members: `useMyChurchAssets` — today's APPROVED, fresh cards for their own
// verified church. A draft, a discarded card, a card whose verse changed since
// it was made, or a card for a verse that is itself still a draft never comes
// back from the server, so nothing here has to filter.

function online(): boolean {
  return !!supabase && useAuth.getState().mode === 'online'
}

type Res<T> = { ok: true; data: T } | { ok: false; reason: string }

async function call<T = any>(fn: string, args: Record<string, unknown>): Promise<Res<T>> {
  if (!online()) return { ok: false, reason: 'unavailable' }
  const { data, error } = await supabase!.rpc(fn, args)
  if (error) return { ok: false, reason: 'unavailable' }
  const d = data as any
  if (d && d.ok === false) return { ok: false, reason: String(d.reason ?? 'unavailable') }
  return { ok: true, data: d as T }
}

export interface ChurchAsset {
  id: string
  kind: AssetKind
  templateId: string
  status: 'draft' | 'approved'
  payload: AssetPayload
  sourceDate: string | null
  sourceSeries: string | null
  sourceAnnouncementId: string | null
  /** Its source changed since it was made — members never see it; regenerate. */
  stale: boolean
  /** For a verse card: the verse's own status ('draft' | 'approved'). */
  sourceStatus: string | null
}

const KINDS: AssetKind[] = ['verse_card', 'series_header', 'announcement']

function toAsset(a: any): ChurchAsset | null {
  if (!a || !KINDS.includes(a.kind) || typeof a.id !== 'string') return null
  return {
    id: a.id,
    kind: a.kind,
    templateId: String(a.template_id ?? ''),
    status: a.status === 'approved' ? 'approved' : 'draft',
    payload: a.payload && typeof a.payload === 'object' ? a.payload : {},
    sourceDate: typeof a.source_drop_date === 'string' ? a.source_drop_date : null,
    sourceSeries: typeof a.source_series === 'string' ? a.source_series : null,
    sourceAnnouncementId: typeof a.source_announcement_id === 'string' ? a.source_announcement_id : null,
    stale: a.stale === true,
    sourceStatus: typeof a.source_status === 'string' ? a.source_status : null,
  }
}

/** Where an asset came from, in the one shape the leader UI matches on. */
export type AssetSource =
  | { kind: 'verse_card'; date: string }
  | { kind: 'series_header'; series: string }
  | { kind: 'announcement'; announcementId: string }

export function matchesSource(a: ChurchAsset, s: AssetSource): boolean {
  if (a.kind !== s.kind) return false
  if (s.kind === 'verse_card') return a.sourceDate === s.date
  if (s.kind === 'series_header') return (a.sourceSeries ?? '').toLowerCase() === s.series.toLowerCase()
  return a.sourceAnnouncementId === s.announcementId
}

// ---------------------------------------------------------------------------
// Leadership — one list per church, shared by every studio on the screen.
// ---------------------------------------------------------------------------
interface AdminState {
  churchId: string | null
  assets: ChurchAsset[] | null
  failed: boolean
  load: (churchId: string, force?: boolean) => Promise<void>
  generate: (churchId: string, s: AssetSource, templateId: string, replace?: boolean) => Promise<Res<ChurchAsset>>
  approve: (churchId: string, id: string) => Promise<Res<ChurchAsset>>
  discard: (churchId: string, id: string) => Promise<Res<unknown>>
}

export const useChurchAssetsAdmin = create<AdminState>((set, get) => ({
  churchId: null,
  assets: null,
  failed: false,

  async load(churchId, force = false) {
    if (!force && get().churchId === churchId && get().assets) return
    if (get().churchId !== churchId) set({ churchId, assets: null, failed: false })
    const r = await call<{ assets: any[] }>('church_assets_for', { p_church_id: churchId })
    if (!r.ok) return set({ churchId, assets: null, failed: true })
    set({ churchId, failed: false, assets: (r.data.assets ?? []).map(toAsset).filter((x): x is ChurchAsset => !!x) })
  },

  async generate(churchId, s, templateId, replace = false) {
    const source = s.kind === 'verse_card' ? s.date : s.kind === 'series_header' ? s.series : ''
    const r = await call<{ asset: any }>('generate_church_asset', {
      p_church_id: churchId, p_kind: s.kind, p_source: source, p_template_id: templateId, p_replace: replace,
    })
    if (!r.ok) return r
    const asset = toAsset(r.data.asset)
    if (!asset) return { ok: false, reason: 'unavailable' }
    set({ assets: [asset, ...(get().assets ?? []).filter((a) => a.id !== asset.id)] })
    return { ok: true, data: asset }
  },

  async approve(churchId, id) {
    const r = await call<{ asset: any }>('approve_church_asset', { p_church_id: churchId, p_asset_id: id })
    if (!r.ok) {
      await get().load(churchId, true)
      return r
    }
    const asset = toAsset(r.data.asset)
    if (asset) set({ assets: (get().assets ?? []).map((a) => (a.id === id ? asset : a)) })
    return asset ? { ok: true, data: asset } : { ok: false, reason: 'unavailable' }
  },

  async discard(churchId, id) {
    const r = await call('discard_church_asset', { p_church_id: churchId, p_asset_id: id })
    if (r.ok) set({ assets: (get().assets ?? []).filter((a) => a.id !== id) })
    else await get().load(churchId, true)
    return r
  },
}))

// ---------------------------------------------------------------------------
// Members — today's approved cards. Fails closed to none.
// ---------------------------------------------------------------------------
export interface MemberAsset {
  id: string
  kind: AssetKind
  templateId: string
  payload: AssetPayload
}

interface MemberState {
  assets: MemberAsset[]
  date: string | null
  load: (force?: boolean) => Promise<void>
  of: (kind: AssetKind) => MemberAsset | null
}

export const useMyChurchAssets = create<MemberState>((set, get) => ({
  assets: [],
  date: null,

  async load(force = false) {
    const date = todayLocalDate()
    if (!force && get().date === date) return
    if (!online()) return set({ assets: [], date })
    const { data, error } = await supabase!.rpc('my_church_assets', { p_local_date: date })
    const list = !error && Array.isArray(data) ? (data as any[]) : []
    set({
      date,
      assets: list
        .filter((a) => a && KINDS.includes(a.kind) && typeof a.id === 'string')
        .map((a) => ({ id: a.id, kind: a.kind, templateId: String(a.template_id ?? ''), payload: a.payload ?? {} })),
    })
  },

  of(kind) {
    return get().assets.find((a) => a.kind === kind) ?? null
  },
}))
