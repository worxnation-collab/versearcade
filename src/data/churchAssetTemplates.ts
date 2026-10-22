// The templates a church's visual assets are drawn with — verse cards, series
// headers and announcement cards (0133, Content Generation add-on).
//
// THIS FILE IS WHERE THE REAL ART GOES. A stored asset is only a `template_id`
// plus a payload of words (`church_assets.payload`), and `ChurchAssetCard`
// draws it by looking the id up here. So replacing a placeholder with finished
// art is an edit to this table (and image/font files under
// `public/church-assets/`) — nothing in generation, storage, approval or the
// member screens changes, and every card already made re-renders with the new
// look the moment the build ships. Full runbook: docs/CHURCH-VISUAL-ASSETS.md.
//
// Four rules, all load-bearing:
//   * An id is PERMANENT once a church has used it — it is stored on their rows.
//     Retire a template with `retired: true` (hidden from the picker, still
//     renders), never by deleting or renaming it.
//   * An id starts with its kind's prefix — `verse_`, `series_`, `notice_` —
//     because `generate_church_asset` refuses a template of the wrong kind by
//     that prefix. `scripts/check-asset-templates.mjs` fails the build on a
//     mismatch, since the failure is otherwise a refusal at the leader's tap.
//   * Everything is POSITIONED IN PERCENT of the card and SIZED IN `cqw` (a
//     percent of the card's width), so one template renders identically in a
//     120px thumbnail and a full-width card. Keep it that way.
//   * An unknown id renders with its kind's DEFAULT template rather than
//     nothing (`templateFor`), and a background image that fails to load
//     leaves the template's colour showing — the catalog's fail-closed rule.
//
// Templates are code, not content: no URL from a payload or a leader ever
// reaches a style. Image paths here are root-relative files we ship.

export type AssetKind = 'verse_card' | 'series_header' | 'announcement'

/** The text slots a template can place. Which words fill each is `assetSlots`. */
export type SlotName = 'eyebrow' | 'title' | 'body' | 'reference' | 'footer'

export interface AssetSlot {
  /** Box, in percent of the card: left, top, width, height. */
  x: number
  y: number
  w: number
  h: number
  align?: 'left' | 'center' | 'right'
  /** Vertical placement of the text inside its box. */
  valign?: 'top' | 'middle' | 'bottom'
  /** Font size as a percent of the card's width (cqw). */
  size: number
  /** Long text shrinks toward size × this (the body of a long verse). */
  minScale?: number
  weight?: number
  font?: 'display' | 'body' | 'serif'
  italic?: boolean
  uppercase?: boolean
  /** Letter spacing in em. */
  tracking?: number
  /** Overrides the template's ink for this slot. */
  color?: string
  /** Line clamp. */
  maxLines?: number
}

export interface AssetTemplate {
  id: string
  kind: AssetKind
  name: string
  /** Width : height. */
  aspect: [number, number]
  background: {
    color: string
    /** A CSS gradient drawn over the colour (placeholders use these). */
    gradient?: string
    /** Root-relative image under /church-assets/ — the real art. Covers the card. */
    image?: string
    /** A scrim over the image so text stays legible (CSS colour or gradient). */
    overlay?: string
  }
  ink: string
  accent: string
  /** CSS font-family stacks; omitted ⇒ the app's own display/body fonts. */
  fonts?: Partial<Record<'display' | 'body' | 'serif', string>>
  slots: Partial<Record<SlotName, AssetSlot>>
  /** True while this is stand-in art — leaders see a small "placeholder" tag. */
  placeholder?: boolean
  /** Hidden from the picker; still renders cards that already use it. */
  retired?: boolean
}

// ---------------------------------------------------------------------------
// Placeholders: flat colour and a layout, so the whole flow works end to end
// before the art exists. Replace the `background` (and `fonts`, `slots`) of
// these in place, or add new ids beside them.
// ---------------------------------------------------------------------------
const SERIF = "Georgia, 'Times New Roman', serif"

