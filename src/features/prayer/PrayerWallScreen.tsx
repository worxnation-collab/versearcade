import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { useAuth } from '@/store/auth'
import { usePrayerWall, type DealtNote, type MyNote, type PrayResult } from '@/store/prayerWall'
import { useJuice } from '@/juice/useJuice'
import {
  PRAYER_CATEGORIES,
  PRAYER_LINE_MAX,
  PRAYER_NOTE_DAYS,
  PRAY_FOR_DAILY_CAP,
  PRAY_FOR_MILESTONES,
  nextPrayForMilestone,
  prayForRank,
  prayerCategoryById,
  type PrayerCategory,
} from '@/data/prayerWall'
import { WallScene } from './WallScene'
import { Candle } from './Candle'

// The Prayer Wall — /pray.
//
// Three things on one screen, top to bottom: the wall (a place, with tonight's
// notes in it), the note the wall hands you and the candle you hold for it,
// and your own note. See data/prayerWall.ts for the rules and
// docs/PRAYER-WALL.md for the whole argument.
//
// THE WALL DEALS; NOBODY BROWSES. There is no list of requests to scroll and
// nothing to sort. "Pray for someone" asks the server for one note — the one
// with the fewest kneelings, at random among equals — and that is the note
// you get. It is what makes the wall fair without a number on any note: the
// buried ones surface on their own.
//
// NOTHING HERE SCOLDS. Out of candles for the day is a warm line and the
// candle still lights (the kneeling is recorded, it just isn't paid). A quiet
// wall is an invitation to leave a note. A note that was reported says so
// plainly to its owner and offers another.

export default function PrayerWallScreen() {
  const navigate = useNavigate()
  const juice = useJuice()
  const isGuest = useAuth((s) => s.mode) === 'local'
  const wall = usePrayerWall()
  const [dealing, setDealing] = useState(false)
  const [result, setResult] = useState<PrayResult | null>(null)

  useEffect(() => {
    if (isGuest) return
    void usePrayerWall.getState().load()
  }, [isGuest])

  const back = () => { juice.select(); navigate(-1) }

  if (isGuest) {
    return (
      <Page>
        <Header onBack={back} />
        <WallScene count={0} stars={[]} />
        <div className="card" style={{ textAlign: 'center', marginTop: 14 }}>
          <div style={{ fontSize: 34 }}>🕯️</div>
          <p style={{ margin: '8px 0 14px', lineHeight: 1.5 }}>
            The wall needs somebody on the other end of it — a note to kneel at, and a stranger to kneel at
            yours — so it comes with an account. Free, and your streak and character come with you.
          </p>
          <Button variant="gold" full onClick={() => navigate('/auth?mode=signup')}>Create an account</Button>
        </div>
      </Page>
    )
  }

  const draw = async (skip = false) => {
    juice.select()
    setResult(null)
    setDealing(true)
    const note = await usePrayerWall.getState().draw(skip)
    // Let the slip finish sliding out of the wall before the card lands.
    window.setTimeout(() => setDealing(false), note ? 500 : 0)
  }

  const onLit = async () => {
    const r = await usePrayerWall.getState().pray()
    setResult(r)
    if (r.ok) {
      if (r.leveledUp) juice.levelUp()
      else if (r.milestone) juice.celebrate()
      else juice.coin()
    }
  }

  const stars = wall.stars.map((s) => prayerCategoryById(s.category).emoji)

  return (
    <Page>
      <Header onBack={back} />

      <WallScene count={wall.wallCount} stars={stars} dealing={dealing} />
      <p className="faint" style={{ fontSize: 12, margin: '8px 2px 14px', lineHeight: 1.5, textAlign: 'center' }}>
        {wall.loaded && !wall.available
          ? 'The wall isn’t open on this server yet.'
          : wall.wallCount === 0
            ? 'The wall is bare tonight. Yours could be the first note in it.'
            : wall.wallCount === 1
              ? 'One note in the wall tonight.'
              : `${wall.wallCount} notes in the wall tonight.`}
        {wall.stars.length > 0 && ' The stars are prayers answered this week.'}
      </p>

      {/* ── The note in your hand ─────────────────────────────────────── */}
      <h3 style={{ fontSize: 16, margin: '0 0 10px' }} className="dim">Hold a candle for someone</h3>
      {wall.available && (
        <NoteInHand
          note={wall.current}
          drawing={wall.drawing || dealing}
          quiet={wall.quiet}
          result={result}
          remaining={wall.remaining()}
          onDraw={() => void draw(false)}
          onSkip={() => void draw(true)}
          onLit={() => void onLit()}
          onReport={() => { juice.select(); void usePrayerWall.getState().report(); setResult(null) }}
          onDone={() => { juice.select(); setResult(null); usePrayerWall.setState({ current: null }) }}
        />
      )}

      {/* ── Your own note ─────────────────────────────────────────────── */}
      <h3 style={{ fontSize: 16, margin: '18px 0 10px' }} className="dim">Your note</h3>
      {wall.available && <YourNote note={wall.mine} />}

      {/* ── Answered ──────────────────────────────────────────────────── */}
      {wall.answered.length > 0 && (
        <>
          <h3 style={{ fontSize: 16, margin: '18px 0 10px' }} className="dim">Answered</h3>
          <div className="card" style={{ display: 'grid', gap: 10 }}>
            {wall.answered.map((n) => (
              <AnsweredRow key={n.id} note={n} />
            ))}
          </div>
        </>
      )}

      {/* ── The ladder ────────────────────────────────────────────────── */}
      {wall.available && <Ladder lifetime={wall.lifetime} />}

      <div style={{ marginTop: 18 }}>
        <Button variant="secondary" full onClick={back}>Back</Button>
      </div>
    </Page>
  )
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <h2 style={{ fontSize: 24, margin: 0 }}>🕯️ The Prayer Wall</h2>
      <div style={{ flex: 1 }} />
      <button className="pill" onClick={onBack} style={{ fontSize: 13, fontWeight: 800, padding: '7px 14px' }}>
        Back
      </button>
    </div>
  )
}

