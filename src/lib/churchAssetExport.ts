import { assetSlots, slotFamily, slotScale, SLOT_LINE_HEIGHT, templateFor, type AssetKind, type AssetPayload, type AssetSlot, type AssetTemplate, type SlotName } from '@/data/churchAssetTemplates'

// A church's approved visual asset (0133), as a PNG a leader can post.
//
// WHY A CANVAS RENDERER AND NOT A SNAPSHOT OF THE CARD. `ChurchAssetCard` is
// HTML, and the only browser-native way to photograph HTML is to wrap it in an
// SVG <foreignObject> and draw that onto a canvas. Safari taints the canvas the
// moment a foreignObject is drawn, so `toBlob` throws there, and Safari is
// where most pastors are. Web fonts and images inside it don't load either,
// which is the postcard's old blank-rectangle bug. So this draws the card from
// the same DATA the HTML draws from: the template's boxes, colours and
// gradients, and the words from `assetSlots`. The sizing (`slotScale`,
// `slotFamily`, `SLOT_LINE_HEIGHT`) is imported from the template module rather
// than restated, so the two renderers can only drift in how they wrap and
// clip, never in what they say or how big it is.
//
// What it supports is what the template TYPE allows: a colour, a
// `linear-gradient(<deg>, <colour> <n>%, …)` over it, a root-relative image
// covering the card, and an overlay that is a colour or such a gradient. A
// gradient it cannot read is skipped and the flat colour shows, which is the
// card's own fail-closed rule for a background image that won't load.
//
// No storage, no server: the PNG exists only in the leader's browser until they
// share or save it. Square corners, because a social network draws its own.

/** The card's own size: Instagram's 1080 wide for a portrait post, 1920 for a 16:9. */
function exportSize(t: AssetTemplate): { w: number; h: number } {
  const [aw, ah] = t.aspect
  const w = aw >= ah ? 1920 : 1080
  return { w, h: Math.round((w * ah) / aw) }
}

/** `var(--x)` inside a family stack, resolved against the page, since a canvas can't read CSS variables. */
function resolveFamily(family: string): string {
  return family.replace(/var\((--[\w-]+)\)/g, (_, name: string) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'sans-serif')
}

// ---- backgrounds --------------------------------------------------------------

/** A CSS `linear-gradient(<deg>, <colour> <n>%, …)` as a canvas gradient, or null if it isn't one. */
function linearGradient(ctx: CanvasRenderingContext2D, css: string, w: number, h: number): CanvasGradient | null {
  const m = /^\s*linear-gradient\(\s*(-?[\d.]+)deg\s*,(.*)\)\s*$/i.exec(css)
  if (!m) return null
  const stops = [...m[2].matchAll(/(#[0-9a-f]{3,8}|rgba?\([^)]*\))\s+(-?[\d.]+)%/gi)]
  if (stops.length < 2) return null
  // CSS: 0deg points up, angles run clockwise, and the line is long enough
  // that the corners land exactly on the first and last stop.
  const a = (Number(m[1]) * Math.PI) / 180
  const dx = Math.sin(a)
  const dy = -Math.cos(a)
  const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2
  const g = ctx.createLinearGradient(w / 2 - dx * half, h / 2 - dy * half, w / 2 + dx * half, h / 2 + dy * half)
  try {
    for (const s of stops) g.addColorStop(Math.min(1, Math.max(0, Number(s[2]) / 100)), s[1])
  } catch {
    return null
  }
  return g
}

/** Fill the whole card with a colour or a linear gradient; anything else is skipped. */
function fillCss(ctx: CanvasRenderingContext2D, css: string, w: number, h: number) {
  if (/gradient\(/i.test(css)) {
    const g = linearGradient(ctx, css, w, h)
    if (!g) return
    ctx.fillStyle = g
  } else {
    ctx.fillStyle = css
  }
  ctx.fillRect(0, 0, w, h)
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** object-fit: cover. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight)
  const iw = img.naturalWidth * s
  const ih = img.naturalHeight * s
  ctx.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih)
}

// ---- text -----------------------------------------------------------------------

interface Pen {
  ctx: CanvasRenderingContext2D
  /** Letter spacing in px; drawn by hand where the canvas has no `letterSpacing`. */
  spacing: number
  native: boolean
}

function measure(p: Pen, text: string): number {
  if (p.native || !p.spacing) return p.ctx.measureText(text).width
  return p.ctx.measureText(text).width + p.spacing * text.length
}

function draw(p: Pen, text: string, x: number, y: number) {
  if (p.native || !p.spacing) return p.ctx.fillText(text, x, y)
  for (const ch of text) {
    p.ctx.fillText(ch, x, y)
    x += p.ctx.measureText(ch).width + p.spacing
  }
}

/** Words onto lines no wider than `max`; a word longer than a line breaks anywhere (the card's `overflow-wrap: anywhere`). */
function wrap(p: Pen, text: string, max: number): string[] {
  const lines: string[] = []
  for (const para of text.split(/\n/)) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (measure(p, next) <= max) { line = next; continue }
      if (line) lines.push(line)
      line = ''
      let rest = word
      while (measure(p, rest) > max && rest.length > 1) {
        let n = rest.length - 1
        while (n > 1 && measure(p, rest.slice(0, n)) > max) n--
        lines.push(rest.slice(0, n))
        rest = rest.slice(n)
      }
      line = rest
    }
    lines.push(line)
  }
  return lines
}

