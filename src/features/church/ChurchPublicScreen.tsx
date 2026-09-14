import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { useAuth } from '@/store/auth'
import { fetchChurchPage, useChurch } from '@/store/church'
import { setPendingChurch } from './pending'
import { ChurchPageBody } from './ChurchPageBody'
import { ShareChurch } from './ShareChurch'
import { useJuice } from '@/juice/useJuice'
import type { Church, ChurchPage } from '@/types'

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
              <PlayForThis church={page.church} />
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

/**
 * The signed-in half of that, and the half the invite actually needs.
 *
 * This page used to offer a signed-in visitor a SHARE button and nothing else —
 * so a member who followed their pastor's link, made an account, and was
 * carried back here by `ChurchResume` was invited to forward a church they had
 * not joined. To actually join it they had to leave, open the Church tab, and
 * search for their own congregation by name: the exact friction the link exists
 * to remove, sitting one tap from the end of the funnel.
 *
 * Three states, because a person arriving here is in one of exactly three
 * situations and the wrong copy for any of them is worse than none:
 *
 * - **No church.** The join is the primary action, and it is a TAP rather than
 *   something that happens on arrival. Somebody who opened a link to look at a
 *   congregation must not be quietly enrolled in it — that is somebody else's
 *   church, the rule the whole `church_profiles` write path is built on.
 * - **This church.** Unchanged: the share, labelled as the invite, on the card
 *   of the person likeliest to send it.
 * - **A different church.** Named, and offered as a switch in plain words.
 *   Never silent, and never a scold — `join_church` moves you and lifetime
 *   giving is across every church, so nothing is lost, which is exactly why
 *   the swap has to be deliberate rather than a side effect of a tap.
 */
function PlayForThis({ church }: { church: Church }) {
  const navigate = useNavigate()
  const juice = useJuice()
  const mine = useChurch((s) => s.church)
  const loaded = useChurch((s) => s.loaded)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // The store is the Church tab's and this page is reachable without it. No
  // load, and a member who already plays for this church is offered the join.
  useEffect(() => {
    if (!useChurch.getState().loaded) void useChurch.getState().load()
  }, [])

  if (!loaded) return null
  if (mine?.id === church.id) {
    return (
      <ShareChurch
        churchId={church.id}
        churchName={church.name}
        label="🔗 Invite your congregation"
        note="Anyone can open this page — no account needed to look."
      />
    )
  }

  const join = async () => {
    setBusy(true)
    setErr(null)
    const joined = await useChurch.getState().join({
      // Known to us already, so it joins by id — its stored key may be an
      // Overture or OSM id we cannot reconstruct, and re-deriving one would
      // fork a second row for the same building.
      churchId: church.id,
      placeKey: '',
      name: church.name,
      address: church.address ?? null,
      city: church.city ?? null,
      region: church.region ?? null,
      lat: church.lat,
      lng: church.lng,
      miles: 0,
    })
    setBusy(false)
    if (!joined) {
      setErr('That didn’t go through. Try again in a moment.')
      return
    }
    juice.coin()
    navigate('/church')
  }

  const switching = !!mine

  return (
    <div className="card" style={{ marginTop: 4 }}>
      <b style={{ fontFamily: 'var(--font-display)', fontSize: 17, display: 'block' }}>
        Play for {church.name}
      </b>
      <p className="dim" style={{ margin: '6px 0 12px', fontSize: 13.5, lineHeight: 1.55 }}>
        {switching ? (
          <>
            You play for <b style={{ color: 'var(--ink-dim)' }}>{mine!.name}</b> at the moment.
            Moving keeps everything you have earned — your flowers are planted with your lifetime
            giving, which follows you.
          </>
        ) : (
          <>The points you earn you can give to this church. Giving costs you nothing, and it is
          how the building grows.</>
        )}
      </p>
      <Button variant="gold" full onClick={() => void join()} disabled={busy}>
        {busy ? 'One moment…' : switching ? `Switch to ${church.name}` : 'Play for this church'}
      </Button>
      {err && (
        <p className="center" style={{ margin: '8px 0 0', fontSize: 12.5, fontWeight: 700, color: 'var(--gold)' }}>
          {err}
        </p>
      )}
      <ShareChurch
        churchId={church.id}
        churchName={church.name}
        label="🔗 Share this church"
        note="Anyone can open this page — no account needed to look."
      />
    </div>
  )
}
