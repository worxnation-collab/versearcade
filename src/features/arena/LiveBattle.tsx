import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { useAuth } from '@/store/auth'
import { useKeep } from '@/store/keep'
import { useLive } from '@/store/live'
import { useJuice } from '@/juice/useJuice'
import { LiveVersusQuiz } from './LiveVersusQuiz'
import { liveWinner, newRoomCode, normalizeRoomCode, verseForRoom } from './live'
import { shareResult, inviteUrl } from '@/features/daily/shareCard'
import type { PlayResult } from '@/types'

// The two live-battle screens: the door (/battle/live) and the room
// (/battle/live/:code).
//
// A ROOM CODE, not a queue. Matchmaking with strangers is a queue table, a
// pairing function, timeouts and abandonment handling; two people who already
// know they are about to play each other need none of it, and a code can be read
// out loud on a stream, which is the actual use this was built for. If open
// matchmaking is ever wanted, it goes in front of this screen and everything
// below still works unchanged.

/** Who owns the room, remembered so a refresh doesn't demote the host. */
const roleKey = (code: string) => `va.live.host.${code}`

export default function LiveLobby() {
  const navigate = useNavigate()
  const juice = useJuice()
  const [code, setCode] = useState('')

  const host = () => {
    const c = newRoomCode()
    try {
      sessionStorage.setItem(roleKey(c), '1')
    } catch {
      /* private mode: a refresh will just rejoin as a guest */
    }
    juice.coin()
    navigate(`/battle/live/${c}`, { state: { host: true } })
  }

  const join = () => {
    const c = normalizeRoomCode(code)
    if (c.length !== 4) return
    juice.coin()
    navigate(`/battle/live/${c}`)
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

      <div style={{ marginTop: 18 }}>
        <Button variant="gold" full onClick={host}>Start a room →</Button>
      </div>

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
  const isHost = useMemo(() => {
    if ((location.state as { host?: boolean } | null)?.host) return true
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
  const { myResult, opponentResult, opponent } = useLive()
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

      <div style={{ marginTop: 20, display: 'grid', gap: 10 }}>
        <Button variant="gold" full onClick={onRematch}>🔁 Rematch — new verse</Button>
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
