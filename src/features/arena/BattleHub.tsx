/**
 * The Battle tab, top to bottom — and the order is the design:
 *
 *   1. One intro line, then the gold "Start a new battle" (the primary action)
 *      and the single "Live battle" button under it (the secondary door).
 *      ONE faint line serves both buttons: the gathering-hour line while the
 *      hour is open, otherwise "quick match or a room code". It used to be
 *      three helper paragraphs, which together were most of a button's height
 *      spent explaining two buttons that already say what they do.
 *   2. Your battles — the three turn buckets, Your turn by default, its count
 *      gold when somebody is waiting on you. `VISIBLE_ROWS` is per bucket and
 *      deliberately unchanged here.
 *   3. `RankStrip` — your rank and your team's, two tiles. If you have no team,
 *      ONE compact "Choose a team" row sits directly under it and unfolds the
 *      picker IN PLACE (`TeamChooser`). It never opens the ranks board to do
 *      it: choosing a team is a one-time setting, and dragging a top-5 board
 *      open on the way is how the picker used to push the battle list down.
 *   4. "Battle ranks", FOLDED by default. The strip already carries both
 *      numbers, so the board behind it is something you open, not something
 *      you scroll past. The Teams tab inside still has the picker, which is
 *      where somebody who already HAS a team goes to change it.
 *   5. The Keep as a compact row (`KeepRow`: name, hall level, arrow) that
 *      opens `KeepSheet`. The full painted hall lives in the sheet only — an
 *      inline ~230px scene was the heaviest thing on the tab and the one thing
 *      on it that can always wait. Then the keep's own challenge ladder.
 *
 * Unchanged and load-bearing: the guest branch (an account card plus the
 * device-local keep), nothing here pays a winner more than a loser (that lives
 * in `award_battle_xp`, which never reads a score), and the tab publishes no
 * comparison the boards didn't already — no losses column, no new ladder.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { gatheringLabel, gatheringOpen } from '@/data/gathering'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { FirstVisitTip } from '@/features/home/FirstVisitTip'
import { Button } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { Collapsible } from '@/components/Collapsible'
import { PaintedIcon } from '@/components/PaintedIcon'
import { useAuth } from '@/store/auth'
import { useBattles, type Battle, type BattleBoard, type DenomBoard } from '@/store/battles'
import { DENOMINATIONS, DENOMINATION_GROUPS, denominationColor, denominationName, isOpenFaction } from '@/data/denominations'
import { KeepSheet } from './KeepSheet'
import { loadFactionKeep, type FactionKeep } from '@/store/keep'
import { keepLevelForWins, keepLevelName } from '@/data/keep'
import { KeepChallenges } from './KeepChallenges'
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
/**
 * How many rows a bucket shows before "Show all".
 *
 * Your turn gets the room because every one of those rows is somebody waiting
 * on YOU. The other two are a record, not a task list: 23 battles waiting on
 * other people rendered as 23 full-size cards is most of a phone screen spent
 * saying "nothing to do here", which is what pushed the ranks and the hall
 * below the fold.
 */
