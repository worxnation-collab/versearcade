import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { useAuth } from '@/store/auth'
import { useBattles, type Battle, type BattleBoard, type DenomBoard } from '@/store/battles'
import { DENOMINATIONS, denominationColor, denominationName } from '@/data/denominations'
import { useJuice } from '@/juice/useJuice'

// Whose move is it? Every battle you can see is in exactly one of these.
type Turn = 'yours' | 'theirs' | 'done'
const TURNS: Turn[] = ['yours', 'theirs', 'done']
const TURN_LABEL: Record<Turn, string> = { yours: 'Your turn', theirs: 'Their turn', done: 'Finished' }
const TURN_EMPTY: Record<Turn, string> = {
  yours: 'No challenges waiting on you. When someone invites you to a battle, it shows up here.',
  theirs: 'Nobody owes you a move. Start a battle and pick who to challenge — or share a link to invite someone new.',
  done: 'No finished battles yet. Play one out and the result lands here.',
}
const VISIBLE_ROWS = 5

// Pending + you didn't send it ⇒ you're the invited opponent (list_my_battles
// only ever returns battles you're the challenger, opponent, or invitee of).
function turnOf(b: Battle): Turn {
  if (b.status === 'complete') return 'done'
  return b.is_challenger ? 'theirs' : 'yours'
}

export default function BattleHub() {
  const navigate = useNavigate()
  const juice = useJuice()
  const mode = useAuth((s) => s.mode)
  const profile = useAuth((s) => s.profile)
  const updateProfile = useAuth((s) => s.updateProfile)
  const { mine, loadMine } = useBattles()
  const leaderboard = useBattles((s) => s.leaderboard)
  const denominationBoard = useBattles((s) => s.denominationBoard)
  const [board, setBoard] = useState<BattleBoard | null>(null)
  const [denomBoard, setDenomBoard] = useState<DenomBoard | null>(null)
  const [rankTab, setRankTab] = useState<'individual' | 'denomination'>('individual')
  // Which turn-bucket the player tapped. Null = follow `autoTurn` below, so the
  // tab that actually needs them is open before they touch anything.
  const [pickedTurn, setPickedTurn] = useState<Turn | null>(null)
  const [expanded, setExpanded] = useState<Turn | null>(null)

  const isGuest = mode === 'local'

  // Every battle sits in exactly one of three buckets, so "whose move is it?"
  // is answered by a glance at the tab counts instead of by reading each row.
  const buckets = useMemo(() => {
    const b: Record<Turn, Battle[]> = { yours: [], theirs: [], done: [] }
    for (const battle of mine) b[turnOf(battle)].push(battle)
    return b
  }, [mine])

  const autoTurn: Turn = buckets.yours.length ? 'yours' : buckets.theirs.length ? 'theirs' : buckets.done.length ? 'done' : 'yours'
  const turn = pickedTurn ?? autoTurn
  const list = buckets[turn]
  const visible = expanded === turn ? list : list.slice(0, VISIBLE_ROWS)

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
          {/* The order surprises people: you set the score first, THEN choose
              who has to beat it. Saying so here beats discovering it after a run. */}
          <p className="faint center" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.4 }}>
            You play first — then pick who has to beat your score.
          </p>

          {/* Your battles, split by whose move it is. "Your turn" carries the
              invite count, so an incoming challenge is visible without opening
              anything — that's the whole point of the split. */}
          <h3 className="dim" style={{ fontSize: 16, margin: '22px 0 10px' }}>Your battles</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 12 }}>
            {TURNS.map((t) => {
              const count = buckets[t].length
              const active = turn === t
              // An unplayed invite is the one thing worth shouting about: gold
              // even when its tab is closed.
              const nudge = t === 'yours' && count > 0
              return (
                <motion.button
                  key={t}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => { juice.select(); setPickedTurn(t); setExpanded(null) }}
                  aria-pressed={active}
                  className="pill"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                    padding: '10px 6px', fontSize: 13, fontWeight: 800, cursor: 'pointer',
                    background: active ? 'var(--grape)' : nudge ? 'rgba(255,210,63,0.10)' : 'var(--card)',
                    border: `1px solid ${active ? 'var(--grape)' : nudge ? 'var(--gold)' : 'var(--stroke)'}`,
                  }}
                >
                  <span>{TURN_LABEL[t]}</span>
                  {count > 0 && (
                    <span
                      style={{
                        minWidth: 18, padding: '1px 5px', borderRadius: 9, fontSize: 11, fontWeight: 800,
                        fontFamily: 'var(--font-display)',
                        background: nudge ? 'var(--gold)' : active ? 'rgba(0,0,0,0.28)' : 'var(--stroke)',
                        color: nudge ? '#241f0a' : 'var(--ink)',
                      }}
                    >
                      {count}
                    </span>
                  )}
                </motion.button>
              )
            })}
          </div>

          {/* minmax(0, 1fr) on the list: a bare `grid` track can't shrink below
              its widest item, so one long "@name challenged you…" line would
              stretch the whole page (see the church board fix). */}
          {list.length === 0 ? (
            <p className="faint" style={{ fontSize: 14 }}>{TURN_EMPTY[turn]}</p>
          ) : (
            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
              {visible.map((b) => (
                <BattleRow key={b.id} b={b} turn={turn} onClick={() => navigate(`/battle/${b.id}`)} />
              ))}
              {list.length > visible.length && (
                <button
                  onClick={() => { juice.select(); setExpanded(turn) }}
                  className="pill"
                  style={{ background: 'var(--card)', border: '1px solid var(--stroke)', padding: '9px 12px', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                >
                  Show all {list.length} ▾
                </button>
              )}
            </div>
          )}

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
                        <Avatar emoji={r.avatar_emoji} character={r.avatar_character} size={28} ring={false} username={r.username} />
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
            <>
            {/* Your denomination lives here rather than in profile settings —
                it's a Battle-only faction, so it's picked where it's used. */}
            <div className="card" style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0, background: profile?.denomination ? denominationColor(profile.denomination) : 'var(--stroke)', boxShadow: profile?.denomination ? `0 0 8px ${denominationColor(profile.denomination)}` : 'none' }} />
                <select
                  aria-label="Your denomination"
                  value={profile?.denomination ?? ''}
                  onChange={async (e) => {
                    juice.select()
                    // Wait for the write to land before re-reading, or the board
                    // comes back with the old membership.
                    await updateProfile({ denomination: e.target.value || null })
                    setDenomBoard(await denominationBoard())
                  }}
                  style={{ flex: 1, padding: '10px 8px', borderRadius: 10, background: 'var(--card-solid)', color: 'var(--ink)', border: '1px solid var(--stroke)', fontSize: 14 }}
                >
                  <option value="">Prefer not to say</option>
                  {DENOMINATIONS.map((d) => (
                    <option key={d.key} value={d.key}>{d.name}</option>
                  ))}
                </select>
              </div>
              <p className="faint" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.4 }}>
                Optional &amp; friendly — pick your tradition to represent it here. Your battle wins add to its team total automatically, and it never shows on the main leaderboard.
              </p>
            </div>
            <div className="card">
              {!denomBoard || denomBoard.top.length === 0 ? (
                <p className="faint" style={{ fontSize: 14, textAlign: 'center', padding: '4px 0' }}>
                  No denominations yet. Pick yours above to start your team’s total.
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
            </>
          )}
          <div style={{ height: 90 }} />
        </>
      )}
    </Page>
  )
}

