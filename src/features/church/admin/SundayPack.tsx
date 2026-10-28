import { useState } from 'react'
import { useJuice } from '@/juice/useJuice'
import { useAuth } from '@/store/auth'
import { useChurchAssetsAdmin } from '@/store/churchAssets'
import { todayLocalDate, addDays } from '@/lib/date'
import { shareFile } from '@/lib/postcard'
import type { VerseBackend } from '@/store/churchAdmin'
import { churchInviteLink } from '@/features/church/ChurchInviteQR'

// "Sunday pack" — on the Plan tab, under the week strip. One PDF for the
// pastor to print or drop into slides: a title slide (the church, the week's
// series), the week's LIVE verse cards, and the invite QR. `lib/sundayPack.ts`
// carries the rules; this is the button, a week picker and one result line.
//
// Leadership only by where it stands (the Plan tab is verified leadership;
// the public demo never mounts it), and it makes a FILE — no page, nothing
// uploaded, nobody else told. A week with no live verse at all says so rather
// than handing over a PDF of a title and a QR code.

const short = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function SundayPack({ churchId, churchName, backend }: { churchId: string; churchName: string; backend: VerseBackend }) {
  const juice = useJuice()
  const referralCode = useAuth((s) => s.profile?.referralCode)
  const [offset, setOffset] = useState(0) // weeks from this one
  const [busy, setBusy] = useState(false)
  const [line, setLine] = useState<{ ok: boolean; text: string } | null>(null)
  const today = todayLocalDate()

  const thisSunday = (() => {
    const [y, m, d] = today.split('-').map(Number)
    return addDays(today, -new Date(Date.UTC(y, m - 1, d)).getUTCDay())
  })()
  const sunday = addDays(thisSunday, offset * 7)

  const make = async () => {
    if (!backend.range) return
    setBusy(true); setLine(null)
    try {
      const pack = await import('@/lib/sundayPack')
      const [range] = await Promise.all([backend.range(churchId, sunday, 7), useChurchAssetsAdmin.getState().load(churchId)])
      if (!range || !range.ok) { setLine({ ok: false, text: 'Couldn’t read that week. Try again in a moment.' }); return }
      if (!pack.weekDates(sunday).some((d) => pack.isLive(range.data[d]))) {
        setLine({ ok: false, text: `Nothing is live for ${pack.weekLabel(sunday)} yet — approve a day first.` })
        return
      }
      const link = churchInviteLink(referralCode, churchId)
      const r = await pack.buildSundayPack({ churchName, link, sunday, verses: range.data, assets: useChurchAssetsAdmin.getState().assets })
      if (!r) { setLine({ ok: false, text: 'Couldn’t make the PDF on this device.' }); return }
      const out = await shareFile(r.blob, {
        filename: pack.packFilename(churchName, sunday),
        title: `${churchName} — Sunday pack`,
        text: pack.weekLabel(sunday),
        ext: 'pdf',
        mime: 'application/pdf',
      })
      if (out === 'failed') { setLine({ ok: false, text: 'Couldn’t save the PDF.' }); return }
      if (out === 'cancelled') return
      juice.select?.()
      const left = [...r.skipped, ...r.failed]
      setLine({
        ok: true,
        text: `${r.included.length} card${r.included.length === 1 ? '' : 's'}, the title slide and your QR code.` +
          (left.length ? ` Left out (nothing live): ${left.map(short).join(', ')}.` : ''),
      })
    } finally {
      setBusy(false)
    }
  }

  if (!backend.range) return null
  return (
    <div className="card" data-sunday-pack style={{ display: 'grid', gap: 8, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <b style={{ flex: 1, fontSize: 14.5 }}>📄 Sunday pack</b>
        <button className="pill" aria-label="Previous week" disabled={busy || offset <= -8} onClick={() => setOffset((o) => o - 1)} style={{ padding: '4px 10px' }}>‹</button>
        <span data-pack-week style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
          {offset === 0 ? 'This week' : `Week of ${short(sunday)}`}
        </span>
        <button className="pill" aria-label="Next week" disabled={busy || offset >= 8} onClick={() => setOffset((o) => o + 1)} style={{ padding: '4px 10px' }}>›</button>
      </div>
      <p className="dim" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45 }}>
        One PDF to print or drop into your slides: a title slide, a card for each day with a live verse, and your
        invite QR code. Days with nothing live are left out.
      </p>
      <button className="pill" disabled={busy} onClick={() => void make()} style={{ justifySelf: 'start', fontSize: 12.5, fontWeight: 800 }}>
        {busy ? 'Making the PDF…' : '⬇ Make the Sunday pack'}
      </button>
      {line && <div role="status" style={{ fontSize: 12.5, lineHeight: 1.45, color: line.ok ? 'var(--mint)' : 'var(--coral)' }}>{line.text}</div>}
    </div>
  )
}
