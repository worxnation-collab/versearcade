import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { TabbedSection } from '@/components/TabbedSection'
import { useJuice } from '@/juice/useJuice'
import { fetchAdminSettings, type AdminSettings } from '@/store/churchAdmin'
import { TodayVerseForm } from './TodayVerseForm'
import { OverviewPanel, PeoplePanel, ActivityPanel, useInsights } from './InsightsPanel'
import { NoticesPanel } from './NoticesPanel'
import { SharePanel } from './SharePanel'

// /church/:id/admin — the tools a church's verified leadership uses.
//
// Reached from the church's own page and from the church tab, and drawn only
// for somebody `church_admin_settings` says is leadership of THIS church. That
// check is the server's (every RPC behind this screen re-checks it), so the
// screen deciding what to draw is presentation, not protection.
//
// Six panels behind one row of pills, the house's TabbedSection rule (0128):
//   1. Overview — members, active vs quiet, 14 days of play, series
//      completion, streaks and the live notice.
//   2. Schedule — the church's verse and five questions per day, series and
//      pastor's note, copy across days (0119, 0123). Its OWN lane for members
//      since 0128, never in place of the daily drop.
//   3. People — every member BY NAME with last play, streak and this week's
//      plays. Names are the owner's call (2026-10-21), reversing 0119's
//      totals-only rule for leadership.
//   4. Activity — the congregation's feed, the same one members see.
//   5. Notices — the announcement and the giving link.
//   6. Share — the page's link to paste, and (verified) the QR code to print.
//
// A claimed church that is not verified gets Notices and Share alone (the
// announcement is free-layer, 0117), and nothing on this screen says why:
// "verified" is decided off the device, and no upgrade, price or badge is ever
// drawn on a client (the skins and promotions pattern).
export default function ChurchAdminScreen() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const juice = useJuice()
  const [settings, setSettings] = useState<AdminSettings | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'denied' | 'unavailable'>('loading')
  // Read once for Overview and People together. Unverified leadership gets
  // `not_verified` back and those tabs are not drawn.
  const insights = useInsights(id)

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
          { key: 'overview', label: 'Overview', content: <OverviewPanel insights={insights.data} failed={insights.failed} /> },
          { key: 'verse', label: 'Schedule', content: <TodayVerseForm churchId={id} churchName={settings.name} /> },
          { key: 'people', label: 'People', content: <PeoplePanel insights={insights.data} failed={insights.failed} /> },
          { key: 'activity', label: 'Activity', content: <ActivityPanel churchId={id} /> },
        ]
      : []),
    {
      key: 'notices',
      label: 'Notices',
      content: <NoticesPanel churchId={id} settings={settings} onSaved={load} />,
    },
    {
      key: 'share',
      label: 'Share',
      content: <SharePanel churchId={id} churchName={settings.name} verified={settings.verified} />,
    },
  ]

  return (
    <Page>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <button className="pill" onClick={back} aria-label="Back to the church">← {settings.name}</button>
      </div>

      <h1 style={{ fontSize: 24, margin: '0 0 4px' }}>Leadership</h1>
      <div className="dim" style={{ fontSize: 13.5, marginBottom: 12 }}>{settings.name}</div>

      <TabbedSection tabs={tabs} defaultOpen defaultTab={settings.verified ? 'overview' : 'notices'} />
      <div style={{ height: 32 }} />
    </Page>
  )
}
