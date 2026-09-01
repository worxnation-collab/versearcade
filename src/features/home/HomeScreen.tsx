import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { XpBar } from '@/components/XpBar'
import { StreakFlame } from '@/components/StreakFlame'
import { QuickSheet } from '@/components/QuickSheet'
import { DailyChest } from '@/features/chest/DailyChest'
import { RoadStrip } from '@/features/season/RoadStrip'
import { MapCompass } from '@/features/map/MapCompass'
import { PlayedToday } from '@/features/presence/PlayedToday'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/store/auth'
import { useGame } from '@/store/game'
import { useReviews } from '@/store/reviews'
import { useSettings } from '@/store/settings'
import { useCollection } from '@/store/collection'
import { useDailyTrivia } from '@/store/dailyTrivia'
import { useFirstLight } from '@/store/firstLight'
import { Tutorial } from './Tutorial'
import { InstallPrompt } from './InstallPrompt'
import { AppStoreNudge } from './AppStoreNudge'
import { FirstLight } from '@/features/daily/FirstLight'
import { dailyTriviaBook } from '@/data/bible/questions'
import { msUntilNextLocalMidnight, formatCountdown } from '@/lib/date'

// The Play tab: two daily boxes, the road, and the compass.
//
// ── WHY IT IS FOUR THINGS ────────────────────────────────────────────────────
//
// This screen accreted. Every card on it was individually right — the chest is
// the verse's reward, first light is a fact about today's verse, the ranks
// belong somewhere — and the sum was a column you had to scroll to find the one
// thing the app is for. So the shape is now:
//
//   1. **The two daily boxes, side by side.** Today's verse and today's trivia
//      round are both "a thing that is new today and gone tomorrow", so they sit
//      level with each other rather than one being buried under the other. The
//      verse keeps the gold; the trivia box is deliberately cooler, because the
//      verse is still what this app is for.
//   2. **The Harvest Road**, under them, exactly as before.
//   3. **The compass**, at full size, glowing gold when something is open. It is
//      the same door as the puck beside the nav — see `MapCompass`, and read
//      `features/map/invitations.ts` before touching what makes it glow.
//
// Plus one LINE, not a card: how many people have played today, under the two
// boxes. It is what survived of the presence ticker — the count was the part
// doing the work, the drifting "@name +430" scores were the part that put one
// player's number beside another's. Tapping it opens the people and never the
// scores (`PlayedToday`, `0093`).
//
// Everything else that had a card here is now a BUTTON that opens its own
// content in a sheet, which is First Light's own gesture generalised rather
// than three screens each inventing one. Two things about that are deliberate:
//
//  - **The chest lives inside the drop box**, because it IS the drop's reward —
//    it unlocks only once the verse is played, and it belongs next to the thing
//    that unlocked it rather than in a card of its own two scrolls down.
//  - **Nothing was deleted, only moved.** The presence strip and the worldwide
//    ranks collapsible are gone from this screen; the ranks still have their own
//    place on the map (`/leaderboard`). An arcade card used to sit in the played
//    state here; the arcade is one of the compass's invitations now, which is
//    the same offer made in the place that is now about answering "what next?".
//
// If a future session wants to add a card here, the honest question is whether
// it is a thing that is NEW TODAY. If it isn't, it wants a button and a sheet,
// or a row on the map.
export default function HomeScreen() {
  const navigate = useNavigate()
  const profile = useAuth((s) => s.profile)!
  const mode = useAuth((s) => s.mode)
  const { today, todayDate, playedToday, lastResult, loadToday, boostArmed, armBoost } = useGame()
  const { loadDue } = useReviews()
  const loadCollection = useCollection((s) => s.load)
  const chestOpenedOn = useCollection((s) => s.chestOpenedOn)
  const loadTrivia = useDailyTrivia((s) => s.load)
  const triviaDone = useDailyTrivia((s) => !!s.done[todayDate])
  const loadFirstLight = useFirstLight((s) => s.load)
  const firstLightAvailable = useFirstLight((s) => s.available)
  const tutorialSeen = useSettings((s) => s.tutorialSeen)
  const setSettings = useSettings((s) => s.set)
  const [countdown, setCountdown] = useState(msUntilNextLocalMidnight())
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [sheet, setSheet] = useState<null | 'chest' | 'lantern' | 'account'>(null)

  useEffect(() => {
    loadToday()
    loadDue()
    loadCollection()
    loadTrivia()
    // First Light lives in a sheet now, and its own component is what used to
    // call this. So the load has to happen HERE: the button that opens the
    // sheet is gated on `available`, and a store that is only loaded by the
    // thing behind the button can never turn the button on. Found by driving
    // the real app — the card simply never appeared.
    void loadFirstLight()
  }, [loadToday, loadDue, loadCollection, loadTrivia, loadFirstLight])

  // Show the how-to-play walkthrough once, automatically, to brand-new players
  // (nobody who's already played today). After that it's opt-in via Settings.
  useEffect(() => {
    if (!tutorialSeen && !playedToday && profile.totalPlays === 0) {
      setTutorialOpen(true)
      setSettings({ tutorialSeen: true })
    }
  }, [tutorialSeen, playedToday, profile.totalPlays, setSettings])

  // Finishing a run can have claimed the day (`submit_play` records the open
  // too), so re-read when the played flag flips rather than leaving a stale
  // "nobody yet" behind the button. This is the effect FirstLight used to own.
  useEffect(() => {
    if (playedToday) void loadFirstLight()
  }, [playedToday, loadFirstLight])

  useEffect(() => {
    const t = setInterval(() => setCountdown(msUntilNextLocalMidnight()), 1000)
    return () => clearInterval(t)
  }, [])

  const triviaBook = useMemo(() => dailyTriviaBook(todayDate), [todayDate])
  const chestReady = playedToday && !chestOpenedOn(todayDate)
  const guest = mode === 'local' && !!supabase

  return (
    <Page>
      {/* Top identity bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <Avatar emoji={profile.avatarEmoji} character={profile.avatarCharacter} ring border={profile.avatarBorder} badge={profile.avatarBadge} username={profile.username} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>@{profile.username}</b>
            <StreakFlame days={profile.currentStreak} size={18} />
          </div>
          <div style={{ marginTop: 6 }}>
            <XpBar xp={profile.xp} />
          </div>
        </div>
      </div>

      {/* Streak-freeze reassurance (kind loss-aversion made visible) */}
      {profile.streakFreezes > 0 && profile.currentStreak > 0 && (
        <p className="faint" style={{ fontSize: 12, marginBottom: 10 }}>
          🛟 {profile.streakFreezes} streak freeze{profile.streakFreezes > 1 ? 's' : ''} — miss a day and your streak survives.
        </p>
      )}

      {/* ── The two daily boxes ────────────────────────────────────────────
          `1fr 1fr` with `minWidth: 0` on each child: without it a long verse
          reference or a book name like "1 Thessalonians" blows the column out
          and the pair stops being two halves. `alignItems: stretch` keeps them
          the same height whatever state each is in, because two boxes of
          different heights read as one card and one afterthought. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'stretch' }}>
        <DropBox
          played={playedToday}
          reference={today?.reference}
          questionCount={today?.questions.length ?? 5}
          score={lastResult?.result.score}
          correct={lastResult?.result.correctCount}
          total={lastResult?.result.totalQuestions}
          countdown={formatCountdown(countdown)}
          boosts={profile.xpBoosts}
          boostArmed={boostArmed}
          onBoost={() => armBoost(!boostArmed)}
          chestReady={chestReady}
          onChest={() => setSheet('chest')}
          onPlay={() => navigate('/play/run')}
          onRecap={() => navigate('/play/result')}
        />
        <TriviaBox
          book={triviaBook}
          done={triviaDone}
          countdown={formatCountdown(countdown)}
          onPlay={() => navigate('/play/trivia')}
        />
      </div>

      {/* How many people are in this with you today, directly under the two
          boxes because it is a fact about the thing those boxes just offered.
          A number and a door — never a score beside anybody's name. See
          `PlayedToday` and `0093_daily_players.sql`. */}
      <PlayedToday />

      {/* The Pilgrimage, under the two things that are new today. */}
      <div style={{ marginTop: 14 }}>
        <RoadStrip />
      </div>

      {/* And the way to everywhere else. */}
      <MapCompass />

      {/* ── The buttons ────────────────────────────────────────────────────
          What is left of this screen's old cards, each one tap from its own
          content. Only what is genuinely there renders: no placeholder row, no
          disabled state, so an empty row is simply no row. */}
      {(firstLightAvailable || guest) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {firstLightAvailable && (
            <PillButton icon="🌅" label="First light" onClick={() => setSheet('lantern')} />
          )}
          {guest && (
            <PillButton icon="⭐" label="Create a free account" gold onClick={() => setSheet('account')} />
          )}
        </div>
      )}

      {/* Add to Home Screen — only renders where installing is actually possible
          (and not already installed), and can be dismissed for good. */}
      <InstallPrompt />

      {/* The App Store bubble — floats in a couple of seconds later, for players
          a few drops deep. */}
      <AppStoreNudge />

      {tutorialOpen && <Tutorial onClose={() => setTutorialOpen(false)} />}

      {/* The chest is the drop's reward, so its sheet is opened from the drop
          box. `DailyChest` is mounted UNCHANGED — the reveal, the relic, the
          duplicate line and the item drop are all still its own. */}
      {sheet === 'chest' && (
        <QuickSheet title="🎁 Today’s reward" onClose={() => setSheet(null)}>
          <DailyChest />
        </QuickSheet>
      )}

      {/* Who opened today's verse first. The card is unchanged and still opens
          the holder's player card from inside here — the player card sits at
          110, above this sheet's 100, which is the tier ladder working as
          designed rather than a coincidence. */}
      {sheet === 'lantern' && (
        <QuickSheet title="🌅 First light" onClose={() => setSheet(null)}>
          <FirstLight />
        </QuickSheet>
      )}

      {/* Guests need a way back into an existing account, and this is the only
          screen everyone lands on. Guarded on `supabase` as well as guest mode:
          in a keyless LOCAL build there is no backend to sign in to and the
          button would be a dead end. */}
      {sheet === 'account' && (
        <QuickSheet title="⭐ Your account" onClose={() => setSheet(null)}>
          <p style={{ margin: '0 0 6px', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17 }}>
            Today’s verse is yours. The rest is one tap away.
          </p>
          <p className="dim" style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.5 }}>
            A free account opens battles, your keep, Study, your own Bible and playing for
            your church — and carries your streak, XP and character to any device.
          </p>
          <div style={{ display: 'grid', gap: 8 }}>
            <Button variant="gold" full onClick={() => navigate('/auth?mode=signup')}>
              Create a free account →
            </Button>
            <Button variant="ghost" full onClick={() => navigate('/auth')}>
              I already have an account
            </Button>
          </div>
        </QuickSheet>
      )}

    </Page>
  )
}

