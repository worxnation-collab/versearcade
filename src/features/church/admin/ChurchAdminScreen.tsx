import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { TabbedSection } from '@/components/TabbedSection'
import { useJuice } from '@/juice/useJuice'
import { fetchAdminSettings, fetchChurchBilling, fetchEntitlements, openBillingPortal, serverGenerationBackend, startSuiteUpgrade, serverVerseBackend, type AdminSettings, type ChurchBilling, type Entitlements } from '@/store/churchAdmin'
import { churchBillingPortalVisible } from '@/lib/commerce'
import { TodayVerseForm } from './TodayVerseForm'
import { OverviewPanel, PeoplePanel, ActivityPanel, SummaryPanel, useInsights, useSummary } from './InsightsPanel'
import { NoticesPanel } from './NoticesPanel'
import { SharePanel } from './SharePanel'
import { ChurchPlansEntry } from '@/features/churches/ChurchPlansEntry'

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
// A claimed church that is not verified — a FREE claim (0137) — gets an
// Overview of three congregation totals (`church_leader_summary`: members,
// active this week as a percentage, average current streak; no names), plus
// Notices and Share. The notice is free-layer (0117) and shows on the
// church's page.
//
// Two entitlements, and the top of the screen says which this church holds
// (`church_entitlements`, 0127): the BASE Church Leader tier (verified
// leadership — every tool above) and the Content Generation PACKAGE, an add-on
// that only stands on the base. Without the add-on the verse form keeps every
// manual tool and draws the drafting assist as locked; with it, the form gets
// the server backend that carries `draft`/`saveDraft`. On the web, the locked
// Content Generation row carries "Unlock with Church Suite" (a Suite Checkout,
// or the portal's confirm step for a card-billed Verified plan) and a "Manage
// plan" link; the App Store build draws neither (`churchBillingPortalVisible`).
// The grant itself is still the webhook's — the screen only re-reads.
export default function ChurchAdminScreen() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const juice = useJuice()
  const [settings, setSettings] = useState<AdminSettings | null>(null)
  const [ent, setEnt] = useState<Entitlements | null>(null)
  const [billing, setBilling] = useState<ChurchBilling | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'denied' | 'unavailable'>('loading')
  // Read once for Overview and People together. Unverified leadership gets
  // `not_verified` back and those tabs are not drawn.
  const insights = useInsights(id)
  // Every tier's top row of totals, verified or not (0137).
  const summary = useSummary(id)
  // Back from Stripe with ?upgraded=1: frozen at mount and stripped, then the
  // entitlements are re-read for a little while, because the webhook that
  // grants the Suite usually lands a few seconds after the redirect.
  const [params, setParams] = useSearchParams()
  const [upgraded] = useState(() => params.get('upgraded') === '1')
  useEffect(() => {
    if (!upgraded) return
    const next = new URLSearchParams(params)
    next.delete('upgraded')
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const load = useCallback(async () => {
    const [r, e, b] = await Promise.all([fetchAdminSettings(id), fetchEntitlements(id), fetchChurchBilling(id)])
    // A server without 0135, or a church verified by hand, draws no billing row.
    setBilling(b)
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

  const granted = !!ent?.churchLeader && !!ent?.contentGeneration
  useEffect(() => {
    if (!upgraded || granted) return
    let tries = 0
    const t = window.setInterval(() => {
      tries += 1
      void load()
      if (tries >= 10) window.clearInterval(t)
    }, 3000)
    return () => window.clearInterval(t)
  }, [upgraded, granted, load])

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
          { key: 'overview', label: 'Overview', content: <OverviewPanel insights={insights.data} failed={insights.failed} summary={summary.data} /> },
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
          { key: 'people', label: 'People', content: <PeoplePanel churchId={id} insights={insights.data} failed={insights.failed} /> },
          { key: 'activity', label: 'Activity', content: <ActivityPanel churchId={id} /> },
        ]
      : [{ key: 'overview', label: 'Overview', content: <SummaryPanel summary={summary.data} failed={summary.failed} /> }]),
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

      <PlanStatus leader={leader} generation={generation} held={!!ent?.contentGenerationHeld} churchId={id} billing={billing} upgraded={upgraded} />
      {/* Native only: the web build already draws the upgrade and the portal above. */}
      <ChurchPlansEntry churchId={id} churchName={settings.name} />

      <TabbedSection tabs={tabs} defaultOpen defaultTab="overview" />
      <div style={{ height: 32 }} />
    </Page>
  )
}