function outcomeLabel(b: Battle, turn: Turn): { text: string; color: string } {
  if (turn === 'yours') {
    // The tab, the gold card and the Play pill already say "your move", so the
    // line spends its width on the number instead of repeating that — it has to
    // survive the ellipsis at 320px.
    return { text: `Beat ${b.challenger.score?.toLocaleString()} pts to win`, color: 'var(--gold)' }
  }
  if (turn === 'theirs') {
    return b.invited && !b.broadcast
      ? { text: 'Waiting on their play', color: 'var(--sky)' }
      : { text: 'Open challenge · waiting for a taker', color: 'var(--sky)' }
  }
  const won = (b.is_challenger && b.winner === 'challenger') || (b.is_opponent && b.winner === 'opponent')
  if (b.winner === 'tie') return { text: 'Tie', color: 'var(--ink-faint)' }
  return won ? { text: 'You won 🏆', color: 'var(--good)' } : { text: 'You lost', color: 'var(--coral)' }
}

function BattleRow({ b, turn, onClick }: { b: Battle; turn: Turn; onClick: () => void }) {
  const other = b.is_challenger ? b.opponent : b.challenger
  // Pending targeted battle: the opponent hasn't played yet, so name the invitee.
  const name = other?.username ?? (b.status !== 'complete' ? b.invited : null)
  const label = outcomeLabel(b, turn)
  const mine = turn === 'yours'
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="card"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', width: '100%', minWidth: 0,
        ...(mine ? { borderColor: 'var(--gold)', background: b.is_welcome ? 'rgba(255,210,63,0.14)' : 'rgba(255,210,63,0.08)' } : {}),
      }}
    >
      <Avatar emoji={other?.avatar_emoji ?? (b.status !== 'complete' ? '⏳' : '⚔️')} character={other?.avatar_character} size={40} ring={false} username={other?.username} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontWeight: 800, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {mine && b.is_welcome ? '👋 Your first battle' : name ? `@${name}` : 'Open challenge'}
        </b>
        <div style={{ fontSize: 12, color: label.color, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label.text}
        </div>
      </div>
      {mine ? (
        <span className="pill" style={{ background: 'var(--gold)', color: '#241f0a', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>Play</span>
      ) : (
        <span style={{ color: 'var(--gold)', fontFamily: 'var(--font-display)', fontSize: 18 }}>›</span>
      )}
    </motion.button>
  )
}