// ── The boxes ───────────────────────────────────────────────────────────────
//
// Both are half-width on a 320px phone (roughly 145px of content), which is the
// constraint that shaped every line in them: one heading, one fact, one button.
// Anything that wanted a third line got cut or moved to a sheet.

/** The box's own label. `nowrap` is the load-bearing part — see DropBox. */
const PILL: React.CSSProperties = {
  marginBottom: 10,
  fontSize: 10.5,
  padding: '4px 9px',
  alignSelf: 'center',
  whiteSpace: 'nowrap',
  maxWidth: '100%',
}

function BoxShell({
  accent,
  children,
}: {
  /** The wash behind the box. Gold for the verse, sky for the trivia. */
  accent: string
  children: React.ReactNode
}) {
  return (
    <motion.div
      className="card"
      initial={{ scale: 0.96, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      style={{
        padding: '16px 12px',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: `radial-gradient(220px 130px at 50% 0%, ${accent}, transparent 70%)`,
        }}
      />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        {children}
      </div>
    </motion.div>
  )
}

function DropBox({
  played,
  reference,
  questionCount,
  score,
  correct,
  total,
  countdown,
  boosts,
  boostArmed,
  onBoost,
  chestReady,
  onChest,
  onPlay,
  onRecap,
}: {
  played: boolean
  reference?: string
  questionCount: number
  score?: number
  correct?: number
  total?: number
  countdown: string
  boosts: number
  boostArmed: boolean
  onBoost: () => void
  chestReady: boolean
  onChest: () => void
  onPlay: () => void
  onRecap: () => void
}) {
  return (
    <BoxShell accent="rgba(255,210,63,0.16)">
      <span className="pill" style={PILL}>✦ Today’s Drop</span>

      {!played ? (
        <>
          <h2 style={{ fontSize: 18, lineHeight: 1.2 }}>A new verse is live</h2>
          {/* Every question is about the verse again — the bonus that used to
              take the last slot is gone (see `generateQuestions`), and trivia
              has the box next door. `QuizRunner` derives the same promise from
              the run itself on the read screen; this is the pitch that gets
              somebody into it, and the two must agree. */}
          <p className="dim" style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.45, flex: 1 }}>
            {questionCount} quick questions about it, against the clock. Same
            verse everyone’s playing.
          </p>

          {/* The boost was a full-width row; at half width it is a toggle pill
              that says its own state. It only exists when you hold one. */}
          {boosts > 0 && (
            <button
              onClick={onBoost}
              aria-pressed={boostArmed}
              className="pill"
              style={{
                marginTop: 10,
                alignSelf: 'center',
                fontSize: 11,
                cursor: 'pointer',
                borderColor: boostArmed ? 'var(--gold)' : undefined,
                color: boostArmed ? 'var(--gold)' : undefined,
                background: boostArmed ? 'rgba(255,210,63,0.14)' : undefined,
              }}
            >
              ⚡ Boost {boostArmed ? 'ON' : `×${boosts}`}
            </button>
          )}

          <div style={{ marginTop: 12 }}>
            <Button variant="gold" full onClick={onPlay}>▶ Play{boostArmed ? ' ⚡' : ''}</Button>
          </div>
        </>
      ) : (
        <>
          <h2 style={{ fontSize: 18, lineHeight: 1.2 }}>Done for today 🎉</h2>
          <p
            className="dim"
            style={{ marginTop: 4, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {reference ?? '—'}
          </p>

          {/* Two numbers, not three. Best combo is on the recap, which is one
              tap away and has the room to explain what it means. */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 10 }}>
            <Stat label="Score" value={score?.toLocaleString() ?? '—'} />
            <Stat label="Correct" value={correct !== undefined ? `${correct}/${total}` : '—'} />
          </div>

          <p className="faint" style={{ marginTop: 10, fontSize: 11.5, flex: 1 }}>
            Next verse in <b style={{ color: 'var(--sky)' }}>{countdown}</b>
          </p>

          {/* The chest, where the thing that unlocked it is. It only appears
              while there is one to open — an "opened" state here would be a tick
              on a screen that deliberately has none. */}
          {chestReady && (
            <button
              onClick={onChest}
              className="pill"
              style={{
                marginTop: 8,
                alignSelf: 'center',
                fontSize: 11,
                cursor: 'pointer',
                borderColor: 'var(--gold)',
                color: 'var(--gold)',
                background: 'rgba(255,210,63,0.14)',
              }}
            >
              🎁 Open your chest
            </button>
          )}

          <div style={{ marginTop: 10 }}>
            <Button variant="secondary" full onClick={onRecap}>Recap →</Button>
          </div>
        </>
      )}
    </BoxShell>
  )
}

function TriviaBox({
  book,
  done,
  countdown,
  onPlay,
}: {
  book: string | null
  done: boolean
  countdown: string
  onPlay: () => void
}) {
  const label = book ?? 'the whole Bible'
  return (
    <BoxShell accent="rgba(93,211,255,0.13)">
      <span className="pill" style={PILL}>✨ Today’s Trivia</span>

      {!done ? (
        <>
          <h2
            style={{ fontSize: 18, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis' }}
            title={label}
          >
            Five on {label}
          </h2>
          <p className="dim" style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.45, flex: 1 }}>
            About the book itself — its people, its places, what happens in it.
            Every answer teaches you something.
          </p>
          <div style={{ marginTop: 12 }}>
            <Button variant="primary" full onClick={onPlay}>▶ Play</Button>
          </div>
        </>
      ) : (
        <>
          <h2 style={{ fontSize: 18, lineHeight: 1.2 }}>Done for today ✨</h2>
          <p
            className="dim"
            style={{ marginTop: 4, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={label}
          >
            {label}
          </p>
          {/* No score is kept and none is shown. The round pays a relic roll and
              a step on the road and nothing rankable — so there is nothing here
              to beat, including your own past self. */}
          <p className="faint" style={{ marginTop: 10, fontSize: 11.5, flex: 1 }}>
            New book in <b style={{ color: 'var(--sky)' }}>{countdown}</b>
          </p>
          <div style={{ marginTop: 10 }}>
            <Button variant="secondary" full onClick={onPlay}>Play again</Button>
          </div>
        </>
      )}
    </BoxShell>
  )
}

function PillButton({
  icon,
  label,
  gold,
  onClick,
}: {
  icon: string
  label: string
  gold?: boolean
  onClick: () => void
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="pill"
      style={{
        flex: '1 1 auto',
        cursor: 'pointer',
        fontSize: 13,
        padding: '10px 14px',
        borderColor: gold ? 'var(--gold)' : undefined,
        color: gold ? 'var(--gold)' : undefined,
        background: gold ? 'rgba(255,210,63,0.10)' : undefined,
      }}
    >
      {icon} {label}
    </motion.button>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 0 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>{value}</div>
      <div className="faint" style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  )
}