// What this church holds, stated plainly: two rows, each on or not. On the
// web the locked Content Generation row is also the way to get it — Church
// Suite is the one price that carries it, so there is no separate add-on to
// sell — and an invoiced church is told to reply to an invoice instead, since
// Stripe's portal cannot change an invoiced plan.
function PlanStatus({ leader, generation, held, churchId, billing, upgraded }: {
  leader: boolean; generation: boolean; held: boolean; churchId: string; billing: ChurchBilling | null; upgraded: boolean
}) {
  const web = churchBillingPortalVisible()
  const card = !!billing?.subscribed && !billing.invoiced
  return (
    <div className="card" style={{ padding: '10px 12px', marginBottom: 12, display: 'grid', gap: 6 }} aria-label="This church’s plan">
      <PlanRow
        on={leader}
        name="Church Leader"
        detail={leader
          ? 'Your verse and questions, series, notes, and each member’s play by name.'
          : 'Free claim: congregation totals and one notice on your page. Church Leader adds your own verse and member names.'}
      />
      <PlanRow
        on={generation}
        name="Content Generation package"
        detail={
          generation
            ? 'Draft questions and a note from a passage or your sermon notes. Drafts need your approval.'
            : held
              ? 'On your plan, and switches on with Church Leader.'
              : 'Included in Church Suite, with Church Leader. Not on this church’s plan.'
        }
      >
        {web && !generation && !held && (
          upgraded
            ? <div className="dim" style={{ fontSize: 12, lineHeight: 1.45, marginTop: 6 }}>Thanks — Church Suite switches on as soon as Stripe confirms it. This usually takes a few seconds.</div>
            : billing?.subscribed && billing.invoiced
              ? <div className="dim" style={{ fontSize: 12, lineHeight: 1.45, marginTop: 6 }}>To move to Church Suite, reply to any invoice email and we’ll switch it.</div>
              : <SuiteUpgrade churchId={churchId} switching={card} />
        )}
        {web && card && (generation || !upgraded) && <ManagePlan churchId={churchId} />}
      </PlanRow>
      {billing?.subscribed && web && <BillingRow churchId={churchId} billing={billing} />}
    </div>
  )
}

/** Founding Churches pay nothing before Easter 2027 (church-billing's FOUNDING_UNTIL). */
const foundingOpen = () => Date.now() < Date.parse('2027-03-27T00:00:00Z')

function SuiteUpgrade({ churchId, switching }: { churchId: string; switching: boolean }) {
  const juice = useJuice()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const go = async () => {
    juice.select?.()
    setBusy(true)
    setFailed(false)
    const r = await startSuiteUpgrade(churchId)
    if ('url' in r) {
      window.location.href = r.url
      return
    }
    setBusy(false)
    setFailed(true)
  }
  return (
    <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
      <Button variant="gold" full disabled={busy} onClick={go}>{busy ? 'Opening…' : 'Unlock with Church Suite'}</Button>
      <div className="faint" style={{ fontSize: 11, lineHeight: 1.4 }}>
        {failed
          ? 'Couldn’t open Stripe just now. Try again in a moment.'
          : switching
            ? `Stripe shows the change before anything is confirmed.${foundingOpen() ? ' Your Founding Church trial carries over.' : ''}`
            : `Checkout is on Stripe.${foundingOpen() ? ' Founding Churches pay nothing before Easter 2027.' : ''}`}
      </div>
    </div>
  )
}

