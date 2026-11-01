import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { parseHomeGo } from '../../../../supabase/functions/church-digest/home.ts'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { TabbedSection } from '@/components/TabbedSection'
import { useJuice } from '@/juice/useJuice'
import { fetchAdminSettings, fetchLedChurches, fetchChurchBilling, fetchEntitlements, openBillingPortal, serverGenerationBackend, startSuiteUpgrade, serverVerseBackend, type AdminSettings, type ChurchBilling, type Entitlements, type LedChurch } from '@/store/churchAdmin'
import { churchBillingPortalVisible } from '@/lib/commerce'
import { todayLocalDate } from '@/lib/date'
import { Capacitor } from '@capacitor/core'
import { TodayVerseForm } from './TodayVerseForm'
import { OverviewPanel, PeoplePanel, ActivityPanel, SummaryPanel, useInsights, useSummary } from './InsightsPanel'
import { InquiriesSection } from './InquiriesSection'
import { HomePanel, type HomeGo } from './HomePanel'
import type { FirstWeekDoor } from './FirstWeek'
import { Collapsible } from '@/components/Collapsible'
import { NoticesPanel } from './NoticesPanel'
import { SharePanel } from './SharePanel'
import { LeaderLookPanel } from './LeaderLookPanel'
import { ChurchPlansEntry } from '@/features/churches/ChurchPlansEntry'
import { MoreTools } from './MoreTools'

