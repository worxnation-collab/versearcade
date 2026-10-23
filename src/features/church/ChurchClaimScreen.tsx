import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { useAuth } from '@/store/auth'
import { useJuice } from '@/juice/useJuice'
import { fetchChurchPage } from '@/store/church'
import { supabase } from '@/lib/supabase'
import { churchSelfClaimVisible } from '@/lib/commerce'
import { ShareChurch } from './ShareChurch'
import {
  FREE_CLAIM_MIN_MEMBERS,
  claimOptions,
  clearPendingClaim,
  getPendingClaim,
  previewClaim,
  redeemClaim,
  setPendingClaim,
  startFreeClaim,
  startSelfClaim,
  type ClaimOptions,
  type ClaimStatus,
  type FreeClaimMethod,
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
// With NO code it is the self-serve claim instead — `SelfClaim` below: free
// once the page has three members (0137), or paid on the Church Leader plan
// (0134).
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

// ── Self-serve: free (0137) or paid (0134) ──────────────────────────────────
//
// For a church nobody leads here yet. Two doors, side by side:
//
//   • FREE, once the page has FREE_CLAIM_MIN_MEMBERS members. Proven one of two
//     ways: a card saved through Stripe (a $0 SetupIntent — nothing charged,
//     no plan), or a form an operator reviews by hand (an email on the church's
//     own domain is flagged for them, not waved through). Grants leadership of
//     an UNVERIFIED church: congregation totals and one notice on its page.
//   • CHURCH LEADER, the paid plan, exactly as 0134 built it: the billing page,
//     card only, the Founding trial; makes the church verified.
//
// Nothing on this screen grants anything. The card path comes back on
// `?carded=1` and the paid one on `?paid=1`; both wait for the webhook. A
// manual claim comes back to "your request is with us" until it is approved.
//
// The App Store build offers the manual free claim only
// (`churchSelfClaimVisible`): the card and the plan both end on Stripe pages,
// and a form an operator reads is not a storefront.

const ROLES = ['Lead / senior pastor', 'Associate pastor', 'Youth or children’s pastor', 'Church staff', 'Elder or deacon', 'Other leadership']

type Path = 'free' | 'paid'

function SelfClaim({ id }: { id: string }) {
  const navigate = useNavigate()
  const juice = useJuice()
  const [params] = useSearchParams()
  const returned = params.get('paid') === '1' ? 'paid' : params.get('carded') === '1' ? 'card' : null
  const { ready, profile, mode } = useAuth()
  const signedIn = !!profile && mode === 'online'
  const web = churchSelfClaimVisible()

  const [name, setName] = useState<string | null>(null)
  const [city, setCity] = useState<string | null>(null)
  const [opts, setOpts] = useState<ClaimOptions | null | 'loading'>('loading')
  const [waited, setWaited] = useState(0)
  const [path, setPath] = useState<Path | null>(null)
  const [method, setMethod] = useState<FreeClaimMethod>(web ? 'card' : 'manual')
  const [role, setRole] = useState('')
  const [contact, setContact] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [attest, setAttest] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [sent, setSent] = useState<{ domainMatch: boolean } | null>(null)

  useEffect(() => {
    let alive = true
    fetchChurchPage(id).then((p) => {
      if (!alive) return
      setName(p?.church?.name ?? null)
      setCity(p?.church?.city ?? null)
    })
    return () => { alive = false }
  }, [id])

  // Re-read when sign-in lands, and — after the card or the payment — every two
  // seconds until the webhook has made this account leadership.
  useEffect(() => {
    if (!ready) return
    let alive = true
    claimOptions(id).then((o) => { if (alive) setOpts(o) })
    return () => { alive = false }
  }, [id, ready, signedIn, waited])
  const status = opts && opts !== 'loading' ? opts.status : null
  useEffect(() => {
    if (!returned || status === 'you_lead' || waited >= 45) return
    const t = setTimeout(() => setWaited((n) => n + 1), 2000)
    return () => clearTimeout(t)
  }, [returned, status, waited])
  useEffect(() => {
    if (returned && status === 'you_lead') {
      juice.select?.()
      navigate(`/church/${id}/admin`, { replace: true })
    }
  }, [returned, status, id, navigate, juice])

  useEffect(() => {
    if (!signedIn || !supabase) return
    void supabase.auth.getUser().then(({ data }) => {
      const e = data.user?.email
      if (e) setEmail((cur) => cur || e)
    })
  }, [signedIn])

  const church = name ?? 'your church'
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const phoneOk = phone.replace(/\D/g, '').length >= 7
  const needsPhone = path === 'free' && method === 'manual'
  const canSubmit = !!role && contact.trim().length > 0 && emailOk && attest && !busy && (!needsPhone || phoneOk)

  const toAuth = (signup: boolean) => {
    juice.select?.()
    setPendingClaim(id, '')
    navigate(signup ? '/auth?mode=signup' : '/auth')
  }

  const failText = (reason: string, members?: number) =>
    reason === 'has_leader' ? 'This church already has leadership here.'
      : reason === 'you_lead' ? 'You already lead this church.'
      : reason === 'paying' ? 'This church already has a subscription.'
      : reason === 'too_few_members' ? `The free claim opens at ${FREE_CLAIM_MIN_MEMBERS} members — this page has ${members ?? 'fewer'}.`
      : reason === 'rate_limited' ? 'That’s a lot of claims for one day — try again tomorrow.'
      : reason === 'bad_phone' ? 'Add a phone number we can reach you on.'
      : reason === 'bad_input' ? 'Check your name and email and try again.'
      : reason === 'setup_failed' ? 'We couldn’t open the card check just now. Try again, or choose “Verify by hand”.'
      : 'That didn’t go through — check your connection and try again.'

  const go = async () => {
    setBusy(true)
    setErr(null)
    const form = { role, name: contact.trim(), email: email.trim(), phone: phone.trim() }
    if (path === 'paid') {
      const r = await startSelfClaim(id, role, form.name, form.email)
      if (!r.ok) {
        setBusy(false)
        setErr(failText(r.reason))
        void claimOptions(id).then(setOpts)
        return
      }
      juice.select?.()
      location.href = r.billingUrl
      return
    }
    const r = await startFreeClaim(id, method, form)
    if (!r.ok) {
      setBusy(false)
      setErr(failText(r.reason, r.members))
      void claimOptions(id).then(setOpts)
      return
    }
    juice.select?.()
    if (r.method === 'card') {
      location.href = r.setupUrl
      return
    }
    setBusy(false)
    setSent({ domainMatch: r.domainMatch })
  }

  const para = (text: React.ReactNode) => (
    <p className="dim" style={{ margin: '8px 0 16px', fontSize: 14, lineHeight: 1.55 }}>{text}</p>
  )

  const o = opts && opts !== 'loading' ? opts : null
  let body: React.ReactNode
  if (!ready || opts === 'loading') {
    body = <div className="skeleton" style={{ height: 160, borderRadius: 18 }} />
  } else if (returned && status !== 'you_lead') {
    const what = returned === 'card' ? 'Card saved' : 'Payment received'
    body = waited < 45 ? (
      <>
        {para(`${what} — setting you up as ${church}’s leadership. This takes a few seconds.`)}
        <div className="skeleton" style={{ height: 8, borderRadius: 8 }} />
      </>
    ) : (
      <>
        {para(`${what}, but setting up your tools is taking longer than usual. Give it a minute and try again — nothing is lost.`)}
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
  } else if (!o || status !== 'open') {
    body = para(status === 'not_found' ? 'We couldn’t find that church.' : 'We couldn’t check this church just now. Check your connection and try again.')
  } else if (!web && !o.freeOk) {
    body = para('Claiming a church page is done on the web, from a computer or a phone’s browser.')
  } else if (sent || (o.pendingManual && path === null)) {
    body = (
      <>
        {para(
          <>
            Your request is with us. We&rsquo;ll check it — usually by a quick call or an email to the church — and you&rsquo;ll
            find your tools on {church}&rsquo;s page once it&rsquo;s approved.
            {sent?.domainMatch ? ' Your email is on the church’s own domain, which makes this quicker.' : ''}
          </>,
        )}
        {web && (
          <Button variant="secondary" full onClick={() => { setSent(null); setPath('free'); setMethod('card') }}>
            Skip the wait — verify with a card instead
          </Button>
        )}
      </>
    )
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
  } else if (path === null) {
    body = (
      <div style={{ display: 'grid', gap: 10 }}>
        <p className="dim" style={{ margin: '8px 0 4px', fontSize: 14, lineHeight: 1.55 }}>
          You&rsquo;re signed in as <b>@{profile!.username}</b>. How would you like to claim {church}?
        </p>
        {o.freeOk ? (
          <Button variant="gold" full onClick={() => { juice.select?.(); setPath('free') }}>Claim it free</Button>
        ) : (
          <div className="card" style={{ padding: '10px 12px', display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>
              <b>The free claim opens at {FREE_CLAIM_MIN_MEMBERS} members.</b> {church} has {o.members} so far — send the
              page to your congregation and it opens by itself.
            </div>
            <ShareChurch churchId={id} churchName={church} city={city} label="Invite your congregation" />
          </div>
        )}
        {web && (
          <Button variant={o.freeOk ? 'secondary' : 'gold'} full onClick={() => { juice.select?.(); setPath('paid') }}>
            Choose the Church Leader plan
          </Button>
        )}
      </div>
    )
  } else {
    const label: React.CSSProperties = { display: 'grid', gap: 6, fontSize: 12.5, fontWeight: 700, color: 'var(--ink-dim)' }
    body = (
      <div style={{ display: 'grid', gap: 12 }}>
        <button className="pill" style={{ justifySelf: 'start', fontSize: 12 }} disabled={busy} onClick={() => { setPath(null); setErr(null) }}>
          ← {path === 'free' ? 'Free claim' : 'Church Leader plan'}
        </button>
        {path === 'free' && (
          <div role="radiogroup" aria-label="How to verify" style={{ display: 'grid', gap: 8 }}>
            {web && (
              <MethodOption
                on={method === 'card'}
                onPick={() => setMethod('card')}
                title="Card on file"
                detail="Stripe saves a card to confirm a real person is claiming. It is not charged — there is no plan and no price. Your tools open straight away."
              />
            )}
            <MethodOption
              on={method === 'manual'}
              onPick={() => setMethod('manual')}
              title="Verify by hand"
              detail="We check with the church by phone or email first, usually within a couple of days. An email on your church’s own domain is quickest."
            />
          </div>
        )}
        {path === 'paid' && (
          <p className="dim" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>
            Next you&rsquo;ll choose a plan on our billing page; your tools open as soon as checkout is done.
          </p>
        )}
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
          Email{needsPhone ? ' — your church address if you have one' : ''}
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} autoComplete="email" disabled={busy} />
        </label>
        {needsPhone && (
          <label style={label}>
            Phone
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} autoComplete="tel" disabled={busy} />
          </label>
        )}
        <label style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', gap: 8, alignItems: 'start', fontSize: 13, lineHeight: 1.45 }}>
          <input type="checkbox" checked={attest} onChange={(e) => setAttest(e.target.checked)} disabled={busy} style={{ width: 16, height: 16, margin: '2px 0 0', padding: 0 }} />
          <span>I&rsquo;m on the staff or leadership of {church} and can set it up on its behalf.</span>
        </label>
        <Button variant="gold" full disabled={!canSubmit} onClick={go}>
          {busy ? 'One moment…'
            : path === 'paid' ? 'Continue to choose a plan'
            : method === 'card' ? 'Continue to save a card' : 'Send for review'}
        </Button>
        {err && <p style={{ color: 'var(--coral)', fontSize: 13, margin: 0 }}>{err}</p>}
        <p className="faint" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.45 }}>
          Every claim is reviewed, and one made for a church you don&rsquo;t lead is taken back.
        </p>
      </div>
    )
  }

  const showExplainer = status === 'open' && !returned && !sent
  return (
    <Page noNav>
      <div className="center" style={{ paddingTop: 28 }}>
        <div style={{ fontSize: 44 }}>⛪</div>
        <h1 style={{ fontSize: 24, margin: '6px 0 0', lineHeight: 1.2 }}>
          {status === 'you_lead' ? church : `Lead ${church} on Verse Arcade`}
        </h1>
      </div>
      <div className="card" style={{ marginTop: 16 }}>{body}</div>
      {showExplainer && <ClaimExplainer web={web} members={o?.members ?? 0} />}
      <div style={{ height: 24 }} />
    </Page>
  )
}

