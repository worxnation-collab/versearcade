import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ChurchArt } from './ChurchArt'
import { StatueIcon, drawableStatues } from './ChurchStatues'
import { useRivalry, type RivalryResult } from '@/store/rivalry'
import { useJuice } from '@/juice/useJuice'
import type { Church } from '@/types'
import {
  PLINTHS,
  bandLabel,
  outcomeEarnsStatue,
  outcomeLine,
  plinthById,
  statueById,
  timeLeftLabel,
} from './rivalry'

// This week's matchup, and the statue a win buys.
//
// EVERY LINE ON THIS CARD IS WRITTEN TO BE READ BY THE CHURCH THAT IS BEHIND.
// That is the design constraint, not a tone preference — see the header of
// rivalry.ts for why a church is allowed to lose here when a person is not.
// Concretely, and these are the things to preserve if this card is ever
// redesigned:
//
//   The bar shows a SHARE, not a gap. "You have 43% of the points played this
//   week" is a thing to push on; "you are 2,300 behind" is a scoreboard rubbing
//   it in, and it is the same number.
//
//   There is no "losing" state word anywhere. Behind is "There's a week to
//   close it", level is "Dead level", ahead is "Ahead by a nose" — and the
//   call to action underneath is always the same one: play, and give.
//
//   No member of either congregation is named, drawn or counted. The opponent
//   is a building and a name, and our own side is a single total. There is no
//   payload for anything else (see 0075) so there is nothing to accidentally
//   render.

export function RivalryCard({ mine: myChurch }: { mine: Church }) {
  const {
    loaded, mine, theirs, opponent, last, wins, band, weekEndsAt,
  } = useRivalry()

  // Recomputed on a slow tick rather than a timer: a week-long contest with a
  // seconds counter on it is a pressure device, and this is meant to be a thing
  // a congregation does together over a week.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  const endsAt = weekEndsAt ? new Date(weekEndsAt) : null
  const left = useMemo(() => timeLeftLabel(now), [now])

  if (!loaded) return null

  // A bye. Not a loss, and said so plainly rather than shown as an empty
  // scoreboard with a blank opposite half.
  if (!opponent) {
    return (
      <div className="card">
        <Heading wins={wins} />
        <p className="dim" style={{ margin: '10px 0 0', fontSize: 13.5, lineHeight: 1.5 }}>
          No matchup this week — there's no other church your size playing yet. Everything you give
          still counts for your church, and you'll be matched as soon as somebody's in range.
        </p>
        {last && <LastWeek last={last} />}
        <StatueShelf />
      </div>
    )
  }

  const total = mine + theirs
  // A 0-0 week is drawn as level rather than as an empty bar, so the first
  // person to open the tab on Monday sees a contest rather than a defeat.
  const share = total > 0 ? mine / total : 0.5
  const ahead = mine > theirs
  const level = mine === theirs

  return (
    <div className="card">
      <Heading wins={wins} />

      {/* BOTH churches, as buildings, at exactly the same size. Drawing only
          one of them puts a building in the middle that belongs to neither
          side, and drawing the leader's bigger would announce the result in
          the picture before the numbers get a chance to say it's close. */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 10, marginTop: 12 }}>
        <Side church={myChurch} label="Your church" points={mine} />
        <div
          className="faint"
          style={{ fontFamily: 'var(--font-display)', fontSize: 12, letterSpacing: 1, paddingTop: 22, flex: '0 0 auto' }}
        >
          VS
        </div>
        <Side church={opponent} label={opponent.name} points={theirs} />
      </div>

      {/* Share of the week, not the gap between them. */}
      <div
        style={{
          height: 14,
          borderRadius: 999,
          marginTop: 14,
          background: 'rgba(0,0,0,0.35)',
          overflow: 'hidden',
          border: '1px solid var(--stroke)',
          display: 'flex',
        }}
      >
        <motion.div
          animate={{ width: `${Math.round(share * 100)}%` }}
          transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          style={{
            height: '100%',
            background: 'linear-gradient(90deg, var(--gold), var(--tangerine))',
            boxShadow: '0 0 14px rgba(255,159,28,0.5)',
          }}
        />
      </div>

      <p style={{ margin: '10px 0 0', fontSize: 13.5, lineHeight: 1.5, textAlign: 'center' }}>
        <b style={{ color: 'var(--gold)' }}>
          {level
            ? 'Dead level.'
            : ahead
              ? 'Your church is ahead.'
              : "There's a week to close it."}
        </b>{' '}
        <span className="dim">
          You have {Math.round(share * 100)}% of everything played between the two of you.
          Every point anyone gives adds to it.
        </span>
      </p>

      <p className="faint center" style={{ margin: '8px 0 0', fontSize: 12 }}>
        {left}
        {endsAt ? ` · resets ${endsAt.toLocaleDateString(undefined, { weekday: 'long' })}` : ''}
      </p>
      {/* Say the MECHANIC, not just the band's name. "A full pew" on its own is
          a label nobody can act on; "matched with a church your size" is the
          reassurance a four-person congregation actually needs, and it is the
          reason pairing is banded at all. */}
      <p className="faint center" style={{ margin: '2px 0 0', fontSize: 11.5 }}>
        Matched with a church your own size — {bandLabel(band).toLowerCase()}.
      </p>

      {last && <LastWeek last={last} />}
      <StatueShelf />
    </div>
  )
}