const VISIBLE_ROWS: Record<Turn, number> = { yours: 6, theirs: 3, done: 3 }

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
  const { mine, loadMine } = useBattles()
  const leaderboard = useBattles((s) => s.leaderboard)
  const denominationBoard = useBattles((s) => s.denominationBoard)
  const [board, setBoard] = useState<BattleBoard | null>(null)
  const [denomBoard, setDenomBoard] = useState<DenomBoard | null>(null)
  const [rankTab, setRankTab] = useState<'individual' | 'denomination'>('individual')
  // Which turn-bucket the player tapped. Null = Your turn (see `turn` below),
  // the bucket that actually needs them, before they touch anything.
  const [pickedTurn, setPickedTurn] = useState<Turn | null>(null)
  /** Faction key whose keep is open, '' for "my hall", null for closed. */
  // ?keep=1 opens your own hall straight away — the unlock toast's door. Read
  // once at mount and stripped, like /you's ?pray=1, or a reload re-opens it.
  const [searchParams, setSearchParams] = useSearchParams()
  const [openKeep, setOpenKeep] = useState<string | null>(() => (searchParams.get('keep') === '1' ? '' : null))
  useEffect(() => {
    if (searchParams.get('keep') === '1') setSearchParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [expanded, setExpanded] = useState<Turn | null>(null)
  /**
   * Mirrors the ranks fold's own open state, and drives it.
   *
   * It starts CLOSED (2026-10-26), reversing the call that opened it: the
   * strip directly above carries both numbers, so an open top-5 board on first
   * load was a screen of scroll between the strip and the Keep for nothing the
   * player didn't already have. Tapping a strip tile opens it to that tab.
   *
   * Kept as a mirror rather than a one-way prop because Collapsible only
   * honours defaultOpen on its RISING edge — a stale `true` here would make a
   * second tile tap after the player closed the fold silently do nothing.
   */
  const [ranksOpen, setRanksOpen] = useState(false)
  // A team picked from the compact row (or the Teams tab) has to re-read the
  // team board, or the strip keeps saying "No team" after the pick.
  const onTeamChanged = async () => setDenomBoard(await denominationBoard())

  const isGuest = mode === 'local'

  // Every battle sits in exactly one of three buckets, so "whose move is it?"
  // is answered by a glance at the tab counts instead of by reading each row.
  const buckets = useMemo(() => {
    const b: Record<Turn, Battle[]> = { yours: [], theirs: [], done: [] }
    for (const battle of mine) b[turnOf(battle)].push(battle)
    return b
  }, [mine])

  // Always Your turn until the player says otherwise. It used to fall through
  // to whichever bucket had anything in it, so a player with nothing to play
  // and 23 battles out landed on a wall of "Waiting on their play" — the tab
  // opening on the one bucket it can do nothing about. An empty Your turn is
  // one short line, and the other two tabs are one tap away with their counts
  // on them.
  const turn = pickedTurn ?? 'yours'
  const list = buckets[turn]
  const visible = expanded === turn ? list : list.slice(0, VISIBLE_ROWS[turn])

  useEffect(() => {
    if (isGuest) return
    loadMine()
    leaderboard().then(setBoard)
    denominationBoard().then(setDenomBoard)
  }, [isGuest, loadMine, leaderboard, denominationBoard])

  return (
    <Page>
      <FirstVisitTip id="battle" />
      {/* One line, not a title card. This tab is reached by tapping a nav
          button labelled "Battle", so a 44px floating sword over the word
          "Bible Battle" was ~130px of the first screen spent restating what
          the player just tapped — and it pushed the gold "Start a new battle"
          button most of the way down a 390px phone. The Play and Study tabs
          have never carried one. The explanatory line stays, because that part
          is genuinely new information to somebody on their first visit. */}
      <p className="dim" style={{ margin: '2px 0 14px', fontSize: 13.5, lineHeight: 1.5 }}>
        <PaintedIcon id="battle_swords" /> Challenge a friend to the same verse quiz. Highest score wins.
      </p>

      {isGuest ? (
        <>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 34 }}>🔐</div>
          <p style={{ margin: '8px 0 14px' }}>Battles are tied to your account so scores and ranks stick. Create a free one to play.</p>
          <Button variant="gold" full onClick={() => navigate('/auth')}>Create an account</Button>
        </div>
        <div style={{ textAlign: 'left' }}>
          {/* The keep still works for a guest: CPU races (reachable from the
              Study tab) move the same counters, and their hall lives on this
              device. Only the faction layer needs an account. */}
          <h3 className="dim" style={{ fontSize: 16, margin: '24px 0 10px' }}>The Keep</h3>
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => { juice.select(); setOpenKeep('') }}
            className="card"
            style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', marginBottom: 10 }}
          >
            <div style={{ fontSize: 26, flexShrink: 0 }}>🏰</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>Your Keep</b>
              <div className="faint" style={{ fontSize: 12.5 }}>Won in battles, furnished by you — saved on this device.</div>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)', fontSize: 18, flexShrink: 0 }}>→</div>
          </motion.button>
          <KeepChallenges />
        </div>
        </>
      ) : (
        <>
          <Button variant="gold" full onClick={() => { juice.coin(); navigate('/battle/new') }}>
            <PaintedIcon id="battle_swords" /> Start a new battle
          </Button>

          {/* Live sits UNDER the async battle, not beside it: a live match needs
              the other person to be holding their phone right now, so it is the
              rarer case even though it is the louder one. One button, not two:
              quick match and the room code are both behind this door, and a
              second button here would put the rarer case ahead of the async
              battle that always works. ONE line under both buttons — the
              gathering hour only says "now" while it's open. */}
          <div style={{ marginTop: 10 }}>
            <Button full onClick={() => { juice.coin(); navigate('/battle/live') }}>
              <PaintedIcon id="battle_live" /> {gatheringOpen() ? 'Live battle — it’s the gathering hour' : 'Live battle — same verse, same moment'}
            </Button>
          </div>
          <p className="faint center" style={{ fontSize: 11, margin: '6px 0 0', lineHeight: 1.4 }}>
            {gatheringOpen()
              ? 'People are likeliest to be looking right now.'
              : `Quick match or a room code · everyone gathers at ${gatheringLabel()}`}
          </p>

          {/* Your battles, split by whose move it is. "Your turn" carries the
              invite count, so an incoming challenge is visible without opening
              anything — that's the whole point of the split. */}
          <h3 className="dim" style={{ fontSize: 16, margin: '18px 0 10px' }}>Your battles</h3>
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
                    background: active ? 'var(--select)' : nudge ? 'rgba(255,210,63,0.10)' : 'var(--card)',
                    border: `1px solid ${active ? 'var(--select)' : nudge ? 'var(--gold)' : 'var(--stroke)'}`,
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

          {/* Battle ranks — two tabs: individual + team factions. The team
              only appears here, never on the main leaderboard. The tab is
              labelled "Teams", not "Denominations": Agnostic and Atheist play
              on this board too, and a heading that reads past them is the
              first thing that would tell them they're guests. */}
          {/* Folded by default, directly under the strip that carries the same
              two numbers — the strip means your rank and your team's are on
              screen whether the fold is open or shut. A player with no team
              gets one compact row between the two, which unfolds the picker
              where it is rather than opening the board to reach it. */}
          <RankStrip
            board={board}
            denomBoard={denomBoard}
            onOpen={(tab) => { juice.select(); setRankTab(tab); setRanksOpen(true) }}
          />
          {!profile?.denomination && <TeamChooser onChanged={onTeamChanged} />}

          <Collapsible icon={<PaintedIcon id="battle_trophy" />} title="Battle ranks" defaultOpen={ranksOpen} onToggle={setRanksOpen}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {(['individual', 'denomination'] as const).map((t) => (
                <button key={t} onClick={() => { juice.select(); setRankTab(t) }} className="pill"
                  style={{ background: rankTab === t ? 'var(--select)' : 'var(--card)', fontWeight: 800, textTransform: 'capitalize' }}>
                  {t === 'individual' ? 'Individual' : 'Teams'}
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
                          {r.rank === 1 ? <PaintedIcon id="battle_crown" label="1st" /> : r.rank}
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
              {/* Your team lives here rather than in profile settings — it's a
                  Battle-only faction, so it's picked (and changed) where it's
                  used. The no-team row above the fold mounts the same picker. */}
              <TeamPicker onChanged={onTeamChanged} style={{ marginBottom: 10 }} />
              <div className="card">
                {!denomBoard || denomBoard.top.length === 0 ? (
                  <p className="faint" style={{ fontSize: 14, textAlign: 'center', padding: '4px 0' }}>
                    No teams yet. Pick yours above to start its total.
                  </p>
                ) : (
                  <div style={{ display: 'grid', gap: 4 }}>
                    {denomBoard.top.map((r) => {
                      const color = denominationColor(r.denomination)
                      const mine = denomBoard.me?.denomination === r.denomination
                      return (
                        <button
                          key={r.denomination}
                          onClick={() => { juice.select(); setOpenKeep(r.denomination) }}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 10, borderLeft: `3px solid ${color}`, background: mine ? 'rgba(255,210,63,0.08)' : 'transparent', width: '100%', textAlign: 'left', cursor: 'pointer' }}
                        >
                          <span style={{ width: 18, textAlign: 'center', fontFamily: 'var(--font-display)', color: 'var(--ink-faint)' }}>
                            {r.rank === 1 ? <PaintedIcon id="battle_crown" label="1st" /> : r.rank}
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
                          <span style={{ color: 'var(--gold)', fontFamily: 'var(--font-display)' }}>›</span>
                        </button>
                      )
                    })}
                    <p className="faint" style={{ fontSize: 11, textAlign: 'center', margin: '6px 0 0' }}>
                      Tap a team to walk into its keep.
                    </p>
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
          </Collapsible>
          {/* ── The Keep ─────────────────────────────────────────────────
              A compact row now, not the painted hall. The inline ~230px scene
              was the heaviest thing on the tab and the one thing on it that can
              always wait — a room you furnish, not a move you owe anybody. The
              row names the hall and its level and opens KeepSheet, which is
              where the full scene has always lived too. With no team it opens
              your own hall (the same device/account keep a guest gets). */}
          <h3 className="dim" style={{ fontSize: 16, margin: '22px 0 10px' }}>The Keep</h3>
          <KeepRow onOpen={() => { juice.select(); setOpenKeep(profile?.denomination ?? '') }} />
          <KeepChallenges />

          <div style={{ height: 90 }} />
        </>
      )}

      {openKeep !== null && (
        <KeepSheet denomination={openKeep === '' ? null : openKeep} onClose={() => setOpenKeep(null)} />
      )}
    </Page>
  )
}

