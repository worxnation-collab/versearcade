import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Avatar } from '@/components/Avatar'
import { Button } from '@/components/Button'
import { Collapsible } from '@/components/Collapsible'
import { useChurch, INFO_NOTE_MAX, INFO_NOTE_MIN, type InfoRequestRole } from '@/store/church'
import { useJuice } from '@/juice/useJuice'
import { formatMiles } from '@/lib/geo'
import { churchLevelInfo, tierForLevel } from './levels'
import { ChurchArt } from './ChurchArt'
import { ChurchScene } from './ChurchScene'
import { CHURCH_SKINS, DEFAULT_CHURCH_SKIN, type ChurchSkinChoice } from './skins'
import type { ChurchMember, ChurchPage } from '@/types'

// A church's page: what's behind tapping a row on the leaderboard.
//
// Portalled to document.body on purpose. The board lives inside a `.card`, and
// `.card` sets `backdrop-filter`, which makes it a containing block for
// `position: fixed` children — the sheet would be trapped inside the card and
// scroll with it. (Same class of bug as the `perspective` note in BookOpening.)
export function ChurchDetailSheet() {
  const page = useChurch((s) => s.page)
  const loading = useChurch((s) => s.pageLoading)
  const close = useChurch((s) => s.closeChurch)
  const juice = useJuice()

  // Escape closes it, same as tapping the scrim — this is reachable with a
  // keyboard on the web build.
  useEffect(() => {
    if (!page) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [page, close])

  // The AnimatePresence lives inside the portal rather than around the whole
  // component, so the sheet can still play its slide-out after `page` is gone.
  return createPortal(
    <AnimatePresence>
      {page && (
        <motion.div
          key="church-sheet"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => { juice.select?.(); close() }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.62)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={page.church.name}
            onClick={(e) => e.stopPropagation()}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
            style={{
              width: '100%',
              maxWidth: 520,
              maxHeight: '92vh',
              overflowY: 'auto',
              background: 'var(--bg-1)',
              borderTop: '1px solid var(--stroke)',
              borderTopLeftRadius: 22,
              borderTopRightRadius: 22,
              padding: '10px 16px calc(24px + env(safe-area-inset-bottom))',
            }}
          >
            <div style={{ width: 42, height: 4, borderRadius: 999, background: 'var(--stroke)', margin: '0 auto 12px' }} />
            <Body page={page} loading={loading} onClose={close} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function Body({ page, loading, onClose }: { page: ChurchPage; loading: boolean; onClose: () => void }) {
  const { church, members, memberTotal } = page
  const level = churchLevelInfo(church.xp)
  const tier = tierForLevel(level.level)
  const where = [church.city, church.region].filter(Boolean).join(', ')

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 style={{ fontSize: 21, margin: 0, overflowWrap: 'anywhere' }}>{church.name}</h2>
          <p className="faint" style={{ margin: '3px 0 0', fontSize: 12.5 }}>
            {where || 'Location not listed'}
            {church.miles != null && !church.isMine ? ` · ${formatMiles(church.miles)} away` : ''}
            {church.isMine ? ' · your church' : ''}
          </p>
        </div>
        <button onClick={onClose} className="pill" style={{ fontSize: 13, fontWeight: 800, padding: '7px 14px', flexShrink: 0 }}>
          Close
        </button>
      </div>

      {/* The wide shot: the building, and the people who play for it. */}
      <ChurchScene level={level.level} members={members} skin={church.skin} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, margin: '12px 0 14px' }}>
        <Stat label={tier.name} value={`LVL ${level.level}`} tone="var(--gold)" />
        <Stat label="church XP" value={church.xp.toLocaleString()} />
        <Stat
          label={memberTotal === 1 ? 'player' : 'players'}
          value={memberTotal.toLocaleString()}
        />
      </div>

      {church.rank != null && (
        <p className="dim center" style={{ margin: '0 0 14px', fontSize: 13 }}>
          Ranked <b style={{ color: 'var(--gold)' }}>#{church.rank}</b> on the board you're looking at.
        </p>
      )}

      <Congregation members={members} total={memberTotal} loading={loading} />

      <InfoSection page={page} loading={loading} />
      <div style={{ height: 8 }} />
    </>
  )
}

// Whether the roster was left open, remembered across churches. A congregation
// of two dozen is a tall block sitting between the building and the "Add info"
// pill, and whether you want to read names every time is a taste, not a state of
// the church — so it's one flag for the whole feature, not one per church.
const ROSTER_KEY = 'va.church.roster'

function rosterOpen(): boolean {
  try {
    // Open unless it was explicitly folded: the names are the point of the section.
    return localStorage.getItem(ROSTER_KEY) !== '0'
  } catch {
    return true
  }
}

function rememberRoster(open: boolean) {
  try {
    localStorage.setItem(ROSTER_KEY, open ? '1' : '0')
  } catch {
    /* private mode — the choice just won't stick */
  }
}

// Who plays here, by name. Join order, no numbers, no medals: the same crowd the
// scene draws, spelled out — a congregation reads as people, and a building with
// eleven anonymous figures outside it doesn't tell you whether you know any of
// them. Deliberately not "top givers": that list is a thank-you and only ever
// appears on your own church, where nobody is being measured against a stranger.
//
// It folds, and the head count rides on the header, so a folded section still
// tells you how big the congregation is rather than going quiet.
function Congregation({ members, total, loading }: { members: ChurchMember[]; total: number; loading: boolean }) {
  const hidden = Math.max(0, total - members.length)
  if (!members.length) {
    // Nothing to fold away — one sentence, left open.
    return loading ? null : (
      <div className="card" style={{ marginBottom: 14 }}>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>Who plays here</b>
        <p className="dim" style={{ margin: '6px 0 0', fontSize: 13.5 }}>
          Nobody yet — this church is on the board, but no one has picked it as theirs.
        </p>
      </div>
    )
  }
  return (
    <Collapsible
      icon="🙌"
      title="Who plays here"
      meta={`${total.toLocaleString()} ${total === 1 ? 'player' : 'players'}`}
      defaultOpen={rosterOpen()}
      onToggle={rememberRoster}
    >
      <div className="card">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {members.map((m) => (
            <span
              key={m.username}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                maxWidth: '100%',
                minWidth: 0,
                padding: '5px 12px 5px 5px',
                borderRadius: 999,
                border: '1px solid',
                borderColor: m.isMe ? 'var(--gold)' : 'var(--stroke)',
                background: m.isMe ? 'rgba(255,210,63,0.10)' : 'var(--card)',
              }}
            >
              {/* `username` makes the avatar tappable — it opens their player card,
                  the same as every other avatar in the app. */}
              <Avatar emoji={m.avatarEmoji} character={m.avatarCharacter} username={m.username} size={28} />
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {m.username}{m.isMe ? ' (you)' : ''}
              </span>
            </span>
          ))}
        </div>

        {hidden > 0 && (
          <p className="faint" style={{ margin: '10px 0 0', fontSize: 12 }}>
            and {hidden.toLocaleString()} more
          </p>
        )}
      </div>
    </Collapsible>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="card" style={{ padding: '10px 8px', textAlign: 'center', minWidth: 0 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, color: tone ?? 'var(--ink)' }}>
        {value}
      </div>
      <div className="faint" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Church details + the "Add info" pill
// ---------------------------------------------------------------------------
// The pill is the front of a queue, not a publish button. A player's note goes
// to a person to read; nothing they type appears on the church's page by
// submitting it. That's deliberate — this is somebody else's congregation, and
// an open text field on it is a moderation problem, not a feature.
//
// Nothing here mentions a price or takes money: the paid side of a claimed
// church page is settled with the church directly, off the device, which keeps
// this surface identical on the web and in the App Store build (see
// lib/commerce.ts for where a real storefront decision would live).
function InfoSection({ page, loading }: { page: ChurchPage; loading: boolean }) {
  const { church, info, myRequestPending } = page
  const [open, setOpen] = useState(false)
  const juice = useJuice()

  // A different church means a different form — reset when the sheet reopens.
  useEffect(() => { setOpen(false) }, [church.id])

  if (open) {
    return (
      <InfoRequestForm
        churchId={church.id}
        churchName={church.name}
        // Preview the skin on the building this church has actually earned, and
        // start from the one it's already wearing — a chooser that opens on
        // somebody else's look reads as a proposal to change it.
        level={churchLevelInfo(church.xp).level}
        currentSkin={church.skin}
        onDone={() => setOpen(false)}
      />
    )
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: info ? 10 : 6 }}>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 16, flex: 1 }}>About this church</b>
        {!myRequestPending && (
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={() => { juice.select?.(); setOpen(true) }}
            className="pill"
            style={{ borderColor: 'var(--gold)', color: 'var(--gold)', fontWeight: 800, fontSize: 12.5, flexShrink: 0 }}
          >
            {info ? 'Suggest an edit' : '＋ Add info'}
          </motion.button>
        )}
      </div>

      {info ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {info.tagline && <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700 }}>{info.tagline}</p>}
          {info.about && <p className="dim" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>{info.about}</p>}
          {info.serviceTimes && <Detail icon="🕘" label="Services" value={info.serviceTimes} />}
          {info.contact && <Detail icon="✉️" label="Contact" value={info.contact} />}
          {info.website && <Detail icon="🌐" label="Website" value={info.website} href={info.website} />}
        </div>
      ) : loading ? (
        <p className="faint" style={{ margin: 0, fontSize: 13 }}>Looking…</p>
      ) : myRequestPending ? (
        // Don't ask again for something they've already sent.
        <p className="dim" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>Nothing here yet.</p>
      ) : (
        <p className="dim" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>
          Nothing here yet. If you're on staff at {church.name}, you can claim this page and put
          service times, a website and a line about who you are on it. If you just go here, tell us
          what belongs on it — most congregations' leadership isn't in the app yet.
        </p>
      )}

      {myRequestPending && (
        <p className="faint" style={{ margin: info ? '10px 0 0' : '10px 0 0', fontSize: 12.5, lineHeight: 1.5 }}>
          ✅ Your note is in the queue. A person reads these — give us a few days.
        </p>
      )}
    </div>
  )
}