/** -webkit-line-clamp: the last kept line ends in an ellipsis. */
function clamp(p: Pen, lines: string[], maxLines: number, max: number): string[] {
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]
  while (last && measure(p, `${last}…`) > max) last = last.slice(0, -1).trimEnd()
  kept[maxLines - 1] = `${last}…`
  return kept
}

function drawSlot(ctx: CanvasRenderingContext2D, t: AssetTemplate, box: AssetSlot, raw: string, W: number, H: number, native: boolean) {
  const text = box.uppercase ? raw.toUpperCase() : raw
  const size = ((box.size * slotScale(box, raw)) / 100) * W
  const lh = size * SLOT_LINE_HEIGHT
  const x = (box.x / 100) * W
  const y = (box.y / 100) * H
  const bw = (box.w / 100) * W
  const bh = (box.h / 100) * H

  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, bw, bh)
  ctx.clip()
  ctx.font = `${box.italic ? 'italic ' : ''}${box.weight ?? 500} ${size}px ${resolveFamily(slotFamily(box, t.fonts))}`
  ctx.fillStyle = box.color ?? t.ink
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  const spacing = box.tracking ? box.tracking * size : 0
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string }
  if (native) c.letterSpacing = `${spacing}px`
  const pen: Pen = { ctx, spacing, native }

  const lines = clamp(pen, wrap(pen, text, bw), box.maxLines ?? 4, bw)
  const block = lines.length * lh
  const top = box.valign === 'middle' ? y + (bh - block) / 2 : box.valign === 'bottom' ? y + bh - block : y
  lines.forEach((line, i) => {
    const lw = measure(pen, line)
    const lx = box.align === 'center' ? x + (bw - lw) / 2 : box.align === 'right' ? x + bw - lw : x
    draw(pen, line, lx, top + i * lh + lh / 2)
  })
  if (native) c.letterSpacing = '0px'
  ctx.restore()
}

/** Paint a template's background (colour, gradient, image + overlay) across a w×h canvas. */
async function paintBackground(ctx: CanvasRenderingContext2D, t: AssetTemplate, w: number, h: number) {
  ctx.fillStyle = t.background.color
  ctx.fillRect(0, 0, w, h)
  if (t.background.gradient) fillCss(ctx, t.background.gradient, w, h)
  if (t.background.image) {
    const img = await loadImage(t.background.image)
    if (img) {
      drawCover(ctx, img, w, h)
      if (t.background.overlay) fillCss(ctx, t.background.overlay, w, h)
    }
  }
}