function Heading({ wins }: { wins: number }) {
  return (
    <div className="center">
      <b style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>This week's matchup</b>
      <p className="faint" style={{ margin: '2px 0 0', fontSize: 12 }}>
        {/* Wins, and nothing to compare them against. There is no losses column
            anywhere in this feature — not in the UI, not in the schema. */}
        {wins > 0
          ? `${wins} ${wins === 1 ? 'week' : 'weeks'} won · ${wins === 1 ? 'a statue' : 'statues'} for the yard`
          : 'Win a week and raise a statue in your churchyard'}
      </p>
    </div>
  )
}

function Side({
  church,
  label,
  points,
}: {
  church: Church
  label: string
  points: number
}) {
  return (
    <div style={{ flex: '1 1 0', minWidth: 0, textAlign: 'center' }}>
      <ChurchArt level={church.level} skin={church.skin} size={62} />
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 24,
          fontWeight: 800,
          color: 'var(--gold)',
          lineHeight: 1.1,
          marginTop: 2,
        }}
      >
        {points.toLocaleString()}
      </div>
      <div
        className="dim"
        style={{
          fontSize: 12.5,
          fontWeight: 700,
          overflowWrap: 'anywhere',
          marginTop: 1,
          // Two lines of church name, then ellipsis: a long parish name must
          // not push the two scores out of alignment with each other.
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {label}
      </div>
    </div>
  )
}

function LastWeek({ last }: { last: RivalryResult }) {
  const won = outcomeEarnsStatue(last.outcome)
  return (
    <div
      style={{
        marginTop: 14,
        paddingTop: 12,
        borderTop: '1px solid var(--stroke)',
      }}
    >
      <div className="faint" style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6 }}>
        LAST WEEK
      </div>
      <p style={{ margin: '4px 0 0', fontSize: 13.5, lineHeight: 1.5 }}>
        <b style={{ color: won ? 'var(--gold)' : 'var(--text)' }}>
          {outcomeLine(last.outcome, last.opponentName)}
        </b>
      </p>
      {/* The final numbers, small and equal-weight. Shown at all because hiding
          them after a loss would be the app deciding the church can't handle
          its own result — and because "we were 200 short" is the sentence that
          brings a congregation back on Monday. */}
      {(last.mine > 0 || last.theirs > 0) && (
        <p className="faint" style={{ margin: '4px 0 0', fontSize: 12 }}>
          {last.mine.toLocaleString()} · {last.theirs.toLocaleString()}
          {last.opponentName ? ` to ${last.opponentName}` : ''}
        </p>
      )}
    </div>
  )
}

