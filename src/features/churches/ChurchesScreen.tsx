import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/store/auth'
import { useJuice } from '@/juice/useJuice'
import { churchPlansVisible } from '@/lib/commerce'

// For Churches — the page a pastor lands on from outreach, a QR or a link, and
// the inquiry form behind it.
//
// It names what a church gets for free and what a Founding Church gets on top
// (the verified layer, docs/CHURCH-SHARED-VERSE.md), and every line here is
// something production does today. Four rules hold it:
//
//   * NO PRICE IN THE APP. The App Store build shows no plan name and no amount.
//     On the web, and only there (`churchPlansVisible`), one card names the two
//     plans a Founding Church moves to after Easter 2027 — the Church Suite
//     first, with the separate total struck through so the saving is plain.
//   * NOTHING COMPETITIVE. No ranks, no rivalry, no badge, no "featured": a
//     church that pays is not a bigger church, and a verified church is never
//     sorted first anywhere (0119).
//   * THE PRIVACY LINE IS A FEATURE, so it is stated, not buried — and it says
//     what the dashboard really does. Since 0128 a verified church's leadership
//     sees its members BY NAME with exact totals (`church_leader_insights`, the
//     owner's call); what the line promises is who else can't, and that nobody
//     is ranked. It used to promise "no names, under five hidden", which stopped
//     being true at 0128 — keep it in step with docs/CHURCH-CLAIM.md.
//   * THE GIVING LINK SAYS "on the web", because `givingLinkVisible()` hides it
//     in the App Store build and the page must not promise what the app won't do.
//
// The inquiry RPC is unchanged (`submit_church_inquiry`, 0025); the role picked
// here rides at the top of the message, so there is no migration.

const ROLES = ['Senior or lead pastor', 'Youth pastor', "Children's ministry", 'Church staff', 'Church member'] as const

const FREE: string[] = [
  'A public page anyone can open from a link — no account needed to look.',
  'The daily verse and a short quiz, the same one for everybody who plays.',
  'Points your people give grow your church’s building. Giving costs them nothing.',
  'A staff member can claim the page: service times, website, a notice and a “This week” line.',
  'Once three people play for your church, claiming it is free — with your congregation’s totals.',
]

const FOUNDING: string[] = [
  'You choose the day’s verse and write its five questions — or fill them from the library in one tap.',
  'Your members get your verse as their own church round beside the daily verse — the shared drop stays for everybody.',
  'Know your people by name: when each member last played, their streak and their week — and a check-in you write yourself.',
  'Your logo and an invite QR on your page, ready for the bulletin or the screen.',
  'Your giving link on your page (on the web).',
]