/**
 * Where you stand, and where your team stands — two tiles, above the fold.
 *
 * The boards themselves are a fold below this, and they always were; what was
 * missing is that a player had to open one to learn their own rank at all. This
 * is the same two numbers the boards already end with (`board.me`,
 * `denomBoard.me`), lifted to where they're read.
 *
 * It adds NO comparison the tab didn't already publish: battle wins have been
 * ranked since 0020, and both tiles are your own row out of a board you're
 * already on. There is no losses column here for the same reason there isn't
 * one in the schema. A tile with nothing to say — no battles finished, no team
 * picked — renders as the invitation to start one rather than as a zero.
 */
function RankStrip({
  board,
  denomBoard,
  onOpen,
}: {
  board: BattleBoard | null
  denomBoard: DenomBoard | null
  onOpen: (tab: 'individual' | 'denomination') => void
}) {
  const me = board?.me
  const team = denomBoard?.me
  const teamColor = team ? denominationColor(team.denomination) : 'var(--stroke)'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '18px 0 10px' }}>
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => onOpen('individual')}
        className="card"
        style={{ padding: '11px 12px', textAlign: 'left', minWidth: 0, cursor: 'pointer' }}
      >
        <div className="faint" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>You</div>
        {me ? (
          <>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, lineHeight: 1.1 }} className="gradient-text">
              #{me.rank}
            </div>
            <div className="faint" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {me.wins} win{me.wins === 1 ? '' : 's'} · {me.battles} battle{me.battles === 1 ? '' : 's'}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, lineHeight: 1.2, marginTop: 2 }}>Unranked</div>
            <div className="faint" style={{ fontSize: 11.5 }}>Win one and you’re on the board.</div>
          </>
        )}
      </motion.button>

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => onOpen('denomination')}
        className="card"
        style={{ padding: '11px 12px', textAlign: 'left', minWidth: 0, cursor: 'pointer', borderLeft: `3px solid ${teamColor}` }}
      >
        <div className="faint" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your team</div>
        {team ? (
          <>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, lineHeight: 1.1 }} className="gradient-text">
              #{team.rank}
            </div>
            <div className="faint" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {denominationName(team.denomination)} · {team.wins.toLocaleString()} wins
            </div>
          </>
        ) : (
          <>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, lineHeight: 1.2, marginTop: 2 }}>No team</div>
            <div className="faint" style={{ fontSize: 11.5 }}>Pick one — your wins add to its total.</div>
          </>
        )}
      </motion.button>
    </div>
  )
}

