import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { useAuth } from '@/store/auth'
import { useKeep } from '@/store/keep'
import { useLive } from '@/store/live'
import { useLiveQueue } from '@/store/liveQueue'
import { useJuice } from '@/juice/useJuice'
import { LiveVersusQuiz } from './LiveVersusQuiz'
import { liveWinner, newRoomCode, normalizeRoomCode, verseForRoom } from './live'
import { shareResult, inviteUrl } from '@/features/daily/shareCard'
import type { PlayResult } from '@/types'

// The two live-battle screens: the door (/battle/live) and the room
// (/battle/live/:code).
//
// A ROOM CODE, and now also a QUEUE IN FRONT OF IT. The original note here said
// matchmaking with strangers is a queue table, a pairing function, timeouts and
// abandonment handling, and that two people who already know they are about to
// play each other need none of it. All of that is still true — and it is an
// argument about people who already know each other, which is the case a code
// covers and the case "find me anyone" does not. It also predicted its own
// exception: open matchmaking goes IN FRONT of this screen and everything below
// works unchanged. That is exactly what happened. Quick match ends by handing
// two devices the same room code, so from that second on there is only one live
// battle in this app and store/live.ts did not change at all.
//
// The queue kept the property that made this worth building: no table, no
// migration, nothing that outlives the search. See store/liveQueue.ts.

/** Who owns the room, remembered so a refresh doesn't demote the host. */
const roleKey = (code: string) => `va.live.host.${code}`

/**
 * Remember that this tab created the room, so a refresh doesn't demote the host
 * and leave a room with two guests in it and nobody able to record the result.
 * Both doors go through here — a hosted room and the host half of a quick match
 * are the same thing by the time the room screen reads it.
 */
function claimHost(code: string) {
  try {
    sessionStorage.setItem(roleKey(code), '1')
  } catch {
    /* private mode: a refresh will just rejoin as a guest */
  }
}

export default function LiveLobby() {
  const navigate = useNavigate()
  const juice = useJuice()
  const [code, setCode] = useState('')
  const { status, match, error: queueError, search, cancel } = useLiveQueue()

  // Leaving the door leaves the queue. There is nothing to come back to: the
  // roster is a picture of who is free right now, and a presence left behind by
  // a screen nobody is looking at would offer rooms to people who then wait
  // alone in them.
  useEffect(() => () => cancel(), [cancel])

  // Paired. The host claims the room before navigating, so both halves of a
  // quick match arrive exactly as a code-shared room does.
  useEffect(() => {
    if (!match) return
    if (match.role === 'host') claimHost(match.code)
    juice.coin()
    navigate(`/battle/live/${match.code}`, { state: { host: match.role === 'host' } })
  }, [match, navigate, juice])

  const host = () => {
    const c = newRoomCode()
    claimHost(c)
    juice.coin()
    navigate(`/battle/live/${c}`, { state: { host: true } })
  }

  const join = () => {
    const c = normalizeRoomCode(code)
    if (c.length !== 4) return
    juice.coin()
    navigate(`/battle/live/${c}`)
  }

  if (status !== 'idle') {
    return <QuickSearch onCancel={() => { juice.tap(); cancel() }} onRoom={host} />
  }

  return (
    <Page noNav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <button className="pill" onClick={() => navigate('/battle')} aria-label="Back">✕</button>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>🔴 Live battle</b>
      </div>

      <div className="card" style={{ padding: 22, textAlign: 'center' }}>
        <div className="floaty" style={{ fontSize: 46 }}>⚔️</div>
        <p style={{ marginTop: 10, fontSize: 15, lineHeight: 1.5 }}>
          Same verse, same moment. You both read it, you both tap ready, and the
          clock starts for the two of you together.
        </p>
      </div>

      {/* Quick match leads, because it is the one door that needs nothing
          arranged first — no code to send, nobody to text. The room is still
          right underneath it for the two people who already know each other,
          which is the case it was built for. */}
      <div style={{ marginTop: 18 }}>
        <Button variant="gold" full onClick={() => { juice.coin(); void search() }}>
          🎲 Quick match — find me anyone
        </Button>
      </div>
      <p className="faint center" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.4 }}>
        We’ll put you with whoever else is looking. No code needed.
      </p>
      {queueError && (
        <p className="dim center" style={{ fontSize: 13, marginTop: 8 }}>{queueError}</p>
      )}

      <div style={{ marginTop: 14 }}>
        <Button full onClick={host}>Start a room →</Button>
      </div>
      <p className="faint center" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.4 }}>
        Playing someone you know? Send them the code.
      </p>

      <div className="card" style={{ padding: 18, marginTop: 18 }}>
        <b style={{ fontFamily: 'var(--font-display)' }}>Got a code?</b>
        <input
          value={code}
          onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
          placeholder="ABCD"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-label="Room code"
          style={{
            width: '100%', marginTop: 12, padding: '14px 16px', borderRadius: 'var(--r-md)',
            background: 'var(--card-solid)', border: '1.5px solid var(--stroke)', color: 'var(--ink)',
            fontFamily: 'var(--font-display)', fontSize: 28, textAlign: 'center', letterSpacing: '0.32em',
          }}
        />
        <div style={{ marginTop: 12 }}>
          <Button full disabled={normalizeRoomCode(code).length !== 4} onClick={join}>Join the room</Button>
        </div>
      </div>
    </Page>
  )
}