export default function ChurchesScreen() {
  const navigate = useNavigate()
  const juice = useJuice()
  const profile = useAuth((s) => s.profile)
  const location = useLocation()

  // This route sits outside TabShell, so there's no bottom nav to escape
  // through, and it's public — someone can land here from a shared link, and the
  // installed app has no browser back button either.
  //
  // The check is router history, not window.history: window.history counts
  // entries from before the app was even loaded, so on a cold landing it can be
  // >1 and going back would throw the visitor out of the app entirely. A router
  // location key of 'default' means this is the first entry of the session —
  // there is no in-app page to return to, so send them somewhere real instead,
  // which depends on whether they have an account at all.
  // ?claim=1 is Landing's "Church leader?" link. Frozen at mount and stripped,
  // like every deep link here, so a reload doesn't yank the page back down.
  const [params, setParams] = useSearchParams()
  const [claimIntent] = useState(() => params.get('claim') === '1')
  const signedIn = useAuth((s) => s.mode === 'online' && s.isAuthed)
  useEffect(() => {
    if (!claimIntent) return
    // Offset by hand rather than scrollIntoView: the top strip (notch scrim,
    // the first-visit music toast) would sit over the card's title.
    const el = document.getElementById('claim')
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 88 })
    const next = new URLSearchParams(params)
    next.delete('claim')
    setParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const exit = () => {
    juice.select?.()
    if (location.key !== 'default') navigate(-1)
    else navigate(profile ? '/play' : '/')
  }

  const [church, setChurch] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [size, setSize] = useState('')
  // Arriving from the demo (/churches/try) carries a line about what they tried,
  // so the first call can start from their sermon.
  const prefill = (location.state as { prefill?: string } | null)?.prefill ?? ''
  const [message, setMessage] = useState(prefill)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const valid = church.trim().length >= 2 && name.trim().length >= 2 && email.includes('@') && email.trim().length >= 5

  const submit = async () => {
    if (!valid || !supabase) return
    setBusy(true)
    setErr(null)
    juice.select?.()
    const note = [role && `Role: ${role}`, message.trim()].filter(Boolean).join('\n\n')
    const { data, error } = await supabase.rpc('submit_church_inquiry', {
      p_church: church, p_name: name, p_email: email, p_size: size || null, p_message: note || null,
    })
    setBusy(false)
    if (error || !(data as { ok?: boolean })?.ok) {
      setErr('Something went wrong — please try again.')
      return
    }
    setSent(true)
  }

  useEffect(() => {
    if (prefill) document.getElementById('founding-form')?.scrollIntoView({ block: 'start' })
  }, [prefill])

  const toForm = () => {
    juice.select?.()
    document.getElementById('founding-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (sent) {
    return (
      <Page>
        <div className="center" style={{ paddingTop: 40 }}>
          <div className="floaty" style={{ fontSize: 56 }}>⛪</div>
          <h1 style={{ fontSize: 28, marginTop: 8 }}>Thank you!</h1>
          <p className="dim" style={{ marginTop: 8, maxWidth: 320, marginInline: 'auto' }}>
            A person reads every one of these, and we&rsquo;ll write back to <b>{email}</b>. In the
            meantime, today&rsquo;s verse is open — it&rsquo;s the same one your congregation will play.
          </p>
          <div style={{ marginTop: 20 }}>
            <Button variant="gold" full onClick={() => navigate('/play')}>
              Play today&rsquo;s verse
            </Button>
          </div>
        </div>
      </Page>
    )
  }

  return (
    <Page>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        <button className="pill" onClick={exit} aria-label="Back">← Back</button>
      </div>

      <div className="center" style={{ marginBottom: 18 }}>
        <div className="floaty" style={{ fontSize: 44 }}>⛪</div>
        <h1 style={{ fontSize: 28, marginTop: 4, lineHeight: 1.15 }}>Your sermon, played all week.</h1>
        <p className="dim" style={{ margin: '8px auto 0', maxWidth: 360, lineHeight: 1.5 }}>
          Pick the verse you&rsquo;re preaching on. Your congregation plays it every day — a two-minute
          quiz that teaches with every answer, right or wrong.
        </p>
        <div style={{ marginTop: 14 }}>
          <Button variant="gold" full onClick={toForm}>Become a Founding Church</Button>
          <div style={{ marginTop: 8 }}>
            <Button variant="secondary" full onClick={() => { juice.select?.(); navigate('/churches/try') }}>
              Try the leadership tools — no sign-up
            </Button>
          </div>
        </div>
      </div>

      <VerseFormMock />

      <section className="card" style={{ marginBottom: 12 }} aria-labelledby="tier-founding">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <b id="tier-founding" style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>Founding Church</b>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--mint)' }}>Free through Easter 2027</span>
        </div>
        <p className="dim" style={{ margin: '4px 0 0', fontSize: 13 }}>Everything in Free, and:</p>
        <List items={FOUNDING} />
      </section>

      {churchPlansVisible() && <PlansCard />}

      <section className="card" style={{ marginBottom: 12 }} aria-labelledby="tier-free">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <b id="tier-free" style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>Free</b>
          <span className="faint" style={{ fontSize: 12, fontWeight: 700 }}>Always</span>
        </div>
        <List items={FREE} />
      </section>

      {/* How leadership claims a page. Deliberately NOT a sign-up path of its
          own: a leader makes the same free account everybody makes, then asks
          from the church's page, and a person verifies it by hand
          (docs/CHURCH-CLAIM.md). Nothing here grants anything. */}
      <section
        id="claim"
        className="card"
        style={{ marginBottom: 12, scrollMarginTop: 16, ...(claimIntent ? { borderColor: 'var(--edge)' } : null) }}
        aria-labelledby="claim-title"
      >
        <b id="claim-title" style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>
          Claim your church&rsquo;s page
        </b>
        <ol style={{ margin: '10px 0 0', paddingLeft: 20, lineHeight: 1.55, fontSize: 14, display: 'grid', gap: 6 }}>
          <li>{signedIn ? 'You’re signed in — that’s step one done.' : 'Make a free account, the same one anybody plays with — or sign in.'}</li>
          <li>Find your church and open its page.</li>
          <li>
            Tap <b>Add info</b> (or <b>Suggest an edit</b>) and say you&rsquo;re leadership. A person checks with your church — a
            call, or an email from its own address — and then the page is yours to edit.
          </li>
        </ol>
        <p className="faint" style={{ margin: '10px 0 0', fontSize: 12.5, lineHeight: 1.45 }}>
          Sent a leadership invite link by us? Just open it — it does the same thing in one tap.
        </p>
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          {!signedIn && (
            <Button variant="secondary" full onClick={() => { juice.select?.(); navigate('/auth?mode=signup') }}>
              Create a free account
            </Button>
          )}
          <Button variant={signedIn ? 'secondary' : 'ghost'} full onClick={() => { juice.select?.(); navigate('/churches/find') }}>
            Find your church →
          </Button>
          {!signedIn && (
            <p className="faint center" style={{ fontSize: 13, margin: 0 }}>
              <span style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={() => navigate('/auth')}>
                I already have an account
              </span>
            </p>
          )}
        </div>
      </section>

      <section className="card" style={{ marginBottom: 12 }} aria-labelledby="privacy">
        <b id="privacy" style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>
          You&rsquo;ll know your people by name — and nobody gets ranked.
        </b>
        <p className="dim" style={{ margin: '8px 0 0', fontSize: 13.5, lineHeight: 1.55 }}>
          Your church&rsquo;s verified leadership sees its members by name: when each last played, their
          current streak and how often they&rsquo;ve played this week, with totals that are exact however
          small your congregation is. The list is in the order people joined, never by score. Anyone who
          hasn&rsquo;t played this week sits in one folded section you open on purpose, and the only thing
          offered there is a short note you write and send yourself.
        </p>
        <p className="dim" style={{ margin: '8px 0 0', fontSize: 13.5, lineHeight: 1.55 }}>
          That view is for your leadership alone — not other members, not other churches, not the public.
          Members see their church as a place to belong: today&rsquo;s verse, the series you&rsquo;re in,
          and what the congregation has been up to together. Nobody is ranked against anybody, and a wrong
          answer always teaches the right one.
        </p>
      </section>

      <section className="card" style={{ marginBottom: 16 }} aria-labelledby="founding-what">
        <b id="founding-what" style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>What a Founding Church agrees to</b>
        <p className="dim" style={{ margin: '8px 0 0', fontSize: 13.5, lineHeight: 1.55 }}>
          Use it with your people and tell us honestly what works and what doesn&rsquo;t. We set your
          church up by hand — a short call or an email from your church&rsquo;s own address — and a person
          answers every message.
        </p>
      </section>

      <div id="founding-form" className="card" style={{ display: 'grid', gap: 10, scrollMarginTop: 16 }}>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>Tell us about your church</b>
        <label style={labelStyle}>
          Church / ministry name
          <input value={church} onChange={(e) => setChurch(e.target.value)} placeholder="Grace Community Church" maxLength={80} />
        </label>
        <label style={labelStyle}>
          Your name
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pastor Jane Smith" maxLength={80} />
        </label>
        <div role="group" aria-label="Your role" style={{ ...labelStyle, gap: 7 }}>
          Your role (optional)
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minWidth: 0 }}>
            {ROLES.map((r) => {
              const on = role === r
              return (
                <button
                  key={r}
                  type="button"
                  className="pill"
                  aria-pressed={on}
                  onClick={() => { juice.select?.(); setRole(on ? '' : r) }}
                  style={{ fontSize: 12.5, fontWeight: 700, ...(on ? { background: 'var(--select)', color: 'var(--ink)', borderColor: 'var(--select)' } : null) }}
                >
                  {r}
                </button>
              )
            })}
          </div>
        </div>
        <label style={labelStyle}>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@church.org" type="email" autoCapitalize="none" autoCorrect="off" maxLength={120} />
        </label>
        <label style={labelStyle}>
          Congregation size (optional)
          <input value={size} onChange={(e) => setSize(e.target.value)} placeholder="e.g. 150" maxLength={40} />
        </label>
        <label style={labelStyle}>
          Anything else? (optional)
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What you’re preaching on, or what you’re hoping to do…" rows={3} maxLength={500} style={{ resize: 'vertical' }} />
        </label>
        {err && <p style={{ color: 'var(--coral)', fontSize: 13, margin: 0 }}>{err}</p>}
        <Button variant="gold" full disabled={!valid || busy} onClick={submit}>
          {busy ? 'Sending…' : 'Become a Founding Church'}
        </Button>
        <p className="faint" style={{ margin: 0, fontSize: 12, lineHeight: 1.45 }}>
          No payment details, now or at sign-up. We&rsquo;ll write back by email.
        </p>
      </div>

      <div style={{ height: 40 }} />
    </Page>
  )
}

