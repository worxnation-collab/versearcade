import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { useAuth } from '@/store/auth'
import { useJuice } from '@/juice/useJuice'
import { fetchChurchPage } from '@/store/church'
import { supabase } from '@/lib/supabase'
import { churchSelfClaimVisible } from '@/lib/commerce'
import {
  clearPendingClaim,
  getPendingClaim,
  previewClaim,
  redeemClaim,
  selfClaimStatus,
  setPendingClaim,
  startSelfClaim,
  type ClaimStatus,
  type SelfClaimStatus,
} from '@/store/churchClaim'

// /church/:id/claim#<code> — a pastor's one-time invite to lead their church
// (0121). The operator sends the link; this screen turns it into a claim.
//
// Public, like /church/:id: a pastor without an account is asked to make one
// and comes straight back here (the code is parked with `setPendingClaim` and
// `ChurchResume` returns them). Nothing is granted until a signed-in person taps
// the button, and the server checks the code, the church and the expiry.
//
// The code is read from the URL fragment once and then stripped from the
// address bar, so it can't be shared by accident in a screenshot or a copied
// link once it has been used.
//
// With NO code it is the self-serve claim (0134) instead — `SelfClaim` below.
export default function ChurchClaimScreen() {
  const { id = '' } = useParams()
  const [code] = useState(() => {
    const fromHash = decodeURIComponent(location.hash.replace(/^#/, '')).trim()
    if (fromHash) return fromHash
    const pending = getPendingClaim()
    return pending && pending.churchId === id ? pending.code : ''
  })
  return code ? <InviteClaim id={id} code={code} /> : <SelfClaim id={id} />
}

function InviteClaim({ id, code }: { id: string; code: string }) {
  const navigate = useNavigate()
  const juice = useJuice()
  const { ready, profile, mode } = useAuth()
  const signedIn = !!profile && mode === 'online'
  const [name, setName] = useState<string | null>(null)
  const [status, setStatus] = useState<ClaimStatus | null | 'loading'>('loading')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (location.hash) history.replaceState(history.state, '', location.pathname)
  }, [])

  useEffect(() => {
    let alive = true
    fetchChurchPage(id).then((p) => { if (alive) setName(p?.church?.name ?? null) })
    previewClaim(id, code).then((s) => { if (alive) setStatus(s) })
    return () => { alive = false }
  }, [id, code])

  const toAuth = (signup: boolean) => {
    juice.select?.()
    setPendingClaim(id, code)
    navigate(signup ? '/auth?mode=signup' : '/auth')
  }

  const claim = async () => {
    setBusy(true)
    setErr(null)
    const r = await redeemClaim(id, code)
    setBusy(false)
    if (!r.ok) {
      setErr(
        r.reason === 'used' ? 'This link has already been used.'
          : r.reason === 'expired' ? 'This link has expired — ask us for a new one.'
          : r.reason === 'invalid' ? 'This link isn’t valid for this church.'
          : 'That didn’t go through — check your connection and try again.',
      )
      return
    }
    clearPendingClaim()
    juice.select?.()
    navigate(`/church/${id}/admin`, { replace: true })
  }

  const church = name ?? 'your church'

  let body: React.ReactNode
  if (!ready || status === 'loading') {
    body = <div className="skeleton" style={{ height: 160, borderRadius: 18 }} />
  } else if (status !== 'valid') {
    body = (
      <>
        <p className="dim" style={{ margin: '8px 0 16px', fontSize: 14, lineHeight: 1.55 }}>
          {status === 'used'
            ? 'This invite has already been used. If that was you, your leadership tools are on your church’s page.'
            : status === 'expired'
              ? 'This invite has expired. Reply to the email it came in and we’ll send a fresh one.'
              : status === null
                ? 'We couldn’t check this invite just now. Check your connection and try again.'
                : 'This invite link isn’t complete. Open it again from the email it came in.'}
        </p>
        <Button variant="secondary" full onClick={() => navigate(`/church/${id}`)}>Go to the church page</Button>
      </>
    )
  } else if (!signedIn) {
    body = (
      <>
        <p className="dim" style={{ margin: '8px 0 16px', fontSize: 14, lineHeight: 1.55 }}>
          Make a free account (or sign in) and you&rsquo;ll come straight back here to finish. It takes
          about a minute.
        </p>
        <div style={{ display: 'grid', gap: 10 }}>
          <Button variant="gold" full onClick={() => toAuth(true)}>Create my account</Button>
          <Button variant="secondary" full onClick={() => toAuth(false)}>I already have one — sign in</Button>
        </div>
      </>
    )
  } else {
    body = (
      <>
        <p className="dim" style={{ margin: '8px 0 16px', fontSize: 14, lineHeight: 1.55 }}>
          You&rsquo;re signed in as <b>@{profile!.username}</b>. Claiming makes this account leadership of{' '}
          {church}: you can edit its page and, as a Founding Church, set its daily verse.
        </p>
        <Button variant="gold" full disabled={busy} onClick={claim}>
          {busy ? 'Claiming…' : `Claim leadership of ${church}`}
        </Button>
        {err && <p style={{ color: 'var(--coral)', fontSize: 13, margin: '10px 0 0' }}>{err}</p>}
      </>
    )
  }

  return (
    <Page noNav>
      <div className="center" style={{ paddingTop: 28 }}>
        <div style={{ fontSize: 44 }}>⛪</div>
        <h1 style={{ fontSize: 24, margin: '6px 0 0', lineHeight: 1.2 }}>
          {status === 'valid' ? `You’re invited to lead ${church}` : 'Church leadership invite'}
        </h1>
      </div>
      <div className="card" style={{ marginTop: 16 }}>{body}</div>
    </Page>
  )
}