export function LiveRoom() {
  const { code: raw = '' } = useParams()
  const code = normalizeRoomCode(raw)
  const location = useLocation()
  const navigate = useNavigate()
  const juice = useJuice()
  const me = useAuth((s) => s.profile)

  const {
    stage, round, opponent, opponentGone, iAmReady, opponentReady,
    myResult, opponentResult, error, open, finish, rematch, leave,
  } = useLive()

  // Host if this tab created the room — including across a refresh, which would
  // otherwise leave a room with two guests in it and nobody able to record the
  // result (see recordResult in store/live).
  //
  // A navigation that STATES which side you are wins over the stored flag, both
  // ways round. Quick match sends its guest here with `host: false`, and the two
  // halves of a match can be the same browser (two tabs share sessionStorage, so
  // a room hosted in one tab marks the other one host too) — which lands both
  // devices on 'host', and store/live drops every message from a player wearing
  // your own role. Two people in one room, each told nobody had joined.
  const isHost = useMemo(() => {
    const stated = (location.state as { host?: boolean } | null)?.host
    if (typeof stated === 'boolean') return stated
    try {
      return sessionStorage.getItem(roleKey(code)) === '1'
    } catch {
      return false
    }
  }, [location.state, code])

  useEffect(() => {
    if (code.length !== 4) {
      navigate('/battle/live', { replace: true })
      return
    }
    void open(code, isHost ? 'host' : 'guest')
    return () => leave()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, isHost])

  const verse = useMemo(() => (code.length === 4 ? verseForRoom(code, round) : null), [code, round])

  const onFinish = (result: PlayResult) => {
    // Same keep-challenge tracking a real battle does — a live match IS a real
    // battle, so playing one has to count for the ladders that count battles.
    const k = useKeep.getState()
    void k.track('battle_played')
    if (result.correctCount === result.totalQuestions && result.totalQuestions > 0) void k.track('battle_perfect')
    if ((result.comboMax ?? 0) >= 4) void k.track('battle_combo')
    finish({
      score: result.score,
      timeMs: result.timeMs,
      correctCount: result.correctCount,
      totalQuestions: result.totalQuestions,
    })
  }

  if (error) {
    return (
      <Page noNav>
        <div className="card" style={{ padding: 24, textAlign: 'center', marginTop: 40 }}>
          <div style={{ fontSize: 40 }}>📴</div>
          <p style={{ marginTop: 10 }}>{error}</p>
          <div style={{ marginTop: 16 }}>
            <Button full onClick={() => navigate('/battle/live', { replace: true })}>Back</Button>
          </div>
        </div>
      </Page>
    )
  }

  // Both finished — the result. Computed locally so it lands the instant the
  // second result arrives, whether or not the row was recorded.
  if (myResult && opponentResult) {
    return <LiveResultScreen onRematch={() => { juice.coin(); rematch() }} onDone={() => navigate('/battle')} />
  }

  // Waiting for them to finish.
  if (myResult) {
    return (
      <Page noNav>
        <div style={{ display: 'grid', placeItems: 'center', height: '70dvh', textAlign: 'center' }}>
          <div>
            <div className="floaty" style={{ fontSize: 54 }}>⏳</div>
            <p style={{ marginTop: 14, fontFamily: 'var(--font-display)', fontSize: 20 }}>
              {myResult.score.toLocaleString()} pts — nice run
            </p>
            <p className="dim" style={{ marginTop: 8 }}>
              {opponentGone
                ? 'Your opponent dropped out. Nothing lost — this still counted.'
                : `Waiting for ${opponent ? `@${opponent.username}` : 'your opponent'} to finish…`}
            </p>
            {opponentGone && (
              <div style={{ marginTop: 18 }}>
                <Button full onClick={() => navigate('/battle')}>Back to battles</Button>
              </div>
            )}
          </div>
        </div>
      </Page>
    )
  }

  // Nobody else here yet: the code, big enough to read off a stream.
  if (!opponent || stage === 'joining' || stage === 'lobby') {
    return <RoomWaiting code={code} joining={stage === 'joining'} onExit={() => navigate('/battle/live')} />
  }

  if (!verse) return <Page noNav><div style={{ display: 'grid', placeItems: 'center', height: '70dvh' }}><div className="floaty" style={{ fontSize: 56 }}>⚔️</div></div></Page>

  // The run itself. Keyed by round so a rematch remounts a clean quiz rather
  // than trying to reset one mid-flight.
  return (
    <LiveVersusQuiz
      key={round}
      verse={verse}
      opponent={opponent}
      onFinish={onFinish}
      onExit={() => navigate('/battle')}
    />
  )
}