// ── the dealt note ───────────────────────────────────────────────────────────

function NoteInHand({
  note,
  drawing,
  quiet,
  result,
  remaining,
  onDraw,
  onSkip,
  onLit,
  onReport,
  onDone,
}: {
  note: DealtNote | null
  drawing: boolean
  quiet: boolean
  result: PrayResult | null
  remaining: number
  onDraw: () => void
  onSkip: () => void
  onLit: () => void
  onReport: () => void
  onDone: () => void
}) {
  const reduceMotion = useReducedMotion()
  const prayed = !!result?.ok

  if (drawing) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 26 }}>
        <motion.div
          animate={reduceMotion ? undefined : { rotate: [0, -6, 6, 0] }}
          transition={{ duration: 1.2, repeat: Infinity }}
          style={{ fontSize: 34 }}
        >
          📜
        </motion.div>
        <p className="dim" style={{ margin: '8px 0 0', fontSize: 14 }}>The wall is choosing one for you…</p>
      </div>
    )
  }

  if (!note) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        {quiet ? (
          <>
            <div style={{ fontSize: 34 }}>🌙</div>
            <p className="dim" style={{ margin: '8px 0 14px', fontSize: 14, lineHeight: 1.5 }}>
              Nothing more for you tonight — every note in the wall has had your candle today, or it is quiet.
              Leave one of your own below, or come back tomorrow.
            </p>
            <Button variant="secondary" full onClick={onDraw}>Look again</Button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 34 }}>🕯️</div>
            <p className="dim" style={{ margin: '8px 0 14px', fontSize: 14, lineHeight: 1.5 }}>
              The wall hands you a note. You read it, hold the candle until it catches, and somebody you will
              never meet finds out that a stranger knelt for them today.
            </p>
            <Button variant="gold" full onClick={onDraw}>Pray for someone</Button>
            <p className="faint" style={{ fontSize: 11.5, margin: '10px 0 0' }}>
              {remaining > 0
                ? `${remaining} of ${PRAY_FOR_DAILY_CAP} candles left today · 1 XP each`
                : 'Your twelve are done for today — the candle still lights, it just doesn’t pay.'}
            </p>
          </>
        )}
      </div>
    )
  }

  const cat = prayerCategoryById(note.category)

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={note.id}
        initial={reduceMotion ? false : { y: -40, opacity: 0, rotate: -4 }}
        animate={
          prayed && !reduceMotion
            ? { y: -60, opacity: 0.0, scale: 0.92, rotate: 0, transition: { duration: 1.6, ease: 'easeIn' } }
            : { y: 0, opacity: 1, rotate: 0 }
        }
        transition={{ type: 'spring', stiffness: 260, damping: 22 }}
        className="card"
        style={{
          background: 'linear-gradient(180deg, #f6ebcb, #ecd9ad)',
          color: '#2a1a0a',
          border: '1px solid #c9b48c',
          position: 'relative',
        }}
      >
        {/* Requester, only if they signed it. Tapping the face opens their
            card, which is where washing their feet already lives. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          {note.signed && note.username ? (
            <>
              <Avatar
                emoji={note.avatarEmoji ?? '🙂'}
                character={note.avatarCharacter}
                username={note.username}
                size={36}
              />
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 13, display: 'block' }}>@{note.username}</b>
                <span style={{ fontSize: 11.5, opacity: 0.7 }}>left this note</span>
              </div>
            </>
          ) : (
            <span style={{ fontSize: 12.5, opacity: 0.7, fontWeight: 700 }}>Somebody left this note.</span>
          )}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 22 }}>{cat.emoji}</span>
        </div>

        <b style={{ fontFamily: 'var(--font-display)', fontSize: 20, display: 'block' }}>{cat.label}</b>
        <p style={{ margin: '2px 0 0', fontSize: 14, opacity: 0.85 }}>{cat.ask}</p>
        {note.line && (
          <p style={{ margin: '10px 0 0', fontSize: 15, lineHeight: 1.5, fontStyle: 'italic' }}>
            “{note.line}”
          </p>
        )}

        <div style={{ margin: '14px 0 0', padding: '10px 12px', borderRadius: 12, background: 'rgba(255,255,255,0.45)' }}>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>
            <i>{cat.verse}</i>
          </p>
          <span style={{ fontSize: 11.5, opacity: 0.7, display: 'block', marginTop: 4 }}>— {cat.reference}</span>
        </div>

        <p style={{ margin: '12px 0 8px', fontSize: 14, lineHeight: 1.55, textAlign: 'center' }}>
          {cat.prayer}
        </p>

        <div style={{ display: 'grid', justifyItems: 'center', margin: '4px 0 6px' }}>
          <Candle key={note.id} onLit={onLit} lit={prayed} />
        </div>

        {result && (
          <p style={{ margin: '6px 0 0', fontSize: 13.5, textAlign: 'center', fontWeight: 700 }}>
            {result.ok
              ? result.milestone
                ? `${result.milestone.emoji} ${result.milestone.name} — ${result.milestone.blurb}`
                : (result.awarded ?? 0) > 0
                  ? 'Amen. +1 XP — they’ll know somebody knelt today.'
                  : 'Amen. Your twelve were done, and this one still counted where it matters.'
              : result.reason === 'already'
                ? 'You already knelt at this one today.'
                : result.reason === 'closed'
                  ? 'This note came down while you were reading it.'
                  : 'That didn’t save, but it still counted where it matters.'}
          </p>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {prayed || (result && !result.ok) ? (
            <>
              <button className="pill" onClick={onSkip} style={{ ...PILL, fontWeight: 800 }}>Another note</button>
              <button className="pill" onClick={onDone} style={PILL}>Done</button>
            </>
          ) : (
            <>
              <button className="pill" onClick={onSkip} style={PILL}>Not this one</button>
              <button className="pill" onClick={onReport} style={{ ...PILL, opacity: 0.7 }}>Report</button>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

const PILL: React.CSSProperties = {
  fontSize: 12.5,
  padding: '7px 12px',
  color: '#2a1a0a',
  borderColor: 'rgba(42,26,10,0.25)',
  background: 'rgba(255,255,255,0.35)',
}

// ── your own note ────────────────────────────────────────────────────────────

function YourNote({ note }: { note: MyNote | null }) {
  const juice = useJuice()
  const [category, setCategory] = useState<PrayerCategory>('peace')
  const [line, setLine] = useState('')
  const [signed, setSigned] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const showForm = !note || (!note.open && !note.reported) || (note.reported && !note.open)

  const submit = async () => {
    if (busy) return
    setBusy(true)
    juice.select()
    const r = await usePrayerWall.getState().post(category, line, signed)
    setBusy(false)
    if (!r.ok) {
      setMsg(r.reason === 'active' ? 'You already have a note in the wall.' : 'That didn’t save. Try again in a moment.')
      return
    }
    juice.whoosh()
    setLine('')
    setMsg(null)
  }

  if (note && (note.open || (note.answeredAt && !showForm))) {
    const cat = prayerCategoryById(note.category)
    const daysLeft = Math.max(0, Math.ceil((new Date(note.expiresAt).getTime() - Date.now()) / 86_400_000))
    return (
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 26 }}>{cat.emoji}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 16, display: 'block' }}>{cat.label}</b>
            {note.line && <span className="dim" style={{ fontSize: 13, fontStyle: 'italic' }}>“{note.line}”</span>}
          </div>
          {/* The lantern. "Today, yes" or nothing — the prayer lamp's shape. */}
          <span title={note.lit ? 'Somebody knelt today' : 'Nobody yet today'} style={{ fontSize: 24, filter: note.lit ? 'none' : 'grayscale(1) opacity(0.45)' }}>
            🏮
          </span>
        </div>

        <p className="dim" style={{ fontSize: 13.5, margin: '10px 0 0', lineHeight: 1.5 }}>
          {note.lit ? 'Somebody knelt at your note today.' : 'Nobody has knelt yet today — the wall deals it out when it can.'}
          {' '}
          {note.prayedTotal > 0 && (
            <span className="faint">
              {note.prayedTotal === 1 ? 'One candle' : `${note.prayedTotal} candles`} held for it so far — a number only you can see.
            </span>
          )}
        </p>

        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button
            className="pill"
            onClick={() => { juice.celebrate(); void usePrayerWall.getState().markAnswered() }}
            style={{ fontWeight: 800, borderColor: 'var(--gold)', color: 'var(--gold)' }}
          >
            ✨ Answered
          </button>
          {!note.renewed && daysLeft <= 2 && (
            <button className="pill" onClick={() => { juice.select(); void usePrayerWall.getState().renew() }} style={{ fontWeight: 800 }}>
              Keep it up another week
            </button>
          )}
          <button className="pill" onClick={() => { juice.select(); void usePrayerWall.getState().withdraw() }} style={{ opacity: 0.8 }}>
            Take it down
          </button>
        </div>
        <p className="faint" style={{ fontSize: 11.5, margin: '10px 0 0' }}>
          {daysLeft === 0 ? 'Comes down tonight.' : daysLeft === 1 ? 'One more day in the wall.' : `${daysLeft} more days in the wall.`}
          {note.signed ? ' Signed with your face.' : ' Unsigned — nobody sees who left it.'}
          {note.line ? ' Your line shows only to your church and your buddies.' : ''}
        </p>
      </div>
    )
  }

  return (
    <div className="card">
      {note?.answeredAt && (
        <p style={{ margin: '0 0 12px', fontSize: 13.5, lineHeight: 1.5 }}>
          ✨ Your last note was answered. Everyone who knelt at it has been told.
        </p>
      )}
      {note?.reported && (
        <p className="dim" style={{ margin: '0 0 12px', fontSize: 13.5, lineHeight: 1.5 }}>
          Your last note was taken off the wall for a look. You can leave another.
        </p>
      )}
      <p className="dim" style={{ margin: '0 0 10px', fontSize: 13.5, lineHeight: 1.5 }}>
        Tuck a note into the wall. Strangers see only what kind of thing it is; a line, if you add one, shows to
        your church and your buddies. It stays {PRAYER_NOTE_DAYS} days.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 10 }}>
        {PRAYER_CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => { juice.select(); setCategory(c.id) }}
            aria-pressed={category === c.id}
            style={{
              padding: '8px 4px',
              borderRadius: 12,
              border: `1.5px solid ${category === c.id ? 'var(--gold)' : 'var(--stroke)'}`,
              background: category === c.id ? 'rgba(255,210,63,0.12)' : 'var(--card)',
              display: 'grid',
              justifyItems: 'center',
              gap: 2,
            }}
          >
            <span style={{ fontSize: 20 }}>{c.emoji}</span>
            <span style={{ fontSize: 10.5, fontWeight: 800, lineHeight: 1.1, textAlign: 'center' }}>{c.label}</span>
          </button>
        ))}
      </div>
      <input
        value={line}
        onChange={(e) => setLine(e.target.value.slice(0, PRAYER_LINE_MAX))}
        placeholder="A line, if you want (church and buddies only)"
        maxLength={PRAYER_LINE_MAX}
        style={{ width: '100%' }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 12px' }}>
        <span className="faint" style={{ fontSize: 11 }}>{line.length}/{PRAYER_LINE_MAX}</span>
        <div style={{ flex: 1 }} />
        <button
          className="pill"
          onClick={() => { juice.select(); setSigned(!signed) }}
          aria-pressed={signed}
          style={{ fontSize: 12, fontWeight: 800, borderColor: signed ? 'var(--gold)' : undefined, color: signed ? 'var(--gold)' : undefined }}
        >
          {signed ? '🙂 Signed with your face' : '🎭 Unsigned'}
        </button>
      </div>
      <Button variant="gold" full disabled={busy} onClick={() => void submit()}>Tuck it into the wall</Button>
      {msg && <p className="dim" style={{ fontSize: 13, margin: '10px 0 0', textAlign: 'center' }}>{msg}</p>}
    </div>
  )
}

