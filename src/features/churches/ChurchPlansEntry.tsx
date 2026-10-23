import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Browser } from '@capacitor/browser'
import { churchPlansLink } from '@/lib/commerce'
import { useIap } from '@/store/iap'
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
// Deliberately a small card and never a banner, a dot or a toast: it is for
// the handful of people running a church, and it sits only on surfaces those
// people already opened. No player screen mounts it.

const SITE = 'https://versearcade.org'

export function ChurchPlansEntry({ churchId, churchName, onAsk }: {
  /** A church's own leadership screen: open THAT church's web tools. */
  churchId?: string
  churchName?: string
  /** The caller's own inquiry form, used instead of navigating to /churches. */
  onAsk?: () => void
}) {
  const juice = useJuice()
  const navigate = useNavigate()
  // Subscribed so the card re-renders when the storefront arrives.
  useIap((s) => s.storefront)
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