// /church/:id/admin — the tools a church's verified leadership uses.
//
// Reached from the church's own page and from the church tab, and drawn only
// for somebody `church_admin_settings` says is leadership of THIS church. That
// check is the server's (every RPC behind this screen re-checks it), so the
// screen deciding what to draw is presentation, not protection.
//
// FOUR tabs since 2026-10-26, and it opens on what needs doing:
//   1. Home — "This week" (`HomePanel`): a short to-do, each row a door to the
//      tool that does it — days in the next seven with no church verse and
//      drafts waiting for approval (→ Plan, opened on that day), drafted
//      questions the answer check flagged ⚠ (0143, → Plan on that day), a
//      missing or ending notice (→ Your page, the notice form), and members
//      who could use a check-in (→ People with the quiet fold open — a count,
//      never a name; see HomePanel's header for why that narrows the People
//      rule). Under it, "At a glance": the totals the Overview tab used to
//      be (verified), or a free claim's three totals.
//   2. Plan — `TodayVerseForm`. With Content Generation it opens on "Plan
//      your week" (`PlanWeek`: sermon, topic or passage → a week of drafts →
//      review and approve), with the day-by-day form under "Edit one day";
//      without it, the form is the tab. `initialDate` is how a Home row opens a
//      given day (it unfolds the form on that day).
//      Its OWN lane for members since 0128, never in place of the daily drop.
//   3. People — players asking about the church from a leader's card (0149,
//      `InquiriesSection`, only when there are any), co-leaders (0147), every member BY NAME with last play,
//      streak and this week's plays (the owner's call, 2026-10-21), the quiet
//      fold with its hand-sent check-in, and the congregation feed (Activity,
//      folded under "Recent activity").
//   4. Your page — the live notice and giving link, Share (the page's link
//      and, verified, the QR), Plan & billing (the plan card and the App
//      Store plans entry; opened on return from a Stripe upgrade), and Your
//      look under More tools (0136; opened on return from the avatar checkout).
// Since 2026-10-29 each tab leads with its everyday tools and folds the rest
// under one "More tools" row (MoreTools.tsx): People's co-leaders, small
// groups, prayer list and activity; Plan's Sunday pack; Your page's look.
// Nothing was removed — the seven tabs' panels are all still here, rehomed —
// and no RPC or gate changed: every panel makes the same reads it did.
//
// "Your first week" (FirstWeek.tsx): a brand-new verified leader — no notice,
// nothing planned in the next seven days, fewer than three members — gets a
// three-row checklist at the top of Home (plan or Autopilot, notice, share),
// each row a door like the to-do's. It sits above "This week" and blocks none
// of it, and goes when done or hidden. The share row opens a fold on Your page
// that HomeGo has no name for (`onDoor`).
//
// DESKTOP: "Plan on a bigger screen →" is one quiet row at the foot of Home
// (not drawn when already wide). It opens this same URL in the system browser
// from the app, or a new tab on the web; signed out there, ordinary sign-in
// brings them straight back (`RequireLeaderSession` in App.tsx →
// `ChurchResume`). Free claims and verified leaders both get it — it is a
// door, and every gate is the server's as before.
// The WIDE layout: on the WEB only (`admin-wide`, never the App Store build's
// webview) and only at ≥900px (index.css), Home puts the to-do and "At a
// glance" side by side, Plan puts steps 1–2 beside "Review and approve", and
// the share and Sunday pack actions sit side by side. Nothing is hidden or
// removed at any width; below 900px, and in the app, it stacks as it always has.
//
// Plan & billing moved off the top of the screen for the same reason the tabs
// moved: a pastor's first screen was a plan card with an upsell on it, and
// the to-do belongs there instead.
//
// A FREE claim (0137, unverified) gets Home (its notice row and three
// congregation totals — no names) and Your page. Plan and People are the
// verified tier's, and are not drawn.
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
//
// A third row since 0136: the CUSTOM LEADER AVATAR, a one-time add-on on the
// same base. "Your look" (verified leadership) is where every leader picks one
// of five default looks, and where the add-on's photo request is sent. Until
// 2026-10-29 a leader with no look chosen landed on that tab first; it now
// sits under Your page → More tools (MoreTools.tsx), and a new leader lands on
// Home, whose first-week list starts with planning the week.
// Wide web: ≥900px in a browser. Never the App Store build's webview, which
// keeps the stacked phone layout whatever the device's width.
function useWideWeb(): boolean {
  const native = Capacitor.isNativePlatform()
  const q = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(min-width: 900px)') : null
  const [wide, setWide] = useState(() => !native && !!q?.matches)
  useEffect(() => {
    if (native || !q) return
    const on = () => setWide(q.matches)
    q.addEventListener?.('change', on)
    return () => q.removeEventListener?.('change', on)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return wide
}

export default function ChurchAdminScreen() {
  const wideWeb = useWideWeb()
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
  // Back from the one-time Custom Leader Avatar checkout (?avatar=1): the same
  // freeze, strip and re-read, and the dashboard opens on "Your look".
  const [avatarPaid] = useState(() => params.get('avatar') === '1')
  useEffect(() => {
    if (!upgraded && !avatarPaid) return
    const next = new URLSearchParams(params)
    next.delete('upgraded')
    next.delete('avatar')
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A Home row's door (2026-10-26): which tab to open, and what to open in it.
  // `nonce` makes the same row tapped twice re-open its tab after a fold.
  const [go, setGo] = useState<{ key: string; nonce: number } | null>(null)
  const [planDate, setPlanDate] = useState<string | undefined>(undefined)
  const [quiet, setQuiet] = useState(false)
  const [noticeFocus, setNoticeFocus] = useState(0)
  const [inquiryFocus, setInquiryFocus] = useState(0)
  // "Your first week" (FirstWeek.tsx): the two doors HomeGo has no name for.
  const [pageOpen, setPageOpen] = useState<'share' | null>(null)
  useEffect(() => {
    if (!inquiryFocus) return
    requestAnimationFrame(() => document.getElementById('church-inquiries')?.scrollIntoView({ block: 'start' }))
  }, [inquiryFocus])
  const onDoor = (d: FirstWeekDoor) => {
    if (d === 'notice') return onGo({ tab: 'page', notice: true })
    if (d === 'plan') return onGo({ tab: 'plan', date: todayLocalDate() })
    setPageOpen(d)
    setGo((cur) => ({ key: 'page', nonce: (cur?.nonce ?? 0) + 1 }))
    requestAnimationFrame(() => document.getElementById(`church-${d}`)?.scrollIntoView({ block: 'start' }))
  }
  const onGo = (g: HomeGo) => {
    setPageOpen(null)
    if (g.tab === 'plan') setPlanDate(g.date)
    if (g.tab === 'people' && g.quiet) setQuiet(true)
    if (g.tab === 'people' && g.inquiries) setInquiryFocus((n) => n + 1)
    if (g.tab === 'page') setNoticeFocus((n) => n + 1)
    setGo((cur) => ({ key: g.tab, nonce: (cur?.nonce ?? 0) + 1 }))
  }
  // A Monday digest link (0154): `?go=plan&date=…`, `?go=people&focus=quiet|
  // inquiries`, `?go=page&focus=notice` — the same doors a Home row opens.
  // Frozen at mount and stripped, like `?upgraded=1`, and applied once the
  // dashboard has loaded, so a reload doesn't re-open it.
  const [linkGo] = useState(() => parseHomeGo(params))
  useEffect(() => {
    if (!linkGo) return
    const next = new URLSearchParams(params)
    for (const k of ['go', 'date', 'focus']) next.delete(k)
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const linkApplied = useRef(false)
  useEffect(() => {
    if (!linkGo || linkApplied.current || state !== 'ok') return
    linkApplied.current = true
    onGo(linkGo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])
  useEffect(() => {
    if (!noticeFocus) return
    requestAnimationFrame(() => document.getElementById('church-notice')?.scrollIntoView({ block: 'start' }))
  }, [noticeFocus])

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

  const granted = upgraded
    ? !!ent?.churchLeader && !!ent?.contentGeneration
    : !!ent?.customLeaderAvatar
  useEffect(() => {
    if ((!upgraded && !avatarPaid) || granted) return
    let tries = 0
    const t = window.setInterval(() => {
      tries += 1
      void load()
      if (tries >= 10) window.clearInterval(t)
    }, 3000)
    return () => window.clearInterval(t)
  }, [upgraded, avatarPaid, granted, load])

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
  const glance = settings.verified
    ? <OverviewPanel insights={insights.data} failed={insights.failed} summary={summary.data} />
    : <SummaryPanel summary={summary.data} failed={summary.failed} />
  const plan = (
    <div style={{ display: 'grid', gap: 12 }}>
      <PlanStatus
        leader={leader}
        generation={generation}
        held={!!ent?.contentGenerationHeld}
        avatar={leader && !!ent?.customLeaderAvatar}
        avatarHeld={!!ent?.customLeaderAvatarHeld}
        churchId={id}
        billing={billing}
        upgraded={upgraded}
      />
      {/* Native only: the web build already draws the upgrade and the portal above. */}
      <ChurchPlansEntry
        churchId={id}
        churchName={settings.name}
        subscribe={{ verified: settings.verified || !!billing?.apple?.active, onChanged: load }}
      />
    </div>
  )
  const tabs = [
    {
      key: 'home',
      label: 'Home',
      content: <HomePanel churchId={id} verified={settings.verified} settings={settings} insights={insights.data} onGo={onGo} glance={glance} autoWeeks={generation} onDoor={onDoor} bigger={!wideWeb} />,
    },
    ...(settings.verified
      ? [
          {
            key: 'plan',
            label: 'Plan',
            content: (
              <TodayVerseForm
                // Only the open tab is mounted, so arriving here from a Home
                // row mounts the planner fresh on the day that row named.
                initialDate={planDate}
                churchId={id}
                churchName={settings.name}
                backend={generation ? serverGenerationBackend : serverVerseBackend}
                generationLocked={!generation}
                assets={{ canGenerate: generation }}
              />
            ),
          },
          {
            key: 'people',
            label: 'People',
            content: (
              <div style={{ display: 'grid', gap: 12 }}>
                <div id="church-inquiries" style={{ scrollMarginTop: 12 }}>
                  <InquiriesSection churchId={id} />
                </div>
                <PeoplePanel
                  churchId={id}
                  insights={insights.data}
                  failed={insights.failed}
                  leaders={{ churchName: settings.name, onChanged: insights.reload }}
                  openQuiet={quiet}
                  onQuietShown={() => setQuiet(false)}
                  more={{
                    names: ['Recent activity'],
                    content: (
                      <Collapsible icon="🕯️" title="Recent activity">
                        <ActivityPanel churchId={id} />
                      </Collapsible>
                    ),
                  }}
                />
              </div>
            ),
          },
        ]
      : []),
    {
      key: 'page',
      label: 'Your page',
      content: (
        <div style={{ display: 'grid', gap: 12 }}>
          <div id="church-notice" style={{ scrollMarginTop: 12 }}>
            <NoticesPanel churchId={id} settings={settings} onSaved={load} canGenerate={generation} />
          </div>
          <div id="church-share" style={{ scrollMarginTop: 12 }}>
          <Collapsible icon="🔗" title="Share your page" defaultOpen={pageOpen === 'share'}>
            <SharePanel churchId={id} churchName={settings.name} verified={settings.verified} />
          </Collapsible>
          </div>
          {/* Open by default while the church is unverified: verifying is
              the one thing an unverified church's leaders have to do here. */}
          <Collapsible icon="🧾" title="Plan & billing" defaultOpen={upgraded || !settings.verified}>
            {plan}
          </Collapsible>
          {/* The look is a nicety, not a setup step (2026-10-29): it used to be
              where a new leader landed, ahead of planning a single verse. */}
          {settings.verified && (
            <MoreTools names={['Your look']} open={avatarPaid}>
              <div id="church-look" style={{ scrollMarginTop: 12 }}>
              <Collapsible icon="🧑‍🦳" title="Your look" defaultOpen={avatarPaid}>
                <LeaderLookPanel churchId={id} ent={ent} setup={setup} paid={avatarPaid} onChanged={load} />
              </Collapsible>
              </div>
            </MoreTools>
          )}
        </div>
      ),
    },
  ]

  return (
    <Page className={Capacitor.isNativePlatform() ? undefined : 'admin-wide'}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <button className="pill" onClick={back} aria-label="Back to the church">← {settings.name}</button>
      </div>

      <h1 style={{ fontSize: 24, margin: '0 0 4px' }}>Leadership</h1>
      <div className="dim" style={{ fontSize: 13.5, marginBottom: 12 }}>{settings.name}</div>
      <AlsoLead currentId={id} />

      <TabbedSection tabs={tabs} defaultOpen defaultTab={avatarPaid || upgraded ? 'page' : 'home'} go={go} />
      <div style={{ height: 32 }} />
    </Page>
  )
}

// What this church holds, stated plainly: three rows, each on or not. On the
// web the locked Content Generation row is also the way to get it — Church
// Suite is the one price that carries it, so there is no separate add-on to
// sell — and an invoiced church is told to reply to an invoice instead, since
// Stripe's portal cannot change an invoiced plan.
function PlanStatus({ leader, generation, held, churchId, billing, upgraded, avatar, avatarHeld }: {
  leader: boolean; generation: boolean; held: boolean; churchId: string; billing: ChurchBilling | null; upgraded: boolean
  avatar: boolean; avatarHeld: boolean
}) {
  const web = churchBillingPortalVisible()
  const card = !!billing?.subscribed && !billing.invoiced
  // 0139: a Verified plan billed through Apple. Adding the Suite on the web
  // would start a second subscription on top of it, so that offer waits.
  const apple = billing?.apple?.active ? billing.apple : null
  return (
    <div className="card" style={{ padding: '10px 12px', marginBottom: 12, display: 'grid', gap: 6 }} aria-label="This church’s plan">
      <PlanRow
        on={leader}
        name="Church Leader"
        detail={leader
          ? 'Your verse and questions, series, notes, and each member’s play by name, and five leader looks.'
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
        {web && !generation && !held && apple && (
          <div className="dim" style={{ fontSize: 12, lineHeight: 1.45, marginTop: 6 }}>Church Suite is a web plan. Cancel the Apple subscription first, then add the Suite here, so you are never billed twice.</div>
        )}
        {web && !generation && !held && !apple && (
          upgraded
            ? <div className="dim" style={{ fontSize: 12, lineHeight: 1.45, marginTop: 6 }}>Thanks — Church Suite switches on as soon as Stripe confirms it. This usually takes a few seconds.</div>
            : billing?.subscribed && billing.invoiced
              ? <div className="dim" style={{ fontSize: 12, lineHeight: 1.45, marginTop: 6 }}>To move to Church Suite, reply to any invoice email and we’ll switch it.</div>
              : <SuiteUpgrade churchId={churchId} switching={card} />
        )}
        {web && card && (generation || !upgraded) && <ManagePlan churchId={churchId} />}
      </PlanRow>
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
      {billing?.subscribed && web && <BillingRow churchId={churchId} billing={billing} />}
      {apple && <AppleBillingRow apple={apple} />}
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

// The church's Verified plan, billed through an Apple ID (0139). Apple owns
// cancelling and changing it, so this row only says so — and, when it is the
// viewer's own Apple ID paying, opens Apple's subscriptions page.
function AppleBillingRow({ apple }: { apple: NonNullable<ChurchBilling['apple']> }) {
  const when = apple.expiresAt
    ? new Date(apple.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null
  return (
    <div style={{ borderTop: '1px solid var(--edge)', paddingTop: 8, marginTop: 2, display: 'grid', gap: 4 }}>
      <b style={{ fontSize: 13 }}>Billing · Verified Church through Apple</b>
      <div className="faint" style={{ fontSize: 11.5, lineHeight: 1.4 }}>
        {`Billed ${apple.interval === 'year' ? 'yearly' : 'monthly'} by Apple${when ? ` · renews ${when}` : ''}. `}
        {apple.mine
          ? <>Change or cancel it in <a href="https://apps.apple.com/account/subscriptions" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--ink-dim)' }}>your Apple subscriptions</a>.</>
          : 'Another leader’s Apple ID pays for it; they can change or cancel it.'}
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

// The other churches this leader leads (0177), one tap each. Without it a
// leader of two churches could only ever reach the one they belong to: every
// door here resolves through membership. Renders nothing for the usual case of
// one church, and nothing on any failure.
function AlsoLead({ currentId }: { currentId: string }) {
  const navigate = useNavigate()
  const [others, setOthers] = useState<LedChurch[]>([])
  useEffect(() => {
    let live = true
    void fetchLedChurches().then((list) => { if (live) setOthers(list.filter((c) => c.id !== currentId)) })
    return () => { live = false }
  }, [currentId])
  if (!others.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 12 }}>
      <span className="dim" style={{ fontSize: 12.5 }}>You also lead</span>
      {others.map((c) => (
        <button key={c.id} className="pill" style={{ fontSize: 12.5 }} onClick={() => navigate(`/church/${c.id}/admin`)}>
          {c.name}{c.verified ? '' : ' · not yet verified'} →
        </button>
      ))}
    </div>
  )
}
