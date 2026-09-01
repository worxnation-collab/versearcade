import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Avatar } from '@/components/Avatar'
import { CountUp } from '@/components/CountUp'
import { QuickSheet } from '@/components/QuickSheet'
import { usePlayerCard } from '@/components/PlayerCardModal'
import { useGame } from '@/store/game'
import { useDailyPlayers } from '@/store/dailyPlayers'
import { denominationColor } from '@/data/denominations'

// "N have played today" — one line under the two daily boxes, and a door.
//
// This replaced the drifting presence ticker, which was a scrolling feed of
// "@name +430" and had two problems: it moved forever on the screen everybody
// lands on, and the numbers on it were the only place in the app where one
// player's score sat beside another's. The count is the part that was doing the
// work — "others are doing this with me today" — so the count is what stayed.
//
// **Tapping it opens the PEOPLE, and never the scores.** `daily_players` (0093)
// returns faces and names with no score in the payload at all, ordered by who
// turned up most recently, which is a fact about the clock rather than about
// them. It is the church roster's rule — a crowd, not a ladder — applied to the
// day. Read the migration header before adding a number to any row here.
//
// Three states, and it never renders a broken one:
//
//  - **No count at all** ⇒ nothing renders. There is no "0 have played today",
//    which on a quiet morning would be the app opening by telling somebody they
//    are alone.
//  - **A count with no roster behind it** (a keyless LOCAL build, or a server
//    without 0093) ⇒ a plain line, not a button. The number on a keyless build
//    is `synthPulse()`'s ambience, and a list to go with it would have to invent
//    names — a named player who doesn't exist is a lie you can tap.
//  - **A count with a roster** ⇒ a button that says so.
export function PlayedToday() {
  const pulse = useGame((s) => s.pulse)
  const loadPulse = useGame((s) => s.loadPulse)
  const todayDate = useGame((s) => s.todayDate)
  const load = useDailyPlayers((s) => s.load)
  const available = useDailyPlayers((s) => s.available)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    void loadPulse()
    // Slower than the strip's 20s: this is one number rather than a moving
    // feed, so a rarer refresh reads identically and costs a fifth as much.
    const t = setInterval(() => void loadPulse(), 100000)
    return () => clearInterval(t)
  }, [loadPulse])

  // Probe the roster ONCE on mount rather than on tap. It is what decides
  // whether this is a button at all, and a control that turns into a button
  // after you have already pressed it is worse than one that never was. Cheap:
  // the store returns early on a repeat, and the sheet re-reads nothing.
  useEffect(() => {
    void load(todayDate)
  }, [load, todayDate])

  const opened = pulse?.opened ?? 0
  if (!opened) return null

  const line = (
    <>
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: 'var(--good)',
          boxShadow: '0 0 10px var(--good)',
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 13.5 }}>
        <b style={{ fontFamily: 'var(--font-display)' }}>
          <CountUp to={opened} />
        </b>{' '}
        <span className="dim">played today</span>
      </span>
    </>
  )

  if (!available) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          marginTop: 12,
        }}
      >
        {line}
      </div>
    )
  }

  return (
    <>
      <motion.button
        onClick={() => setOpen(true)}
        whileTap={{ scale: 0.97 }}
        aria-label="See who has played today"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          width: '100%',
          marginTop: 12,
          padding: '8px 12px',
          borderRadius: 999,
          border: '1px solid var(--stroke)',
          background: 'transparent',
          color: 'var(--ink)',
          cursor: 'pointer',
        }}
      >
        {line}
        <span className="faint" style={{ fontSize: 12, flexShrink: 0 }}>→</span>
      </motion.button>

      {open && <PlayersSheet onClose={() => setOpen(false)} />}
    </>
  )
}

function PlayersSheet({ onClose }: { onClose: () => void }) {
  const players = useDailyPlayers((s) => s.players)
  const shown = useDailyPlayers((s) => s.shown)
  const accounts = useDailyPlayers((s) => s.accounts)
  const guests = useDailyPlayers((s) => s.guests)
  const total = useDailyPlayers((s) => s.total)
  const { open: openCard } = usePlayerCard()

  return (
    <QuickSheet title="Played today" onClose={onClose}>
      {/* The count, said once, in words. No breakdown by score, no "top" of
          anything, and no position for anybody in the list below. */}
      <p className="dim" style={{ margin: '0 0 12px', fontSize: 13.5, lineHeight: 1.5 }}>
        {total.toLocaleString()} {total === 1 ? 'person has' : 'people have'} read today’s verse.
        {guests > 0 && (
          <>
            {' '}
            {guests.toLocaleString()} of them{' '}
            {guests === 1 ? 'is playing as a guest' : 'are playing as guests'}.
          </>
        )}
      </p>

      {players.length === 0 ? (
        <p className="faint" style={{ fontSize: 13, lineHeight: 1.5 }}>
          Everyone playing today is doing it as a guest so far. Faces show up here as
          people with accounts join in.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {players.map((p) => (
              <motion.button
                key={p.username}
                whileTap={{ scale: 0.96 }}
                onClick={() => openCard(p.username)}
                className="pill"
                aria-label={`Player card for @${p.username}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '4px 11px 4px 4px',
                  fontSize: 12.5,
                  cursor: 'pointer',
                  borderColor: p.isMe ? 'var(--gold)' : undefined,
                  background: p.isMe ? 'rgba(255,210,63,0.10)' : undefined,
                }}
              >
                <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
                  {/* `username` unset: the Avatar would otherwise render its own
                      button, and a button inside a button is neither valid nor
                      tappable — the scar FirstLight's row carries. */}
                  <Avatar
                    emoji={p.avatarEmoji}
                    character={p.avatarCharacter}
                    border={p.avatarBorder}
                    badge={p.avatarBadge}
                    username={null}
                    size={26}
                    ring={false}
                  />
                  {p.denomination && (
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute',
                        right: -1,
                        bottom: -1,
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        background: denominationColor(p.denomination),
                        border: '2px solid var(--bg-1)',
                      }}
                    />
                  )}
                </span>
                <span>@{p.username}</span>
              </motion.button>
            ))}
          </div>

          {/* Honest about the cap rather than pretending to be the whole day. */}
          {shown < accounts && (
            <p className="faint" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>
              Showing the {shown} most recent. Everybody else is here too — this list just
              stops somewhere.
            </p>
          )}
        </>
      )}
    </QuickSheet>
  )
}
