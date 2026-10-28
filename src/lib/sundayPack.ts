import { renderAssetPng } from '@/lib/churchAssetExport'
import { blobPage, buildImagePdf, canvasPage, type PdfPage } from '@/lib/imagePdf'
import { defaultTemplate, pickableTemplates, templateFits, type AssetPayload } from '@/data/churchAssetTemplates'
import { printableQrCanvas, qrGrid } from '@/features/church/ChurchInviteQR'
import { addDays } from '@/lib/date'
import type { DayVerse } from '@/store/churchAdmin'
import type { ChurchAsset } from '@/store/churchAssets'

// The Sunday pack: one PDF a pastor prints or drops into slides — a title
// slide, the week's verse cards, and the church's invite QR. A BUNDLE of
// things that already exist, with no new art and no new service:
//
//   • each card is the existing export path (`renderAssetPng`), at the
//     card's own aspect, from the same words the server would put on it
//     (0133 `church_asset_source_payload`'s shape). Where the church has an
//     APPROVED, fresh verse card for that day, its own chosen look is used;
//     otherwise the first look that fits the words, as the studio would pick;
//   • the QR page is `ChurchInviteQR`'s printable code, the same link
//     `ShareChurch` sends;
//   • the title slide is the only thing drawn here, and it is words on a
//     plain ground.
//
// A day is in the pack only when its verse is LIVE (approved) — a draft is
// something members can't see yet, so it has no business on a Sunday slide —
// and a day with no verse is simply left out, never a failure. The PDF is the
// pastor's own file; nothing is uploaded and no page is made public.

export interface PackDay {
  date: string
  verse: DayVerse
}

export interface PackResult {
  blob: Blob
  /** The days whose card made it in, in order. */
  included: string[]
  /** The week's days with nothing live — left out, and said so. */
  skipped: string[]
  /** A card whose render failed — left out rather than failing the pack. */
  failed: string[]
}

/** The Sunday on or before a date — a church week runs Sunday to Saturday. */
export function sundayOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return addDays(date, -new Date(Date.UTC(y, m - 1, d)).getUTCDay())
}

export const weekDates = (sunday: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(sunday, i))

export const isLive = (v: DayVerse | undefined): v is DayVerse => !!v && v.status !== 'draft' && !!v.reference && !!v.text

/** Every distinct series in the week, in order — the title slide's subtitle. */
export function packSeries(days: PackDay[]): string[] {
  const out: string[] = []
  for (const d of days) {
    const s = d.verse.series?.trim()
    if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s)
  }
  return out
}

export function cardPayload(churchName: string, d: PackDay): AssetPayload {
  return {
    church_name: churchName,
    date: d.date,
    reference: d.verse.reference,
    text: d.verse.text,
    series: d.verse.series ?? null,
    note: d.verse.note ?? null,
  }
}

/** The church's own approved card for the day, else the first look that fits. */
export function cardLook(date: string, payload: AssetPayload, assets: ChurchAsset[] | null): { templateId: string; payload: AssetPayload } {
  const own = assets?.find((a) => a.kind === 'verse_card' && a.sourceDate === date && a.status === 'approved' && !a.stale)
  if (own) return { templateId: own.templateId, payload: own.payload }
  const fit = pickableTemplates('verse_card').find((t) => templateFits(t, 'verse_card', payload)) ?? defaultTemplate('verse_card')
  return { templateId: fit.id, payload }
}

const prettyDay = (iso: string, opts: Intl.DateTimeFormatOptions) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts)
}

export function weekLabel(sunday: string): string {
  return `${prettyDay(sunday, { month: 'short', day: 'numeric' })} – ${prettyDay(addDays(sunday, 6), { month: 'short', day: 'numeric', year: 'numeric' })}`
}

const FONT = 'system-ui, -apple-system, Segoe UI, sans-serif'

/** 1920 x 1080: the church, the series, the week, and the week's references. */
export function titleSlide(churchName: string, series: string[], sunday: string, days: PackDay[]): HTMLCanvasElement | null {
  const W = 1920
  const H = 1080
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const fit = (s: string, weight: number, start: number, min: number, max = W - 240) => {
    let size = start
    ctx.font = `${weight} ${size}px ${FONT}`
    while (ctx.measureText(s).width > max && size > min) {
      size -= 4
      ctx.font = `${weight} ${size}px ${FONT}`
    }
    return size
  }

  const title = series.length ? series.join(' · ') : 'This week’s verses'
  ctx.fillStyle = '#6b5a2e'
  fit(churchName, 700, 56, 30)
  ctx.fillText(churchName, W / 2, 330)
  ctx.fillStyle = '#1b1530'
  fit(title, 800, 120, 52)
  ctx.fillText(title, W / 2, 490)
  ctx.fillStyle = '#c9a43a'
  ctx.fillRect(W / 2 - 90, 540, 180, 6)
  ctx.fillStyle = '#4a4560'
  fit(weekLabel(sunday), 500, 48, 28)
  ctx.fillText(weekLabel(sunday), W / 2, 630)

  const refs = days.map((d) => `${prettyDay(d.date, { weekday: 'short' })} · ${d.verse.reference}`).join('     ')
  if (refs) {
    ctx.fillStyle = '#6a6580'
    fit(refs, 500, 34, 18, W - 160)
    ctx.fillText(refs, W / 2, 760)
  }
  return c
}

/**
 * Build the pack. Null only if there is nothing at all to put in it or the
 * browser can't draw — a day that fails to render is listed in `failed` and
 * the rest still ships.
 */
export async function buildSundayPack(input: {
  churchName: string
  link: string
  sunday: string
  verses: Record<string, DayVerse>
  assets: ChurchAsset[] | null
}): Promise<PackResult | null> {
  const days: PackDay[] = []
  const skipped: string[] = []
  for (const date of weekDates(input.sunday)) {
    const v = input.verses[date]
    if (isLive(v)) days.push({ date, verse: v })
    else skipped.push(date)
  }
  const pages: PdfPage[] = []
  const title = titleSlide(input.churchName, packSeries(days), input.sunday, days)
  const tp = title && (await canvasPage(title))
  if (tp) pages.push(tp)

  const included: string[] = []
  const failed: string[] = []
  for (const d of days) {
    const look = cardLook(d.date, cardPayload(input.churchName, d), input.assets)
    const png = await renderAssetPng('verse_card', look.templateId, look.payload, 'post')
    const page = png && (await blobPage(png).catch(() => null))
    if (page) { pages.push(page); included.push(d.date) } else failed.push(d.date)
  }

  const qr = printableQrCanvas(qrGrid(input.link), input.churchName, input.link)
  const qp = qr && (await canvasPage(qr))
  if (qp) pages.push(qp)

  if (!pages.length) return null
  return { blob: buildImagePdf(pages), included, skipped, failed }
}

export function packFilename(churchName: string, sunday: string): string {
  const slug = churchName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  return `${slug || 'church'}-sunday-pack-${sunday}`
}
