import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChurchArt } from '@/features/church/ChurchArt'
import { tierForLevel } from '@/features/church/levels'
import { PaintedIcon, type PaintedIconId } from '@/components/PaintedIcon'
import { gatheringLabel, gatheringOpen, gatheringWindow } from '@/data/gathering'
import { useChurch } from '@/store/church'
import type { Church } from '@/types'
import { useJuice } from '@/juice/useJuice'
import { useGame } from '@/store/game'
import { useChurchToday, bannerSeen, markBannerSeen } from '@/store/churchPackage'
import { givingLinkVisible } from '@/lib/commerce'
import { GiveLink } from '@/features/church/ChurchExtras'

// The church window on the Play tab, where the Harvest Road strip used to sit.
//
// The road did not go anywhere: it keeps its own screen (/pilgrimage), its row
// on the map, and its quests still score from every surface. It just stopped
// being the third thing on the tab everybody lands on, because a congregation
// is the reason most people stay and the road is the reason some people grind.
//
// Two states, and neither draws anything about a PERSON:
//
//   * You have a church — ONE card that is the church's word to you today,
//     and it absorbed what used to be `ChurchTodayStrip` (a second, thinner
//     card above this one saying half the same thing). In order, and each
//     part only when it is TRUE today:
//       1. who it is: the building at its real tier and skin, name, tier, city;
//       2. today's verse from the church — only when leadership set one AND it
//          is today's drop (`get_effective_verse`, 0119), with the series as a
//          quiet label and the pastor's note clamped to two lines (0123);
//       3. the church's one live notice (`set_church_announcement` keeps one),
//          with its last day when it has one, dismissible per notice;
//       4. the giving link, where this BUILD may show one (`givingLinkVisible`);
//       5. how many play there (a church total, already public on its page)
//          and the gathering hour.
//     No giver, no rank, no "who played today" — the church rules in
//     CLAUDE.md, applied to a card. An unverified church simply has no 2-4.
//   * You don't — what a church adds, in four short lines, and ONE button into
//     the existing picker at /church. A guest meets the account wall there,
//     which is the pitch; a keyless build meets the Church tab's own card.
//
// Renders nothing until the church store has answered, so a member never sees
// "Add your church" flash before their own name arrives.
export function ChurchWindow() {
  const navigate = useNavigate()
  const juice = useJuice()
  const church = useChurch((s) => s.church)
  const loaded = useChurch((s) => s.loaded)
  const loading = useChurch((s) => s.loading)
  const load = useChurch((s) => s.load)
  // The gathering line is a clock; re-read it once a minute so "open now"
  // turns on and off without a reload.
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (!loaded && !loading) void load()
  }, [loaded, loading, load])

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(t)
  }, [])

  if (!loaded) return null

  const go = () => {
    juice.select?.()
    navigate('/church')
  }

  if (church) return <MemberCard church={church} now={now} onOpen={go} />

  return (
    <Shell onClick={go} label="Add your church">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div aria-hidden style={{ width: 64, height: 64, flexShrink: 0, display: 'grid', placeItems: 'end center', opacity: 0.9 }}>
          <ChurchArt level={1} size={64} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.2 }}>Add your church</div>
          <div className="faint" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.4 }}>
            Play for your own congregation.
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
        <Signal icon="buddies">See who plays from your church</Signal>
        <Signal icon="week">This week’s news from your church</Signal>
        <Signal icon="pray">Pray for each other at the wall</Signal>
        <Signal icon="journal">Study the verse your church picks</Signal>
      </div>

      <div style={{ marginTop: 12 }}>
        <CardButton>Add church</CardButton>
      </div>
    </Shell>
  )
}

// The member's card is NOT one big button, unlike the pitch: it holds things
// with taps of their own (the note's "more", the notice's ×, the giving link),
// and a <button> can't contain buttons. So the church's identity row is the
// door to /church, and "Open church" at the foot is the same door again.
function MemberCard({ church, now, onOpen }: { church: Church; now: Date; onOpen: () => void }) {
  const ct = useChurchToday((s) => s.today)
  const loadToday = useChurchToday((s) => s.load)
  const drop = useGame((s) => s.today)
  const [, bump] = useState(0)

  useEffect(() => {
    void loadToday()
  }, [loadToday])

  // Only the church's OWN verse, and only when it is today's drop: the run
  // carries `church` exactly on the days leadership set one (0119).
  const verse = drop?.church?.id === church.id ? drop : null
  // The today payload is keyed to the church it answered for, so switching
  // church can't show the old one's notice under the new one's name.
  const pkg = ct?.verified && ct.church_id === church.id ? ct : null
  const notice = pkg?.announcements?.[0]
  const showNotice = !!notice && !bannerSeen(notice.id)
  const giving = pkg?.giving_url && givingLinkVisible() ? pkg.giving_url : null
  const open = gatheringOpen(now)

  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      // minmax(0, 1fr): a grid item's min-width is `auto`, so one long
      // church name would otherwise widen the whole card off the phone.
      style={{ padding: 14, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 12 }}
    >
      <button
        onClick={onOpen}
        aria-label={`Open ${church.name}`}
        style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left', padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer' }}
      >
        <div aria-hidden style={{ width: 72, height: 72, flexShrink: 0, display: 'grid', placeItems: 'end center' }}>
          <ChurchArt level={church.level} skin={church.skin} size={72} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Eyebrow>Your church</Eyebrow>
          <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.2, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {church.name}
          </div>
          <div className="faint" style={{ fontSize: 12, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {tierForLevel(church.level).name}
            {church.city ? ` · ${church.city}` : ''}
          </div>
        </div>
      </button>

      {verse && (
        <Section>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, justifyContent: 'space-between' }}>
            <Eyebrow nowrap>Today’s verse from {church.name}</Eyebrow>
            {verse.church?.series && (
              <span
                className="faint"
                style={{ fontSize: 11, fontWeight: 700, flexShrink: 0, maxWidth: '45%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {verse.church.series}
              </span>
            )}
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, marginTop: 3 }}>{verse.reference}</div>
          {verse.church?.note && <PastorNote text={verse.church.note} />}
        </Section>
      )}

      {showNotice && notice && (
        <Section>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <Eyebrow>
              From your church
              {notice.expires_at ? <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}> · {throughLabel(notice.expires_at, now)}</span> : null}
            </Eyebrow>
            <button
              aria-label="Put this notice away"
              className="faint"
              onClick={() => { markBannerSeen(notice.id); bump((n) => n + 1) }}
              style={{ fontSize: 17, lineHeight: 1, padding: '0 2px', flexShrink: 0, cursor: 'pointer' }}
            >
              ×
            </button>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, lineHeight: 1.45, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{notice.message}</p>
        </Section>
      )}

      {giving && (
        <div>
          <GiveLink url={giving} churchName={church.name} compact />
        </div>
      )}

      <div style={{ display: 'grid', gap: 6 }}>
        <Signal icon="buddies">
          {church.members === 1 ? 'You play here — invite your congregation' : `${church.members.toLocaleString()} play here`}
        </Signal>
        <Signal icon="week" lit={open}>
          {open ? 'The gathering hour is open now' : `Gathering hour ${gatheringWhen(now)}`}
        </Signal>
      </div>

      <button onClick={onOpen} style={{ padding: 0, width: '100%', color: 'inherit', font: 'inherit', cursor: 'pointer' }}>
        <CardButton>Open church</CardButton>
      </button>
    </motion.div>
  )
}

