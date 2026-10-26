import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Browser } from '@capacitor/browser'
import { churchApplePlansVisible, churchPlansLink } from '@/lib/commerce'
import { useIap, type ChurchPlanOutcome } from '@/store/iap'
import type { ChurchPlanInterval } from '@/lib/iap'
import { noteChurchPlanTap } from '@/store/churchAdmin'
import { useJuice } from '@/juice/useJuice'

// "For Churches" — the App Store build's quiet door to church plans.
//
// On the web this renders NOTHING: the site already shows the plans, prices,
// the Suite upgrade and Stripe's portal, and a second door would be noise.
// In the app, `churchPlansLink()` (lib/commerce — the only place the decision
// lives) picks one of two shapes, and neither carries a price or a plan name:
//
//   external — US storefront, flag on: one line saying where plans live, and
//              a link that opens the web page in the in-app browser
//              (SFSafariViewController), the way native OAuth already does.
//   ask      — everywhere else: no link out. `onAsk` if the caller has its own
//              inquiry form (the For Churches page), else the same form on
//              /churches, prefilled through the router state it already reads.
//
// On the leadership screen (`subscribe` passed) an unverified church also gets
// the Verified Church plan through Apple (0139) — in EVERY storefront, because
// that is in-app purchase rather than a link out. It shows Apple's own price
// and period (Guideline 3.1.2 wants both, plus the terms and privacy links, on
// the screen that sells a subscription), and only once StoreKit has returned
// the product (`churchApplePlansVisible`). Which church it verifies is decided
// by the server, after it asks RevenueCat; this card only names the church.
//
// Deliberately a small card and never a banner, a dot or a toast: it is for
// the handful of people running a church, and it sits only on surfaces those
// people already opened. No player screen mounts it.

const SITE = 'https://versearcade.org'

export function ChurchPlansEntry({ churchId, churchName, onAsk, subscribe }: {
  /** A church's own leadership screen: open THAT church's web tools. */
  churchId?: string
  churchName?: string
  /** The caller's own inquiry form, used instead of navigating to /churches. */
  onAsk?: () => void
  /** Leadership screen only: offer the plan through Apple while unverified. */
  subscribe?: { verified: boolean; onChanged: () => void }
}) {
  const juice = useJuice()
  const navigate = useNavigate()
  // Subscribed so the card re-renders when the storefront arrives.
  useIap((s) => s.storefront)
  useIap((s) => s.churchPlans)
  const load = useIap((s) => s.load)
  const [failed, setFailed] = useState(false)

  // The storefront is read with the products; a leader who never opened the
  // Skins shelf would otherwise never have asked. A no-op when already loaded,
  // when loading, and wherever IAP isn't available.
  useEffect(() => { void load() }, [load])

  const kind = churchPlansLink()
  if (kind === 'none') return null

  const open = async () => {
    juice.select?.()
    setFailed(false)
    // The web admin page carries this church's billing once signed in there;
    // without a church, the For Churches page carries the plans.
    const url = churchId ? `${SITE}/church/${encodeURIComponent(churchId)}/admin` : `${SITE}/churches`
    // Counted only on the leadership screen, where there is a church to count
    // it against. Not awaited: the browser opens on this tap regardless.
    if (churchId && subscribe) noteChurchPlanTap(churchId, 'web', null)
    try {
      await Browser.open({ url })
    } catch {
      setFailed(true)
    }
  }

  const ask = () => {
    juice.select?.()
    if (onAsk) return onAsk()
    navigate('/churches', { state: { prefill: `Asking about church plans${churchName ? ` for ${churchName}` : ''}.` } })
  }

  return (
    <section className="card" style={{ padding: '12px 14px', marginBottom: 12, display: 'grid', gap: 6 }} aria-labelledby="church-plans-title">
      <b id="church-plans-title" style={{ fontSize: 14 }}>For Churches</b>
      {churchId && subscribe && !subscribe.verified && churchApplePlansVisible() && (
        <ApplePlans churchId={churchId} churchName={churchName} onChanged={subscribe.onChanged} />
      )}
      {kind === 'external' ? (
        <>
          <p className="dim" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45 }}>
            Church plans are managed on the web for invoicing and multi-user access.
          </p>
          <button className="pill" style={{ justifySelf: 'start' }} onClick={open}>View plans and billing →</button>
          <div className="faint" style={{ fontSize: 11, lineHeight: 1.4 }}>
            {failed ? 'Couldn’t open it just now. Try again in a moment.' : 'Opens versearcade.org.'}
          </div>
        </>
      ) : (
        <>
          <p className="dim" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45 }}>
            Church plans are set up with our team directly.
          </p>
          <button className="pill" style={{ justifySelf: 'start' }} onClick={ask}>Contact us about church plans</button>
        </>
      )}
    </section>
  )
}