// The portal on its plan picker: downgrade to Verified, or monthly ↔ yearly.
function ManagePlan({ churchId }: { churchId: string }) {
  const juice = useJuice()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const go = async () => {
    juice.select?.()
    setBusy(true)
    setFailed(false)
    const r = await openBillingPortal(churchId, 'plan')
    if ('url' in r) {
      window.location.href = r.url
      return
    }
    setBusy(false)
    setFailed(true)
  }
  return (
    <div style={{ marginTop: 6, fontSize: 12 }}>
      <button
        onClick={go}
        disabled={busy}
        style={{ background: 'none', border: 0, padding: 0, color: 'var(--ink-dim)', textDecoration: 'underline', font: 'inherit', cursor: 'pointer' }}
      >
        {busy ? 'Opening…' : 'Manage plan'}
      </button>
      {failed && <span className="faint" style={{ marginLeft: 8, fontSize: 11 }}>Couldn’t open it just now.</span>}
    </div>
  )
}

// The church's own Stripe subscription, and the door to Stripe's billing portal
// (cancel, change the card, download invoices). Drawn only for a live
// subscription with a Stripe customer, so a church an operator verified by hand
// sees exactly the card it always did, and only on the web — the portal is a
// page with prices and a card form, which the App Store build does not show.
function BillingRow({ churchId, billing }: { churchId: string; billing: ChurchBilling }) {
  const juice = useJuice()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const when = billing.periodEnd
    ? new Date(billing.periodEnd).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null
  const detail =
    billing.status === 'trialing'
      ? 'Founding Church — free through Easter 2027. Nothing is charged before then.'
      : billing.status === 'past_due'
        ? 'The last payment didn’t go through. Update the card or pay the invoice to keep Church Leader on.'
        : `Billed ${billing.interval === 'year' ? 'yearly' : 'monthly'}${billing.invoiced ? ' by invoice' : ''}${when ? ` · renews ${when}` : ''}.`

  const open = async () => {
    juice.select?.()
    setBusy(true)
    setFailed(false)
    const r = await openBillingPortal(churchId)
    if ('url' in r) {
      window.location.href = r.url
      return
    }
    setBusy(false)
    setFailed(true)
  }

  return (
    <div style={{ borderTop: '1px solid var(--edge)', paddingTop: 8, marginTop: 2, display: 'grid', gap: 6 }}>
      <div style={{ minWidth: 0 }}>
        <b style={{ fontSize: 13 }}>Billing · {billing.addon ? 'Church Suite' : 'Verified Church'}</b>
        <div className="faint" style={{ fontSize: 11.5, lineHeight: 1.4 }}>{detail}</div>
      </div>
      <button className="pill" style={{ justifySelf: 'start' }} disabled={busy} onClick={open}>
        {busy ? 'Opening…' : 'Manage billing →'}
      </button>
      <div className="faint" style={{ fontSize: 11, lineHeight: 1.4 }}>
        {failed
          ? 'Couldn’t open billing just now. Try again in a moment.'
          // Stripe's portal cannot change the plan on an invoiced subscription
          // (it refuses any collection method but charge_automatically), so an
          // invoiced church is pointed at a person rather than at a button
          // that would not offer the switch.
          : billing.invoiced
            ? billing.addon
              ? 'See invoices or cancel. To change your plan, reply to any invoice email and we’ll switch it.'
              : 'See invoices or cancel here.'
            : billing.addon
              ? 'Change the card or plan, see invoices, or cancel. Cancelling keeps your tools on until the period ends.'
              : 'Change the card, see invoices, or cancel.'}
      </div>
    </div>
  )
}

function PlanRow({ on, name, detail, children }: { on: boolean; name: string; detail: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
      <span aria-hidden style={{ fontSize: 13, lineHeight: '18px', color: on ? 'var(--mint)' : 'var(--ink-dim)', flexShrink: 0 }}>{on ? '✓' : '🔒'}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <b style={{ fontSize: 13 }}>{name}</b>
        <span className="dim" style={{ fontSize: 12, fontWeight: 700 }}> · {on ? 'Active' : 'Locked'}</span>
        <div className="faint" style={{ fontSize: 11.5, lineHeight: 1.4 }}>{detail}</div>
        {children}
      </div>
    </div>
  )
}
