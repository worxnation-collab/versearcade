// "Export summary" — a one-page PDF of the church's last three series with
// something live: name, dates, engaged % and completed %, out of current
// members. Drawn on a canvas and written through `lib/imagePdf.ts`, the Sunday
// pack's path, so it is a picture of the numbers and nothing else.
//
// Totals only. The input is `church_series_landing` (0150), which never
// returns a name, and nothing here adds one. Definitions are printed on the
// page so a board meeting reads the numbers the way Home does.

import type { SeriesLanding } from '@/store/churchAdmin'
import { buildImagePdf, canvasPage } from './imagePdf'

const W = 1275 // 8.5in at 150dpi
const H = 1650 // 11in

const pretty = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return y && m && d ? new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : iso
}

/** The three newest series with at least one live day, in date order newest first. */
export function summarySeries(series: SeriesLanding[]): SeriesLanding[] {
  return series.filter((s) => s.status !== 'upcoming' && s.engagedPct != null).slice(0, 3)
}

export function summaryFilename(churchName: string, today: string) {
  const slug = churchName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'church'
  return `${slug}-series-summary-${today}`
}

export async function buildSeriesSummary(opts: {
  churchName: string
  members: number
  series: SeriesLanding[]
  today: string
}): Promise<Blob | null> {
  const rows = summarySeries(opts.series)
  if (!rows.length) return null
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const g = c.getContext('2d')
  if (!g) return null
  try { await document.fonts?.ready } catch { /* system fonts are fine */ }
  const sans = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

  g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H)
  const ink = '#1f1a17', dim = '#5c534c', faint = '#8a817a', rule = '#e6dfd6', mint = '#2f9e7a', gold = '#c8901c'

  const fit = (text: string, max: number, size: number, weight = 700) => {
    let s = size
    g.font = `${weight} ${s}px ${sans}`
    while (g.measureText(text).width > max && s > 18) { s -= 2; g.font = `${weight} ${s}px ${sans}` }
    return s
  }

  let y = 130
  g.fillStyle = faint; g.font = `700 26px ${sans}`
  g.fillText('SERIES SUMMARY', 100, y)
  y += 70
  g.fillStyle = ink; fit(opts.churchName, W - 200, 60, 800)
  g.fillText(opts.churchName, 100, y)
  y += 50
  g.fillStyle = dim; g.font = `400 26px ${sans}`
  g.fillText(`${opts.members.toLocaleString()} current member${opts.members === 1 ? '' : 's'} · as of ${pretty(opts.today)}`, 100, y)
  y += 40
  g.fillStyle = rule; g.fillRect(100, y, W - 200, 3)
  y += 80

  for (const s of rows) {
    g.fillStyle = ink; fit(s.name, W - 200, 44, 800)
    g.fillText(s.name, 100, y)
    y += 42
    g.fillStyle = faint; g.font = `400 24px ${sans}`
    const span = `${pretty(s.startDate)} – ${pretty(s.endDate)} · ${s.status === 'running' ? `running, day ${s.liveDays} of ${s.days}` : `${s.days} days, finished`}`
    g.fillText(span, 100, y)
    y += 50
    const bar = (label: string, pct: number, count: number, color: string) => {
      g.fillStyle = ink; g.font = `700 28px ${sans}`
      g.fillText(label, 100, y)
      g.textAlign = 'right'
      g.fillText(`${pct}%`, W - 100, y)
      g.fillStyle = dim; g.font = `400 22px ${sans}`
      g.fillText(`${count.toLocaleString()} of ${opts.members.toLocaleString()}`, W - 200, y)
      g.textAlign = 'left'
      y += 18
      g.fillStyle = '#f1ece5'; g.fillRect(100, y, W - 200, 22)
      g.fillStyle = color; g.fillRect(100, y, Math.round(((W - 200) * Math.min(100, Math.max(0, pct))) / 100), 22)
      y += 60
    }
    bar('Engaged', s.engagedPct ?? 0, s.engaged, mint)
    bar(s.status === 'running' ? 'Kept up so far' : 'Completed', s.completedPct ?? 0, s.completed, gold)
    y += 30
    g.fillStyle = rule; g.fillRect(100, y - 30, W - 200, 2)
    y += 40
  }

  // Definitions, at the foot of the page.
  const foot = [
    'Engaged: a current member who played at least one of the series’ days so far.',
    'Completed: a current member who played every one of them (“kept up so far” while it runs).',
    'Out of the church’s current members. Totals only — no names, and nobody is ranked.',
  ]
  g.fillStyle = faint; g.font = `400 21px ${sans}`
  foot.forEach((line, i) => g.fillText(line, 100, H - 150 + i * 32))
  g.fillText('Verse Arcade', 100, H - 50)

  const page = await canvasPage(c)
  return page ? buildImagePdf([page]) : null
}