function RoomWaiting({ code, joining, onExit }: { code: string; joining: boolean; onExit: () => void }) {
  const [shared, setShared] = useState<'shared' | 'copied' | 'failed' | null>(null)
  const url = inviteUrl(null, `/battle/live/${code}`)

  return (
    <Page noNav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <button className="pill" onClick={onExit} aria-label="Back">✕</button>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>🔴 Live battle</b>
      </div>

      <div className="card" style={{ padding: 26, textAlign: 'center' }}>
        <div className="faint" style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.1em' }}>ROOM CODE</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 58, letterSpacing: '0.16em', marginTop: 6 }}>
          {code}
        </div>
        <motion.p
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 1.8 }}
          className="dim"
          style={{ marginTop: 10, fontSize: 14 }}
        >
          {joining ? 'Opening the room…' : 'Waiting for your opponent to join…'}
        </motion.p>
      </div>

      <div style={{ marginTop: 18 }}>
        <Button
          variant="gold"
          full
          onClick={async () => setShared(await shareResult(`Battle me live on Verse Arcade — room ${code}\n${url}`, url))}
        >
          📣 Send the room link
        </Button>
        {shared === 'copied' && <p className="dim" style={{ textAlign: 'center', marginTop: 8, fontSize: 13 }}>Link copied.</p>}
      </div>

      <p className="dim" style={{ textAlign: 'center', marginTop: 18, fontSize: 13, lineHeight: 1.5 }}>
        They can also tap <b>Live battle</b> on the Battle tab and type the code.
      </p>
    </Page>
  )
}

