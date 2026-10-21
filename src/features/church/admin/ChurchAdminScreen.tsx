import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { TabbedSection } from '@/components/TabbedSection'
import { useJuice } from '@/juice/useJuice'
import { fetchAdminSettings, fetchEntitlements, serverGenerationBackend, serverVerseBackend, type AdminSettings, type Entitlements } from '@/store/churchAdmin'
import { TodayVerseForm } from './TodayVerseForm'
import { ParticipationPanel } from './ParticipationPanel'
import { NoticesPanel } from './NoticesPanel'
import { SharePanel } from './SharePanel'

// /church/:id/admin — the tools a church's verified leadership uses.
//
// Reached from the church's own page and from the church tab, and drawn only
// for somebody `church_admin_settings` says is leadership of THIS church. That
// check is the server's (every RPC behind this screen re-checks it), so the
// screen deciding what to draw is presentation, not protection.
//
// Three panels behind one row of pills, the house's TabbedSection rule:
//   1. Today's verse — the church's verse and five questions for a day (0119).
//   2. Congregation — totals only, floored at five, private to leadership.
//   3. Notices — the announcement and the giving link.
//   4. Share — the page's link to paste, and (verified) the QR code to print.
//
// A claimed church that is not verified gets Notices and Share alone (the
// announcement is free-layer, 0117).
//
// Two entitlements, and the top of the screen says which this church holds
// (`church_entitlements`, 0127): the BASE Church Leader tier (verified
// leadership — every tool above) and the Content Generation PACKAGE, an add-on
// that only stands on the base. Without the add-on the verse form keeps every
// manual tool and draws the drafting assist as locked; with it, the form gets
// the server backend that carries `draft`/`saveDraft`. Still no price, no
// checkout and no upgrade button anywhere: both are granted off the device.
export default function ChurchAdminScreen() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const juice = useJuice()
  const [settings, setSettings] = useState<AdminSettings | null>(null)
  const [ent, setEnt] = useState<Entitlements | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'denied' | 'unavailable'>('loading')

  const load = useCallback(async () => {
    const [r, e] = await Promise.all([fetchAdminSettings(id), fetchEntitlements(id)])
    // A server without 0127 (null) or a failed read is "no add-on": fail closed.
    setEnt(e && e.ok ? e.data : null)
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

  const leader = ent ? ent.churchLeader : settings.verified
  const generation = leader && !!ent?.contentGeneration
  const tabs = [
    ...(settings.verified
      ? [
          {
            key: 'verse',
            label: 'Today’s verse',
            content: (
              <TodayVerseForm
                churchId={id}
                churchName={settings.name}
                backend={generation ? serverGenerationBackend : serverVerseBackend}
                generationLocked={!generation}
              />
            ),
          },
          { key: 'people', label: 'Congregation', content: <ParticipationPanel churchId={id} /> },
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

      <PlanStatus leader={leader} generation={generation} held={!!ent?.contentGenerationHeld} />

      <TabbedSection tabs={tabs} defaultOpen defaultTab={settings.verified ? 'verse' : 'notices'} />
      <div style={{ height: 32 }} />
    </Page>
  )
}

// What this church holds, stated plainly: two rows, each on or not. No price,
// no upgrade button — a church asks through the page's "Add info" pill, as it
// always has, and an operator grants both.
function PlanStatus({ leader, generation, held }: { leader: boolean; generation: boolean; held: boolean }) {
  return (
    <div className="card" style={{ padding: '10px 12px', marginBottom: 12, display: 'grid', gap: 6 }} aria-label="This church’s plan">
      <PlanRow
        on={leader}
        name="Church Leader"
        detail={leader ? 'Your verse and questions, series, notes, congregation totals.' : 'Notices and sharing only for now.'}
      />
      <PlanRow
        on={generation}
        name="Content Generation package"
        detail={
          generation
            ? 'Draft questions and a note from a passage or your sermon notes. Drafts need your approval.'
            : held
              ? 'On your plan, and switches on with Church Leader.'
              : 'An add-on to Church Leader. Not on this church’s plan.'
        }
      />
    </div>
  )
}

function PlanRow({ on, name, detail }: { on: boolean; name: string; detail: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
      <span aria-hidden style={{ fontSize: 13, lineHeight: '18px', color: on ? 'var(--mint)' : 'var(--ink-dim)', flexShrink: 0 }}>{on ? '✓' : '🔒'}</span>
      <div style={{ minWidth: 0 }}>
        <b style={{ fontSize: 13 }}>{name}</b>
        <span className="dim" style={{ fontSize: 12, fontWeight: 700 }}> · {on ? 'Active' : 'Locked'}</span>
        <div className="faint" style={{ fontSize: 11.5, lineHeight: 1.4 }}>{detail}</div>
      </div>
    </div>
  )
}
