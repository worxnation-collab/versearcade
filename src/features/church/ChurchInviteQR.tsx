import { useMemo, useState } from 'react'
import qrcode from 'qrcode-generator'
import { useAuth } from '@/store/auth'
import { inviteUrl } from '@/features/daily/shareCard'

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
export function ChurchInviteQR({ churchId, churchName }: { churchId: string; churchName: string }) {
  const referralCode = useAuth((s) => s.profile?.referralCode)
  const [open, setOpen] = useState(false)
  const link = inviteUrl(referralCode, `/church/${churchId}`)

  const grid = useMemo(() => {
    if (!open) return null
    const qr = qrcode(0, 'M')
    qr.addData(link)
    qr.make()
    const n = qr.getModuleCount()
    const cells: Array<[number, number]> = []
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) cells.push([c, r])
    return { n, cells }
  }, [open, link])

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
      <button className="pill" onClick={() => setOpen(false)} style={{ marginTop: 10, fontSize: 12 }}>
        Hide
      </button>
    </div>
  )
}