export const ASSET_TEMPLATES: AssetTemplate[] = [
  {
    id: 'verse_plain', kind: 'verse_card', name: 'Evening', aspect: [4, 5], placeholder: true,
    background: { color: '#2a1d22', gradient: 'linear-gradient(160deg, #3a2730 0%, #1c1317 100%)' },
    ink: '#fbf3e6', accent: '#e9c46a', fonts: { serif: SERIF },
    slots: {
      eyebrow: { x: 8, y: 7, w: 84, h: 8, size: 3.4, uppercase: true, tracking: 0.14, weight: 800, color: '#e9c46a' },
      body: { x: 8, y: 20, w: 84, h: 54, size: 7, minScale: 0.5, font: 'serif', valign: 'middle', maxLines: 12 },
      reference: { x: 8, y: 77, w: 84, h: 7, size: 4.4, weight: 800, color: '#e9c46a' },
      footer: { x: 8, y: 88, w: 84, h: 6, size: 3, color: '#cbb9a8' },
    },
  },
  {
    id: 'verse_light', kind: 'verse_card', name: 'Morning', aspect: [4, 5], placeholder: true,
    background: { color: '#f6efe2', gradient: 'linear-gradient(180deg, #fbf6ec 0%, #efe3cc 100%)' },
    ink: '#2b2118', accent: '#9a6b2f', fonts: { serif: SERIF },
    slots: {
      eyebrow: { x: 10, y: 8, w: 80, h: 8, size: 3.4, uppercase: true, tracking: 0.14, weight: 800, align: 'center', color: '#9a6b2f' },
      body: { x: 10, y: 20, w: 80, h: 54, size: 7, minScale: 0.5, font: 'serif', italic: true, align: 'center', valign: 'middle', maxLines: 12 },
      reference: { x: 10, y: 77, w: 80, h: 7, size: 4.4, weight: 800, align: 'center', color: '#9a6b2f' },
      footer: { x: 10, y: 88, w: 80, h: 6, size: 3, align: 'center', color: '#7a6650' },
    },
  },
  {
    id: 'series_plain', kind: 'series_header', name: 'Banner', aspect: [16, 9], placeholder: true,
    background: { color: '#1f2a2e', gradient: 'linear-gradient(120deg, #24363b 0%, #141c1f 100%)' },
    ink: '#f2f7f6', accent: '#7fd1c7',
    slots: {
      eyebrow: { x: 7, y: 12, w: 86, h: 9, size: 2.6, uppercase: true, tracking: 0.16, weight: 800, color: '#7fd1c7' },
      title: { x: 7, y: 24, w: 86, h: 34, size: 8, minScale: 0.55, font: 'display', weight: 800, valign: 'middle', maxLines: 2 },
      body: { x: 7, y: 62, w: 86, h: 10, size: 3, color: '#cfe3e0' },
      reference: { x: 7, y: 76, w: 86, h: 10, size: 2.6, color: '#9fbdb8', maxLines: 1 },
    },
  },
  {
    id: 'series_bold', kind: 'series_header', name: 'Spotlight', aspect: [16, 9], placeholder: true,
    background: { color: '#e9c46a', gradient: 'linear-gradient(135deg, #f1d28a 0%, #d9a441 100%)' },
    ink: '#2a1a08', accent: '#6b3f12',
    slots: {
      eyebrow: { x: 8, y: 12, w: 84, h: 9, size: 2.6, uppercase: true, tracking: 0.16, weight: 800, align: 'center', color: '#6b3f12' },
      title: { x: 8, y: 25, w: 84, h: 34, size: 8.5, minScale: 0.55, font: 'display', weight: 900, align: 'center', valign: 'middle', maxLines: 2 },
      body: { x: 8, y: 63, w: 84, h: 10, size: 3, align: 'center' },
      reference: { x: 8, y: 77, w: 84, h: 10, size: 2.6, align: 'center', color: '#5a3a14', maxLines: 1 },
    },
  },
  {
    id: 'notice_plain', kind: 'announcement', name: 'Notice board', aspect: [16, 9], placeholder: true,
    background: { color: '#2b2433', gradient: 'linear-gradient(150deg, #362c41 0%, #1d1823 100%)' },
    ink: '#f7f2fb', accent: '#c7a6ff',
    slots: {
      eyebrow: { x: 7, y: 10, w: 86, h: 9, size: 2.6, uppercase: true, tracking: 0.16, weight: 800, color: '#c7a6ff' },
      body: { x: 7, y: 22, w: 86, h: 56, size: 5, minScale: 0.55, weight: 700, valign: 'middle', maxLines: 6 },
      footer: { x: 7, y: 82, w: 86, h: 8, size: 2.4, color: '#bcb0c9' },
    },
  },
  {
    id: 'notice_light', kind: 'announcement', name: 'Bulletin', aspect: [16, 9], placeholder: true,
    background: { color: '#f4f1ea' },
    ink: '#24201a', accent: '#a0522d', fonts: { serif: SERIF },
    slots: {
      eyebrow: { x: 8, y: 10, w: 84, h: 9, size: 2.6, uppercase: true, tracking: 0.16, weight: 800, align: 'center', color: '#a0522d' },
      body: { x: 8, y: 22, w: 84, h: 56, size: 5, minScale: 0.55, font: 'serif', align: 'center', valign: 'middle', maxLines: 6 },
      footer: { x: 8, y: 82, w: 84, h: 8, size: 2.4, align: 'center', color: '#7a6a58' },
    },
  },
]

