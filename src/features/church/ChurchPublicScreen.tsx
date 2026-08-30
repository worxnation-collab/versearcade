import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { useAuth } from '@/store/auth'
import { fetchChurchPage } from '@/store/church'
import { setPendingChurch } from './pending'
import { ChurchPageBody } from './ChurchPageBody'
import { ShareChurch } from './ShareChurch'
import type { ChurchPage } from '@/types'

// /church/:id — a congregation, linkable by anybody.
//
// The one page in this app that is meant to be pasted somewhere else: into a
// church's group chat, onto a slide, behind a QR code by the door. Everything
// else here assumes you arrived through the app; this assumes you arrived from
// your pastor and have never heard of us.
//
// Public on purpose, and gated at the point of ACTION rather than at the door —
// the same shape as /battle/:id, which is the only other route that has to
// convert a stranger. Someone who follows the link sees the real building at
// its real level with the real congregation standing outside it, and is then
// offered the account. A wall in front of that would be advertising a locked
// door; this advertises the church.
//
// Signed in, it is the same page the sheet draws, names and all. `fetchChurchPage`
// picks the RPC; nothing here branches on it beyond who gets a roster.
export default function ChurchPublicScreen() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { ready, profile, mode } = useAuth()
  const [page, setPage] = useState<ChurchPage | null>(null)
  const [loading, setLoading] = useState(true)

  const signedIn = !!profile && mode === 'online'

  useEffect(() => {
    if (!ready) return
    let alive = true
    setLoading(true)
    fetchChurchPage(id).then((p) => {
      if (!alive) return
      setPage(p)
      setLoading(false)
    })
    return () => {
      alive = false
    }
    // `signedIn` is in the deps on purpose: signing in on this page has to
    // re-ask, or the roster stays anonymous until a reload.
  }, [id, ready, signedIn])

  if (!ready || (loading && !page)) {
    return (
      <Page noNav>
        <div style={{ display: 'grid', placeItems: 'center', height: '70dvh' }}>
          <div className="floaty" style={{ fontSize: 56 }}>⛪</div>
        </div>
      </Page>
    )
  }

  if (!page) {
    return (
      <Page noNav>
        <div className="card center" style={{ marginTop: 24 }}>
          <div style={{ fontSize: 40 }}>🕯️</div>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 18, display: 'block', marginTop: 8 }}>
            We couldn't find that church
          </b>
          <p className="dim" style={{ margin: '6px 0 14px', fontSize: 13.5, lineHeight: 1.55 }}>
            The link may be old, or the church may have been removed from the board.
          </p>
          <Button variant="gold" full onClick={() => navigate('/')}>Go to Verse Arcade</Button>
        </div>
      </Page>
    )
  }

  return (
    <Page noNav>
      <div style={{ padding: '4px 0 0' }}>
        <ChurchPageBody
          page={page}
          loading={loading}
          // Names, the "Add info" queue and the landscaping all need an
          // account — the first because 0074 doesn't return usernames, the
          // other two because their RPCs are authenticated-only.
          named={signedIn}
          canAsk={signedIn}
          withYard={signedIn}
          footer={
            signedIn ? (
              <ShareChurch churchId={page.church.id} churchName={page.church.name} />
            ) : (
              <JoinIn churchId={page.church.id} churchName={page.church.name} />
            )
          }
        />
      </div>
    </Page>
  )
}

// The one way in, and the only thing on this page that asks for anything.
//
// It says what the account is FOR on this particular page — the names of the
// people standing on the grass above it — rather than reciting the app's
// feature list, because that is the thing the visitor is looking at and can't
// have yet. Same no-scolding rule as AccountWall: nothing here suggests they
// did something wrong by arriving without one.
function JoinIn({ churchId, churchName }: { churchId: string; churchName: string }) {
  const navigate = useNavigate()
  const go = () => {
    setPendingChurch(churchId)
    navigate('/auth?mode=signup')
  }
  return (
    <div className="card" style={{ marginTop: 4 }}>
      <b style={{ fontFamily: 'var(--font-display)', fontSize: 17, display: 'block' }}>
        Play for {churchName}
      </b>
      <p className="dim" style={{ margin: '6px 0 12px', fontSize: 13.5, lineHeight: 1.55 }}>
        One Bible verse a day, the same one for everybody. The points you earn you can give to this
        church — giving costs you nothing, and it's how the building grows. Make a free account and
        you'll see who else plays here.
      </p>
      <Button variant="gold" full onClick={go}>Create a free account</Button>
      <button
        onClick={() => navigate('/play')}
        className="faint"
        style={{ display: 'block', width: '100%', marginTop: 10, fontSize: 12.5, textDecoration: 'underline' }}
      >
        Or just play today's verse first
      </button>
    </div>
  )
}