/** The card itself, at its own aspect, on a canvas of its own. */
async function drawCard(kind: AssetKind, templateId: string, payload: AssetPayload): Promise<HTMLCanvasElement | null> {
  const t = templateFor(templateId, kind)
  const words = assetSlots(kind, payload)
  const { w: W, h: H } = exportSize(t)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  await paintBackground(ctx, t, W, H)
  // A web font the card uses must be loaded before the canvas draws with it,
  // or the first export comes out in the fallback face.
  await document.fonts?.ready
  const native = 'letterSpacing' in ctx
  for (const name of Object.keys(t.slots) as SlotName[]) {
    const box = t.slots[name]
    const text = words[name]
    if (box && text) drawSlot(ctx, t, box, text, W, H, native)
  }
  return canvas
}

// A STORY is the card, unchanged, standing on a 9:16 field of its own
// background. The template's boxes are for its own aspect, so a story is a
// FRAME around the card rather than a relayout of it — which is also why it
// needs nothing from a template author. The card sits inside Instagram's Story
// safe zone (clear of the top ~250px and bottom ~340px the app draws over),
// with the field dimmed so the card's edge reads on a light template too.
const STORY = { w: 1080, h: 1920, gutter: 64, safeTop: 250, safeBottom: 340, radius: 28 }

async function drawStory(kind: AssetKind, templateId: string, payload: AssetPayload): Promise<HTMLCanvasElement | null> {
  const card = await drawCard(kind, templateId, payload)
  if (!card) return null
  const t = templateFor(templateId, kind)
  const canvas = document.createElement('canvas')
  canvas.width = STORY.w
  canvas.height = STORY.h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  await paintBackground(ctx, t, STORY.w, STORY.h)
  ctx.fillStyle = 'rgba(0,0,0,0.28)'
  ctx.fillRect(0, 0, STORY.w, STORY.h)

  const room = STORY.h - STORY.safeTop - STORY.safeBottom
  let cw = STORY.w - STORY.gutter * 2
  let ch = (cw * card.height) / card.width
  if (ch > room) { ch = room; cw = (ch * card.width) / card.height }
  const x = (STORY.w - cw) / 2
  const y = STORY.safeTop + (room - ch) / 2

  const shape = () => {
    ctx.beginPath()
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, cw, ch, STORY.radius)
    else ctx.rect(x, y, cw, ch)
  }
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.4)'
  ctx.shadowBlur = 48
  ctx.shadowOffsetY = 12
  shape()
  ctx.fillStyle = t.background.color
  ctx.fill()
  ctx.restore()
  ctx.save()
  shape()
  ctx.clip()
  ctx.drawImage(card, x, y, cw, ch)
  ctx.restore()
  return canvas
}

/** `post`: the card at its own aspect. `story`: the card framed on a 9:16 field. */
export type ExportFormat = 'post' | 'story'

/**
 * Draw one asset to a PNG. Null when the browser can't (no canvas, a toBlob
 * failure) — the caller says "couldn't make the image", never throws a dialog.
 */
export async function renderAssetPng(kind: AssetKind, templateId: string, payload: AssetPayload, format: ExportFormat = 'post'): Promise<Blob | null> {
  try {
    const canvas = format === 'story' ? await drawStory(kind, templateId, payload) : await drawCard(kind, templateId, payload)
    if (!canvas) return null
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  } catch {
    return null
  }
}

/** A filename a phone's photo roll and a desktop's Downloads folder both read well. */
export function assetFilename(kind: AssetKind, payload: AssetPayload): string {
  const s = (k: string) => (typeof payload[k] === 'string' ? (payload[k] as string) : '')
  const what = kind === 'verse_card' ? s('reference') || 'verse' : kind === 'series_header' ? s('series') || 'series' : 'notice'
  const slug = `${s('church_name')} ${what}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
  return slug || 'church-card'
}