function Detail({ icon, label, value, href }: { icon: string; label: string; value: string; href?: string }) {
  const link = href && /^https?:\/\//i.test(href) ? href : href ? `https://${href}` : undefined
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 13.5, minWidth: 0 }}>
      <span style={{ flexShrink: 0 }}>{icon}</span>
      <span className="faint" style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </span>
      {link ? (
        <a href={link} target="_blank" rel="noreferrer noopener" style={{ color: 'var(--sky)', overflowWrap: 'anywhere' }}>
          {value}
        </a>
      ) : (
        <span style={{ overflowWrap: 'anywhere' }}>{value}</span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The inquiry form
// ---------------------------------------------------------------------------
const REASONS: Record<string, string> = {
  already_pending: "You've already got a note in for this church — we're on it.",
  note_too_short: 'A little more detail, please — a sentence is plenty.',
  name_required: 'We need a name to reply to.',
  email_required: 'That email doesn’t look right.',
  not_found: 'That church has gone missing. Try reopening it.',
  offline: 'You need to be signed in to send this.',
}

function InfoRequestForm({
  churchId,
  churchName,
  level,
  currentSkin,
  onDone,
}: {
  churchId: string
  churchName: string
  level: number
  currentSkin?: string | null
  onDone: () => void
}) {
  const requestInfo = useChurch((s) => s.requestInfo)
  const juice = useJuice()
  const [role, setRoleState] = useState<InfoRequestRole>('member')
  const [skin, setSkin] = useState<ChurchSkinChoice>(
    (CHURCH_SKINS.find((s) => s.id === currentSkin)?.id ?? DEFAULT_CHURCH_SKIN) as ChurchSkinChoice,
  )
  const [note, setNote] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const max = INFO_NOTE_MAX[role]
  // Switching down to the short path has to take the note with it, or the
  // counter reads 400/180 and the server quietly truncates on send.
  const setRole = (next: InfoRequestRole) => {
    setRoleState(next)
    setNote((n) => n.slice(0, INFO_NOTE_MAX[next]))
    setErr(null)
  }
  const leadership = role === 'leadership'
  const valid =
    note.trim().length >= INFO_NOTE_MIN &&
    (!leadership || (name.trim().length >= 2 && email.includes('@') && email.trim().length >= 5))

  const submit = async () => {
    if (!valid || busy) return
    setBusy(true)
    setErr(null)
    const res = await requestInfo({ churchId, role, note, name, email, skin: leadership ? skin : undefined })
    setBusy(false)
    if (!res.ok) {
      setErr(REASONS[res.reason ?? ''] ?? 'That didn’t go through. Try again in a moment.')
      return
    }
    juice.celebrate()
    setSent(true)
  }

  if (sent) {
    return (
      <div className="card center">
        <div style={{ fontSize: 32 }}>🙏</div>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 17, display: 'block', marginTop: 6 }}>Thank you</b>
        <p className="dim" style={{ margin: '6px 0 14px', fontSize: 13.5, lineHeight: 1.55 }}>
          {!leadership
            ? `We'll use this to fill in ${churchName}'s page — and we'll reach out to the church too.`
            : skin === 'custom'
              ? `We'll email you about ${churchName}'s page, and about drawing the building itself.`
              : `We'll email you about ${churchName}'s page.`}
        </p>
        <Button variant="secondary" full onClick={onDone}>Back</Button>
      </div>
    )
  }

  return (
    <div className="card" style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 16, flex: 1 }}>Add info</b>
        <button onClick={onDone} className="faint" style={{ fontSize: 12.5, textDecoration: 'underline', flexShrink: 0 }}>
          Cancel
        </button>
      </div>

      <p className="dim" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
        Who are you to {churchName}?
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <RoleChip active={role === 'member'} onClick={() => { juice.select?.(); setRole('member') }}>
          I go here
        </RoleChip>
        <RoleChip active={leadership} onClick={() => { juice.select?.(); setRole('leadership') }}>
          I'm on staff
        </RoleChip>
      </div>

      {leadership && (
        <>
          <label style={labelStyle}>
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Pastor Jane Smith" maxLength={80} />
          </label>
          <label style={labelStyle}>
            Email
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@church.org"
              type="email"
              autoCapitalize="none"
              autoCorrect="off"
              maxLength={120}
            />
          </label>
          <SkinPicker
            churchName={churchName}
            level={level}
            value={skin}
            onPick={(next) => { juice.select?.(); setSkin(next) }}
          />
        </>
      )}

      <label style={labelStyle}>
        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span>{leadership ? 'What should be on the page?' : 'What should we put on this church’s page?'}</span>
          <span style={{ flexShrink: 0, color: note.length >= max ? 'var(--tangerine)' : undefined }}>
            {note.length}/{max}
          </span>
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, max))}
          rows={leadership ? 4 : 3}
          maxLength={max}
          placeholder={
            leadership
              ? 'Service times, a line about your congregation, your website…'
              : 'Sundays 9 & 11am, Wednesday youth night…'
          }
          style={{ resize: 'vertical' }}
        />
      </label>
      <p className="faint" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5 }}>
        {leadership
          ? 'We’ll email you to set the page up.'
          : 'A short note — leadership can claim the page properly later.'}
      </p>

      {err && <p style={{ color: 'var(--coral)', fontSize: 13, margin: 0 }}>{err}</p>}

      <Button variant="gold" full disabled={!valid || busy} onClick={submit}>
        {busy ? 'Sending…' : 'Send'}
      </Button>
      <p className="faint" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5 }}>
        Notes are read by a person before anything goes on the page — nothing you write here is
        published to {churchName} straight away.
      </p>
    </div>
  )
}

function RoleChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      style={{
        padding: '9px 8px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 800,
        border: '1px solid var(--stroke)',
        background: active ? 'linear-gradient(180deg, var(--grape), var(--grape-deep))' : 'var(--card)',
        color: active ? '#fff' : 'var(--ink-faint)',
        boxShadow: active ? '0 4px 14px rgba(122,63,242,0.45)' : 'none',
      }}
    >
      {children}
    </motion.button>
  )
}

const labelStyle: React.CSSProperties = { display: 'grid', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--ink-faint)' }

// ---------------------------------------------------------------------------
// Choosing how the building looks
// ---------------------------------------------------------------------------
// Staff only, and it's still an ask rather than a setting: this posts to the
// same review queue as everything else on the form, and `church_profiles` has
// no client write path at all (0050/0051). Picking "Tile roof" here does not
// change a single pixel for anybody until a person publishes it.
//
// Each tile previews the church's OWN building — the tier it has actually
// earned — because that's what the choice is really about. Showing a cathedral
// to a congregation on the second rung would be selling them a level, and the
// levels aren't for sale.
//
// NOTHING HERE NAMES A PRICE, on purpose, and that isn't squeamishness — it's
// the rule this whole surface is built to keep. The pill has to be byte-
// identical on the web and in the App Store build, and a price label is a
// storefront even with no button under it (see lib/commerce.ts). Custom work
// says what it is — a commission, answered by email — which is the honest
// version anyway: what a hand-drawn building costs depends on the building.
// If a church page ever gets a real in-app price, that decision goes in
// commerce.ts and nowhere else.
function SkinPicker({
  churchName,
  level,
  value,
  onPick,
}: {
  churchName: string
  level: number
  value: ChurchSkinChoice
  onPick: (skin: ChurchSkinChoice) => void
}) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-faint)' }}>
        How should {churchName} look?
      </span>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {CHURCH_SKINS.map((s) => (
          <SkinTile key={s.id} active={value === s.id} onClick={() => onPick(s.id)}>
            <ChurchArt level={level} skin={s.id} size={98} />
            <b style={{ fontSize: 12.5, marginTop: 2 }}>{s.name}</b>
            <span className="faint" style={{ fontSize: 10.5, lineHeight: 1.35, textAlign: 'center' }}>
              {s.id === DEFAULT_CHURCH_SKIN ? 'The one you have now' : s.blurb}
            </span>
          </SkinTile>
        ))}
      </div>

      <SkinTile active={value === 'custom'} onClick={() => onPick('custom')} row>
        <span style={{ fontSize: 26, lineHeight: 1 }}>✏️</span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <b style={{ fontSize: 13, display: 'block' }}>Custom — draw our actual building</b>
          <span className="faint" style={{ fontSize: 11.5, lineHeight: 1.45, display: 'block' }}>
            Your roofline, your windows, your doors. This one is a commission rather than a preset,
            so we'll write back about what it takes before anything gets drawn.
          </span>
        </span>
      </SkinTile>

      <p className="faint" style={{ margin: 0, fontSize: 11, lineHeight: 1.5 }}>
        Whichever you pick, the building stays the one your congregation earned by playing — right now
        that's the {tierForLevel(level).name}. A look never moves your level or your place on the board.
      </p>
    </div>
  )
}

function SkinTile({
  active,
  onClick,
  row = false,
  children,
}: {
  active: boolean
  onClick: () => void
  row?: boolean
  children: React.ReactNode
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: 'flex',
        flexDirection: row ? 'row' : 'column',
        // The wide row's icon belongs beside its heading, not floating level
        // with the middle of a four-line paragraph.
        alignItems: row ? 'flex-start' : 'center',
        gap: row ? 10 : 1,
        textAlign: row ? 'left' : 'center',
        padding: row ? '10px 12px' : '8px 6px 10px',
        borderRadius: 'var(--r-sm)',
        border: '1px solid',
        borderColor: active ? 'var(--gold)' : 'var(--stroke)',
        background: active ? 'rgba(255,210,63,0.10)' : 'var(--card)',
        color: 'var(--ink)',
        minWidth: 0,
      }}
    >
      {children}
    </motion.button>
  )
}
