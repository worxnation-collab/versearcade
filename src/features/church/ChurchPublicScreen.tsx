import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { useAuth } from '@/store/auth'
import { fetchChurchPage } from '@/store/church'
import { setPendingChurch } from './pending'
import { ChurchPageBody } from './ChurchPageBody'
import { ShareChurch } from './ShareChurch'
import { useChurchExtras } from './ChurchExtras'
import { JoinChurchButton } from './JoinChurchButton'
import { ChurchInviteQR } from './ChurchInviteQR'
import { churchSelfClaimVisible } from '@/lib/commerce'
import { selfClaimStatus } from '@/store/churchClaim'
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
//
// Signed out it is laid out as a FRONT DOOR (2026-10-21): the logo and name
// large, the building, then the church's own words — this week's line and its
// service times — directly under it (`lead`), and ONE call to action, pinned
// to the bottom of the screen so it is never a scroll away: "Join {church} on
// Verse Arcade". The explanation of what joining means stays at the end of the
// page as text, without a second button competing with the first.
export default function ChurchPublicScreen() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { ready, profile, mode } = useAuth()
  const [page, setPage] = useState<ChurchPage | null>(null)
  const [loading, setLoading] = useState(true)

  const signedIn = !!profile && mode === 'online'
  // Badge, logo, announcement, giving link and membership (0117). Re-asked on
  // sign-in so `isMember` is about the person now looking.
  const extras = useChurchExtras(id, signedIn)

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
          // Names, WRITING to the page and the landscaping all need an
          // account — the first because 0074 doesn't return usernames, the
          // other two because their RPCs are authenticated-only. The
          // published facts (service times, website…) are drawn either way:
          // `canAsk` hides the form, not the page.
          named={signedIn}
          canAsk={signedIn}
          withYard={signedIn}
          // A church's own front door compares it with nobody. The rank only
          // means something on the board it came from, so the sheet keeps it.
          showRank={signedIn}
          lead={!signedIn}
          extras={extras}
          footer={
            signedIn ? (
              <>
                <JoinChurchButton church={page.church} isMember={!!extras?.isMember} />
                {extras?.isAdmin && (
                  <div style={{ marginTop: 12 }}>
                    <Button variant="secondary" full onClick={() => navigate(`/church/${page.church.id}/admin`)}>
                      ⛪ Leadership tools
                    </Button>
                  </div>
                )}
                <ShareChurch churchId={page.church.id} churchName={page.church.name} city={page.church.city} />
                {/* The QR code is the verified package's; the link above is
                    every church's, free, and stays that way. */}
                {extras?.verified && <ChurchInviteQR churchId={page.church.id} churchName={page.church.name} />}
                <ClaimLink churchId={page.church.id} />
              </>
            ) : (
              <>
                <JoinIn churchName={page.church.name} verified={!!extras?.verified} />
                <ClaimLink churchId={page.church.id} />
              </>
            )
          }
        />
      </div>
      {!signedIn && (
        <>
          {/* Room for the pinned bar, so it never covers the last line. */}
          <div style={{ height: 116 }} />
          <JoinBar churchId={page.church.id} churchName={page.church.name} />
        </>
      )}
    </Page>
  )
}

/** "Join {church}" — or "this church" when the name would wrap the button on
 *  a 320px phone (measured: a 22-character name wraps there, 16 does not). The
 *  name is the page's own headline, so the short form loses nothing; "on Verse
 *  Arcade" rides the line under the button rather than wrapping it. */
function joinLabel(churchName: string): string {
  return churchName.length <= 16 ? `Join ${churchName}` : 'Join this church'
}

// The one thing this page asks for, pinned where a thumb already is. It parks
// the church (`setPendingChurch`) so the visitor lands back here after sign-up
// — through an OAuth reload too — via `ChurchResume`, and is offered the real
// Join button with the congregation named. Joining itself only ever happens on
// that tap; this button creates the account.
function JoinBar({ churchId, churchName }: { churchId: string; churchName: string }) {
  const navigate = useNavigate()
  const go = () => {
    setPendingChurch(churchId)
    navigate('/auth?mode=signup')
  }
  return (
    <div
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 40,
        padding: '12px 16px calc(12px + env(safe-area-inset-bottom))',
        background: 'linear-gradient(to top, var(--bg-0) 70%, transparent)',
      }}
    >
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <Button variant="gold" full onClick={go}>{joinLabel(churchName)}</Button>
        <p className="faint center" style={{ margin: '6px 0 0', fontSize: 11.5 }}>
          Free on Verse Arcade · one verse a day
        </p>
      </div>
    </div>
  )
}

// What joining means, at the end of the page. It says what the account is FOR
// on this particular page — the names of the people standing on the grass above
// it — rather than reciting the app's feature list, because that is the thing
// the visitor is looking at and can't have yet. Same no-scolding rule as
// AccountWall: nothing here suggests they did something wrong by arriving
// without one. Its button moved to the pinned `JoinBar`: one ask, not two.
function JoinIn({ churchName, verified }: { churchName: string; verified: boolean }) {
  const navigate = useNavigate()
  return (
    <div className="card" style={{ marginTop: 4 }}>
      <b style={{ fontFamily: 'var(--font-display)', fontSize: 17, display: 'block' }}>
        Play for {churchName}
      </b>
      <p className="dim" style={{ margin: '6px 0 12px', fontSize: 13.5, lineHeight: 1.55 }}>
        {verified
          ? `One Bible verse a day — on the days ${churchName} picks one, theirs — and a quick quiz on it.`
          : 'One Bible verse a day, the same one for everybody, and a quick quiz on it.'}{' '}
        The points you earn you can give to this church — giving costs you nothing, and it's how the
        building grows. Make a free account and you'll see who else plays here.
      </p>
      <button
        onClick={() => navigate('/play')}
        className="faint"
        style={{ display: 'block', width: '100%', marginTop: 2, fontSize: 12.5, textDecoration: 'underline' }}
      >
        Or just play today's verse first
      </button>
    </div>
  )
}

// The quiet door for a pastor: "Lead this church?" under everything else, and
// only while the church can actually be claimed (nobody leads it here, no
// subscription) — a link to a form that would refuse them is a dead end. Web
// only (`churchSelfClaimVisible`): the claim ends on a page with prices.
function ClaimLink({ churchId }: { churchId: string }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!churchSelfClaimVisible()) return
    let alive = true
    selfClaimStatus(churchId).then((s) => { if (alive) setOpen(s === 'open') })
    return () => { alive = false }
  }, [churchId])
  if (!open) return null
  return (
    <button
      onClick={() => navigate(`/church/${churchId}/claim`)}
      className="faint"
      style={{ display: 'block', width: '100%', marginTop: 14, fontSize: 12.5, textDecoration: 'underline' }}
    >
      Lead this church? Claim its page
    </button>
  )
}