// A ruled section inside the card, so verse and notice read as two things the
// church said rather than one paragraph.
function Section({ children }: { children: React.ReactNode }) {
  return <div style={{ borderTop: '1px solid var(--stroke)', paddingTop: 10 }}>{children}</div>
}

function Eyebrow({ children, nowrap = false }: { children: React.ReactNode; nowrap?: boolean }) {
  return (
    <div
      className="faint"
      style={{
        fontSize: 10.5,
        fontWeight: 800,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        minWidth: 0,
        ...(nowrap ? { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : null),
      }}
    >
      {children}
    </div>
  )
}

// Two lines, then "more" — measured rather than guessed from a character
// count, because a 280-char note is two lines on a tablet and five on a phone.
function PastorNote({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(false)
  const [clipped, setClipped] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (el && !open) setClipped(el.scrollHeight > el.clientHeight + 1)
  }, [text, open])

  return (
    <div style={{ marginTop: 6, paddingLeft: 10, borderLeft: '2px solid var(--edge)' }}>
      <p
        ref={ref}
        style={{
          margin: 0,
          fontSize: 13,
          lineHeight: 1.45,
          color: 'var(--ink-dim)',
          overflowWrap: 'anywhere',
          ...(open ? null : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }),
        }}
      >
        {text}
      </p>
      {(clipped || open) && (
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          style={{ padding: 0, marginTop: 2, fontSize: 12, fontWeight: 700, color: 'var(--ink-dim)', cursor: 'pointer' }}
        >
          {open ? 'Less' : 'More'}
        </button>
      )}
    </div>
  )
}

// "through today" / "through tomorrow" / "through Sunday" / "through Nov 3".
// The admin form saves the END of the chosen local day (`saveAnnouncement`),
// so the local date of `expires_at` is the notice's last day.
function throughLabel(expiresAt: string, now: Date): string {
  const end = new Date(expiresAt)
  if (Number.isNaN(end.getTime())) return ''
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(end) - day(now)) / 86_400_000)
  if (days <= 0) return 'through today'
  if (days === 1) return 'through tomorrow'
  if (days < 7) return `through ${end.toLocaleDateString(undefined, { weekday: 'long' })}`
  return `through ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

function Shell({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <motion.button
      className="card"
      onClick={onClick}
      aria-label={label}
      whileTap={{ scale: 0.985 }}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '14px 14px 14px',
        cursor: 'pointer',
        color: 'inherit',
        font: 'inherit',
      }}
    >
      {children}
    </motion.button>
  )
}

function Signal({ icon, lit = false, children }: { icon: PaintedIconId; lit?: boolean; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 13,
        lineHeight: 1.35,
        color: lit ? 'var(--gold)' : 'var(--ink-dim)',
        fontWeight: lit ? 700 : 500,
      }}
    >
      <PaintedIcon id={icon} size={18} style={{ verticalAlign: 'middle' }} />
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  )
}

// Drawn as a button inside the card's own button, so the whole card is the tap
// target and this is only what it looks like — no nested <button>. Outlined in
// bronze, not filled gold: the gold is rationed to the thing to do NEXT, and on
// this tab that is today's verse in the box above.
function CardButton({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: 42,
        borderRadius: 14,
        border: '1.5px solid var(--edge)',
        color: 'var(--gold)',
        fontWeight: 800,
        fontSize: 15,
      }}
    >
      {children}
    </span>
  )
}

// "in 40 min" / "tonight at 8:00 pm" / "tomorrow at 1:00 am" — the same
// words `gatheringLine` picks, because the hour is ONE instant worldwide and
// for some players it lands after their midnight.
function gatheringWhen(now: Date): string {
  const { start } = gatheringWindow(now)
  const mins = Math.round((start.getTime() - now.getTime()) / 60_000)
  if (mins < 60) return `in ${Math.max(1, mins)} min`
  return start.getDate() === now.getDate() ? `tonight at ${gatheringLabel(now)}` : `tomorrow at ${gatheringLabel(now)}`
}
