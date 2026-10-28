import { useMemo, useState } from 'react'
import qrcode from 'qrcode-generator'
import { useAuth } from '@/store/auth'
import { inviteUrl } from '@/features/daily/shareCard'
import { shareImage } from '@/lib/postcard'

// The church's invite as a QR code — the thing a pastor puts on a slide or
// prints for the welcome table. Part of the VERIFIED package; the plain share
// link (`ShareChurch`) stays free for every church.
//
// It encodes exactly the link `ShareChurch` sends — `/church/:id` with the
// sharer's referral code — so a scan lands on the church's page with its Join
// button, and a visitor without an account is carried back to that page after
// sign-up by `ChurchResume`. That is the "pre-selects the church" part: no new
// route, the same door a link already opens.
//
// Drawn as SVG rects from the module grid rather than through the library's
// HTML-string helpers: nothing here is set with innerHTML, and an SVG stays
// sharp on a projector.
//
// "Save for the bulletin" turns the same grid into a PNG — the code, the
// church's name above it and the link under it, black on white at print size
// — and hands it over through `shareImage`, the postcard's native-safe path,
// because a bulletin is made on a laptop and a slide on a phone.
export function ChurchInviteQR({
  churchId,
  churchName,
  defaultOpen = false,
}: {
  churchId: string
  churchName: string
  /** Leadership's Share tab opens on the code; the church page keeps it folded. */
  defaultOpen?: boolean
}) {
  const referralCode = useAuth((s) => s.profile?.referralCode)
  const [open, setOpen] = useState(defaultOpen)
  const [saved, setSaved] = useState<string | null>(null)
  const link = churchInviteLink(referralCode, churchId)

  const grid = useMemo(() => (open ? qrGrid(link) : null), [open, link])

  if (!open) {
    return (
      <button
        className="pill"
        onClick={() => setOpen(true)}
        style={{ display: 'block', margin: '10px auto 0', fontSize: 12.5, fontWeight: 800 }}
      >
        Show the invite QR code
      </button>
    )
  }

  const quiet = 4 // the QR spec's quiet zone, in modules
  const size = grid ? grid.n + quiet * 2 : 0
  return (
    <div className="card center" style={{ marginTop: 10 }}>
      <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>Scan to play for {churchName}</b>
      {grid && (
        <svg
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`QR code linking to ${churchName} on Verse Arcade`}
          shapeRendering="crispEdges"
          style={{ display: 'block', width: '100%', maxWidth: 240, margin: '10px auto', borderRadius: 10 }}
        >
          {/* Always dark-on-white, whatever the theme: a phone camera reads a
              light code on a dark ground badly, and this will be projected. */}
          <rect width={size} height={size} fill="#ffffff" />
          {grid.cells.map(([x, y]) => (
            <rect key={`${x}-${y}`} x={x + quiet} y={y + quiet} width={1} height={1} fill="#000000" />
          ))}
        </svg>
      )}
      <p className="faint" style={{ margin: 0, fontSize: 11.5, overflowWrap: 'anywhere' }}>{link}</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 10 }}>
        {grid && (
          <button
            className="pill"
            style={{ fontSize: 12, fontWeight: 800 }}
            onClick={async () => {
              setSaved(null)
              const blob = await printableQr(grid, churchName, link)
              const r = blob
                ? await shareImage(blob, { filename: 'church-qr', title: `${churchName} on Verse Arcade`, text: link })
                : 'failed'
              setSaved(r === 'saved' ? 'Saved — check your downloads.' : r === 'failed' ? 'Couldn’t make the picture.' : null)
            }}
          >
            ⬇ Save for a bulletin or slide
          </button>
        )}
        {!defaultOpen && (
          <button className="pill" onClick={() => setOpen(false)} style={{ fontSize: 12 }}>
            Hide
          </button>
        )}
      </div>
      {saved && <p className="faint" style={{ margin: '8px 0 0', fontSize: 12 }}>{saved}</p>}
    </div>
  )
}

/**
 * The code at print size: 1200 x 1500, white, the church's name above, the
 * link below. Drawn module by module onto a canvas (never through an image of
 * the SVG), so it is crisp at any size a printer scales it to.
 */
export type QrGrid = { n: number; cells: Array<[number, number]> }

/** The church invite's link, the one `ShareChurch` sends — also the Sunday pack's. */
export function churchInviteLink(referralCode: string | null | undefined, churchId: string): string {
  return inviteUrl(referralCode, `/church/${churchId}`)
}

/** The module grid for a link, dark cells as [column, row]. */
export function qrGrid(link: string): QrGrid {
  const qr = qrcode(0, 'M')
  qr.addData(link)
  qr.make()
  const n = qr.getModuleCount()
  const cells: Array<[number, number]> = []
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) cells.push([c, r])
  return { n, cells }
}

export async function printableQr(grid: QrGrid, churchName: string, link: string): Promise<Blob | null> {
  const canvas = printableQrCanvas(grid, churchName, link)
  if (!canvas) return null
  return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
}

/** The printable code as a canvas — the Sunday pack puts this page in its PDF. */
export function printableQrCanvas(grid: QrGrid, churchName: string, link: string): HTMLCanvasElement | null {
  try {
    const W = 1200
    const H = 1500
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#000000'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'

    // The name, shrunk to fit one line rather than wrapped mid-word.
    let size = 76
    ctx.font = `800 ${size}px system-ui, -apple-system, Segoe UI, sans-serif`
    while (ctx.measureText(churchName).width > W - 140 && size > 36) {
      size -= 4
      ctx.font = `800 ${size}px system-ui, -apple-system, Segoe UI, sans-serif`
    }
    ctx.fillText(churchName, W / 2, 150)
    ctx.font = '500 44px system-ui, -apple-system, Segoe UI, sans-serif'
    ctx.fillText('Scan to play the daily verse with us', W / 2, 225)

    const quiet = 4
    const box = 940
    const unit = Math.floor(box / (grid.n + quiet * 2))
    const side = unit * (grid.n + quiet * 2)
    const x0 = Math.round((W - side) / 2)
    const y0 = 290
    for (const [x, y] of grid.cells) ctx.fillRect(x0 + (x + quiet) * unit, y0 + (y + quiet) * unit, unit, unit)

    // The address a person could TYPE: the page itself, without the invite
    // code (that rides in the code above), shrunk to fit rather than cut — a
    // truncated URL is worse than none.
    const shown = link.replace(/^https?:\/\//, '').replace(/\?.*$/, '')
    let urlSize = 34
    ctx.font = `500 ${urlSize}px system-ui, -apple-system, Segoe UI, sans-serif`
    while (ctx.measureText(shown).width > W - 80 && urlSize > 18) {
      urlSize -= 2
      ctx.font = `500 ${urlSize}px system-ui, -apple-system, Segoe UI, sans-serif`
    }
    ctx.fillText(shown, W / 2, y0 + side + 70)
    ctx.font = '700 38px system-ui, -apple-system, Segoe UI, sans-serif'
    ctx.fillText('Verse Arcade · free · no account needed to look', W / 2, y0 + side + 130)

    return canvas
  } catch {
    return null
  }
}