/** The first template of each kind is its default — keep a good one first. */
export function defaultTemplate(kind: AssetKind): AssetTemplate {
  return ASSET_TEMPLATES.find((t) => t.kind === kind)!
}

/** The template for a stored id, or the kind's default when the id is unknown. */
export function templateFor(id: string, kind: AssetKind): AssetTemplate {
  const t = ASSET_TEMPLATES.find((x) => x.id === id)
  return t && t.kind === kind ? t : defaultTemplate(kind)
}

/** What a leader may pick for a new asset. */
export function pickableTemplates(kind: AssetKind): AssetTemplate[] {
  return ASSET_TEMPLATES.filter((t) => t.kind === kind && !t.retired)
}

// ---------------------------------------------------------------------------
// Which words fill which slot. The payload is the server's (0133
// `church_asset_source_payload`); a template only decides WHERE words go, never
// WHAT they are, so swapping art can never change a card's text.
// ---------------------------------------------------------------------------
export type AssetPayload = Record<string, unknown>

export function assetSlots(kind: AssetKind, p: AssetPayload): Partial<Record<SlotName, string>> {
  const s = (k: string) => (typeof p[k] === 'string' ? (p[k] as string).trim() : '')
  const church = s('church_name')
  if (kind === 'verse_card') {
    return { eyebrow: s('series') || church, body: s('text'), reference: s('reference'), footer: s('series') ? church : formatDate(s('date')) }
  }
  if (kind === 'series_header') {
    const days = Number(p.days)
    const refs = Array.isArray(p.references) ? (p.references as unknown[]).filter((r): r is string => typeof r === 'string') : []
    const span = s('start_date') && s('end_date') ? `${formatDate(s('start_date'))} – ${formatDate(s('end_date'))}` : ''
    return {
      eyebrow: church,
      title: s('series'),
      body: [Number.isFinite(days) && days > 0 ? `${days} day${days === 1 ? '' : 's'}` : '', span].filter(Boolean).join(' · '),
      reference: refs.slice(0, 3).join(' · '),
    }
  }
  return { eyebrow: 'From your church’s leaders', body: s('message'), footer: church }
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return ''
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Dev-time: ids unique, prefixed by kind, every kind has a template, boxes on the card. */
export function checkAssetTemplates(): string[] {
  const errors: string[] = []
  const prefix: Record<AssetKind, string> = { verse_card: 'verse_', series_header: 'series_', announcement: 'notice_' }
  const seen = new Set<string>()
  for (const t of ASSET_TEMPLATES) {
    if (seen.has(t.id)) errors.push(`${t.id}: duplicate`)
    seen.add(t.id)
    if (!/^[a-z0-9_]{2,40}$/.test(t.id)) errors.push(`${t.id}: id must be [a-z0-9_]{2,40}`)
    if (!t.id.startsWith(prefix[t.kind])) errors.push(`${t.id}: a ${t.kind} template id must start with ${prefix[t.kind]}`)
    if (t.background.image && !t.background.image.startsWith('/church-assets/')) errors.push(`${t.id}: images live under /church-assets/`)
    for (const [name, b] of Object.entries(t.slots)) {
      if (!b) continue
      if (b.x < 0 || b.y < 0 || b.x + b.w > 100.01 || b.y + b.h > 100.01) errors.push(`${t.id}.${name}: box runs off the card`)
    }
  }
  for (const k of Object.keys(prefix) as AssetKind[]) if (!ASSET_TEMPLATES.some((t) => t.kind === k && !t.retired)) errors.push(`${k}: no pickable template`)
  return errors
}

if (import.meta.env.DEV) {
  const errors = checkAssetTemplates()
  if (errors.length) console.error('[churchAssetTemplates]', errors)
}
