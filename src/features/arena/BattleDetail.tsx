import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { useAuth } from '@/store/auth'
import { useBattles, type Battle, type BattleSide } from '@/store/battles'
import { setPendingBattle } from './pending'
import { shareResult, inviteUrl } from '@/features/daily/shareCard'
import { useJuice } from '@/juice/useJuice'
import { useKeep } from '@/store/keep'
import { FavoriteButton } from '@/components/FavoriteButton'
import { BattleXpLine } from './BattleXpLine'
import { battleVerse, asBattleMode } from './battle'

function myOutcome(b: Battle): 'won' | 'lost' | 'tie' | null {
  if (b.status !== 'complete' || !b.winner) return null
  if (b.winner === 'tie') return 'tie'
  if (b.is_challenger) return b.winner === 'challenger' ? 'won' : 'lost'
  if (b.is_opponent) return b.winner === 'opponent' ? 'won' : 'lost'
  return null
}

export default function BattleDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const juice = useJuice()
  const { ready, profile, mode } = useAuth()
  const getBattle = useBattles((s) => s.getBattle)
  const [battle, setBattle] = useState<Battle | null>(null)
  const [loading, setLoading] = useState(true)
  const [shareMsg, setShareMsg] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getBattle(id).then((b) => {
      if (!alive) return
      setBattle(b)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [id, getBattle])

  useEffect(() => {
    const st = location.state as { justPlayed?: boolean; justCreated?: boolean } | null
    if (battle?.status === 'complete' && st?.justPlayed) {
      myOutcome(battle) === 'won' ? juice.levelUp() : juice.celebrate()
    }
  }, [battle, location.state, juice])

  // Keep challenges: a battle I was in completed with me as the winner. Fires
  // on whichever visit first SEES the completed battle (the opponent's result
  // arrives async); track() guards by battle id so revisits can't double-count.
  useEffect(() => {
    if (battle && myOutcome(battle) === 'won') void useKeep.getState().track('battle_won', battle.id)
  }, [battle])

  // The verse both sides raced over. Only ever rendered on a finished battle, so
  // it can't spoil a challenge that's still waiting to be played.
  // The mode rides on the row, so a recap opened days later still shows the
  // round that was actually played rather than a verse nobody saw.
  const verse = useMemo(
    () => (battle ? battleVerse(battle.seed, asBattleMode(battle.mode)) : null),
    [battle],
  )

  const link = inviteUrl(profile?.referralCode, `/battle/${id}`)
  const doShare = async () => {
    juice.coin()
    const text = `⚔️ I challenge you to a Bible Battle! Same quiz, beat my score:\n${link}`
    const r = await shareResult(text, link)
    setShareMsg(r === 'shared' ? 'Shared!' : r === 'copied' ? 'Link copied!' : 'Could not share')
  }

  if (!ready || loading) {
    return (
      <Page noNav>
        <div style={{ display: 'grid', placeItems: 'center', height: '70dvh' }}>
          <div className="floaty" style={{ fontSize: 56 }}>⚔️</div>
        </div>
      </Page>
    )
  }

  if (!battle) {
    return (
      <Page noNav>
        <div style={{ textAlign: 'center', paddingTop: 60 }}>
          <div style={{ fontSize: 52 }}>🕳️</div>
          <h1 style={{ fontSize: 24, marginTop: 8 }}>Battle not found</h1>
          <p className="dim" style={{ marginTop: 6 }}>This invite may have expired.</p>
          <div style={{ marginTop: 18 }}>
            <Button variant="gold" full onClick={() => navigate(profile ? '/battle' : '/')}>
              {profile ? 'Back to Bible Battle' : 'Open Verse Arcade'}
            </Button>
          </div>
        </div>
      </Page>
    )
  }

  const outcome = myOutcome(battle)
  const needsAccount = !profile || mode === 'local'

  // ── Not signed in / guest: public invite + create-account gate ──
  if (needsAccount) {
    return (
      <Page noNav>
        <ChallengeHeader challenger={battle.challenger} />
        <div className="card" style={{ textAlign: 'center', marginTop: 16 }}>
          <p style={{ fontSize: 15, lineHeight: 1.5 }}>
            <b>@{battle.challenger.username}</b> scored{' '}
            <b style={{ color: 'var(--gold)' }}>{battle.challenger.score?.toLocaleString()}</b> — think you can beat it?
            Same verse quiz, head to head.
          </p>
          <p className="faint" style={{ fontSize: 13, marginTop: 10 }}>
            Create a free account to accept the battle. It’s quick — you’ll jump right into the quiz.
          </p>
          <div style={{ marginTop: 16 }}>
            <Button
              variant="gold"
              full
              onClick={() => {
                setPendingBattle(id)
                navigate('/auth')
              }}
            >
              Create an account to accept ⚔️
            </Button>
          </div>
        </div>
      </Page>
    )
  }

  // ── Signed in ──
  const iAmChallenger = battle.is_challenger
  const finished = battle.status === 'complete'
  // The other side of a battle I played — the rematch target.
  const rival = (iAmChallenger ? battle.opponent?.username : battle.challenger.username) ?? null

  return (
    <Page noNav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <button className="pill" onClick={() => navigate('/battle')} aria-label="Back">✕</button>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Bible Battle</b>
      </div>

      {finished ? (
        <>
          {outcome && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 220, damping: 16 }}
              style={{ textAlign: 'center', margin: '10px 0 18px' }}
            >
              <div style={{ fontSize: 56 }}>{outcome === 'won' ? '🏆' : outcome === 'tie' ? '🤝' : '💪'}</div>
              <h1 className="gradient-text" style={{ fontSize: 30, marginTop: 4 }}>
                {outcome === 'won' ? 'You won!' : outcome === 'tie' ? "It's a tie!" : 'So close!'}
              </h1>
              {outcome === 'lost' && <p className="dim" style={{ marginTop: 4 }}>Rematch with a new battle 👀</p>}
            </motion.div>
          )}
          <ScoreRow side={battle.challenger} youIf={iAmChallenger} winner={battle.winner === 'challenger'} label="Challenger" />
          <div className="faint center" style={{ fontSize: 12, letterSpacing: '0.3em', margin: '2px 0' }}>VS</div>
          {battle.opponent && (
            <ScoreRow side={battle.opponent} youIf={battle.is_opponent} winner={battle.winner === 'opponent'} label="Opponent" />
          )}
          {/* A battle is a verse challenge too — the players who ran it get the
              same chance to keep the verse. */}
          {verse && (battle.is_challenger || battle.is_opponent) && (
            <div className="card" style={{ marginTop: 16, textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <b style={{ fontFamily: 'var(--font-display)', fontSize: 17, flex: 1, minWidth: 0 }}>{verse.reference}</b>
                <FavoriteButton reference={verse.reference} variant="icon" />
              </div>
              <p style={{ marginTop: 8, lineHeight: 1.5 }}>“{verse.text}”</p>
            </div>
          )}

          {/* What the run was worth — your own day, never a comparison, and the
              same whichever way the result above went. Only for the two people
              who actually played it; a spectator opening a finished battle has
              no day of their own to report. */}
          {(battle.is_challenger || battle.is_opponent) && <BattleXpLine />}

          {/* "Rematch" has to mean rematch THEM — a generic new battle sends
              you to the picker and makes you hunt down the same opponent. */}
          <div style={{ marginTop: 18 }}>
            {rival ? (
              <Button variant="gold" full onClick={() => navigate('/battle/new', { state: { challenge: rival } })}>
                Rematch @{rival} ⚔️
              </Button>
            ) : (
              <Button variant="gold" full onClick={() => navigate('/battle/new')}>Start a new battle ⚔️</Button>
            )}
          </div>
        </>
      ) : iAmChallenger ? (
        !battle.broadcast && battle.invited ? (
          // Private 1v1 — the invited buddy is notified on their tab; no link to
          // share (it would only work for them anyway).
          <>
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="floaty" style={{ fontSize: 44 }}>📨</div>
              <h2 style={{ fontSize: 20, marginTop: 6 }}>
                Challenge sent to <span className="gradient-text">@{battle.invited}</span>
              </h2>
              <p className="dim" style={{ marginTop: 6 }}>
                Your score to beat: <b style={{ color: 'var(--gold)' }}>{battle.challenger.score?.toLocaleString()}</b>.{' '}
                It’s waiting on their Battle tab — you’ll see the result here the moment they play.
              </p>
              <div style={{ marginTop: 14 }}>
                <Button variant="gold" full onClick={() => navigate('/battle')}>Back to my battles</Button>
              </div>
            </div>
          </>
        ) : (
          // Open challenge — anyone with the link can take you on.
          <>
            <div className="card" style={{ textAlign: 'center' }}>
              <div className="floaty" style={{ fontSize: 44 }}>📨</div>
              <h2 style={{ fontSize: 20, marginTop: 6 }}>Open challenge</h2>
              <p className="dim" style={{ marginTop: 6 }}>
                Your score to beat: <b style={{ color: 'var(--gold)' }}>{battle.challenger.score?.toLocaleString()}</b>.{' '}
                Anyone who opens your link can take you on — each result lands in your battles as they play.
              </p>
              <div style={{ marginTop: 14 }}>
                <Button variant="gold" full onClick={doShare}>📤 Share the battle link</Button>
              </div>
              {shareMsg && <p style={{ color: 'var(--good)', fontSize: 13, marginTop: 8 }}>{shareMsg}</p>}
            </div>
            <p className="faint center" style={{ fontSize: 12, marginTop: 12 }}>
              No account needed to open — friends get prompted to join and jump straight in.
            </p>
          </>
        )
      ) : battle.invited && !battle.is_invited ? (
        // Targeted at someone else
        <div className="card" style={{ textAlign: 'center', marginTop: 16 }}>
          <div style={{ fontSize: 40 }}>🔒</div>
          <p style={{ fontSize: 15, marginTop: 8 }}>
            This challenge is for <b>@{battle.invited}</b>. Start your own to take on <b>@{battle.challenger.username}</b>!
          </p>
          <div style={{ marginTop: 16 }}>
            <Button
              variant="gold"
              full
              onClick={() => navigate('/battle/new', { state: { challenge: battle.challenger.username } })}
            >
              Challenge @{battle.challenger.username} ⚔️
            </Button>
          </div>
        </div>
      ) : (
        // I'm the invited opponent (or an open invite), not yet played
        <>
          <ChallengeHeader challenger={battle.challenger} welcome={battle.is_welcome} />
          <div className="card" style={{ textAlign: 'center', marginTop: 16, ...(battle.is_welcome ? { borderColor: 'var(--gold)', background: 'rgba(255,210,63,0.08)' } : {}) }}>
            {battle.is_welcome && (
              <p style={{ fontSize: 15, lineHeight: 1.5, marginBottom: 8 }}>
                Welcome to Verse Arcade! 🎉 <b>@{battle.challenger.username}</b> kicks off every new player with a
                friendly battle.
              </p>
            )}
            <p style={{ fontSize: 15, lineHeight: 1.5 }}>
              <b>@{battle.challenger.username}</b> scored{' '}
              <b style={{ color: 'var(--gold)' }}>{battle.challenger.score?.toLocaleString()}</b>. Play the same verse quiz and
              beat it!
            </p>
            <div style={{ marginTop: 16 }}>
              <Button variant="gold" full onClick={() => navigate(`/battle/${id}/play`)}>
                {battle.is_welcome ? 'Play my first battle ⚔️' : 'Accept & play ⚔️'}
              </Button>
            </div>
          </div>
        </>
      )}
    </Page>
  )
}