/**
 * The Keep as one row: the hall's name, its level, an arrow. Tapping opens
 * KeepSheet, which draws the full painted hall — the only place it is drawn.
 *
 * The level still comes from the faction's pooled wins (keep_json via
 * loadFactionKeep), so the name on the row and the room in the sheet agree.
 * With no team the row is your own hall, saying so plainly; choosing a team
 * is the compact row up by the rank strip, not a card here.
 */
function KeepRow({ onOpen }: { onOpen: () => void }) {
  const denomination = useAuth((st) => st.profile?.denomination ?? null)
  const [faction, setFaction] = useState<FactionKeep | null>(null)

  useEffect(() => {
    setFaction(null)
    if (denomination) loadFactionKeep(denomination).then(setFaction)
  }, [denomination])

  const color = denomination ? denominationColor(denomination) : 'var(--stroke)'
  const level = keepLevelForWins(faction?.wins ?? 0)

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onOpen}
      className="card"
      style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', marginBottom: 10, borderLeft: `3px solid ${color}` }}
    >
      <div style={{ fontSize: 26, flexShrink: 0 }}>🏰</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 15, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {denomination ? `${denominationName(denomination)} Keep` : 'Your Keep'}
        </b>
        <div className="faint" style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {denomination ? keepLevelName(level) : 'Your own hall — pick a team to share one.'}
        </div>
      </div>
      <div style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)', fontSize: 18, flexShrink: 0 }}>→</div>
    </motion.button>
  )
}

