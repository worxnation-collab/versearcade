import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { TabbedSection } from '@/components/TabbedSection'
import { useJuice } from '@/juice/useJuice'
import { fetchAdminSettings, type AdminSettings } from '@/store/churchAdmin'
import { VerifiedBadge } from '../VerifiedBadge'
import { VerseScheduler } from './VerseScheduler'
import { ParticipationPanel } from './ParticipationPanel'
import { NoticesPanel } from './NoticesPanel'

// /church/:id/admin — the tools a church's verified leadership uses.
//
// Reached from the church's own page and from the church tab, and drawn only
// for somebody `church_admin_settings` says is leadership of THIS church. That
// check is the server's (every RPC behind this screen re-checks it), so the
// screen deciding what to draw is presentation, not protection.
//
// Three panels behind one row of pills, the house's TabbedSection rule:
//   1. The verse — schedule the congregation's shared verse, with a preview.
//   2. How we're doing — floored aggregates and the OPT-IN care list.
//   3. Notices — the announcement and the giving link.
//
// A claimed church that is not verified still gets the Notices panel (the
// announcement is free-layer, 0117) and one plain line about what the package
// adds. No price anywhere: the package is arranged off the device, like every
// other thing a church pays for here.
export default function ChurchAdminScreen() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const juice = useJuice()
  const [settings, setSettings] = useState<AdminSettings | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'denied' | 'unavailable'>('loading')

  const load = useCallback(async () => {
    const r = await fetchAdminSettings(id)
    if (r.ok) {
      setSettings(r.data)
      setState('ok')
    } else {
      setState(r.reason === 'not_leadership' ? 'denied' : 'unavailable')
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const back = () => {
    juice.select?.()
    navigate(`/church/${id}`)
  }

  if (state === 'loading') {
    return (
      <Page>
        <div className="skeleton" style={{ height: 220, borderRadius: 18 }} />
      </Page>
    )
  }

  if (state !== 'ok' || !settings) {
    return (
      <Page>
        <div className="card center" style={{ marginTop: 16 }}>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 18, display: 'block' }}>
            {state === 'denied' ? 'This page is for church leadership' : "Leadership tools aren't available right now"}
          </b>
          <p className="dim" style={{ margin: '8px 0 14px', fontSize: 13.5, lineHeight: 1.55 }}>
            {state === 'denied'
              ? "If you lead this church, ask us to confirm your role from the church's page — tap “Add info” there."
              : 'Check your connection and try again in a moment.'}
          </p>
          <Button variant="secondary" full onClick={back}>Back to the church</Button>
        </div>
      </Page>
    )
  }

  const tabs = [
    ...(settings.verified
      ? [
          { key: 'verse', label: 'Verse', content: <VerseScheduler churchId={id} churchName={settings.name} /> },
          { key: 'people', label: 'How we’re doing', content: <ParticipationPanel churchId={id} /> },
        ]
      : []),
    {
      key: 'notices',
      label: 'Notices',
      content: <NoticesPanel churchId={id} settings={settings} onSaved={load} />,
    },
  ]

  return (
    <Page>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <button className="pill" onClick={back} aria-label="Back to the church">← {settings.name}</button>
      </div>

      <h1 style={{ fontSize: 24, margin: '0 0 4px' }}>Leadership</h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span className="dim" style={{ fontSize: 13.5 }}>{settings.name}</span>
        {settings.verified && <VerifiedBadge />}
      </div>

      {!settings.verified && (
        <div className="card" style={{ marginBottom: 12 }}>
          <p className="dim" style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}>
            You can post a notice for {settings.name} any time. A verified church can also set the
            congregation's daily verse with a note from you, see how the week went, and add a giving
            link.{' '}
            <button onClick={() => navigate('/churches')} style={{ color: 'var(--gold)', textDecoration: 'underline', padding: 0, fontSize: 13 }}>
              Get in touch
            </button>{' '}
            to set that up.
          </p>
        </div>
      )}

      <TabbedSection tabs={tabs} defaultOpen defaultTab={settings.verified ? 'verse' : 'notices'} />
      <div style={{ height: 32 }} />
    </Page>
  )
}
