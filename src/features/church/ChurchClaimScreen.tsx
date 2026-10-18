import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { useAuth } from '@/store/auth'
import { useJuice } from '@/juice/useJuice'
import { fetchChurchPage } from '@/store/church'
import {
  clearPendingClaim,
  getPendingClaim,
  previewClaim,
  redeemClaim,
  setPendingClaim,
  type ClaimStatus,
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
export default function ChurchClaimScreen() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const juice = useJuice()
  const { ready, profile, mode } = useAuth()
  const signedIn = !!profile && mode === 'online'

  const [code] = useState(() => {
    const fromHash = decodeURIComponent(location.hash.replace(/^#/, '')).trim()
    if (fromHash) return fromHash
    const pending = getPendingClaim()
    return pending && pending.churchId === id ? pending.code : ''
  })
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
    if (!code) { setStatus('invalid'); return }
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
