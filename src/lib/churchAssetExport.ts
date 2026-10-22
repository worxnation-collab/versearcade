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

/** Long edge of the export: Instagram's 1080 for a portrait post, 1920 for a 16:9. */
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

/**
 * Draw one asset to a PNG. Null when the browser can't (no canvas, a toBlob
 * failure) — the caller says "couldn't make the image", never throws a dialog.
 */
export async function renderAssetPng(kind: AssetKind, templateId: string, payload: AssetPayload): Promise<Blob | null> {
  try {
    const t = templateFor(templateId, kind)
    const words = assetSlots(kind, payload)
    const { w: W, h: H } = exportSize(t)
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.fillStyle = t.background.color
    ctx.fillRect(0, 0, W, H)
    if (t.background.gradient) fillCss(ctx, t.background.gradient, W, H)
    if (t.background.image) {
      const img = await loadImage(t.background.image)
      if (img) {
        drawCover(ctx, img, W, H)
        if (t.background.overlay) fillCss(ctx, t.background.overlay, W, H)
      }
    }

    // A web font the card uses must be loaded before the canvas draws with it,
    // or the first export comes out in the fallback face.
    await document.fonts?.ready
    const native = 'letterSpacing' in ctx
    for (const name of Object.keys(t.slots) as SlotName[]) {
      const box = t.slots[name]
      const text = words[name]
      if (box && text) drawSlot(ctx, t, box, text, W, H, native)
    }
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