function ChallengeHeader({ challenger, welcome }: { challenger: BattleSide; welcome?: boolean }) {
  return (
    <div style={{ textAlign: 'center', paddingTop: 20 }}>
      <div style={{ fontSize: 40 }}>{welcome ? '👋' : '⚔️'}</div>
      <h1 style={{ fontSize: 26, marginTop: 4 }}>{welcome ? 'Welcome! You’ve been challenged' : 'You’ve been challenged!'}</h1>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
        <Avatar emoji={challenger.avatar_emoji} character={challenger.avatar_character} size={44} username={challenger.username} />
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>@{challenger.username}</b>
      </div>
    </div>
  )
}

function ScoreRow({ side, youIf, winner, label }: { side: BattleSide; youIf: boolean; winner: boolean; label: string }) {
  return (
    <div
      className="card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderColor: winner ? 'var(--gold)' : 'var(--stroke)',
        background: winner ? 'rgba(255,210,63,0.1)' : undefined,
      }}
    >
      <Avatar emoji={side.avatar_emoji} character={side.avatar_character} size={44} ring={false} username={side.username} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontWeight: 800 }}>
          @{side.username}
          {youIf && <span style={{ color: 'var(--gold)', fontSize: 12, marginLeft: 6 }}>you</span>}
        </b>
        <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 20 }} className={winner ? 'gradient-text' : undefined}>
          {side.score?.toLocaleString() ?? '—'}
        </div>
        <div className="faint" style={{ fontSize: 10 }}>{winner ? '👑 winner' : 'pts'}</div>
      </div>
    </div>
  )
}
