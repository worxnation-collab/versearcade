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
// What it supports is what the shipped templates use: a colour, a
// `linear-gradient(<deg> | to <side>, …)` or `radial-gradient(ellipse at X% Y%,
// …)` over it, a root-relative image covering the card, and an overlay that is
// a colour or such a gradient. A gradient it cannot read is skipped and the
// flat colour shows, which is the card's own fail-closed rule for a background
// image that won't load.
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

/** Split on commas that are not inside parentheses: `rgba(1,2,3,0.5) 40%, #fff` → two parts. */
function splitTop(css: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of css) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = '' } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

const COLOUR = /^(#[0-9a-f]{3,8}|rgba?\([^)]*\)|transparent)(?:\s+(-?[\d.]+)%)?$/i

/**
 * Colour stops, positions as 0..1. A stop with no % is placed the way CSS
 * places it: the first at 0, the last at 1, the rest spread evenly between
 * their positioned neighbours. Null if any stop isn't a colour we can read.
 */
function stopsOf(parts: string[]): Array<[number, string]> | null {
  const raw = parts.map((p) => COLOUR.exec(p))
  if (raw.length < 2 || raw.some((m) => !m)) return null
  const pos: Array<number | null> = raw.map((m) => (m![2] === undefined ? null : Number(m![2]) / 100))
  if (pos[0] === null) pos[0] = 0
  if (pos[pos.length - 1] === null) pos[pos.length - 1] = 1
  for (let i = 1; i < pos.length; i++) {
    if (pos[i] !== null) continue
    let j = i
    while (pos[j] === null) j++
    const from = pos[i - 1]!
    const to = pos[j]!
    for (let k = i; k < j; k++) pos[k] = from + ((to - from) * (k - i + 1)) / (j - i + 1)
  }
  // CSS clamps a stop that comes before the one ahead of it.
  for (let i = 1; i < pos.length; i++) pos[i] = Math.max(pos[i]!, pos[i - 1]!)
  return raw.map((m, i) => [Math.min(1, Math.max(0, pos[i]!)), m![1] === 'transparent' ? 'rgba(0,0,0,0)' : m![1]])
}

/** The CSS angle (0deg up, clockwise) a `<deg>` or `to <side> [<side>]` names on a w×h box. */
function angleOf(dir: string, w: number, h: number): number | null {
  const deg = /^(-?[\d.]+)deg$/i.exec(dir)
  if (deg) return (Number(deg[1]) * Math.PI) / 180
  const to = /^to\s+(top|bottom|left|right)(?:\s+(top|bottom|left|right))?$/i.exec(dir)
  if (!to) return null
  const sides = [to[1], to[2]].filter(Boolean).map((x) => x!.toLowerCase())
  const dx = sides.includes('right') ? 1 : sides.includes('left') ? -1 : 0
  const dy = sides.includes('bottom') ? 1 : sides.includes('top') ? -1 : 0
  // A corner is perpendicular to the diagonal through the other two corners,
  // which on a non-square box is not 45°.
  return Math.atan2(dx * (dy ? h : 1), -dy * (dx ? w : 1))
}

function addStops(g: CanvasGradient, stops: Array<[number, string]>): boolean {
  try {
    for (const [at, colour] of stops) g.addColorStop(at, colour)
    return true
  } catch {
    return false
  }
}

/**
 * Paint a CSS `linear-gradient(...)` or `radial-gradient(ellipse at X% Y%, ...)`
 * across w×h. False when it is a form this doesn't read, so the caller leaves
 * the flat colour showing — the card's own fail-closed rule.
 */
function paintGradient(ctx: CanvasRenderingContext2D, css: string, w: number, h: number): boolean {
  const lin = /^\s*linear-gradient\((.*)\)\s*$/i.exec(css)
  if (lin) {
    const parts = splitTop(lin[1])
    let a = angleOf(parts[0], w, h)
    if (a === null) a = Math.PI // no direction: CSS's default, to bottom
    else parts.shift()
    const stops = stopsOf(parts)
    if (!stops) return false
    // The line is long enough that the corners land exactly on 0 and 1.
    const dx = Math.sin(a)
    const dy = -Math.cos(a)
    const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2
    const g = ctx.createLinearGradient(w / 2 - dx * half, h / 2 - dy * half, w / 2 + dx * half, h / 2 + dy * half)
    if (!addStops(g, stops)) return false
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
    return true
  }
  const rad = /^\s*radial-gradient\((.*)\)\s*$/i.exec(css)
  if (rad) {
    const parts = splitTop(rad[1])
    const shape = /^(?:ellipse\s+)?at\s+(-?[\d.]+)%\s+(-?[\d.]+)%$/i.exec(parts[0])
    if (!shape) return false
    const stops = stopsOf(parts.slice(1))
    if (!stops) return false
    // `ellipse farthest-corner` (CSS's default size): the farthest-side
    // ellipse, scaled by √2 so it passes through the farthest corner.
    const cx = (Number(shape[1]) / 100) * w
    const cy = (Number(shape[2]) / 100) * h
    const rx = Math.max(cx, w - cx) * Math.SQRT2
    const ry = Math.max(cy, h - cy) * Math.SQRT2
    if (!rx || !ry) return false
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx)
    if (!addStops(g, stops)) return false
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(1, ry / rx)
    ctx.fillStyle = g
    ctx.fillRect(-cx, (-cy * rx) / ry, w, (h * rx) / ry)
    ctx.restore()
    return true
  }
  return false
}

