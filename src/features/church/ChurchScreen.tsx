import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { Collapsible } from '@/components/Collapsible'
import { CountUp } from '@/components/CountUp'
import { useAuth } from '@/store/auth'
import { useChurch } from '@/store/church'
import { useChurchYard } from '@/store/churchYard'
import { useRivalry } from '@/store/rivalry'
import { useJuice } from '@/juice/useJuice'
import { supabase } from '@/lib/supabase'
import { ChurchArt } from './ChurchArt'
import { ChurchBoard, TIMEFRAME_PHRASE } from './ChurchBoard'
import { ChurchScene } from './ChurchScene'
import { RivalryCard } from './RivalryCard'
import { FloraIcon } from './ChurchFlora'
import { FLORA, PLOTS, floraById, nextFlora } from './yard'
import { ChurchPicker } from './ChurchPicker'
import { CHURCH_TIERS, churchLevelInfo, nextTier, tierForLevel, tierIndexForLevel } from './levels'
import type { Church } from '@/types'

// The Church tab. Pick the church you actually attend, then pour the points
// you've earned into it: the congregation's XP is pooled, the building grows as
// it levels, and the whole thing is ranked against the churches around you.
export default function ChurchScreen() {
  const navigate = useNavigate()
  const mode = useAuth((s) => s.mode)
  const church = useChurch((s) => s.church)
  const loaded = useChurch((s) => s.loaded)
  const loading = useChurch((s) => s.loading)
  const load = useChurch((s) => s.load)

  useEffect(() => {
    void load()
  }, [load])

  // Pooled, cross-device, and ranked against other congregations — none of which
  // a guest device can do. Same gate the worldwide leaderboard uses.
  if (mode === 'local' || !supabase) {
    return (
      <Page>
        <Header />
        <div className="card center">
          <div style={{ fontSize: 34 }}>⛪</div>
          <p style={{ margin: '10px 0 14px', lineHeight: 1.5 }}>
            Create a free account to play for your church. Your points pool with everyone else who
            goes there, and your church climbs the local board.
          </p>
          <Button variant="gold" full onClick={() => navigate('/auth')}>
            Sign in / Create account
          </Button>
        </div>
      </Page>
    )
  }

  if (!loaded && loading) {
    return (
      <Page>
        <div className="center" style={{ paddingTop: 80 }}>
          <div className="floaty" style={{ fontSize: 48 }}>⛪</div>
        </div>
      </Page>
    )
  }

  return (
    <Page>
      <Header />
      {church ? <ChurchHome church={church} /> : <ChurchPicker />}
    </Page>
  )
}