const OUTCOME: Record<Exclude<ChurchPlanOutcome, 'verified' | 'cancelled'>, string> = {
  failed: 'That didn’t go through, and nothing was charged. Try again in a moment.',
  pending: 'Apple confirmed it. It can take a minute to reach us — tap Restore shortly if your church isn’t verified yet.',
  not_subscribed: 'No Verified Church subscription was found on this Apple ID.',
  bound_elsewhere: 'This Apple ID already verifies another church you lead. One subscription covers one church.',
  already_subscribed: 'Another leader already subscribes for this church through Apple.',
  not_leadership: 'Only this church’s leadership can subscribe for it.',
}

const TERMS = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'
const PRIVACY = 'https://versearcade.org/privacy.html'

function ApplePlans({ churchId, churchName, onChanged }: { churchId: string; churchName?: string; onChanged: () => void }) {
  const juice = useJuice()
  const plans = useIap((s) => s.churchPlans)
  const buy = useIap((s) => s.buyChurchPlan)
  const restore = useIap((s) => s.restoreChurchPlan)
  const [busy, setBusy] = useState<ChurchPlanInterval | 'restore' | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const done = (r: ChurchPlanOutcome) => {
    setBusy(null)
    if (r === 'cancelled') return
    if (r === 'verified') {
      juice.select?.()
      setNote(null)
      onChanged()
      return
    }
    setNote(OUTCOME[r])
  }

  const link = (href: string, label: string) => (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink-dim)' }}>{label}</a>
  )

  return (
    <div style={{ display: 'grid', gap: 6, paddingBottom: 6, borderBottom: '1px solid var(--edge)' }}>
      <p className="dim" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.45 }}>
        Verified Church for {churchName ?? 'your church'}: your own verse and questions, series, notes, and your members by name.
      </p>
      {plans.map((p) => (
        <button
          key={p.interval}
          className="pill"
          style={{ justifySelf: 'start' }}
          disabled={busy !== null}
          onClick={async () => {
            juice.select?.()
            setNote(null)
            setBusy(p.interval)
            // Fire-and-forget (0141), BEFORE the sheet opens and never awaited.
            noteChurchPlanTap(churchId, 'apple', p.interval)
            done(await buy(p.interval, churchId))
          }}
        >
          {busy === p.interval ? 'Opening…' : `Subscribe with Apple · ${p.priceString} / ${p.interval === 'year' ? 'year' : 'month'}`}
        </button>
      ))}
      {note && <div className="dim" style={{ fontSize: 12, lineHeight: 1.45 }}>{note}</div>}
      <div className="faint" style={{ fontSize: 11, lineHeight: 1.45 }}>
        Renews automatically until cancelled in Settings → your name → Subscriptions. One subscription covers one church.{' '}
        {link(TERMS, 'Terms of Use')} · {link(PRIVACY, 'Privacy')} ·{' '}
        <button
          disabled={busy !== null}
          onClick={async () => { juice.select?.(); setNote(null); setBusy('restore'); done(await restore(churchId)) }}
          style={{ background: 'none', border: 0, padding: 0, color: 'var(--ink-dim)', textDecoration: 'underline', font: 'inherit', cursor: 'pointer' }}
        >
          {busy === 'restore' ? 'Restoring…' : 'Restore purchase'}
        </button>
      </div>
    </div>
  )
}
