import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { useAuth } from '@/store/auth'
import { useBattles, type Battle, type BattleBoard, type DenomBoard } from '@/store/battles'
import { denominationColor, denominationName } from '@/data/denominations'
import { useJuice } from '@/juice/useJuice'

export default function BattleHub() {
  const navigate = useNavigate()
  const juice = useJuice()
  const mode = useAuth((s) => s.mode)
  const profile = useAuth((s) => s.profile)
  const { mine, loadMine } = useBattles()
  const leaderboard = useBattles((s) => s.leaderboard)
  const denominationBoard = useBattles((s) => s.denominationBoard)
  const [board, setBoard] = useState<BattleBoard | null>(null)
  const [denomBoard, setDenomBoard] = useState<DenomBoard | null>(null)
  const [rankTab, setRankTab] = useState<'individual' | 'denomination'>('individual')
  const [battlesOpen, setBattlesOpen] = useState(false)

  const isGuest = mode === 'local'
  const isIncoming = (b: Battle) => b.is_invited && b.status === 'pending' && !b.is_challenger
  const incoming = mine.filter(isIncoming)
  const others = mine.filter((b) => !isIncoming(b))

  useEffect(() => {
    if (isGuest) return
    loadMine()
    leaderboard().then(setBoard)
    denominationBoard().then(setDenomBoard)
  }, [isGuest, loadMine, leaderboard, denominationBoard])

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
                    style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', width: '100%', borderColor: 'var(--gold)', background: b.is_welcome ? 'rgba(255,210,63,0.14)' : 'rgba(255,210,63,0.08)' }}
                  >
                    <Avatar emoji={b.challenger.avatar_emoji} character={b.challenger.avatar_character} size={40} ring={false} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ fontWeight: 800 }}>
                        {b.is_welcome ? '👋 Welcome!' : `@${b.challenger.username}`}
                      </b>
                      <div style={{ fontSize: 12, color: 'var(--gold)', fontWeight: 700 }}>
                        {b.is_welcome
                          ? `@${b.challenger.username} challenged you to your first battle`
                          : `Challenged you · beat ${b.challenger.score?.toLocaleString()} pts`}
                      </div>
                    </div>
                    <span className="pill" style={{ background: 'var(--gold)', color: '#241f0a', fontWeight: 800, fontSize: 12 }}>Play</span>
                  </motion.button>
                ))}
              </div>
            </>
          )}

          {/* Your battles — collapsible (default closed) so a long list of sent
              challenges doesn't push the ranks off-screen. */}
          <button
            onClick={() => { juice.select(); setBattlesOpen((o) => !o) }}
            aria-expanded={battlesOpen}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'transparent', border: 'none', padding: '22px 0 10px', cursor: 'pointer' }}
          >
            <h3 className="dim" style={{ fontSize: 16, margin: 0 }}>
              Your battles {others.length > 0 && <span className="faint">· {others.length}</span>}
            </h3>
            <span style={{ color: 'var(--gold)', transform: battlesOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
          </button>
          {battlesOpen && (others.length === 0 ? (
            <p className="faint" style={{ fontSize: 14 }}>
              No battles yet. Start one, then pick players to challenge — or share a link to invite someone new.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {others.map((b) => (
                <BattleRow key={b.id} b={b} onClick={() => navigate(`/battle/${b.id}`)} />
              ))}
            </div>
          ))}

          {/* Battle ranks — two tabs: individual + denomination factions.
              Denomination only appears here, never on the main leaderboard. */}
          <h3 className="dim" style={{ fontSize: 16, margin: '24px 0 10px' }}>Battle ranks</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {(['individual', 'denomination'] as const).map((t) => (
              <button key={t} onClick={() => { juice.select(); setRankTab(t) }} className="pill"
                style={{ background: rankTab === t ? 'var(--grape)' : 'var(--card)', fontWeight: 800, textTransform: 'capitalize' }}>
                {t === 'individual' ? 'Individual' : 'Denomination'}
              </button>
            ))}
          </div>

          {rankTab === 'individual' ? (
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
                      <span style={{ position: 'relative', flexShrink: 0 }}>
                        <Avatar emoji={r.avatar_emoji} character={r.avatar_character} size={28} ring={false} />
                        {r.denomination && (
                          <span title={denominationName(r.denomination)} style={{ position: 'absolute', right: -2, bottom: -2, width: 10, height: 10, borderRadius: '50%', background: denominationColor(r.denomination), boxShadow: '0 0 0 2px var(--bg-1)' }} />
                        )}
                      </span>
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
          ) : (
            <div className="card">
              {!denomBoard || denomBoard.top.length === 0 ? (
                <p className="faint" style={{ fontSize: 14, textAlign: 'center', padding: '4px 0' }}>
                  No denominations yet. Pick yours on the <b>You</b> page to start your team’s total.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: 4 }}>
                  {denomBoard.top.map((r) => {
                    const color = denominationColor(r.denomination)
                    const mine = denomBoard.me?.denomination === r.denomination
                    return (
                      <div key={r.denomination} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 10, borderLeft: `3px solid ${color}`, background: mine ? 'rgba(255,210,63,0.08)' : 'transparent' }}>
                        <span style={{ width: 18, textAlign: 'center', fontFamily: 'var(--font-display)', color: 'var(--ink-faint)' }}>
                          {r.rank === 1 ? '👑' : r.rank}
                        </span>
                        <span style={{ width: 12, height: 12, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: `0 0 8px ${color}` }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <b style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                            {denominationName(r.denomination)}{mine && <span style={{ color: 'var(--gold)', fontSize: 11, marginLeft: 6 }}>you</span>}
                          </b>
                          <span className="faint" style={{ fontSize: 11 }}>{r.members} member{r.members === 1 ? '' : 's'}</span>
                        </div>
                        <span style={{ fontFamily: 'var(--font-display)' }} className="gradient-text">{r.wins}</span>
                        <span className="faint" style={{ fontSize: 11 }}>wins</span>
                      </div>
                    )
                  })}
                  {denomBoard.me && (
                    <div className="faint" style={{ fontSize: 12, textAlign: 'center', marginTop: 8, borderTop: '1px solid var(--stroke)', paddingTop: 8 }}>
                      {denominationName(denomBoard.me.denomination)} — rank <b style={{ color: 'var(--gold)' }}>#{denomBoard.me.rank}</b> · {denomBoard.me.wins} wins · {denomBoard.me.members} members
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <div style={{ height: 90 }} />
        </>
      )}
    </Page>
  )
}

function outcomeLabel(b: Battle): { text: string; color: string } {
  if (b.status !== 'complete') return { text: 'Waiting on their play', color: 'var(--sky)' }
  const won = (b.is_challenger && b.winner === 'challenger') || (b.is_opponent && b.winner === 'opponent')
  if (b.winner === 'tie') return { text: 'Tie', color: 'var(--ink-faint)' }
  return won ? { text: 'You won 🏆', color: 'var(--good)' } : { text: 'You lost', color: 'var(--coral)' }
}

function BattleRow({ b, onClick }: { b: Battle; onClick: () => void }) {
  const other = b.is_challenger ? b.opponent : b.challenger
  // Pending targeted battle: the opponent hasn't played yet, so name the invitee.
  const name = other?.username ?? (b.status !== 'complete' ? b.invited : null)
  const label = outcomeLabel(b)
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="card"
      style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', width: '100%' }}
    >
      <Avatar emoji={other?.avatar_emoji ?? (b.status !== 'complete' ? '⏳' : '⚔️')} character={other?.avatar_character} size={40} ring={false} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontWeight: 800 }}>{name ? `@${name}` : 'Open challenge'}</b>
        <div style={{ fontSize: 12, color: label.color, fontWeight: 700 }}>{label.text}</div>
      </div>
      <span style={{ color: 'var(--gold)', fontFamily: 'var(--font-display)', fontSize: 18 }}>›</span>
    </motion.button>
  )
}