function List({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: '10px 0 0', paddingLeft: 18, lineHeight: 1.6, fontSize: 14, display: 'grid', gap: 4 }}>
      {items.map((t) => <li key={t}>{t}</li>)}
    </ul>
  )
}

// A drawing of the leadership verse form, not a screenshot: it is the product in
// one picture, it stays sharp at every size and in every build, and it can't go
// stale against a real screen the way a baked image would. Static and inert —
// nothing in it is a control, and it is hidden from screen readers in favour of
// the one-sentence description beside it.
function VerseFormMock() {
  return (
    <figure style={{ margin: '0 0 14px' }}>
      <div className="card" aria-hidden="true" style={{ padding: 14, display: 'grid', gap: 8, pointerEvents: 'none', userSelect: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--ink-dim)' }}>Leadership · Today&rsquo;s verse</span>
          <span style={{ fontSize: 11, color: 'var(--ink-dim)' }}>Sunday</span>
        </div>
        <MockField label="Verse reference" value="John 15:5" />
        <MockField label="The verse" value="I am the vine; you are the branches. If you remain in me and I in you, you will bear much fruit…" />
        <div style={{ background: 'var(--card-raised)', borderRadius: 12, padding: '10px 12px', display: 'grid', gap: 6 }}>
          <b style={{ fontSize: 12, color: 'var(--ink-dim)' }}>Question 1 of 5</b>
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>What does Jesus call himself here?</span>
          {['The vine', 'The gardener', 'The branch'].map((o, i) => (
            <span key={o} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{ width: 14, height: 14, borderRadius: 999, flexShrink: 0, border: '2px solid var(--edge)', background: i === 0 ? 'var(--mint)' : 'transparent' }} />
              {o}
            </span>
          ))}
        </div>
        <span style={{ justifySelf: 'stretch', textAlign: 'center', fontWeight: 800, fontSize: 13.5, padding: '10px 12px', borderRadius: 12, background: 'var(--select)', color: 'var(--ink)' }}>
          Set today&rsquo;s verse
        </span>
      </div>
      <figcaption className="faint" style={{ marginTop: 6, fontSize: 12, textAlign: 'center' }}>
        What a Founding Church&rsquo;s leadership sees: the verse and five questions, set in about five minutes.
      </figcaption>
    </figure>
  )
}