// ── The shelf ────────────────────────────────────────────────────────────────
// Where a won week turns into something standing in the yard. It appears only
// once there is a statue to raise, so a church that has not won yet is never
// shown a rack of locked trophies — the padlock grid is the shape this app
// uses for things you earn by playing, and a rack of them here would read as
// "here is what you have failed to win" every single week.
function StatueShelf() {
  const juice = useJuice()
  const { wins, statues, raise, earned } = useRivalry()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [picking, setPicking] = useState<string | null>(null)

  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(null), 2600)
    return () => clearTimeout(t)
  }, [note])

  if (wins < 1) return null

  const standing = Object.keys(statues).length
  const free = earned() - standing
  // Only plinths that are empty (or the one being changed) can take a statue.
  const openPlinths = PLINTHS.filter((p) => !statues[p.id])

  const put = async (plinth: string, statueId: string) => {
    if (busy) return
    setBusy(true)
    // Plan against the store rather than this render's snapshot — two taps
    // inside one tick would otherwise both see the same free plinth and the
    // second would silently overwrite the first. Same scar as KeepSheet and
    // the Upper Room's shelf (CLAUDE.md).
    const res = await useRivalry.getState().raise(plinth, statueId)
    setBusy(false)
    setPicking(null)
    if (!res.ok) {
      setNote(
        res.reason === 'locked'
          ? 'Win another week to raise a second one.'
          : "Couldn't raise it just now — try again in a moment.",
      )
      return
    }
    juice.correct()
    setNote(`${statueById(statueId)?.name} is standing in the yard.`)
  }

  const take = async (plinth: string) => {
    if (busy) return
    setBusy(true)
    await useRivalry.getState().raise(plinth, null)
    setBusy(false)
    setNote('Taken down. Raise it again whenever you like — the week stays won.')
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--stroke)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>The churchyard's statues</b>
        <span className="faint" style={{ fontSize: 11.5 }}>
          {standing}/{earned()} raised
        </span>
      </div>
      <p className="dim" style={{ margin: '4px 0 0', fontSize: 12.5, lineHeight: 1.5 }}>
        A won week buys one statue, and the congregation picks it. Anyone who plays here can raise
        or change one — it belongs to the church, not to whoever tapped it.
      </p>

      {/* What's already up. */}
      {standing > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          {PLINTHS.filter((p) => statues[p.id]).map((p) => (
            <div key={p.id} className="center" style={{ position: 'relative', width: 78 }}>
              <StatueIcon id={statues[p.id]} size={54} />
              <div className="faint" style={{ fontSize: 10.5, marginTop: 2, lineHeight: 1.25 }}>
                {statueById(statues[p.id])?.name}
              </div>
              <button
                type="button"
                aria-label={`Take down the ${statueById(statues[p.id])?.name}`}
                disabled={busy}
                onClick={() => void take(p.id)}
                style={{
                  position: 'absolute', top: -4, right: 2,
                  width: 20, height: 20, borderRadius: 999, lineHeight: '18px',
                  border: '1px solid var(--stroke)', background: 'var(--card)',
                  color: 'var(--muted)', fontSize: 12, cursor: 'pointer', padding: 0,
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* An unspent win. */}
      {free > 0 && openPlinths.length > 0 && (
        <>
          <p style={{ margin: '12px 0 0', fontSize: 13, fontWeight: 800, color: 'var(--gold)' }}>
            {free === 1 ? 'One statue to raise.' : `${free} statues to raise.`} Pick one:
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(74px, 1fr))',
              gap: 8,
              marginTop: 8,
            }}
          >
            {drawableStatues().map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={busy}
                onClick={() => setPicking(picking === s.id ? null : s.id)}
                className="center"
                style={{
                  border: `1px solid ${picking === s.id ? 'var(--gold)' : 'var(--stroke)'}`,
                  background: picking === s.id ? 'rgba(255,159,28,0.10)' : 'transparent',
                  borderRadius: 'var(--r-md)',
                  padding: '8px 4px 6px',
                  cursor: 'pointer',
                  color: 'inherit',
                }}
              >
                <StatueIcon id={s.id} size={46} />
                <div style={{ fontSize: 10.5, marginTop: 3, lineHeight: 1.25 }}>{s.name}</div>
              </button>
            ))}
          </div>

          {picking && (
            <div style={{ marginTop: 10 }}>
              <p className="dim" style={{ margin: '0 0 6px', fontSize: 12.5, fontStyle: 'italic' }}>
                “{statueById(picking)?.blurb}”
              </p>
              <p className="faint" style={{ margin: '0 0 6px', fontSize: 11.5 }}>
                Where should it stand?
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {openPlinths.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    disabled={busy}
                    className="pill"
                    onClick={() => void put(p.id, picking)}
                    style={{ cursor: 'pointer', borderColor: 'var(--gold)', color: 'var(--gold)', fontWeight: 700 }}
                  >
                    {plinthById(p.id)?.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {note && (
        <p className="center" style={{ margin: '10px 0 0', fontSize: 12.5, fontWeight: 700, color: 'var(--gold)' }}>
          {note}
        </p>
      )}
    </div>
  )
}