function MethodOption({ on, onPick, title, detail }: { on: boolean; onPick: () => void; title: string; detail: string }) {
  return (
    <button
      role="radio"
      aria-checked={on}
      onClick={onPick}
      className="card"
      style={{
        textAlign: 'left', padding: '10px 12px', display: 'grid', gap: 3, minWidth: 0,
        ...(on ? { background: 'var(--select)', borderColor: 'var(--select)' } : null),
      }}
    >
      <b style={{ fontSize: 13.5 }}>{on ? '● ' : '○ '}{title}</b>
      <span style={{ fontSize: 12, lineHeight: 1.45, color: 'var(--ink-dim)' }}>{detail}</span>
    </button>
  )
}

// What a claim is, said plainly before anybody fills anything in: what's free,
// what the plan adds, and the rule every leader tool here keeps. No price on
// this screen in either build — the plan's price lives on the billing page.
function ClaimExplainer({ web, members }: { web: boolean; members: number }) {
  const head: React.CSSProperties = { fontFamily: 'var(--font-display)', fontSize: 15, display: 'block' }
  const li: React.CSSProperties = { margin: '4px 0 0', fontSize: 13, lineHeight: 1.5 }
  return (
    <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
      <div className="card" style={{ padding: '12px 14px' }}>
        <b style={head}>Free claim</b>
        <div className="faint" style={{ fontSize: 11.5 }}>
          Once the page has {FREE_CLAIM_MIN_MEMBERS} members{members >= FREE_CLAIM_MIN_MEMBERS ? ' — yours does' : ''}
        </div>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          <li style={li}>Your congregation&rsquo;s totals: members, how many played this week, the average streak.</li>
          <li style={li}>One notice on your church&rsquo;s page, changed whenever you like.</li>
          <li style={li}>{web ? 'Verified by a card on file (never charged) or by hand.' : 'Verified by hand.'}</li>
        </ul>
      </div>
      {web && (
        <div className="card" style={{ padding: '12px 14px' }}>
          <b style={head}>Church Leader plan</b>
          <div className="faint" style={{ fontSize: 11.5 }}>Paid · Founding Churches free through Easter 2027</div>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            <li style={li}>Everything in the free claim, and a verified badge.</li>
            <li style={li}>Your own daily verse and questions, series and pastor&rsquo;s notes.</li>
            <li style={li}>Each member&rsquo;s play by name, for your leadership only.</li>
          </ul>
          <p className="faint" style={{ margin: '8px 0 0', fontSize: 12, lineHeight: 1.45 }}>
            Or the Church Suite: all of this plus verse, series and notice cards ready to post, in one plan.
          </p>
        </div>
      )}
      <div className="card" style={{ padding: '12px 14px', borderColor: 'var(--edge)' }}>
        <b style={head}>No one is shamed here</b>
        <p style={{ ...li, margin: '6px 0 0' }}>
          Verse Arcade never ranks one member against another, and never gives you a list of who hasn&rsquo;t played.
          On the free claim every number is a total for the whole congregation.{web ? ' On the plan, member names are for your leadership alone, in the order people joined — never sorted into who is behind.' : ''}
          {' '}Wrong answers teach, and nobody loses for missing a day — your church page should feel like that too.
        </p>
      </div>
    </div>
  )
}