/**
 * Who you're playing for — the one picker, mounted in two places: unfolded
 * from the no-team row by the rank strip, and in the ranks fold's Teams tab
 * (where somebody who already has a team changes it).
 *
 * It is a plain list with every team on equal footing. An earlier card put the
 * gold "do the thing" colour on Non-denominational alone, which made one of
 * thirty teams read as the recommended answer and skewed who joined what; the
 * gold on this tab belongs to "Start a new battle". Don't add a highlighted
 * shortcut back.
 */
function TeamPicker({ onChanged, style }: { onChanged: () => void | Promise<void>; style?: CSSProperties }) {
  const juice = useJuice()
  const profile = useAuth((st) => st.profile)
  const updateProfile = useAuth((st) => st.updateProfile)
  return (
    <div className="card" style={style}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0, background: profile?.denomination ? denominationColor(profile.denomination) : 'var(--stroke)', boxShadow: profile?.denomination ? `0 0 8px ${denominationColor(profile.denomination)}` : 'none' }} />
        <select
          aria-label="Who you're playing for"
          value={profile?.denomination ?? ''}
          onChange={async (e) => {
            juice.select()
            // Wait for the write to land before re-reading, or the board
            // comes back with the old membership.
            await updateProfile({ denomination: e.target.value || null })
            await onChanged()
          }}
          style={{ flex: 1, minWidth: 0, padding: '10px 8px', borderRadius: 10, background: 'var(--card-solid)', color: 'var(--ink)', border: '1px solid var(--stroke)', fontSize: 14 }}
        >
          <option value="">Prefer not to say</option>
          {DENOMINATION_GROUPS.map((g) => (
            <optgroup key={g.key} label={g.label}>
              {DENOMINATIONS.filter((d) => d.group === g.key).map((d) => (
                <option key={d.key} value={d.key}>{d.name}</option>
              ))}
            </optgroup>
          ))}
          {/* `other` belongs to neither heading, so it sits after both. */}
          {DENOMINATIONS.filter((d) => !d.group).map((d) => (
            <option key={d.key} value={d.key}>{d.name}</option>
          ))}
        </select>
      </div>
      <p className="faint" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.4 }}>
        Optional &amp; friendly — your battle wins add to that team’s total and raise its hall. It never shows on the main leaderboard, and you can change it whenever you like.
      </p>
      {/* Said once, only to the two teams that might wonder whether
          they're actually welcome. It's a welcome, not a badge: nothing
          else about these teams looks different anywhere in the app. */}
      {isOpenFaction(profile?.denomination) && (
        <p className="faint" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.4 }}>
          You don’t have to believe it to be good at it — same verses, same board, no sermon attached.
        </p>
      )}
    </div>
  )
}

/**
 * The no-team row under the rank strip. One line until tapped, then the picker
 * unfolds right here — no board opened, no scroll-to. It replaces both the old
 * "Every team has a hall" card (which sat where the keep is) and the
 * open-two-folds-then-scroll button that reached the picker inside the ranks
 * board, which shipped twice as a button that silently did nothing.
 *
 * The parent unmounts it the moment a team is set, so nobody is asked twice.
 */
