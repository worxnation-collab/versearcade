import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { useAuth } from '@/store/auth'
import { useBattles, type Battle, type BattleBoard } from '@/store/battles'
import { useJuice } from '@/juice/useJuice'

export default function BattleHub() {
  const navigate = useNavigate()
  const juice = useJuice()
  const mode = useAuth((s) => s.mode)
  const profile = useAuth((s) => s.profile)
  const { mine, loadMine } = useBattles()
  const leaderboard = useBattles((s) => s.leaderboard)
  const [board, setBoard] = useState<BattleBoard | null>(null)

  const isGuest = mode === 'local'
  const isIncoming = (b: Battle) => b.is_invited && b.status === 'pending' && !b.is_challenger
  const incoming = mine.filter(isIncoming)
  const others = mine.filter((b) => !isIncoming(b))

  useEffect(() => {
    if (isGuest) return
    loadMine()
    leaderboard().then(setBoard)
  }, [isGuest, loadMine, leaderboard])

  return (
    <Page>
      <div className="center" style={{ marginBottom: 16 }}>
        <div className="floaty" style={{ fontSize: 44 }}>⚔️</div>
        <h1 style={{ fontSize: 28, marginTop: 4 }}>Bible Battle</h1>
        <p className="dim" style={{ marginTop: 4 }}>Challenge a friend to the same verse quiz. Highest score wins.</p>
      </div>

      {isGuest ? (
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 34 }}>🔐</div>
          <p style={{ margin: '8px 0 14px' }}>Battles are tied to your account so scores and ranks stick. Create a free one to play.</p>
          <Button variant="gold" full onClick={() => navigate('/auth')}>Create an account</Button>
        </div>
      ) : (
        <>
          <Button variant="gold" full onClick={() => { juice.coin(); navigate('/battle/new') }}>
            ⚔️ Start a new battle
          </Button>

          {/* Incoming challenges — someone challenged you, your move */}
          {incoming.length > 0 && (
            <>
              <h3 className="dim" style={{ fontSize: 16, margin: '22px 0 10px' }}>
                Challenges for you <span style={{ color: 'var(--gold)' }}>· {incoming.length}</span>
              </h3>
              <div style={{ display: 'grid', gap: 8 }}>
                {incoming.map((b) => (
                  <motion.button
                    key={b.id}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate(`/battle/${b.id}`)}
                    className="card"
                    style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', width: '100%', borderColor: 'var(--gold)', background: 'rgba(255,210,63,0.08)' }}
                  >
                    <Avatar emoji={b.challenger.avatar_emoji} character={b.challenger.avatar_character} size={40} ring={false} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ fontWeight: 800 }}>@{b.challenger.username}</b>
                      <div style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 700 }}>
                        Challenged you · beat {b.challenger.score?.toLocaleString()} pts
                      </div>
                    </div>
                    <span className="pill" style={{ background: 'var(--gold)', color: '#241f0a', fontWeight: 800, fontSize: 12 }}>Play</span>
                  </motion.button>
                ))}
              </div>
            </>
          )}

          {/* Your battles */}
          <h3 className="dim" style={{ fontSize: 16, margin: '22px 0 10px' }}>Your battles</h3>
          {others.length === 0 ? (
            <p className="faint" style={{ fontSize: 14 }}>
              No battles yet. Start one, then pick players to challenge — or share a link to invite someone new.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {others.map((b) => (
                <BattleRow key={b.id} b={b} onClick={() => navigate(`/battle/${b.id}`)} />
              ))}
            </div>
          )}

          {/* Battle ranks (separate from the main, encouragement-first leaderboard) */}
          <h3 className="dim" style={{ fontSize: 16, margin: '24px 0 10px' }}>Battle ranks</h3>
          <div className="card">
            {!board || board.top.length === 0 ? (
              <p className="faint" style={{ fontSize: 14, textAlign: 'center', padding: '4px 0' }}>
                No battles finished yet — be the first to claim a win.
              </p>
            ) : (
              <div style={{ display: 'grid', gap: 4 }}>
                {board.top.slice(0, 5).map((r) => (
                  <div key={r.rank} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 2px' }}>
                    <span style={{ width: 20, textAlign: 'center', fontFamily: 'var(--font-display)', color: 'var(--ink-faint)' }}>
                      {r.rank === 1 ? '👑' : r.rank}
                    </span>
                    <Avatar emoji={r.avatar_emoji} character={r.avatar_character} size={28} ring={false} />
                    <span style={{ flex: 1, minWidth: 0, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      @{r.username}
                    </span>
                    <span style={{ fontFamily: 'var(--font-display)' }} className="gradient-text">{r.wins}</span>
                    <span className="faint" style={{ fontSize: 11 }}>wins</span>
                  </div>
                ))}
                {board.me && (
                  <div className="faint" style={{ fontSize: 12, textAlign: 'center', marginTop: 8, borderTop: '1px solid var(--stroke)', paddingTop: 8 }}>
                    You’re rank <b style={{ color: 'var(--gold)' }}>#{board.me.rank}</b> — {board.me.wins}W / {board.me.battles} battles
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{ height: 90 }} />
        </>
      )}
    </Page>
  )
}

function outcomeLabel(b: Battle): { text: string; color: string } {
  if (b.status !== 'complete') return { text: 'Waiting for opponent', color: 'var(--sky)' }
  const won = (b.is_challenger && b.winner === 'challenger') || (b.is_opponent && b.winner === 'opponent')
  if (b.winner === 'tie') return { text: 'Tie', color: 'var(--ink-faint)' }
  return won ? { text: 'You won 🏆', color: 'var(--good)' } : { text: 'You lost', color: 'var(--coral)' }
}

function BattleRow({ b, onClick }: { b: Battle; onClick: () => void }) {
  const other = b.is_challenger ? b.opponent : b.challenger
  const label = outcomeLabel(b)
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="card"
      style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', width: '100%' }}
    >
      <Avatar emoji={other?.avatar_emoji ?? '⚔️'} character={other?.avatar_character} size={40} ring={false} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontWeight: 800 }}>{other ? `@${other.username}` : 'Waiting…'}</b>
        <div style={{ fontSize: 12, color: label.color, fontWeight: 700 }}>{label.text}</div>
      </div>
      <span style={{ color: 'var(--gold)', fontFamily: 'var(--font-display)', fontSize: 18 }}>›</span>
    </motion.button>
  )
}