// The result. Same shame-free rule as everywhere else here: it names a winner,
// because that is what a battle is, and then it says the thing that is actually
// true of the loser — they answered these questions and now know the verse.
function LiveResultScreen({ onRematch, onDone }: { onRematch: () => void; onDone: () => void }) {
  const me = useAuth((s) => s.profile)
  const {
    myResult, opponentResult, opponent, opponentGone, iWantRematch, opponentWantsRematch,
  } = useLive()
  const juice = useJuice()
  const outcome = myResult && opponentResult ? liveWinner(myResult, opponentResult) : 'tie'

  useEffect(() => {
    if (outcome === 'me') juice.celebrate()
  }, [outcome, juice])

  if (!myResult || !opponentResult) return null

  return (
    <Page noNav>
      <div style={{ textAlign: 'center', marginTop: 24 }}>
        <div className="floaty" style={{ fontSize: 56 }}>
          {outcome === 'me' ? '🏆' : outcome === 'tie' ? '🤝' : '⚔️'}
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 30, marginTop: 10 }}>
          {outcome === 'me' ? 'You took it!' : outcome === 'tie' ? 'Dead even' : `@${opponent?.username} took it`}
        </h1>
      </div>

      <div className="card" style={{ padding: 18, marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <Side
          emoji={me?.avatarEmoji ?? '😇'}
          character={me?.avatarCharacter}
          name="You"
          score={myResult.score}
          correct={myResult.correctCount}
          total={myResult.totalQuestions}
          won={outcome === 'me'}
        />
        <div className="faint" style={{ fontSize: 12, fontWeight: 900 }}>VS</div>
        <Side
          emoji={opponent?.avatarEmoji ?? '🙂'}
          character={opponent?.avatarCharacter}
          name={opponent ? `@${opponent.username}` : 'Opponent'}
          score={opponentResult.score}
          correct={opponentResult.correctCount}
          total={opponentResult.totalQuestions}
          won={outcome === 'them'}
        />
      </div>

      <p className="dim" style={{ textAlign: 'center', marginTop: 16, fontSize: 14, lineHeight: 1.5 }}>
        Both of you just read the same verse and answered for it. That part
        doesn’t have a loser.
      </p>

      {/* A rematch takes two, so this button says where the other one is.
          Waiting is a state worth drawing: without it, tapping Rematch and
          having nothing happen looks like the button is broken. */}
      <div style={{ marginTop: 20, display: 'grid', gap: 10 }}>
        {opponentGone ? (
          <p className="dim" style={{ textAlign: 'center', margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>
            {opponent ? `@${opponent.username} has` : 'They have'} left the room — no rematch
            from here. Your result still counted.
          </p>
        ) : iWantRematch ? (
          <Button variant="gold" full disabled onClick={() => {}}>
            ⏳ Waiting for {opponent ? `@${opponent.username}` : 'them'}…
          </Button>
        ) : (
          <Button variant="gold" full onClick={onRematch}>
            {opponentWantsRematch
              ? `🔁 ${opponent ? `@${opponent.username}` : 'They'} want${opponent ? 's' : ''} a rematch — go`
              : '🔁 Rematch — new verse'}
          </Button>
        )}
        <Button full onClick={onDone}>Done</Button>
      </div>
    </Page>
  )
}

function Side({
  emoji, character, name, score, correct, total, won,
}: {
  emoji: string
  character?: import('@/types').AvatarSpec | null
  name: string
  score: number
  correct: number
  total: number
  won: boolean
}) {
  return (
    <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
      <Avatar emoji={emoji} character={character} size={44} ring={won} />
      <div style={{ fontSize: 12, fontWeight: 800, marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
      <div className={won ? 'gradient-text' : undefined} style={{ fontFamily: 'var(--font-display)', fontSize: 24, lineHeight: 1.2 }}>
        {score.toLocaleString()}
      </div>
      <div className="faint" style={{ fontSize: 11 }}>{correct}/{total} right</div>
    </div>
  )
}

/**
 * Looking for anybody. One button's worth of screen, and the only interesting
 * decision in it is what happens when the lobby is EMPTY.
 *
 * It is going to be empty most of the time — that is simply true of a small app,
 * and a spinner that never resolves is the version of this feature that teaches
 * people not to tap it. So the search keeps running (somebody may walk in at any
 * second) and after a quiet spell the screen says so plainly and puts the two
 * doors that always work right there: a room code, and the async battle that
 * needs nobody to be holding their phone at all.
 */
function QuickSearch({ onCancel, onRoom }: { onCancel: () => void; onRoom: () => void }) {
  const navigate = useNavigate()
  const { waiting, elapsed, status } = useLiveQueue()
  const quiet = elapsed >= 20 && waiting === 0

  return (
    <Page noNav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <button className="pill" onClick={onCancel} aria-label="Stop looking">✕</button>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>🎲 Quick match</b>
      </div>

      <div className="card" style={{ padding: 26, textAlign: 'center' }}>
        <motion.div
          animate={{ rotate: [-8, 8, -8] }}
          transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
          style={{ fontSize: 54 }}
        >
          ⚔️
        </motion.div>
        <p style={{ marginTop: 12, fontFamily: 'var(--font-display)', fontSize: 20 }}>
          {status === 'matched' ? 'Found someone!' : 'Looking for an opponent…'}
        </p>
        <motion.p
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 1.8 }}
          className="dim"
          style={{ marginTop: 8, fontSize: 14 }}
        >
          {status === 'matched'
            ? 'Opening the room…'
            : waiting > 0
              ? `${waiting} other player${waiting === 1 ? '' : 's'} in the lobby`
              : `Searching… ${elapsed}s`}
        </motion.p>
      </div>

      {quiet && (
        <div className="card" style={{ padding: 18, marginTop: 16 }}>
          <b style={{ fontFamily: 'var(--font-display)' }}>Quiet in here right now</b>
          <p className="dim" style={{ marginTop: 6, fontSize: 13.5, lineHeight: 1.5 }}>
            We’ll keep looking while you’re on this screen — but a live battle
            needs somebody holding their phone this second. These two don’t.
          </p>
          <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            <Button full onClick={onRoom}>Start a room and send the code</Button>
            <Button full onClick={() => navigate('/battle/new')}>Challenge someone — they play later</Button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <Button full onClick={onCancel}>Stop looking</Button>
      </div>

      <p className="faint center" style={{ fontSize: 11, marginTop: 14, lineHeight: 1.5 }}>
        You’ll be matched with whoever else is looking — you both get the same
        verse at the same moment.
      </p>
    </Page>
  )
}