// ── Self-serve: claim → pay → verified (0134) ───────────────────────────────
//
// For a church nobody leads here yet. The claimant says who they are, gets a
// one-time token, and chooses a plan on the web billing page (card only); the
// payment landing is what makes them leadership, so nothing on this screen
// grants anything. Stripe brings them back to `?paid=1`, which waits for the
// webhook and then opens their tools.
//
// A church that already has leadership, or a subscription, is not claimable
// this way — that is a stranger taking a congregation from its real leaders,
// and it still goes through the queue ("Add info" on the church's page). The
// App Store build offers none of this (`churchSelfClaimVisible`): it ends at a
// page with prices.

const ROLES = ['Lead / senior pastor', 'Associate pastor', 'Youth or children’s pastor', 'Church staff', 'Elder or deacon', 'Other leadership']

function SelfClaim({ id }: { id: string }) {
  const navigate = useNavigate()
  const juice = useJuice()
  const [params] = useSearchParams()
  const paid = params.get('paid') === '1'
  const { ready, profile, mode } = useAuth()
  const signedIn = !!profile && mode === 'online'

  const [name, setName] = useState<string | null>(null)
  const [status, setStatus] = useState<SelfClaimStatus | null | 'loading'>('loading')
  const [waited, setWaited] = useState(0)
  const [role, setRole] = useState('')
  const [contact, setContact] = useState('')
  const [email, setEmail] = useState('')
  const [attest, setAttest] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetchChurchPage(id).then((p) => { if (alive) setName(p?.church?.name ?? null) })
    return () => { alive = false }
  }, [id])

  // Re-read when sign-in lands, and — after paying — every two seconds until
  // the webhook has made this account leadership (about a minute at most).
  useEffect(() => {
    if (!ready) return
    let alive = true
    selfClaimStatus(id).then((s) => { if (alive) setStatus(s) })
    return () => { alive = false }
  }, [id, ready, signedIn, waited])
  useEffect(() => {
    if (!paid || status === 'you_lead' || waited >= 45) return
    const t = setTimeout(() => setWaited((n) => n + 1), 2000)
    return () => clearTimeout(t)
  }, [paid, status, waited])
  useEffect(() => {
    if (paid && status === 'you_lead') {
      juice.select?.()
      navigate(`/church/${id}/admin`, { replace: true })
    }
  }, [paid, status, id, navigate, juice])

  useEffect(() => {
    if (!signedIn || !supabase) return
    void supabase.auth.getUser().then(({ data }) => {
      const e = data.user?.email
      if (e) setEmail((cur) => cur || e)
    })
  }, [signedIn])

  const church = name ?? 'your church'
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const ready2 = !!role && contact.trim().length > 0 && emailOk && attest && !busy

  const toAuth = (signup: boolean) => {
    juice.select?.()
    setPendingClaim(id, '')
    navigate(signup ? '/auth?mode=signup' : '/auth')
  }

  const go = async () => {
    setBusy(true)
    setErr(null)
    const r = await startSelfClaim(id, role, contact.trim(), email.trim())
    if (!r.ok) {
      setBusy(false)
      setErr(
        r.reason === 'has_leader' ? 'This church already has leadership here.'
          : r.reason === 'you_lead' ? 'You already lead this church.'
          : r.reason === 'paying' ? 'This church already has a subscription.'
          : r.reason === 'rate_limited' ? 'That’s a lot of claims for one day — try again tomorrow.'
          : r.reason === 'bad_input' ? 'Check your name and email and try again.'
          : 'That didn’t go through — check your connection and try again.',
      )
      if (r.reason === 'has_leader' || r.reason === 'paying' || r.reason === 'you_lead') void selfClaimStatus(id).then(setStatus)
      return
    }
    juice.select?.()
    location.href = r.billingUrl
  }

  const para = (text: React.ReactNode) => (
    <p className="dim" style={{ margin: '8px 0 16px', fontSize: 14, lineHeight: 1.55 }}>{text}</p>
  )

  let body: React.ReactNode
  if (!churchSelfClaimVisible()) {
    body = para('Claiming a church page is done on the web, from a computer or a phone’s browser.')
  } else if (!ready || status === 'loading') {
    body = <div className="skeleton" style={{ height: 160, borderRadius: 18 }} />
  } else if (paid && status !== 'you_lead') {
    body = waited < 45 ? (
      <>
        {para(`Payment received — setting you up as ${church}’s leadership. This takes a few seconds.`)}
        <div className="skeleton" style={{ height: 8, borderRadius: 8 }} />
      </>
    ) : (
      <>
        {para('Your payment went through, but setting up your tools is taking longer than usual. Give it a minute and try again — nothing is lost.')}
        <Button variant="secondary" full onClick={() => setWaited(0)}>Check again</Button>
      </>
    )
  } else if (status === 'you_lead') {
    body = (
      <>
        {para(`You lead ${church} on Verse Arcade.`)}
        <Button variant="gold" full onClick={() => navigate(`/church/${id}/admin`)}>⛪ Open leadership tools</Button>
      </>
    )
  } else if (status === 'has_leader' || status === 'paying') {
    body = (
      <>
        {para(`${church} already has leadership on Verse Arcade. If that isn’t right, tell us with “Add info” on the church’s page and we’ll sort it out by hand.`)}
        <Button variant="secondary" full onClick={() => navigate(`/church/${id}`)}>Go to the church page</Button>
      </>
    )
  } else if (status !== 'open') {
    body = para(status === 'not_found' ? 'We couldn’t find that church.' : 'We couldn’t check this church just now. Check your connection and try again.')
  } else if (!signedIn) {
    body = (
      <>
        {para('Make a free account (or sign in) and you’ll come straight back here to finish. It takes about a minute.')}
        <div style={{ display: 'grid', gap: 10 }}>
          <Button variant="gold" full onClick={() => toAuth(true)}>Create my account</Button>
          <Button variant="secondary" full onClick={() => toAuth(false)}>I already have one — sign in</Button>
        </div>
      </>
    )
  } else {
    const label: React.CSSProperties = { display: 'grid', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--ink-dim)' }
    body = (
      <div style={{ display: 'grid', gap: 12 }}>
        <p className="dim" style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.55 }}>
          As <b>@{profile!.username}</b>, you&rsquo;ll set {church}&rsquo;s daily verse and notes, post notices,
          and see how your congregation is playing. Next you&rsquo;ll choose a plan; your tools open as soon as
          checkout is done.
        </p>
        <label style={label}>
          Your role
          <select value={role} onChange={(e) => setRole(e.target.value)} disabled={busy}>
            <option value="" disabled>Choose one</option>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </label>
        <label style={label}>
          Your name
          <input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={120} autoComplete="name" disabled={busy} />
        </label>
        <label style={label}>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} autoComplete="email" disabled={busy} />
        </label>
        <label style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', gap: 8, alignItems: 'start', fontSize: 13, lineHeight: 1.45 }}>
          <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} disabled={busy} style={{ width: 16, height: 16, margin: '2px 0 0', padding: 0 }} />
          <span>I&rsquo;m on the staff or leadership of {church} and can set it up on its behalf.</span>
        </label>
        <Button variant="gold" full disabled={!ready2} onClick={go}>
          {busy ? 'One moment…' : 'Continue to choose a plan'}
        </Button>
        {err && <p style={{ color: 'var(--coral)', fontSize: 13, margin: 0 }}>{err}</p>}
        <p className="faint" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45 }}>
          Every claim is reviewed afterwards, and one made for a church you don&rsquo;t lead is taken back.
        </p>
      </div>
    )
  }

  return (
    <Page noNav>
      <div className="center" style={{ paddingTop: 28 }}>
        <div style={{ fontSize: 44 }}>⛪</div>
        <h1 style={{ fontSize: 24, margin: '6px 0 0', lineHeight: 1.2 }}>
          {status === 'you_lead' ? church : `Lead ${church} on Verse Arcade`}
        </h1>
      </div>
      <div className="card" style={{ marginTop: 16 }}>{body}</div>
    </Page>
  )
}
