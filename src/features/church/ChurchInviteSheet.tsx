import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '@/store/auth'
import { fetchChurchPage } from '@/store/church'
import { churchLevelInfo } from './levels'
import { ChurchArt } from './ChurchArt'
import { inviteUrl } from '@/features/daily/shareCard'
import { encodeQr, qrPath } from '@/lib/qr'
import type { ChurchPage } from '@/types'

// /church/:id/invite — the Sunday sheet.
//
// The church page is the one thing here a pastor can put in front of a whole
// congregation at once, and until now the only way to pass it on was a link in
// a group chat. A link reaches whoever reads the chat; a QR on a projector
// between the announcements and the first song reaches the room. This is that
// page: the building, the church's name, and a code big enough to scan from the
// back row.
//
// It is PUBLIC and behind no wall, like /church/:id itself — a church laptop
// running the projector is not signed in to anything, and a wall here would
// mean the pastor cannot show the thing they are recommending. It carries no
// number about anybody either: no congregation size, no points, no level named
// in words. A poster is the wrong place to start counting people, and the rule
// the map holds absolutely holds here too.
//
// THE CODE IS ALWAYS DARK-ON-WHITE, in both themes and on paper, and that is
// correctness rather than taste: plenty of scanners will not read an inverted
// code, and this app is otherwise dark throughout. The tile it sits on is
// therefore a fixed white, never a token.

/** Roughly the largest payload we ever encode, for a stable layout. */
function useInviteQr(churchId: string, referralCode?: string | null) {
  return useMemo(() => {
    const base = inviteUrl(referralCode, `/church/${churchId}`)
    // The same two parameters ShareChurch sends, for the same two reasons: the
    // referral credits whoever printed the sheet, and `src=church` files the
    // whole channel in the growth tab. A sheet whose sign-ups land as
    // "untracked" cannot tell anybody whether Sunday worked.
    const url = `${base}${base.includes('?') ? '&' : '?'}src=church`
    try {
      return { url, ...qrPath(encodeQr(url)) }
    } catch {
      // encodeQr only throws on a payload too long for version 40, which no
      // invite URL can reach. Fail to the plain link rather than a blank sheet.
      return { url, d: '', side: 0 }
    }
  }, [churchId, referralCode])
}

export default function ChurchInviteSheet() {
  const { id = '' } = useParams()
  const ready = useAuth((s) => s.ready)
  const referralCode = useAuth((s) => s.profile?.referralCode)
  const [page, setPage] = useState<ChurchPage | null>(null)
  const [loading, setLoading] = useState(true)
  const qr = useInviteQr(id, referralCode)

  useEffect(() => {
    if (!ready) return
    let alive = true
    fetchChurchPage(id).then((p) => {
      if (!alive) return
      setPage(p)
      setLoading(false)
    })
    return () => { alive = false }
  }, [id, ready])

  const name = page?.church.name ?? ''
  const level = page ? churchLevelInfo(page.church.xp).level : 1

  return (
    <div className="invite-sheet">
      <style>{`
        /* The sheet is its own surface rather than an app screen: it is shown
           on a projector and printed on a home printer, so it commits to a
           light ground in both themes and drops every scrap of app chrome when
           it prints. No @media (prefers-color-scheme) branch — a poster that
           inverts itself on somebody's laptop is the bug. */
        .invite-sheet {
          min-height: 100dvh;
          background: #fbf7f2;
          color: #1a1216;
          display: grid;
          place-items: center;
          padding: 24px 18px 40px;
        }
        .invite-card {
          width: 100%;
          max-width: 620px;
          display: grid;
          justify-items: center;
          gap: 18px;
          text-align: center;
        }
        .invite-qr {
          background: #ffffff;
          padding: 14px;
          border-radius: 18px;
          box-shadow: 0 8px 30px rgba(40, 20, 30, 0.14);
          line-height: 0;
        }
        .invite-print {
          border: 1px solid rgba(26, 18, 22, 0.28);
          border-radius: 999px;
          padding: 9px 20px;
          font-weight: 800;
          font-size: 13.5px;
          background: transparent;
          color: #1a1216;
        }
        @media print {
          @page { margin: 14mm; }
          .invite-sheet { background: #fff; min-height: auto; padding: 0; }
          .invite-qr { box-shadow: none; padding: 0; }
          .invite-noprint { display: none !important; }
        }
      `}</style>

      <div className="invite-card">
        {loading ? (
          <p style={{ opacity: 0.55, fontSize: 14 }}>Loading…</p>
        ) : !page ? (
          <p style={{ opacity: 0.7, fontSize: 15 }}>
            We couldn’t find that church. The link may be old.
          </p>
        ) : (
          <>
            <div style={{ lineHeight: 0 }}>
              <ChurchArt level={level} skin={page.church.skin} size={168} />
            </div>

            <div>
              <p style={{
                margin: 0, fontSize: 13, letterSpacing: '0.14em',
                textTransform: 'uppercase', opacity: 0.62, fontWeight: 800,
              }}>
                Play today’s verse for
              </p>
              <h1 style={{
                margin: '6px 0 0', fontFamily: 'var(--font-display)',
                fontSize: 'clamp(28px, 7vw, 44px)', lineHeight: 1.12,
              }}>
                {name}
              </h1>
            </div>

            <div className="invite-qr">
              {qr.d ? (
                <svg
                  viewBox={`0 0 ${qr.side} ${qr.side}`}
                  width="min(70vw, 300px)"
                  height="min(70vw, 300px)"
                  shapeRendering="crispEdges"
                  role="img"
                  aria-label={`Scan to play for ${name}`}
                >
                  {/* The quiet zone is part of the viewBox, so the white tile
                      behind it is the margin a scanner needs. */}
                  <rect width={qr.side} height={qr.side} fill="#ffffff" />
                  <path d={qr.d} fill="#14100f" />
                </svg>
              ) : (
                <p style={{ fontSize: 13, padding: 12 }}>{qr.url}</p>
              )}
            </div>

            <div style={{ display: 'grid', gap: 4 }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                Point your camera at the code
              </p>
              <p style={{ margin: 0, fontSize: 13.5, opacity: 0.72, lineHeight: 1.55 }}>
                One Bible verse a day, the same one for everybody. It’s free, and the points you
                earn you can give to {name}.
              </p>
            </div>

            {/* The URL in words, because a QR is useless to somebody reading
                this over a shoulder, on a photocopy, or in a newsletter. */}
            <p style={{
              margin: 0, fontSize: 12.5, opacity: 0.58,
              wordBreak: 'break-all', maxWidth: 460,
            }}>
              {qr.url.replace(/^https:\/\//, '')}
            </p>

            <button className="invite-print invite-noprint" onClick={() => window.print()}>
              Print this sheet
            </button>
          </>
        )}
      </div>
    </div>
  )
}
