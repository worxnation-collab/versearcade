import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { TabbedSection } from '@/components/TabbedSection'
import { useJuice } from '@/juice/useJuice'
import { fetchAdminSettings, fetchEntitlements, serverGenerationBackend, serverVerseBackend, type AdminSettings, type Entitlements } from '@/store/churchAdmin'
import { TodayVerseForm } from './TodayVerseForm'
import { OverviewPanel, PeoplePanel, ActivityPanel, useInsights } from './InsightsPanel'
import { NoticesPanel } from './NoticesPanel'
import { SharePanel } from './SharePanel'
import { LeaderLookPanel } from './LeaderLookPanel'

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
// announcement is free-layer, 0117).
//
// Two entitlements, and the top of the screen says which this church holds
// (`church_entitlements`, 0127): the BASE Church Leader tier (verified
// leadership — every tool above) and the Content Generation PACKAGE, an add-on
// that only stands on the base. Without the add-on the verse form keeps every
// manual tool and draws the drafting assist as locked; with it, the form gets
// the server backend that carries `draft`/`saveDraft`. Still no price, no
// checkout and no upgrade button anywhere: both are granted off the device.
//
// A third row since 0136: the CUSTOM LEADER AVATAR, a one-time add-on on the
// same base. "Your look" (verified leadership) is where every leader picks one
// of five default looks, and where the add-on's photo request is sent. A leader
// who has not chosen a look yet lands on that tab first — the claim screen
// sends a new leader straight here, so that IS the setup step.
export default function ChurchAdminScreen() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const juice = useJuice()
  const [settings, setSettings] = useState<AdminSettings | null>(null)
  const [ent, setEnt] = useState<Entitlements | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'denied' | 'unavailable'>('loading')
  // Read once for Overview and People together. Unverified leadership gets
  // `not_verified` back and those tabs are not drawn.
  const insights = useInsights(id)

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
  // Setup: verified leadership with no look chosen yet opens on the picker.
  const setup = settings.verified && !!ent && ent.churchLeader && !ent.leaderLook
  const tabs = [
    ...(settings.verified
      ? [
          { key: 'overview', label: 'Overview', content: <OverviewPanel insights={insights.data} failed={insights.failed} /> },
          {
            key: 'verse',
            label: 'Schedule',
            content: (
              <TodayVerseForm
                churchId={id}
                churchName={settings.name}
                backend={generation ? serverGenerationBackend : serverVerseBackend}
                generationLocked={!generation}
                assets={{ canGenerate: generation }}
              />
            ),
          },
          { key: 'people', label: 'People', content: <PeoplePanel insights={insights.data} failed={insights.failed} /> },
          { key: 'activity', label: 'Activity', content: <ActivityPanel churchId={id} /> },
          { key: 'look', label: 'Your look', content: <LeaderLookPanel churchId={id} ent={ent} setup={setup} onChanged={load} /> },
        ]
      : []),
    {
      key: 'notices',
      label: 'Notices',
      content: <NoticesPanel churchId={id} settings={settings} onSaved={load} canGenerate={generation} />,
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

      <PlanStatus
        leader={leader}
        generation={generation}
        held={!!ent?.contentGenerationHeld}
        avatar={leader && !!ent?.customLeaderAvatar}
        avatarHeld={!!ent?.customLeaderAvatarHeld}
      />

      <TabbedSection tabs={tabs} defaultOpen defaultTab={setup ? 'look' : settings.verified ? 'overview' : 'notices'} />
      <div style={{ height: 32 }} />
    </Page>
  )
}

// What this church holds, stated plainly: two rows, each on or not. No price,
// no upgrade button — a church asks through the page's "Add info" pill, as it
// always has, and an operator grants both.
function PlanStatus({ leader, generation, held, avatar, avatarHeld }: {
  leader: boolean
  generation: boolean
  held: boolean
  avatar: boolean
  avatarHeld: boolean
}) {
  return (
    <div className="card" style={{ padding: '10px 12px', marginBottom: 12, display: 'grid', gap: 6 }} aria-label="This church’s plan">
      <PlanRow
        on={leader}
        name="Church Leader"
        detail={leader ? 'Your verse and questions, series, notes, congregation totals, and five leader looks.' : 'Notices and sharing only for now.'}
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
      <PlanRow
        on={avatar}
        name="Custom Leader Avatar"
        detail={
          avatar
            ? 'Send up to three photos and notes from “Your look”, and we make your avatar.'
            : avatarHeld
              ? 'On your plan, and switches on with Church Leader.'
              : 'A one-time add-on to Church Leader. Not on this church’s plan.'
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