/** Fill the whole card with a colour or a gradient; a gradient it can't read is skipped. */
function fillCss(ctx: CanvasRenderingContext2D, css: string, w: number, h: number) {
  if (/gradient\(/i.test(css)) {
    paintGradient(ctx, css, w, h)
    return
  }
  ctx.fillStyle = css
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

// A FRAME is the card, unchanged, standing on a field of its own background —
// used where the network's shape is not the card's. The template's boxes are
// for its own aspect, so this frames rather than relayouts, which is also why a
// template author never has to think about it. The field is dimmed so the
// card's edge reads on a light template too.
interface Frame { w: number; h: number; gutter: number; top: number; bottom: number }

// A Story keeps the card inside Instagram's safe zone, clear of the top ~250px
// and bottom ~340px the app draws over.
const STORY: Frame = { w: 1080, h: 1920, gutter: 64, top: 250, bottom: 340 }
// The feed crops anything TALLER than 4:5, and the shipped verse and notice
// art is 2:3 — the crop would take the eyebrow and the footer. So a tall card
// posts whole on a 4:5 frame instead.
const FEED_PORTRAIT: Frame = { w: 1080, h: 1350, gutter: 56, top: 56, bottom: 56 }
const RADIUS = 28

async function drawFramed(kind: AssetKind, templateId: string, payload: AssetPayload, f: Frame): Promise<HTMLCanvasElement | null> {
  const card = await drawCard(kind, templateId, payload)
  if (!card) return null
  const t = templateFor(templateId, kind)
  const canvas = document.createElement('canvas')
  canvas.width = f.w
  canvas.height = f.h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  await paintBackground(ctx, t, f.w, f.h)
  ctx.fillStyle = 'rgba(0,0,0,0.28)'
  ctx.fillRect(0, 0, f.w, f.h)

  const room = f.h - f.top - f.bottom
  let cw = f.w - f.gutter * 2
  let ch = (cw * card.height) / card.width
  if (ch > room) { ch = room; cw = (ch * card.width) / card.height }
  const x = (f.w - cw) / 2
  const y = f.top + (room - ch) / 2

  const shape = () => {
    ctx.beginPath()
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, cw, ch, RADIUS)
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

/** Whether a template's card is taller than the feed's 4:5, and so posts framed. */
export function postsFramed(templateId: string, kind: AssetKind): boolean {
  const [aw, ah] = templateFor(templateId, kind).aspect
  return ah / aw > 5 / 4 + 1e-6
}

/** `post`: the card at its own aspect (framed at 4:5 if it is taller). `story`: framed on 9:16. */
export type ExportFormat = 'post' | 'story'

/**
 * Draw one asset to a PNG. Null when the browser can't (no canvas, a toBlob
 * failure) — the caller says "couldn't make the image", never throws a dialog.
 */
export async function renderAssetPng(kind: AssetKind, templateId: string, payload: AssetPayload, format: ExportFormat = 'post'): Promise<Blob | null> {
  try {
    const canvas =
      format === 'story' ? await drawFramed(kind, templateId, payload, STORY)
        : postsFramed(templateId, kind) ? await drawFramed(kind, templateId, payload, FEED_PORTRAIT)
          : await drawCard(kind, templateId, payload)
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
