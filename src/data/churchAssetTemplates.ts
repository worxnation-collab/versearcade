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
  // --- Finished art (owner-supplied, public/church-assets/<id>/bg.jpg). The
  // first of each kind is its default. Verse and notice art is 2:3 portrait and
  // series art 3:2, so those are their aspects — the art is not cropped to fit.
  {
    id: 'verse_cream_cross', kind: 'verse_card', name: 'Parchment', aspect: [2, 3],
    background: { color: '#f7f2e7', image: '/church-assets/verse_cream_cross/bg.jpg' },
    ink: '#2b2118', accent: '#8a6a3a', fonts: { serif: SERIF },
    slots: {
      eyebrow: { x: 12, y: 10, w: 76, h: 6, size: 3.4, uppercase: true, tracking: 0.14, weight: 800, align: 'center', color: '#8a6a3a' },
      body: { x: 12, y: 19, w: 76, h: 50, size: 7, minScale: 0.5, font: 'serif', italic: true, align: 'center', valign: 'middle', maxLines: 13 },
      reference: { x: 12, y: 71, w: 76, h: 5, size: 4.4, weight: 800, align: 'center', color: '#8a6a3a' },
      footer: { x: 12, y: 78, w: 60, h: 5, size: 3, align: 'center', color: '#7a6650' },
    },
  },
  {
    id: 'verse_bluegray_cross', kind: 'verse_card', name: 'Stillwater', aspect: [2, 3],
    background: {
      color: '#b8bdc3', image: '/church-assets/verse_bluegray_cross/bg.jpg',
      overlay: 'radial-gradient(ellipse at 50% 48%, rgba(240,243,247,0.55) 0%, rgba(240,243,247,0) 70%)',
    },
    ink: '#18212f', accent: '#2c3c58', fonts: { serif: SERIF },
    slots: {
      eyebrow: { x: 12, y: 10, w: 76, h: 6, size: 3.4, uppercase: true, tracking: 0.14, weight: 800, align: 'center', color: '#2c3c58' },
      body: { x: 12, y: 19, w: 76, h: 52, size: 7, minScale: 0.5, font: 'serif', align: 'center', valign: 'middle', maxLines: 13 },
      reference: { x: 12, y: 74, w: 76, h: 5, size: 4.4, weight: 800, align: 'center', color: '#2c3c58' },
      footer: { x: 12, y: 84, w: 76, h: 5, size: 3, align: 'center', color: '#2c3c58' },
    },
  },
  {
    id: 'verse_sage_rays', kind: 'verse_card', name: 'First light', aspect: [2, 3],
    background: { color: '#e3d4ba', image: '/church-assets/verse_sage_rays/bg.jpg' },
    ink: '#2a2e22', accent: '#55623c', fonts: { serif: SERIF },
    slots: {
      eyebrow: { x: 22, y: 20, w: 56, h: 5, size: 3.2, uppercase: true, tracking: 0.14, weight: 800, align: 'center', color: '#55623c' },
      body: { x: 22, y: 27, w: 56, h: 42, size: 6.2, minScale: 0.5, font: 'serif', italic: true, align: 'center', valign: 'middle', maxLines: 14 },
      reference: { x: 22, y: 71, w: 56, h: 5, size: 4.2, weight: 800, align: 'center', color: '#55623c' },
      footer: { x: 22, y: 78, w: 56, h: 5, size: 3, align: 'center', color: '#4a4f3c' },
    },
  },
  {
    id: 'verse_terracotta', kind: 'verse_card', name: 'Clay', aspect: [2, 3],
    background: { color: '#f6e9d7', image: '/church-assets/verse_terracotta/bg.jpg' },
    ink: '#3a2a20', accent: '#a5523a', fonts: { serif: SERIF },
    slots: {
      eyebrow: { x: 20, y: 17, w: 60, h: 5, size: 3.2, uppercase: true, tracking: 0.14, weight: 800, align: 'center', color: '#a5523a' },
      body: { x: 20, y: 24, w: 60, h: 46, size: 6.4, minScale: 0.5, font: 'serif', align: 'center', valign: 'middle', maxLines: 14 },
      reference: { x: 20, y: 72, w: 60, h: 5, size: 4.2, weight: 800, align: 'center', color: '#a5523a' },
      footer: { x: 24, y: 79, w: 52, h: 4, size: 2.8, align: 'center', color: '#6e5444' },
    },
  },
  {
    id: 'verse_dark_gold', kind: 'verse_card', name: 'Vigil', aspect: [2, 3],
    background: { color: '#23262c', image: '/church-assets/verse_dark_gold/bg.jpg' },
    ink: '#f3ead8', accent: '#d4af6a', fonts: { serif: SERIF },
    slots: {
      eyebrow: { x: 9, y: 15, w: 82, h: 6, size: 3.4, uppercase: true, tracking: 0.14, weight: 800, color: '#d4af6a' },
      body: { x: 9, y: 23, w: 82, h: 50, size: 7, minScale: 0.5, font: 'serif', valign: 'middle', maxLines: 14 },
      reference: { x: 9, y: 76, w: 82, h: 5, size: 4.4, weight: 800, color: '#d4af6a' },
      footer: { x: 9, y: 86, w: 82, h: 5, size: 3, color: '#b9ae9a' },
    },
  },
  {
    id: 'series_cream_sage', kind: 'series_header', name: 'Meadow', aspect: [3, 2],
    background: { color: '#fbf1de', image: '/church-assets/series_cream_sage/bg.jpg' },
    ink: '#2c2a1f', accent: '#5b6a43',
    slots: {
      eyebrow: { x: 22, y: 16, w: 56, h: 8, size: 2.4, uppercase: true, tracking: 0.16, weight: 800, align: 'center', color: '#5b6a43' },
      title: { x: 22, y: 26, w: 56, h: 30, size: 7, minScale: 0.55, font: 'display', weight: 800, align: 'center', valign: 'middle', maxLines: 2 },
      body: { x: 22, y: 58, w: 56, h: 8, size: 2.6, align: 'center', color: '#4a4a3a' },
      reference: { x: 22, y: 67, w: 56, h: 8, size: 2.3, align: 'center', color: '#5b6a43', maxLines: 1 },
    },
  },
  {
    id: 'series_bluegray_flow', kind: 'series_header', name: 'Current', aspect: [3, 2],
    background: { color: '#e5e5e5', image: '/church-assets/series_bluegray_flow/bg.jpg' },
    ink: '#1b2433', accent: '#3d5272',
    slots: {
      eyebrow: { x: 34, y: 12, w: 58, h: 8, size: 2.4, uppercase: true, tracking: 0.16, weight: 800, color: '#3d5272' },
      title: { x: 34, y: 21, w: 58, h: 28, size: 7, minScale: 0.55, font: 'display', weight: 800, valign: 'middle', maxLines: 2 },
      body: { x: 34, y: 50, w: 58, h: 7, size: 2.6, color: '#36435a' },
      reference: { x: 34, y: 58, w: 58, h: 7, size: 2.3, color: '#3d5272', maxLines: 1 },
    },
  },
  {
    id: 'series_sand_terracotta', kind: 'series_header', name: 'Ember', aspect: [3, 2],
    background: { color: '#efc9aa', image: '/church-assets/series_sand_terracotta/bg.jpg' },
    ink: '#3a1d10', accent: '#6e2f16',
    slots: {
      eyebrow: { x: 32, y: 18, w: 60, h: 8, size: 2.4, uppercase: true, tracking: 0.16, weight: 800, color: '#6e2f16' },
      title: { x: 32, y: 27, w: 60, h: 30, size: 7.4, minScale: 0.55, font: 'display', weight: 900, valign: 'middle', maxLines: 2 },
      body: { x: 32, y: 60, w: 60, h: 8, size: 2.6, color: '#4a2616' },
      reference: { x: 32, y: 69, w: 60, h: 8, size: 2.3, color: '#6e2f16', maxLines: 1 },
    },
  },
  {
    id: 'notice_cream_gold', kind: 'announcement', name: 'Laurel', aspect: [2, 3],
    background: { color: '#fdf5e8', image: '/church-assets/notice_cream_gold/bg.jpg' },
    ink: '#2b2118', accent: '#8f6b2c', fonts: { serif: SERIF },
    slots: {
      eyebrow: { x: 12, y: 14, w: 76, h: 6, size: 3.2, uppercase: true, tracking: 0.16, weight: 800, align: 'center', color: '#8f6b2c' },
      body: { x: 12, y: 23, w: 76, h: 56, size: 6.4, minScale: 0.55, font: 'serif', align: 'center', valign: 'middle', maxLines: 10 },
      footer: { x: 12, y: 83, w: 76, h: 5, size: 3, align: 'center', color: '#7a6650' },
    },
  },
  {
    id: 'notice_blush', kind: 'announcement', name: 'Blossom', aspect: [2, 3],
    background: { color: '#fcefe3', image: '/church-assets/notice_blush/bg.jpg' },
    ink: '#3a2526', accent: '#9a5a5e', fonts: { serif: SERIF },
    slots: {
      eyebrow: { x: 18, y: 17, w: 64, h: 6, size: 3.2, uppercase: true, tracking: 0.16, weight: 800, align: 'center', color: '#9a5a5e' },
      body: { x: 18, y: 25, w: 64, h: 50, size: 6.2, minScale: 0.55, font: 'serif', align: 'center', valign: 'middle', maxLines: 10 },
      footer: { x: 22, y: 77, w: 56, h: 5, size: 3, align: 'center', color: '#7a5658' },
    },
  },
  {
    id: 'notice_sage', kind: 'announcement', name: 'Garden', aspect: [2, 3],
    background: { color: '#d0d5bf', image: '/church-assets/notice_sage/bg.jpg' },
    ink: '#23291c', accent: '#4c5a36',
    slots: {
      eyebrow: { x: 16, y: 20, w: 68, h: 6, size: 3.2, uppercase: true, tracking: 0.16, weight: 800, align: 'center', color: '#4c5a36' },
      body: { x: 16, y: 28, w: 68, h: 46, size: 6, minScale: 0.55, weight: 700, align: 'center', valign: 'middle', maxLines: 10 },
      footer: { x: 16, y: 77, w: 68, h: 5, size: 3, align: 'center', color: '#465038' },
    },
  },
  {
    id: 'notice_navy_gold', kind: 'announcement', name: 'Midnight', aspect: [2, 3],
    background: { color: '#06152c', image: '/church-assets/notice_navy_gold/bg.jpg' },
    ink: '#f2ead8', accent: '#d4b26a', fonts: { serif: SERIF },
    slots: {
      eyebrow: { x: 12, y: 12, w: 76, h: 6, size: 3.2, uppercase: true, tracking: 0.16, weight: 800, align: 'center', color: '#d4b26a' },
      body: { x: 12, y: 21, w: 76, h: 58, size: 6.4, minScale: 0.55, font: 'serif', align: 'center', valign: 'middle', maxLines: 11 },
      footer: { x: 12, y: 84, w: 76, h: 5, size: 3, align: 'center', color: '#bfb49c' },
    },
  },

  // --- Picture cards (owner-supplied, people in them). The words sit in the
  // picture's own empty space or on a soft panel, never across a face.
  {
    id: 'verse_child_light', kind: 'verse_card', name: 'Wonder', aspect: [2, 3],
    background: { color: '#e9d0a9', image: '/church-assets/verse_child_light/bg.jpg', overlay: 'linear-gradient(to bottom, rgba(250,243,230,0) 46%, rgba(250,243,230,0.88) 60%, rgba(250,243,230,0.96) 100%)' },
    ink: '#3a2a18', accent: '#8a5f24', fonts: { serif: SERIF },
    slots: {
      eyebrow: { x: 8, y: 58, w: 84, h: 4, size: 3, uppercase: true, tracking: 0.14, weight: 800, align: 'center', color: '#8a5f24' },
      body: { x: 8, y: 63, w: 84, h: 26, size: 5.6, minScale: 0.5, font: 'serif', italic: true, align: 'center', valign: 'middle', maxLines: 10 },
      reference: { x: 8, y: 90, w: 84, h: 4, size: 3.8, weight: 800, align: 'center', color: '#8a5f24' },
      footer: { x: 8, y: 95, w: 84, h: 3.5, size: 2.6, align: 'center', color: '#8a5f24' },
    },
  },
  {
    id: 'verse_open_hands', kind: 'verse_card', name: 'Open hands', aspect: [2, 3],
    background: { color: '#d3c5ae', image: '/church-assets/verse_open_hands/bg.jpg', overlay: 'linear-gradient(to bottom, rgba(250,243,230,0) 46%, rgba(250,243,230,0.88) 60%, rgba(250,243,230,0.96) 100%)' },
    ink: '#2e2a24', accent: '#6b5a3e', fonts: { serif: SERIF },
    slots: {
      eyebrow: { x: 8, y: 58, w: 84, h: 4, size: 3, uppercase: true, tracking: 0.14, weight: 800, align: 'center', color: '#6b5a3e' },
      body: { x: 8, y: 63, w: 84, h: 26, size: 5.6, minScale: 0.5, font: 'serif', italic: true, align: 'center', valign: 'middle', maxLines: 10 },
      reference: { x: 8, y: 90, w: 84, h: 4, size: 3.8, weight: 800, align: 'center', color: '#6b5a3e' },
      footer: { x: 8, y: 95, w: 84, h: 3.5, size: 2.6, align: 'center', color: '#6b5a3e' },
    },
  },
  {
    id: 'verse_family_reading', kind: 'verse_card', name: 'Family', aspect: [2, 3],
    background: { color: '#ccb99b', image: '/church-assets/verse_family_reading/bg.jpg', overlay: 'linear-gradient(to bottom, rgba(250,243,230,0) 46%, rgba(250,243,230,0.88) 60%, rgba(250,243,230,0.96) 100%)' },
    ink: '#2e2a20', accent: '#5d6b45', fonts: { serif: SERIF },
    slots: {
      eyebrow: { x: 8, y: 60, w: 84, h: 4, size: 3, uppercase: true, tracking: 0.14, weight: 800, align: 'center', color: '#5d6b45' },
      body: { x: 8, y: 65, w: 84, h: 24, size: 5.6, minScale: 0.5, font: 'serif', italic: true, align: 'center', valign: 'middle', maxLines: 10 },
      reference: { x: 8, y: 90, w: 84, h: 4, size: 3.8, weight: 800, align: 'center', color: '#5d6b45' },
      footer: { x: 8, y: 95, w: 84, h: 3.5, size: 2.6, align: 'center', color: '#5d6b45' },
    },
  },
  {
    id: 'verse_elder_book', kind: 'verse_card', name: 'Elder', aspect: [2, 3],
    background: {
      color: '#525359', image: '/church-assets/verse_elder_book/bg.jpg',
      overlay: 'linear-gradient(to bottom, rgba(16,26,52,0) 38%, rgba(16,26,52,0.35) 48%, rgba(16,26,52,0.82) 60%, rgba(16,26,52,0.95) 72%)',
    },
    ink: '#f4ecdc', accent: '#e2c27f', fonts: { serif: SERIF },
    slots: {
      eyebrow: { x: 8, y: 58, w: 84, h: 4, size: 3, uppercase: true, tracking: 0.14, weight: 800, align: 'center', color: '#e2c27f' },
      body: { x: 8, y: 63, w: 84, h: 26, size: 5.6, minScale: 0.5, font: 'serif', italic: true, align: 'center', valign: 'middle', maxLines: 10 },
      reference: { x: 8, y: 90, w: 84, h: 4, size: 3.8, weight: 800, align: 'center', color: '#e2c27f' },
      footer: { x: 8, y: 95, w: 84, h: 3.5, size: 2.6, align: 'center', color: '#c9bfae' },
    },
  },
  {
    id: 'verse_kneeling', kind: 'verse_card', name: 'Kneeling', aspect: [2, 3],
    background: { color: '#b3ada4', image: '/church-assets/verse_kneeling/bg.jpg' },
    ink: '#1f2733', accent: '#3e4c63', fonts: { serif: SERIF },
    slots: {
      eyebrow: { x: 7, y: 7, w: 86, h: 4, size: 3, uppercase: true, tracking: 0.14, weight: 800, color: '#3e4c63' },
      body: { x: 7, y: 12, w: 36, h: 44, size: 5.2, minScale: 0.5, font: 'serif', italic: true, valign: 'top', maxLines: 14 },
      reference: { x: 7, y: 58, w: 40, h: 4, size: 3.8, weight: 800, color: '#3e4c63' },
      footer: { x: 7, y: 93, w: 50, h: 3.5, size: 2.6, color: '#3e4c63' },
    },
  },
  {
    id: 'verse_the_path', kind: 'verse_card', name: 'The path', aspect: [2, 3],
    background: {
      color: '#a39175', image: '/church-assets/verse_the_path/bg.jpg',
      overlay: 'linear-gradient(to bottom, rgba(246,238,224,0.85) 0%, rgba(246,238,224,0.6) 26%, rgba(246,238,224,0) 36%)',
    },
    ink: '#2c2a22', accent: '#5a5338', fonts: { serif: SERIF },
    slots: {
      eyebrow: { x: 8, y: 4, w: 84, h: 3.5, size: 2.8, uppercase: true, tracking: 0.14, weight: 800, align: 'center', color: '#5a5338' },
      body: { x: 6, y: 7.5, w: 88, h: 18.5, size: 5, minScale: 0.6, font: 'serif', italic: true, align: 'center', valign: 'middle', maxLines: 7 },
      reference: { x: 58, y: 27, w: 36, h: 3.5, size: 3.4, weight: 800, align: 'right', color: '#5a5338' },
      footer: { x: 52, y: 95, w: 42, h: 3.5, size: 2.6, align: 'right', color: '#f4ecdc' },
    },
  },
  {
    id: 'verse_lamplight', kind: 'verse_card', name: 'Lamplight', aspect: [2, 3],
    background: { color: '#2a1f45', image: '/church-assets/verse_lamplight/bg.jpg' },
    ink: '#f3e9d2', accent: '#f2c66d', fonts: { serif: SERIF },
    slots: {
      eyebrow: { x: 46, y: 25, w: 48, h: 3.5, size: 2.8, uppercase: true, tracking: 0.14, weight: 800, color: '#f2c66d' },
      body: { x: 46, y: 29, w: 48, h: 21, size: 5, minScale: 0.55, font: 'serif', italic: true, valign: 'top', maxLines: 12 },
      reference: { x: 46, y: 51, w: 48, h: 4, size: 3.6, weight: 800, color: '#f2c66d' },
      footer: { x: 52, y: 95, w: 42, h: 3.5, size: 2.6, align: 'right', color: '#cbbfe0' },
    },
  },
  {
    id: 'series_gathered', kind: 'series_header', name: 'Gathered', aspect: [3, 2],
    background: { color: '#fef6e9', image: '/church-assets/series_gathered/bg.jpg' },
    ink: '#2e2a22', accent: '#5f6b47',
    slots: {
      eyebrow: { x: 56, y: 22, w: 40, h: 8, size: 2.2, uppercase: true, tracking: 0.16, weight: 800, color: '#5f6b47' },
      title: { x: 56, y: 31, w: 40, h: 30, size: 6, minScale: 0.55, font: 'display', weight: 800, valign: 'middle', maxLines: 3 },
      body: { x: 56, y: 63, w: 40, h: 7, size: 2.4, color: '#4a4636' },
      reference: { x: 56, y: 71, w: 40, h: 8, size: 2.1, color: '#5f6b47', maxLines: 2 },
    },
  },
  {
    id: 'notice_two_friends', kind: 'announcement', name: 'Friends', aspect: [2, 3],
    background: { color: '#e0dbcc', image: '/church-assets/notice_two_friends/bg.jpg' },
    ink: '#2a2e26', accent: '#5b6b4a', fonts: { serif: SERIF },
    slots: {
      eyebrow: { x: 8, y: 4, w: 84, h: 4, size: 3, uppercase: true, tracking: 0.16, weight: 800, align: 'center', color: '#5b6b4a' },
      body: { x: 8, y: 8.5, w: 84, h: 19, size: 5.2, minScale: 0.55, font: 'serif', align: 'center', valign: 'middle', maxLines: 6 },
      footer: { x: 8, y: 94, w: 84, h: 3.5, size: 2.6, align: 'center', color: '#5b6b4a' },
    },
  },
  {
    id: 'notice_quiet_prayer', kind: 'announcement', name: 'Quiet prayer', aspect: [2, 3],
    background: { color: '#e6cbb3', image: '/church-assets/notice_quiet_prayer/bg.jpg', overlay: 'linear-gradient(to bottom, rgba(250,243,230,0) 52%, rgba(250,243,230,0.88) 66%, rgba(250,243,230,0.96) 100%)' },
    ink: '#3a2826', accent: '#8a5a52', fonts: { serif: SERIF },
    slots: {
      eyebrow: { x: 8, y: 66, w: 84, h: 4, size: 3, uppercase: true, tracking: 0.16, weight: 800, align: 'center', color: '#8a5a52' },
      body: { x: 8, y: 71, w: 84, h: 23, size: 5.4, minScale: 0.55, font: 'serif', align: 'center', valign: 'middle', maxLines: 7 },
      footer: { x: 8, y: 95, w: 84, h: 3.5, size: 2.6, align: 'center', color: '#8a5a52' },
    },
  },
  {
    id: 'notice_reading_corner', kind: 'announcement', name: 'Reading corner', aspect: [2, 3],
    background: { color: '#d8c9b2', image: '/church-assets/notice_reading_corner/bg.jpg', overlay: 'linear-gradient(to bottom, rgba(250,243,230,0) 52%, rgba(250,243,230,0.88) 66%, rgba(250,243,230,0.96) 100%)' },
    ink: '#2e2a22', accent: '#5d6b4a', fonts: { serif: SERIF },
    slots: {
      eyebrow: { x: 8, y: 70, w: 84, h: 4, size: 3, uppercase: true, tracking: 0.16, weight: 800, align: 'center', color: '#5d6b4a' },
      body: { x: 8, y: 75, w: 84, h: 19, size: 5.4, minScale: 0.55, font: 'serif', align: 'center', valign: 'middle', maxLines: 7 },
      footer: { x: 8, y: 95, w: 84, h: 3.5, size: 2.6, align: 'center', color: '#5d6b4a' },
    },
  },

  // --- The original stand-ins, retired: hidden from the picker, still drawing
  // any card a church made with them before the art landed.
  {
    id: 'verse_plain', kind: 'verse_card', name: 'Evening', aspect: [4, 5], placeholder: true, retired: true,
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
    id: 'verse_light', kind: 'verse_card', name: 'Morning', aspect: [4, 5], placeholder: true, retired: true,
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
    id: 'series_plain', kind: 'series_header', name: 'Banner', aspect: [16, 9], placeholder: true, retired: true,
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
    id: 'series_bold', kind: 'series_header', name: 'Spotlight', aspect: [16, 9], placeholder: true, retired: true,
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
    id: 'notice_plain', kind: 'announcement', name: 'Notice board', aspect: [16, 9], placeholder: true, retired: true,
    background: { color: '#2b2433', gradient: 'linear-gradient(150deg, #362c41 0%, #1d1823 100%)' },
    ink: '#f7f2fb', accent: '#c7a6ff',
    slots: {
      eyebrow: { x: 7, y: 10, w: 86, h: 9, size: 2.6, uppercase: true, tracking: 0.16, weight: 800, color: '#c7a6ff' },
      body: { x: 7, y: 22, w: 86, h: 56, size: 5, minScale: 0.55, weight: 700, valign: 'middle', maxLines: 6 },
      footer: { x: 7, y: 82, w: 86, h: 8, size: 2.4, color: '#bcb0c9' },
    },
  },
  {
    id: 'notice_light', kind: 'announcement', name: 'Bulletin', aspect: [16, 9], placeholder: true, retired: true,
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
