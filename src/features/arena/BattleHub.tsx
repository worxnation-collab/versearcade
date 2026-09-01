import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { Collapsible } from '@/components/Collapsible'
import { useAuth } from '@/store/auth'
import { useBattles, type Battle, type BattleBoard, type DenomBoard } from '@/store/battles'
import { DENOMINATIONS, DENOMINATION_GROUPS, denominationColor, denominationName, isOpenFaction } from '@/data/denominations'
import { KeepSheet } from './KeepSheet'
import { useKeep, loadFactionKeep, type FactionKeep, type KeepMember, type Placements } from '@/store/keep'
import { keepLevelForWins, keepLevelName } from '@/data/keep'
import { KeepScene } from './KeepScene'
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
  /** Faction key whose keep is open, '' for "my hall", null for closed. */
  const [openKeep, setOpenKeep] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Turn | null>(null)
  /**
   * The team picker only EXISTS inside the Teams rank tab, which now also sits
   * inside a folded "Battle ranks" section — so "Choose a team" has to open
   * BOTH before it can scroll to it. Neither a closed Collapsible nor the
   * unselected rank tab mounts its children, and `getElementById` on something
   * that isn't mounted returns null and makes the button do nothing at all,
   * silently. That bug shipped once already on the rank-tab half alone; folding
   * the section re-armed it, which is why the fix is widened here in the same
   * change rather than left to be rediscovered.
   *
   * Opening both and scrolling in an EFFECT — rather than in the same handler —
   * is what guarantees the picker is mounted before we look for it. The beat of
   * delay is for the Collapsible's own 250ms expand: scrolling while the
   * section is still growing aims at a target that is still moving.
   */
  const [scrollToPicker, setScrollToPicker] = useState(false)
  /** Edge-triggered open for the ranks fold — see Collapsible's defaultOpen. */
  const [ranksOpen, setRanksOpen] = useState(false)
  const browseTeams = () => {
    setRanksOpen(true)
    setRankTab('denomination')
    setScrollToPicker(true)
  }
  useEffect(() => {
    if (!scrollToPicker) return
    // The flag is cleared INSIDE the timeout, not before it. Clearing it first
    // re-renders, which changes this effect's dep, which runs its cleanup —
    // cancelling the very timeout that does the scrolling. That shipped for
    // about ten minutes and the button silently did nothing again, which is
    // the same failure this whole block exists to prevent; found by driving
    // the real tab rather than by reading the diff.
    const t = setTimeout(() => {
      document.getElementById('team-picker')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setScrollToPicker(false)
    }, 320)
    return () => clearTimeout(t)
  }, [scrollToPicker])

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
      {/* One line, not a title card. This tab is reached by tapping a nav
          button labelled "Battle", so a 44px floating sword over the word
          "Bible Battle" was ~130px of the first screen spent restating what
          the player just tapped — and it pushed the gold "Start a new battle"
          button most of the way down a 390px phone. The Play and Study tabs
          have never carried one. The explanatory line stays, because that part
          is genuinely new information to somebody on their first visit. */}
      <p className="dim" style={{ margin: '2px 0 14px', fontSize: 13.5, lineHeight: 1.5 }}>
        ⚔️ Challenge a friend to the same verse quiz. Highest score wins.
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
            ⚔️ Start a new battle
          </Button>
          <p className="faint center" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.4 }}>
            Pick who you’re battling, then play your round.
          </p>

          {/* Live sits UNDER the async battle, not beside it: a live match needs
              the other person to be holding their phone right now, so it is the
              rarer case even though it is the louder one. One button, not two:
              quick match and the room code are both behind this door, and a
              second button here would put the rarer case ahead of the async
              battle that always works. */}
          <div style={{ marginTop: 10 }}>
            <Button full onClick={() => { juice.coin(); navigate('/battle/live') }}>
              🔴 Live battle — same verse, same moment
            </Button>
          </div>
          <p className="faint center" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.4 }}>
            Quick match anyone who’s looking, or share a room code.
          </p>

          {/* The hall, right under the button — the same place the Harvest Road
              puts its road. A tab whose whole ladder is a room should show the
              room, not a link to it. Someone with no team gets the invitation
              instead, because a hall with nobody's colours on it is the one
              version of this that says nothing. */}
          <div style={{ marginTop: 14, marginBottom: 4 }}>
            {profile?.denomination ? <MyKeepScene onOpen={() => { juice.select(); setOpenKeep(profile.denomination ?? '') }} /> : <PickATeam onBrowse={browseTeams} />}
          </div>

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

          {/* Battle ranks — two tabs: individual + team factions. The team
              only appears here, never on the main leaderboard. The tab is
              labelled "Teams", not "Denominations": Agnostic and Atheist play
              on this board too, and a heading that reads past them is the
              first thing that would tell them they're guests. */}
          {/* Folded, and closed by default — the same call the Play tab makes
              for "Worldwide Ranks", for the same reason: a board is something
              you look up occasionally, and open by default it sat between the
              battles you came to play and the keep ladder underneath, on every
              visit, for everybody. The team picker rides inside it because the
              team is a Battle-only faction and this is where it is used, and
              because "Choose a denomination" already opens the tab and scrolls
              to it.

              A closed Collapsible still says what is in it, so nothing here
              got harder to find — it got shorter to scroll past. */}
          <Collapsible icon="🏆" title="Battle ranks" defaultOpen={ranksOpen}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {(['individual', 'denomination'] as const).map((t) => (
                <button key={t} onClick={() => { juice.select(); setRankTab(t) }} className="pill"
                  style={{ background: rankTab === t ? 'var(--grape)' : 'var(--card)', fontWeight: 800, textTransform: 'capitalize' }}>
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
              {/* Your team lives here rather than in profile settings — it's a
                  Battle-only faction, so it's picked where it's used. */}
              <div className="card" id="team-picker" style={{ marginBottom: 10 }}>
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
                      setDenomBoard(await denominationBoard())
                    }}
                    style={{ flex: 1, padding: '10px 8px', borderRadius: 10, background: 'var(--card-solid)', color: 'var(--ink)', border: '1px solid var(--stroke)', fontSize: 14 }}
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
                  Optional &amp; friendly — pick who you’re playing for. Your battle wins add to that team’s total automatically, and it never shows on the main leaderboard.
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
          {/* ── The Keep ─────────────────────────────────────────────── */}
          {/* No "open your keep" card down here any more: the hall itself is up
              under the battle button and tapping it opens the sheet, so a row
              that says the same thing in words is one thing too many. What's
              left is the ladder, which the room can't show. */}
          <h3 className="dim" style={{ fontSize: 16, margin: '24px 0 10px' }}>
            {profile?.denomination ? `${denominationName(profile.denomination)} Keep` : 'The Keep'}
          </h3>
          {!profile?.denomination && (
            <p className="faint" style={{ fontSize: 12.5, margin: '-4px 0 10px', lineHeight: 1.5 }}>
              Pick a team above to share a hall — everything below is yours either way.
            </p>
          )}
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
 * Your faction's hall, inline under the new-battle button.
 *
 * The whole scene is the button: tapping anywhere in the room opens the sheet.
 * Deliberately NOT editable here — a hall you could rearrange from a summary
 * card would let you move the tapestry while reaching for what's under it.
 *
 * The faction blend is the same read the sheet does (keep_json), so the room
 * on the tab and the room in the sheet are the same room. It loads on mount
 * and shows the drawn fallback while it's in flight, which is the whole reason
 * the fallback exists.
 */
function MyKeepScene({ onOpen }: { onOpen: () => void }) {
  const profile = useAuth((st) => st.profile)
  const keep = useKeep()
  const [faction, setFaction] = useState<FactionKeep | null>(null)
  const denomination = profile?.denomination ?? null

  useEffect(() => {
    void useKeep.getState().load()
    if (denomination) loadFactionKeep(denomination).then(setFaction)
  }, [denomination])

  if (!denomination) return null
  const color = denominationColor(denomination)
  const placements: Placements = { ...(faction?.placements ?? {}), ...keep.placements }
  const wins = faction?.wins ?? 0
  const level = keepLevelForWins(wins)
  const members: KeepMember[] = faction?.members?.length
    ? faction.members
    : profile
      ? [{ username: profile.username, avatarEmoji: profile.avatarEmoji, avatarCharacter: profile.avatarCharacter, isMe: true }]
      : []

  return (
    <div>
      <KeepScene
        color={color}
        level={level}
        placements={placements}
        members={members}
        onOpen={onOpen}
      />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 14, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {denominationName(denomination)} Keep
        </b>
        <span className="faint" style={{ fontSize: 11.5, flex: 1, minWidth: 0 }}>
          {keepLevelName(level)}
        </span>
        <button className="pill" onClick={onOpen} style={{ fontSize: 11.5, padding: '4px 10px', fontWeight: 800, flexShrink: 0 }}>
          Decorate
        </button>
      </div>
    </div>
  )
}

/**
 * What sits where the hall would be, before there's a hall to show.
 *
 * The tone matters more than the layout here. A faction is optional and stays
 * optional — this offers the full list and the one-tap answer, and says plainly
 * that it can be changed and that it never touches the main leaderboard.
 * Nobody is nagged twice: it disappears the moment a team is picked.
 *
 * NEITHER BUTTON OUTRANKS THE OTHER, and that's the whole point of this card.
 * The gold variant is this app's "do the thing" colour, so putting it on
 * Non-denominational alone made one of thirty teams look like the recommended
 * answer and skewed who joined what. Both paths are the same variant now, the
 * full list leads, and the gold on this tab belongs to "Start a new battle".
 * If a variant ever changes here, change both.
 */
function PickATeam({ onBrowse }: { onBrowse: () => void }) {
  const juice = useJuice()
  const updateProfile = useAuth((st) => st.updateProfile)
  const [busy, setBusy] = useState(false)

  const pick = async (key: string) => {
    if (busy) return
    setBusy(true)
    juice.select()
    await updateProfile({ denomination: key })
    setBusy(false)
  }

  return (
    <div className="card">
      <div className="center" style={{ fontSize: 30, lineHeight: 1 }}>🏰</div>
      <b style={{ display: 'block', textAlign: 'center', fontFamily: 'var(--font-display)', fontSize: 16, marginTop: 6 }}>
        Every team has a hall
      </b>
      <p className="dim center" style={{ fontSize: 13, margin: '6px 0 12px', lineHeight: 1.5 }}>
        Pick who you're playing for and you get a room to fill — your battle wins raise it, and
        what you win in them hangs on its walls. It never shows on the main leaderboard, and you
        can change it whenever you like.
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Button
          variant="primary"
          disabled={busy}
          onClick={() => {
            juice.select()
            // The full list already exists further down the tab; send them to
            // it rather than building a second picker that could disagree.
            onBrowse()
          }}
        >
          Choose a denomination
        </Button>
        <Button variant="primary" disabled={busy} onClick={() => void pick('non_denominational')}>
          Non-denominational
        </Button>
      </div>
    </div>
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