function MockField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-dim)' }}>{label}</span>
      <span style={{ fontSize: 13.5, padding: '9px 11px', borderRadius: 10, background: 'var(--card-raised)', lineHeight: 1.4 }}>{value}</span>
    </div>
  )
}

const labelStyle: React.CSSProperties = { display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--ink-dim)' }

// The two paid plans, web only. Same numbers as the billing page (the amounts
// themselves live in Stripe; change all three together). The Suite leads and is
// the one marked — buying both separately is shown only as the struck-through
// figure it saves against, never as a third option.
function PlansCard() {
  const [yearly, setYearly] = useState(false)
  const p = yearly
    ? { suite: '$390', sep: '$480', base: '$290', per: '/ year', save: 'Save $90 a year' }
    : { suite: '$39', sep: '$48', base: '$29', per: '/ month', save: 'Save $9 a month' }
  const row: React.CSSProperties = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }
  return (
    <section className="card" style={{ marginBottom: 12, display: 'grid', gap: 10 }} aria-labelledby="tier-plans">
      <div style={row}>
        <b id="tier-plans" style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>After Easter 2027</b>
        <div role="group" aria-label="Billing period" style={{ display: 'flex', gap: 4 }}>
          {[false, true].map((y) => (
            <button
              key={String(y)}
              className="pill"
              aria-pressed={yearly === y}
              onClick={() => setYearly(y)}
              style={{ fontSize: 12, fontWeight: 700, ...(yearly === y ? { background: 'var(--select)', borderColor: 'var(--select)', color: 'var(--ink)' } : null) }}
            >
              {y ? 'Yearly' : 'Monthly'}
            </button>
          ))}
        </div>
      </div>
      <p className="dim" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
        Founding Churches pay nothing until then, and your plan starts by itself at the price you chose.
      </p>
      <div className="card" style={{ padding: '12px 14px', borderColor: 'var(--gold)', display: 'grid', gap: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--gold)' }}>Everything · best value</span>
        <div style={row}>
          <b style={{ fontSize: 15 }}>Church Suite</b>
          <span>
            <s className="faint" style={{ fontSize: 13 }}>{p.sep}</s>{' '}
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>{p.suite}</b>
            <span className="faint" style={{ fontSize: 12 }}> {p.per}</span>
          </span>
        </div>
        <span className="dim" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
          <b>Includes Content Generation.</b> Every Founding Church tool, plus verse, series and notice cards ready to post — drafted, approved by you,
          exported for the feed and Stories. <b>{p.save}.</b>
        </span>
      </div>
      <div className="card" style={{ padding: '12px 14px', display: 'grid', gap: 4 }}>
        <div style={row}>
          <b style={{ fontSize: 15 }}>Verified Church</b>
          <span>
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>{p.base}</b>
            <span className="faint" style={{ fontSize: 12 }}> {p.per}</span>
          </span>
        </div>
        <span className="dim" style={{ fontSize: 12.5, lineHeight: 1.45 }}>Every Founding Church tool, without the cards.</span>
      </div>
    </section>
  )
}
