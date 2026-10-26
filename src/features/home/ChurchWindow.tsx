import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChurchArt } from '@/features/church/ChurchArt'
import { tierForLevel } from '@/features/church/levels'
import { PaintedIcon, type PaintedIconId } from '@/components/PaintedIcon'
import { gatheringLabel, gatheringOpen, gatheringWindow } from '@/data/gathering'
import { useChurch } from '@/store/church'
import type { Church } from '@/types'
import { useJuice } from '@/juice/useJuice'
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
//       2. (today's church verse moved OUT of this card to its own box beside
//          the drop and the trivia — `ChurchVerseBox`, 0128 — because it is
//          a thing to PLAY, not a line to read);
//       3. the church's one live notice (`set_church_announcement` keeps one),
//          with its last day when it has one, dismissible per notice;
//       4. the giving link, where this BUILD may show one (`givingLinkVisible`);
//       5. how many play there (a church total, already public on its page)
//          and the gathering hour.
//     No giver, no rank, no "who played today" — the church rules in
//     CLAUDE.md, applied to a card. An unverified church simply has no 2-4.
//   * You don't — an invitation, "Play for a congregation": the building, one
//     warm sentence of what a church adds, and ONE door (the whole card) into
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

  // The pitch is an INVITATION, not a task: no "Add", no checklist of four
  // features to unlock, and the building is drawn first and large because a
  // place is what is being offered. It is deliberately shorter than it was
  // (one line of what a church adds, not four rows) so it sits under the
  // daily things without pushing the compass — and the arcade it invites —
  // down the screen. Still ONE tap, the whole card, into /church.
  return (
    <Shell onClick={go} label="Play for a congregation — find your church">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div aria-hidden style={{ width: 76, height: 76, flexShrink: 0, display: 'grid', placeItems: 'end center' }}>
          <ChurchArt level={1} size={76} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Eyebrow>There’s a seat for you</Eyebrow>
          <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.2, marginTop: 2 }}>Play for a congregation</div>
          <div className="dim" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.45 }}>
            The points you earn can help a church grow — the one you go to, or one near
            you — and you’ll see who else plays there.
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <CardButton>Find your church ›</CardButton>
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
  const [, bump] = useState(0)

  useEffect(() => {
    void loadToday()
  }, [loadToday])

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

// "through today" / "through tomorrow" / "through Sunday" / "through Nov 3".
// The admin form saves the END of the chosen local day (`saveAnnouncement`),
// so the local date of `expires_at` is the notice's last day.
export function throughLabel(expiresAt: string, now: Date): string {
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