function AnsweredRow({ note }: { note: DealtNote }) {
  const cat = prayerCategoryById(note.category)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 22 }}>⭐</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontSize: 14, display: 'block' }}>
          {cat.emoji} {cat.label}
          {note.signed && note.username ? ` · @${note.username}` : ''}
        </b>
        <span className="faint" style={{ fontSize: 12 }}>
          A note you knelt at was answered
          {note.answeredAt ? ` · ${new Date(note.answeredAt).toLocaleDateString()}` : ''}
        </span>
      </div>
    </div>
  )
}

// ── the ladder ───────────────────────────────────────────────────────────────

function Ladder({ lifetime }: { lifetime: number }) {
  const rank = prayForRank(lifetime)
  const next = nextPrayForMilestone(lifetime)
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 26 }}>{rank?.emoji ?? '🕯️'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 16, display: 'block' }}>
            {rank ? rank.name : 'Not yet knelt'}
          </b>
          <span className="faint" style={{ fontSize: 12 }}>
            {lifetime === 0
              ? 'Your first candle is one note away.'
              : `${lifetime} ${lifetime === 1 ? 'candle' : 'candles'} held for other people — a number that only goes up.`}
          </span>
        </div>
      </div>
      {next && (
        <p className="faint" style={{ fontSize: 12, margin: '10px 0 0' }}>
          Next: {next.emoji} {next.name} at {next.goal}.
        </p>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        {PRAY_FOR_MILESTONES.map((m) => (
          <span
            key={m.id}
            title={m.blurb}
            className="pill"
            style={{
              fontSize: 11,
              padding: '4px 9px',
              opacity: lifetime >= m.goal ? 1 : 0.4,
              borderColor: lifetime >= m.goal ? 'var(--gold)' : undefined,
            }}
          >
            {m.emoji} {m.name}
          </span>
        ))}
      </div>
    </div>
  )
}