function TeamChooser({ onChanged }: { onChanged: () => void | Promise<void> }) {
  const juice = useJuice()
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginBottom: 10 }}>
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => { juice.select(); setOpen((o) => !o) }}
        aria-expanded={open}
        className="card"
        style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer', marginBottom: open ? 8 : 0 }}
      >
        <span style={{ flex: 1, minWidth: 0, fontWeight: 800, fontSize: 14 }}>
          Choose a team
          <span className="faint" style={{ fontWeight: 400, fontSize: 12 }}> · optional, shares a hall</span>
        </span>
        <span style={{ color: 'var(--gold)', fontFamily: 'var(--font-display)', fontSize: 15, flexShrink: 0 }}>{open ? '▴' : '▾'}</span>
      </motion.button>
      {open && <TeamPicker onChanged={onChanged} />}
    </div>
  )
}

/**
 * What the row says about this battle.
 *
 * `short` is the same fact in a couple of words, for the slim rows the other
 * two buckets use — it sits at the END of a single line beside the name, so
 * "Open challenge · waiting for a taker" would eat the name it's next to.
 */
function outcomeLabel(b: Battle, turn: Turn): { text: string; short: string; color: string } {
  if (turn === 'yours') {
    // The tab, the gold card and the Play pill already say "your move", so the
    // line spends its width on the number instead of repeating that — it has to
    // survive the ellipsis at 320px.
    const text = `Beat ${b.challenger.score?.toLocaleString()} pts to win`
    return { text, short: 'Your move', color: 'var(--gold)' }
  }
  if (turn === 'theirs') {
    return b.invited && !b.broadcast
      ? { text: 'Waiting on their play', color: 'var(--sky)', short: 'Waiting' }
      : { text: 'Open challenge · waiting for a taker', color: 'var(--sky)', short: 'Open' }
  }
  const won = (b.is_challenger && b.winner === 'challenger') || (b.is_opponent && b.winner === 'opponent')
  if (b.winner === 'tie') return { text: 'Tie', short: 'Tie', color: 'var(--ink-faint)' }
  return won
    ? { text: 'You won 🏆', short: 'Won 🏆', color: 'var(--good)' }
    : { text: 'You lost', short: 'Lost', color: 'var(--coral)' }
}

function BattleRow({ b, turn, onClick }: { b: Battle; turn: Turn; onClick: () => void }) {
  const other = b.is_challenger ? b.opponent : b.challenger
  // Pending targeted battle: the opponent hasn't played yet, so name the invitee.
  const name = other?.username ?? (b.status !== 'complete' ? b.invited : null)
  const label = outcomeLabel(b, turn)
  const mine = turn === 'yours'
  const title = mine && b.is_welcome ? '👋 Your first battle' : name ? `@${name}` : 'Open challenge'

  // Everything that isn't your move is a slim line rather than a card: same
  // information, a third of the height. A battle waiting on somebody else is a
  // fact to glance at, and 23 of them as full cards is the whole tab.
  if (!mine) {
    return (
      <motion.button
        whileTap={{ scale: 0.99 }}
        onClick={onClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', width: '100%', minWidth: 0,
          padding: '7px 10px', borderRadius: 12, cursor: 'pointer',
          background: 'var(--card)', border: '1px solid var(--stroke)',
        }}
      >
        {/* No `username` here on purpose: an Avatar that knows whose it is
            renders as its own <button> (it opens the player card), and a 26px
            second target inside a slim row is a mis-tap rather than a feature.
            The whole line opens the battle. */}
        <Avatar
          emoji={other?.avatar_emoji ?? (b.status !== 'complete' ? '⏳' : '⚔️')}
          character={other?.avatar_character}
          size={26}
          ring={false}
        />
        <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </span>
        <span style={{ fontSize: 11.5, color: label.color, fontWeight: 700, flexShrink: 0 }}>
          {label.short}
        </span>
        <span style={{ color: 'var(--gold)', fontFamily: 'var(--font-display)', fontSize: 15, flexShrink: 0 }}>›</span>
      </motion.button>
    )
  }

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="card"
      style={{
        display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', width: '100%', minWidth: 0,
        borderColor: 'var(--gold)', background: b.is_welcome ? 'rgba(255,210,63,0.14)' : 'rgba(255,210,63,0.08)',
      }}
    >
      <Avatar emoji={other?.avatar_emoji ?? '⏳'} character={other?.avatar_character} size={40} ring={false} username={other?.username} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontWeight: 800, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </b>
        <div style={{ fontSize: 12, color: label.color, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label.text}
        </div>
      </div>
      <span className="pill" style={{ background: 'var(--gold)', color: '#241f0a', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>Play</span>
    </motion.button>
  )
}