function Header() {
  return (
    <div className="center" style={{ marginBottom: 16 }}>
      <div className="floaty" style={{ fontSize: 40 }}>⛪</div>
      <h1 style={{ fontSize: 26, marginTop: 2 }}>My Church</h1>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The church you're playing for
// ---------------------------------------------------------------------------
function ChurchHome({ church }: { church: Church }) {
  const juice = useJuice()
  const navigate = useNavigate()
  const { available, myGiven, givers, contribute, leave, radiusMiles, timeframe } = useChurch()
  const worldwide = radiusMiles === 'all'
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [promoted, setPromoted] = useState<string | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)

  // The churchyard lives up here now, because the hero IS the yard: the scene
  // at the top of this tab is the editable one, and the picker below only fills
  // plots. Two scenes on one screen was one scene too many.
  const me = useAuth((s) => s.profile)
  const { plantings, load: loadYard, move: moveFlora } = useChurchYard()
  // The congregation's monuments stand in the same hero scene as its flowers.
  const statues = useRivalry((s) => s.statues)
  const loadRivalry = useRivalry((s) => s.load)
  const congregation = useChurch((s) => s.congregation)
  const loadCongregation = useChurch((s) => s.loadCongregation)
  const [picked, setPicked] = useState<string | null>(null)
  const [yardNote, setYardNote] = useState<string | null>(null)

  useEffect(() => {
    void loadYard()
    // This one has SIDE EFFECTS on the server as well as reading: church_rivalry
    // settles any finished week and pairs the current one (0075). Since nothing
    // in this project runs on a schedule, opening the tab IS the scheduler —
    // which is why it is called on mount rather than lazily when the card
    // scrolls into view.
    void loadRivalry()
  }, [loadYard, loadRivalry, church.id])

  // Keyed on the church so joining, leaving or switching redraws the yard with
  // the right people in it rather than the last congregation's.
  useEffect(() => {
    void loadCongregation()
  }, [loadCongregation, church.id])

  useEffect(() => {
    if (!yardNote) return
    const t = setTimeout(() => setYardNote(null), 2600)
    return () => clearTimeout(t)
  }, [yardNote])

  // The congregation stands in its own yard.
  //
  // This used to draw you ALONE under a caption reading "Your congregation ·
  // 3 players", on the reasoning that the people belong on the church's page
  // where the roster is. On a real phone that reads as a broken screen, and
  // fairly: the line above says three and the grass had one. The keep's hall
  // shows you alone because a faction is thousands of strangers and any crowd
  // it drew would be an arbitrary sample; a congregation is a handful of named
  // people, so there is nothing to sample.
  //
  // Nothing about the rule changes: the roster is ordered by join date, carries
  // no per-person points, and `is_me` on your own row is what keeps you from
  // being drawn twice. Until the RPC lands — and for a guest, who has no church
  // at all — you stand there on your own, exactly as before.
  const crowd = congregation.length
    ? congregation
    : me
      ? [{ username: me.username, avatarEmoji: me.avatarEmoji, avatarCharacter: me.avatarCharacter, pet: me.pet, isMe: true }]
      : []

  const pick = (plot: string) => {
    juice.tap()
    setPicked((cur) => (cur === plot ? null : plot))
  }

  const drop = async (plot: string) => {
    const from = picked
    setPicked(null)
    if (!from) return
    const had = !!plantings[plot]
    const res = await moveFlora(from, plot)
    if (!res.ok) {
      setYardNote('That didn’t save. Try again in a moment.')
      return
    }
    juice.select()
    if (had) setYardNote('Swapped.')
  }

  const info = useMemo(() => churchLevelInfo(church.xp), [church.xp])
  const tier = tierForLevel(info.level)
  const upcoming = nextTier(info.level)
  const where = [church.city, church.region].filter(Boolean).join(', ')

  const give = async (points: number) => {
    if (busy || points <= 0) return
    setBusy(true)
    const beforeTier = tier.id
    juice.coin()
    const res = await contribute(points)
    setBusy(false)
    if (!res.ok) {
      setFlash(
        res.reason === 'nothing_to_give'
          ? 'Play a round first — points to give come from XP you’ve earned.'
          : 'That didn’t go through. Try again in a moment.',
      )
      return
    }
    const afterTier = tierForLevel(churchLevelInfo(useChurch.getState().church?.xp ?? church.xp).level)
    if (afterTier.id !== beforeTier) {
      // The building itself changed — that's the big moment, not the level.
      setPromoted(afterTier.name)
      juice.celebrate()
    } else if (res.leveledUp) {
      juice.levelUp()
    } else {
      juice.correct()
    }
    setFlash(`+${res.given.toLocaleString()} to ${church.name}`)
    // Giving is the only thing that opens landscaping, so the yard's ladder is
    // stale the moment this lands.
    void useChurchYard.getState().load()
    // And it just moved this week's matchup — the whole point of the card above
    // is that a gift changes the bar you can see. Re-read rather than adding
    // optimistically: the opponent's half moves too, and only the server knows.
    void useRivalry.getState().load()
  }

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 2600)
    return () => clearTimeout(t)
  }, [flash])

  // Offer round numbers you can actually afford, plus everything.
  const quick = [100, 500, 2500].filter((n) => n <= available)

  return (
    <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0, 1fr)' }}>
      {/* Hero --------------------------------------------------------------
          The church you play for, as a PLACE: the building at its tier, the
          landscaping its givers planted, and people standing outside it. It was
          a portrait of the building on its own, which said "here is a drawing"
          rather than "here is where you go" — the Harvest Road and the keep both
          open with their world, and this is the same idea in the same spot.

          It is also the editable one: tap a plant to pick it up, tap a plot to
          set it down. The landscaping picker below fills the plots; this is
          where you arrange them. */}
      <div className="card center" style={{ paddingTop: 10 }}>
        <ChurchScene
          level={info.level}
          members={crowd}
          skin={church.skin}
          flora={plantings}
          statues={statues}
          floraEditing={{ picked, onPick: pick, onDrop: drop }}
          emptyNote={false}
          onArcade={() => { juice.select(); navigate('/arcade/manna') }}
        />
        {(picked || yardNote) && (
          <p className="center" style={{ margin: '8px 0 0', fontSize: 12.5, fontWeight: 700, color: 'var(--gold)' }}>
            {picked
              ? `Carrying the ${floraById(plantings[picked])?.name} — tap a spot to plant it there.`
              : yardNote}
          </p>
        )}
        <h2 style={{ fontSize: 22, marginTop: 8, overflowWrap: 'anywhere' }}>{church.name}</h2>
        <p className="faint" style={{ margin: '2px 0 0', fontSize: 12.5 }}>
          {where || 'Your congregation'} · {church.members} {church.members === 1 ? 'player' : 'players'}
        </p>

        <div
          className="pill"
          style={{ marginTop: 10, borderColor: 'var(--gold)', color: 'var(--gold)', fontWeight: 800 }}
        >
          LVL {info.level} · {tier.name}
        </div>
        <p className="dim" style={{ margin: '8px 0 0', fontSize: 13, fontStyle: 'italic' }}>“{tier.blurb}”</p>

        <div style={{ marginTop: 14, textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
            <span className="dim">{church.xp.toLocaleString()} church XP</span>
            <span className="faint">{info.intoLevel.toLocaleString()}/{info.levelSpan.toLocaleString()}</span>
          </div>
          <div style={{ height: 14, borderRadius: 999, background: 'rgba(0,0,0,0.35)', overflow: 'hidden', border: '1px solid var(--stroke)' }}>
            <motion.div
              animate={{ width: `${info.pct * 100}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 20 }}
              style={{
                height: '100%',
                borderRadius: 999,
                background: 'linear-gradient(90deg, var(--gold), var(--tangerine))',
                boxShadow: '0 0 14px rgba(255,159,28,0.6)',
              }}
            />
          </div>
          <p className="faint" style={{ margin: '8px 0 0', fontSize: 12, textAlign: 'center' }}>
            {info.toNext.toLocaleString()} to LVL {info.level + 1}
            {upcoming ? ` · ${upcoming.name} at LVL ${upcoming.minLevel}` : ' · top of the ladder'}
          </p>
        </div>
      </div>

      {/* This week's matchup ------------------------------------------------
          Above the Give card on purpose: it is the reason to tap Give this
          week, and an argument placed below its own call to action is an
          argument nobody reads. */}
      <RivalryCard mine={church} />

      {/* Give -------------------------------------------------------------- */}
      <div className="card">
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>Add points</b>
        <p className="dim" style={{ margin: '6px 0 0', fontSize: 13.5, lineHeight: 1.5 }}>
          Giving doesn't cost you anything — your own XP and rank stay exactly where they are. You
          can give up to what you've earned all-time, and playing earns you more.
        </p>

        <div className="center" style={{ margin: '14px 0 12px' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 34, fontWeight: 800, color: 'var(--gold)' }}>
            <CountUp to={available} duration={600} />
          </div>
          <div className="faint" style={{ fontSize: 12, marginTop: -2 }}>points ready to give</div>
        </div>

        {available <= 0 ? (
          <p className="dim center" style={{ fontSize: 13.5, margin: 0 }}>
            All given. Play today's drop, a battle or a study run to earn more.
          </p>
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            {quick.map((n) => (
              <Button key={n} variant="secondary" disabled={busy} onClick={() => give(n)}>
                +{n.toLocaleString()}
              </Button>
            ))}
            <Button variant="gold" disabled={busy} onClick={() => give(available)}>
              {busy ? 'Giving…' : `Give all ${available.toLocaleString()}`}
            </Button>
          </div>
        )}

        {myGiven > 0 && (
          <p className="faint center" style={{ fontSize: 12, margin: '12px 0 0' }}>
            You've given {myGiven.toLocaleString()} to {church.name}.
          </p>
        )}

        <AnimatePresence>
          {flash && (
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="center"
              style={{ margin: '10px 0 0', fontSize: 13, fontWeight: 800, color: 'var(--gold)' }}
            >
              {flash}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Landscaping — the picker only; the yard itself is the hero above. */}
      <Landscaping church={church} onPlanted={() => setPicked(null)} />

      {/* Ranks — local by default, worldwide on the "All" chip -------------- */}
      <div className="card">
        <div className="center" style={{ marginBottom: 12 }}>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>
            {worldwide ? 'Churches worldwide' : 'Churches near you'}
          </b>
          <p className="faint" style={{ margin: '2px 0 0', fontSize: 12 }}>
            {/* The window slots into the sentence the caption has always been.
                It is the empty string on all time, so the default scope reads
                exactly as it did before the chips existed. */}
            {worldwide
              ? `Every church playing, ranked by points given${TIMEFRAME_PHRASE[timeframe]}`
              : `Ranked by points given${TIMEFRAME_PHRASE[timeframe]}, measured from ${church.name}`}
          </p>
        </div>
        <ChurchBoard />
      </div>

      {/* Congregation ------------------------------------------------------ */}
      {givers.length > 0 && (
        <Collapsible icon="🙌" title="Top givers" meta={`${givers.length}`}>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
            {givers.map((g, i) => (
              <div
                key={g.username}
                className="card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 12px',
                  minWidth: 0,
                  borderColor: g.isMe ? 'var(--gold)' : 'var(--stroke)',
                  background: g.isMe ? 'rgba(255,210,63,0.08)' : undefined,
                }}
              >
                <span className="faint" style={{ width: 20, fontWeight: 800, fontSize: 13 }}>{i + 1}</span>
                <Avatar emoji={g.avatarEmoji} character={g.avatarCharacter} username={g.username} size={34} />
                <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {g.username}{g.isMe ? ' (you)' : ''}
                </span>
                <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--gold)' }}>{g.points.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </Collapsible>
      )}

      {/* The ladder -------------------------------------------------------- */}
      <Collapsible icon="🏗️" title="Buildings to earn" meta={`${tierIndexForLevel(info.level) + 1}/${CHURCH_TIERS.length}`}>
        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
          {CHURCH_TIERS.map((t) => {
            const earned = info.level >= t.minLevel
            return (
              <div
                key={t.id}
                className="card"
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', minWidth: 0, borderColor: earned ? 'var(--gold)' : 'var(--stroke)' }}
              >
                <ChurchArt tier={t.id} skin={church.skin} size={56} locked={!earned} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontWeight: 800, fontSize: 14 }}>{t.name}</span>
                  <span className="faint" style={{ display: 'block', fontSize: 12 }}>
                    {earned ? 'Earned' : `Unlocks at LVL ${t.minLevel}`}
                  </span>
                </span>
                <span style={{ fontSize: 16 }}>{earned ? '✅' : '🔒'}</span>
              </div>
            )
          })}
        </div>
      </Collapsible>

      {/* Change church ----------------------------------------------------- */}
      <div className="card center">
        {confirmLeave ? (
          <>
            <p style={{ margin: '0 0 12px', fontSize: 13.5, lineHeight: 1.5 }}>
              Switch to a different church? Points you've already given stay with {church.name} —
              they were a gift, not a deposit.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <Button variant="secondary" onClick={() => { setConfirmLeave(false); void leave() }}>
                Yes, switch
              </Button>
              <Button variant="ghost" onClick={() => setConfirmLeave(false)}>Cancel</Button>
            </div>
          </>
        ) : (
          <button onClick={() => setConfirmLeave(true)} className="faint" style={{ fontSize: 13, textDecoration: 'underline' }}>
            Change my church
          </button>
        )}
      </div>

      {/* Promotion moment -------------------------------------------------- */}
      <AnimatePresence>
        {promoted && (
          <Promotion name={promoted} level={info.level} skin={church.skin} onClose={() => setPromoted(null)} />
        )}
      </AnimatePresence>

      <div style={{ height: 20 }} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Landscaping
// ---------------------------------------------------------------------------
// The other half of giving. Church XP grows the building for everybody; the
// same points, counted as YOUR lifetime giving, open the landscaping you get to
// choose. It sits directly under the Give card because that's the sentence:
// give, and the ground out front is where it shows up.
//
// This is the PICKER only — what goes in each plot. The yard itself is the hero
// at the top of the tab, and arranging it happens there by tapping. Rendering a
// second scene down here meant two churchyards on one screen disagreeing about
// which one you were touching.
//
// Nothing in here counts or compares anybody: no "3 planted", no who-planted-
// what, no per-giver totals. See features/church/yard.ts.
function Landscaping({ church, onPlanted }: { church: Church; onPlanted: () => void }) {
  const juice = useJuice()
  const { given, plantings, loaded, plant, unlocked } = useChurchYard()
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), 2600)
    return () => clearTimeout(t)
  }, [flash])

  const mine = unlocked()
  const next = nextFlora(given)

  /** Tap a plant: it goes in the first free plot. No plot list to read first —
   *  and if the yard is full, it says so rather than quietly replacing
   *  something, which is the same rule the keep's shelf follows. */
  const put = async (floraId: string) => {
    onPlanted()
    const taken = new Set(Object.keys(plantings))
    const free = PLOTS.find((p) => !taken.has(p.id))
    if (!free) {
      juice.select()
      setFlash('The yard is full — take something out first, or move one in the yard above.')
      return
    }
    juice.select()
    const res = await plant(free.id, floraId)
    if (!res.ok) {
      setFlash(
        res.reason === 'locked'
          ? 'Not open yet — keep giving and it will be.'
          : 'That didn’t save. Try again in a moment.',
      )
      return
    }
    juice.coin()
    setFlash(`Planted — ${floraById(floraId)?.name}.`)
  }

  /** Take a plant out of whichever plot holds it. */
  const pull = async (floraId: string) => {
    onPlanted()
    juice.select()
    const plot = PLOTS.find((p) => plantings[p.id] === floraId)
    if (!plot) return
    const res = await plant(plot.id, null)
    if (!res.ok) setFlash('That didn’t save. Try again in a moment.')
  }

  return (
    <div className="card">
      <b style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>Your churchyard</b>
      <p className="dim" style={{ margin: '6px 0 10px', fontSize: 13.5, lineHeight: 1.5 }}>
        Giving opens up the landscaping out front — it's the yard at the top of this tab. Everyone
        who gives plants their own, and the yard on {church.name}'s page is all of it together;
        nobody's beds are labelled. Tap anything you've planted up there to move it.
      </p>

      <p className="faint" style={{ fontSize: 12, margin: '0 0 4px', lineHeight: 1.5 }}>
        {given.toLocaleString()} given, all-time
        {next
          ? ` · ${(next.given - given).toLocaleString()} more opens the ${next.name}.`
          : ' · every plant is open. The yard is yours.'}
      </p>

      <AnimatePresence>
        {flash && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="center"
            style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 800, color: 'var(--gold)' }}
          >
            {flash}
          </motion.p>
        )}
      </AnimatePresence>

      <div style={{ marginTop: 12 }}>
        <Collapsible icon="🌷" title="Landscaping" meta={`${mine.length}/${FLORA.length} open`}>
          {!loaded ? (
            <p className="faint" style={{ fontSize: 12, margin: 0 }}>Reading the yard…</p>
          ) : (
            <>
              <p className="faint" style={{ fontSize: 11.5, margin: '0 0 10px', lineHeight: 1.5 }}>
                Tap a plant to put it in the yard above, and tap it there to move it. Everything
                arrives by giving — nothing here is for sale.
              </p>
              {/* Pictures, not a list of names. The ladder WAS the visual and
                  the per-plot chip rows were a second, wordier copy of it, so
                  the ladder became the picker and the rows are gone. */}
              <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' }}>
                {FLORA.map((f) => {
                  const open = given >= f.given
                  const planted = Object.values(plantings).includes(f.id)
                  return (
                    <div
                      key={f.id}
                      style={{
                        position: 'relative',
                        borderRadius: 12,
                        border: `1px solid ${planted ? 'var(--gold)' : 'var(--stroke)'}`,
                        background: planted ? 'rgba(255,210,63,0.10)' : 'rgba(255,255,255,0.04)',
                        opacity: open ? 1 : 0.45,
                        overflow: 'hidden',
                      }}
                    >
                      <button
                        onClick={() => open && void put(f.id)}
                        disabled={!open}
                        aria-label={open ? `Plant ${f.name}` : `${f.name}, locked`}
                        style={{
                          display: 'block',
                          width: '100%',
                          padding: '10px 6px 8px',
                          background: 'none',
                          border: 'none',
                          cursor: open ? 'pointer' : 'default',
                          textAlign: 'center',
                        }}
                      >
                        <span style={{ display: 'grid', placeItems: 'center', height: 56 }}>
                          <FloraIcon id={f.id} size={54} />
                        </span>
                        <span style={{ display: 'block', fontSize: 11, fontWeight: 800, marginTop: 4, lineHeight: 1.25 }}>
                          {f.name}
                        </span>
                        <span className="faint" style={{ display: 'block', fontSize: 10, marginTop: 2 }}>
                          {planted ? 'In the yard' : open ? 'Tap to plant' : `🔒 ${f.given.toLocaleString()} given`}
                        </span>
                      </button>
                      {planted && (
                        <button
                          onClick={() => void pull(f.id)}
                          aria-label={`Take the ${f.name} out`}
                          style={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            border: '1px solid var(--stroke)',
                            background: 'rgba(10,5,26,0.8)',
                            color: 'var(--ink-dim)',
                            fontSize: 12,
                            lineHeight: 1,
                            cursor: 'pointer',
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </Collapsible>
      </div>
    </div>
  )
}


// The reward for a long climb: the building visibly becomes something bigger.
function Promotion({
  name,
  level,
  skin,
  onClose,
}: {
  name: string
  level: number
  skin?: string | null
  onClose: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: 'rgba(8,4,24,0.82)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <motion.div
        initial={{ scale: 0.8, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className="card center"
        style={{ maxWidth: 340, borderColor: 'var(--gold)' }}
      >
        <p className="faint" style={{ margin: 0, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Your church grew
        </p>
        <ChurchArt level={level} skin={skin} size={200} animate />
        <h2 className="gradient-text" style={{ fontSize: 26, marginTop: 4 }}>{name}</h2>
        <p className="dim" style={{ margin: '8px 0 14px', fontSize: 14 }}>
          Everyone who gave built this. Keep going — there's more house to raise.
        </p>
        <Button variant="gold" full onClick={onClose}>Amen</Button>
      </motion.div>
    </motion.div>
  )
}
