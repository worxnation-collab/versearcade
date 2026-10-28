import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { XpBar } from '@/components/XpBar'
import { StreakFlame } from '@/components/StreakFlame'
import { QuickSheet } from '@/components/QuickSheet'
import { FirstDropTour, ChurchMoment, ArcadeCue, BibleCue } from './FirstWeekCues'
import { useChurch } from '@/store/church'
import { DailyChest } from '@/features/chest/DailyChest'
import { ChurchWindow } from './ChurchWindow'
import { MapCompass } from '@/features/map/MapCompass'
import { PlayedToday } from '@/features/presence/PlayedToday'
import { liturgyFor } from '@/data/liturgy'
import { useJuice } from '@/juice/useJuice'
import { todayLocalDate } from '@/lib/date'
import { takeVerseLink } from '@/lib/verseLink'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/store/auth'
import { useGame } from '@/store/game'
import { useReviews } from '@/store/reviews'
import { useSettings } from '@/store/settings'
import { useCollection } from '@/store/collection'
import { useDailyTrivia } from '@/store/dailyTrivia'
import { useChurchVerse } from '@/store/churchVerse'
import { SeriesTrail } from '@/features/church/SeriesTrail'
import { useFirstLight } from '@/store/firstLight'
import { useWeekly } from '@/store/weekly'
import { useReminders } from '@/store/reminders'
import { useBible } from '@/store/bible'
import { useKeep } from '@/store/keep'
import { WeekRecapBody } from './WeekRecap'
import { Tutorial } from './Tutorial'
import { InstallPrompt } from './InstallPrompt'
import { AppStoreNudge } from './AppStoreNudge'
import { FirstLight } from '@/features/daily/FirstLight'
import { dailyTriviaBook } from '@/data/bible/questions'
import { msUntilNextLocalMidnight, formatCountdown } from '@/lib/date'
import { prefetchScripture, refreshAvailableBibles } from '@/lib/bible'
import { PaintedIcon } from '@/components/PaintedIcon'

// The Play tab: the drop, the second daily things, your church, the compass.
//
// ── WHY IT IS FOUR THINGS ────────────────────────────────────────────────────
//
// This screen accreted. Every card on it was individually right — the chest is
// the verse's reward, first light is a fact about today's verse, the ranks
// belong somewhere — and the sum was a column you had to scroll to find the one
// thing the app is for. So the shape is now:
//
//   1. **The drop is the hero, and nothing but the identity bar and the
//      streak-safety line sits above it.** Full width, gold, the one big Play
//      button on the screen.
//   2. **The second daily things are ROWS under it, not boxes beside it**
//      (2026-10-26): today's trivia, and — for a member of a verified church
//      that scheduled one — the church's verse. Both are still "new today, gone
//      tomorrow", so they stay above the fold and one tap away (`DailyRow`, the
//      whole row is the button); neither gets a card the size of the drop's,
//      because two equal boxes said the verse was one of two things here. Each
//      keeps its own cooler accent (sky, bronze) and an outlined chip rather
//      than a gold button — the gold is rationed to the drop. They used to sit
//      side by side, then stacked as equal cards; this is the third shape.
//   3. **Your church** (`ChurchWindow`): a member's church card, or for
//      everybody else an INVITATION ("Play for a congregation") — short on
//      purpose, so it doesn't push the compass down.
//   4. **The compass**, at full size, glowing gold when something is open. It is
//      the same door as the puck beside the nav, and it is where the ARCADE is
//      offered — see `MapCompass`, and read `features/map/invitations.ts` before
//      touching what makes it glow. Anything that grows the cards above it
//      buries the arcade; that is the budget every card here spends from.
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
  // Today's numbers, or null for a day recorded before they were kept. Selected
  // off the map rather than through `scoreOn` so the box re-renders the moment
  // the round is marked.
  const triviaScore = useDailyTrivia((s) => {
    const v = s.done[todayDate]
    return v && v !== true ? v : null
  })
  const loadFirstLight = useFirstLight((s) => s.load)
  const firstLightAvailable = useFirstLight((s) => s.available)
  const tutorialSeen = useSettings((s) => s.tutorialSeen)
  const setSettings = useSettings((s) => s.set)
  const [countdown, setCountdown] = useState(msUntilNextLocalMidnight())
  const [tutorialOpen, setTutorialOpen] = useState(false)
  // ?chest=1 opens the chest straight away — the compass's "your chest is
  // waiting" row and any quest naming `open_chest` point here, because the
  // chest is a SHEET on this tab rather than a route and landing on the tab
  // leaves somebody hunting for the thing they just tapped. Frozen at mount and
  // the param dropped on the way past, the house pattern: a reload must not
  // re-open it over whatever they moved on to.
  const [searchParams, setSearchParams] = useSearchParams()
  const [wantsChest] = useState(() => searchParams.get('chest') === '1')
  const [sheet, setSheet] = useState<null | 'chest' | 'lantern' | 'account' | 'week' | 'tour' | 'church'>(
    wantsChest ? 'chest' : null,
  )

  // A social post's link names the day it was about (?d=, lib/verseLink.ts):
  // taken once, here, because this is the first screen with a profile to
  // play it with. Today's opens the run; a past day opens its replay.
  useEffect(() => {
    const to = takeVerseLink(todayLocalDate())
    if (to) navigate(to)
  }, [navigate])

  useEffect(() => {
    if (!wantsChest) return
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('chest')
        return next
      },
      { replace: true },
    )
  }, [wantsChest, setSearchParams])
  // The day's verse in the player's translation, warmed onto the device while
  // there is a network, so the recap and the reader have it offline later. One
  // chapter request covers the verse and its context. The list of Bibles this
  // key serves rides along at most once a week.
  const readingTranslation = useSettings((s) => s.readingTranslation)
  useEffect(() => {
    void refreshAvailableBibles()
    if (!today || readingTranslation === 'bsb') return
    prefetchScripture({ book: today.book, chapter: today.chapter, start: today.verseStart, end: today.verseEnd }, readingTranslation)
  }, [today?.reference, readingTranslation])

  const recap = useWeekly((s) => s.recap)
  const recapSeen = useWeekly((s) => s.seen)
  const snapshotWeek = useWeekly((s) => s.snapshot)
  const bibleLoaded = useBible((s) => s.loaded)
  const collectionLoaded = useCollection((s) => s.loaded)
  const keepLoaded = useKeep((s) => s.loaded)

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

  // "Your week": record today's numbers once the three stores it reads are in,
  // and re-record as they move (a play, a chapter, a chest) so the last snapshot
  // of a day is never a stale one. Cheap — one localStorage write.
  useEffect(() => {
    if (!bibleLoaded || !collectionLoaded || !keepLoaded) {
      if (!useBible.getState().loaded) void useBible.getState().load()
      if (!useKeep.getState().loaded) void useKeep.getState().load()
      return
    }
    snapshotWeek()
  }, [snapshotWeek, bibleLoaded, collectionLoaded, keepLoaded, profile.xp, profile.totalPlays, playedToday])

  // The recap opens ITSELF once, the first time it is ready on a device — a
  // pill nobody knows to tap is a recap nobody reads. After that it waits in
  // the pill row for the rest of the week.
  useEffect(() => {
    // ...unless something was asked for by name. Arriving on ?chest=1 and being
    // shown last week's numbers instead is the row not working.
    if (recap && !recapSeen && !tutorialOpen && !wantsChest) setSheet('week')
  }, [recap, recapSeen, tutorialOpen, wantsChest])

  // The first week's two one-time sheets (FirstWeekCues.tsx). Each waits for
  // the tab to be otherwise quiet — no tutorial, no chest asked for by name, no
  // other sheet up, last week's recap not still waiting to open itself — so
  // they never stack. The tour is for the moment somebody lands back here
  // having just finished their FIRST daily verse; the church moment is day 2-3,
  // online only (a church needs an account), offered to somebody with no church
  // and, after they've been sent to find one, once more to give into it.
  const firstDropTourSeen = useSettings((s) => s.firstDropTourSeen)
  const churchMoment = useSettings((s) => s.churchMoment)
  const churchLoaded = useChurch((s) => s.loaded)
  const myChurch = useChurch((s) => s.church)
  const myGiven = useChurch((s) => s.myGiven)
  const churchAvailable = useChurch((s) => s.available)
  const quiet = sheet === null && !tutorialOpen && !wantsChest && !(recap && !recapSeen)
  const churchPhase: 'find' | 'give' | null =
    mode !== 'online' || !churchLoaded || churchMoment === 'done' || profile.totalPlays < 2 || profile.totalPlays > 30
      ? null
      : churchMoment === 'new' && !myChurch
        ? 'find'
        : churchMoment === 'found' && myChurch && myGiven === 0 && churchAvailable > 0
          ? 'give'
          : null
  // Frozen when the sheet opens: giving changes `myGiven`, which would
  // otherwise unmount the sheet at the exact moment the building grows.
  const [churchSheetPhase, setChurchSheetPhase] = useState<'find' | 'give'>('find')
  useEffect(() => {
    if (!quiet) return
    if (!firstDropTourSeen && playedToday && profile.totalPlays <= 1) setSheet('tour')
    else if (churchPhase) {
      setChurchSheetPhase(churchPhase)
      setSheet('church')
    }
  }, [quiet, firstDropTourSeen, playedToday, profile.totalPlays, churchPhase])
  // Sent to find a church and came back without one (or already giving): the
  // moment has had its one go.
  useEffect(() => {
    if (churchMoment !== 'found' || !churchLoaded || sheet === 'church') return
    if (!myChurch || myGiven > 0 || churchAvailable <= 0) setSettings({ churchMoment: 'done' })
  }, [churchMoment, churchLoaded, myChurch, myGiven, churchAvailable, sheet, setSettings])
  // A player past their first verse never needs the tour.
  useEffect(() => {
    if (!firstDropTourSeen && profile.totalPlays > 1) setSettings({ firstDropTourSeen: true })
  }, [firstDropTourSeen, profile.totalPlays, setSettings])

  // The device's reminders read `playedToday` (a played day's nudge is
  // dropped), so a finished run has to re-plan them. No-op off native.
  useEffect(() => {
    if (playedToday && useReminders.getState().supported) void useReminders.getState().reschedule()
  }, [playedToday])

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

      {/* The streak's safety net, made visible — and only while it matters.
          Once today's verse is played the streak is safe whatever happens, so
          the line goes; before that it says what the freezes are FOR. A streak
          with no freeze behind it gets the plain fact and nothing louder: the
          verse box below is the answer, and a warning is not this app's voice. */}
      {!playedToday && profile.currentStreak > 0 && (
        <p className="faint" style={{ fontSize: 12, marginBottom: 10 }}>
          {profile.streakFreezes > 0
            ? <><PaintedIcon id="freeze" /> {`Your ${profile.currentStreak}-day streak is safe tonight even if you miss — ${profile.streakFreezes} freeze${profile.streakFreezes > 1 ? 's' : ''} held.`}</>
            : <><PaintedIcon id="streak" /> {`${profile.currentStreak} day${profile.currentStreak > 1 ? 's' : ''} running — today’s verse keeps it going.`}</>}
        </p>
      )}

      {/* ── Today ─────────────────────────────────────────────────────────
          The drop as the one full card, then the second daily things as slim
          rows under it. `minmax(0, 1fr)`: a grid item's min-width is `auto`,
          and a book name like "1 Thessalonians" must not blow a row out. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
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
          correct={triviaScore?.c}
          total={triviaScore?.t}
          countdown={formatCountdown(countdown)}
          onPlay={() => navigate('/play/trivia')}
        />
        {/* Your church's own verse, a THIRD lane — never in place of the drop
            above (0128), and a row like the trivia so it never pushes the drop
            down. Renders nothing for anybody without a verified church that
            scheduled one today, so the tab is unchanged for them. */}
        <ChurchVerseBox onPlay={() => navigate('/play/church')} />
      </div>

      {/* How many people are in this with you today, directly under the daily
          things because it is a fact about the thing those boxes just offered.
          A number and a door — never a score beside anybody's name. See
          `PlayedToday` and `0093_daily_players.sql`. */}
      <PlayedToday />

      {/* ── What today IS in the church year ──────────────────────────────
          One line, only on a day that is actually one of the kept days, and
          nothing at all on the other ~355. That is this tab's own test applied
          honestly: "is it NEW TODAY?" — Good Friday is, an ordinary Tuesday in
          Ordinary Time is not, and a permanent row naming the season would be
          the kind of card this tab was cut back to remove.

          It is a FACT and not an invitation, which is why it is a line here
          rather than a row in the compass: the compass lists what is open to
          do, and nobody can do Easter. It asks nothing and pays nothing. */}
      <FeastLine />

      {/* Your church, under the two things that are new today — where the
          Harvest Road strip used to lead. For a member it is the church's word
          today (its verse, note, notice, giving link); for everybody else the
          "Play for a congregation" invitation. See ChurchWindow. */}
      <div style={{ marginTop: 14 }}>
        <ChurchWindow />
      </div>

      {/* And the way to everywhere else. */}
      <MapCompass />

      {/* Two quiet first-week rows under the compass — never above the daily
          things. Each renders once its moment is real and retires for good the
          first time its place is opened. */}
      <ArcadeCue playedToday={playedToday} totalPlays={profile.totalPlays} />
      <BibleCue totalPlays={profile.totalPlays} />

      {/* ── The buttons ────────────────────────────────────────────────────
          What is left of this screen's old cards, each one tap from its own
          content. Only what is genuinely there renders: no placeholder row, no
          disabled state, so an empty row is simply no row. */}
      {(firstLightAvailable || guest || recap) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {recap && (
            <PillButton icon={<PaintedIcon id="week" />} label="Your week" gold={!recapSeen} onClick={() => setSheet('week')} />
          )}
          {firstLightAvailable && (
            <PillButton icon={<PaintedIcon id="firstlight" />} label="First light" onClick={() => setSheet('lantern')} />
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
      {/* Last week, in your own numbers. Opens itself once when it is ready and
          lives in the pill row until the next Sunday. See store/weekly.ts. */}
      {sheet === 'week' && recap && (
        <QuickSheet
          title={<><PaintedIcon id="week" /> Your week</>}
          onClose={() => { useWeekly.getState().markSeen(); setSheet(null) }}
        >
          <WeekRecapBody recap={recap} onClose={() => { useWeekly.getState().markSeen(); setSheet(null) }} />
        </QuickSheet>
      )}

      {sheet === 'tour' && (
        <QuickSheet
          title="Where to next"
          onClose={() => { setSettings({ firstDropTourSeen: true }); setSheet(null) }}
        >
          <FirstDropTour onDone={() => { setSettings({ firstDropTourSeen: true }); setSheet(null) }} />
        </QuickSheet>
      )}

      {sheet === 'church' && (
        <QuickSheet
          title="⛪ Your church"
          onClose={() => { setSettings({ churchMoment: 'done' }); setSheet(null) }}
        >
          <ChurchMoment
            phase={churchSheetPhase}
            onFind={() => { setSettings({ churchMoment: 'found' }); setSheet(null); navigate('/church') }}
            onDone={() => { setSettings({ churchMoment: 'done' }); setSheet(null) }}
          />
        </QuickSheet>
      )}

      {sheet === 'lantern' && (
        <QuickSheet title={<><PaintedIcon id="firstlight" /> First light</>} onClose={() => setSheet(null)}>
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

// ── The drop box, and the rows under it ─────────────────────────────────────
//
// The drop is the only BOX: one heading, one fact, one gold button. The trivia
// round and the church verse are `DailyRow`s further down — see its comment.

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
  /** The wash behind the box. Only the drop wears one now — gold. */
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
        padding: '18px 14px',
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
          <h2 style={{ fontSize: 21, lineHeight: 1.2 }}>A new verse is live</h2>
          {/* Every question is about the verse again — the bonus that used to
              take the last slot is gone (see `generateQuestions`), and trivia
              has its own row under this box. `QuizRunner` derives the same promise from
              the run itself on the read screen; this is the pitch that gets
              somebody into it, and the two must agree. */}
          <p className="dim" style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.45, flex: 1 }}>
            {questionCount} quick questions about it, against the clock.{' '}
            Same verse everyone’s playing.
          </p>

          {/* The boost is a toggle pill that says its own state. It only exists
              when you hold one. */}
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
          <h2 style={{ fontSize: 20, lineHeight: 1.2 }}>Done for today 🎉</h2>
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

function ChurchVerseBox({ onPlay }: { onPlay: () => void }) {
  const today = useChurchVerse((s) => s.today)
  const series = useChurchVerse((s) => s.series)
  const load = useChurchVerse((s) => s.load)
  const mode = useAuth((s) => s.mode)

  useEffect(() => {
    if (mode === 'online') void load()
  }, [mode, load])

  if (!today) return null
  const p = today.progress
  // The series line reads the 0130 arc when there is one ("Day 3 of 5 · …"),
  // and 0128's counts on a server without it.
  const arc = series && series.churchId === today.churchId && series.name === today.series ? series : null
  const seriesLine = arc
    ? <SeriesTrail series={arc} compact />
    : today.series ? `${p ? `Day ${p.soFar} of ${p.total} · ` : ''}${today.series}` : null
  return (
    <DailyRow
      accent="rgba(154,124,69,0.30)"
      icon="⛪"
      eyebrow={`From ${today.churchName}`}
      title={today.reference}
      // The pastor's note used to be a paragraph here; as a row it is one
      // clamped line, and the whole note is on the read screen of the run.
      line={!today.played ? (seriesLine ?? today.note ?? 'Five questions from your pastor') : seriesLine}
      done={!!today.played}
      result={today.played ? `${today.played.correct}/${today.played.total}` : undefined}
      action={today.played ? 'Again' : 'Play'}
      label={today.played ? `See ${today.churchName}’s verse again` : `Play ${today.churchName}’s verse, ${today.reference}`}
      onClick={onPlay}
    />
  )
}

function TriviaBox({
  book,
  done,
  correct,
  total,
  countdown,
  onPlay,
}: {
  book: string | null
  done: boolean
  correct?: number
  total?: number
  countdown: string
  onPlay: () => void
}) {
  const label = book ?? 'the whole Bible'
  // Today's numbers only, the same as before it was a row: no best, no
  // history, nothing to be behind on. A day recorded before the numbers were
  // kept simply has none, and the row says "done" without them.
  return (
    <DailyRow
      accent="rgba(93,211,255,0.16)"
      icon="✨"
      eyebrow="Today’s trivia"
      title={done ? label : `Five on ${label}`}
      line={done ? `New book in ${countdown}` : 'The book itself — its people, places, what happens'}
      done={done}
      result={done && correct !== undefined ? `${correct}/${total}` : undefined}
      action={done ? 'Again' : 'Play'}
      label={done ? `Play today’s trivia on ${label} again` : `Play today’s trivia: five on ${label}`}
      onClick={onPlay}
    />
  )
}

/**
 * A second daily thing, as ONE ROW under the drop: the trivia round and (for
 * a member of a verified church that scheduled one) the church's verse.
 *
 * The whole row is the button — eyebrow, title, one clamped line, and a chip
 * on the right that says what a tap does. The chip is outlined in the row's
 * own accent, never filled gold: the gold is the drop's alone, and a second
 * gold Play button an inch under the first is two primaries. Done shows the
 * day's own `n/5` in the chip's place, tinted, with no tick-mark ceremony — a
 * finished day is quiet, not a list of boxes ticked.
 */
function DailyRow({
  accent,
  icon,
  eyebrow,
  title,
  line,
  done,
  result,
  action,
  label,
  onClick,
}: {
  /** The wash on the row's left edge. Sky for trivia, bronze for the church. */
  accent: string
  icon: React.ReactNode
  eyebrow: string
  title: string
  line?: React.ReactNode
  done: boolean
  /** Today's "n/5", once played. */
  result?: string
  action: string
  label: string
  onClick: () => void
}) {
  const juice = useJuice()
  return (
    <motion.button
      className="card"
      onClick={() => { juice.select?.(); onClick() }}
      aria-label={label}
      whileTap={{ scale: 0.98 }}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        width: '100%',
        minWidth: 0,
        padding: '10px 12px',
        textAlign: 'left',
        cursor: 'pointer',
        color: 'inherit',
        font: 'inherit',
        position: 'relative',
        overflow: 'hidden',
        background: `linear-gradient(90deg, ${accent}, transparent 55%), var(--card)`,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 38, height: 38, flexShrink: 0, borderRadius: 12,
          display: 'grid', placeItems: 'center', fontSize: 19,
          background: 'var(--card-raised)', opacity: done ? 0.75 : 1,
        }}
      >
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 1 }}>
        <span className="faint" style={ROW_EYEBROW}>{eyebrow}</span>
        <span style={{ ...ROW_CLAMP, fontWeight: 800, fontSize: 15, color: done ? 'var(--ink-dim)' : 'var(--ink)' }}>{title}</span>
        {line && <span className="faint" style={{ ...ROW_CLAMP, fontSize: 12 }}>{line}</span>}
      </span>
      <span style={{ display: 'grid', justifyItems: 'end', gap: 2, flexShrink: 0 }}>
        {result && (
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--ink)' }}>{result}</span>
        )}
        <span
          style={{
            fontSize: 12.5, fontWeight: 800, padding: '6px 11px', borderRadius: 999,
            border: '1.5px solid var(--edge)', color: done ? 'var(--ink-dim)' : 'var(--ink)',
            whiteSpace: 'nowrap',
          }}
        >
          {done ? action : `▶ ${action}`}
        </span>
      </span>
    </motion.button>
  )
}

const ROW_EYEBROW: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}
const ROW_CLAMP: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }

function PillButton({
  icon,
  label,
  gold,
  onClick,
}: {
  icon: React.ReactNode
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

/**
 * Today's kept day, when there is one.
 *
 * Renders nothing on an ordinary day — no season badge, no "Ordinary Time"
 * row — for the same reason `PlayedToday` renders nothing at zero: a line that
 * is always there stops being news and becomes furniture.
 */
function FeastLine() {
  const navigate = useNavigate()
  const juice = useJuice()
  const today = todayLocalDate()
  const day = useMemo(() => liturgyFor(today), [today])
  if (!day.feast) return null
  return (
    <motion.button
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={() => { juice.select?.(); navigate('/calendar') }}
      style={{
        display: 'flex', alignItems: 'center', gap: 9, margin: '10px auto 0',
        background: 'none', border: 0, padding: '2px 4px', cursor: 'pointer',
        color: 'var(--ink-dim)', fontSize: 13,
      }}
    >
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: day.season.hex, flexShrink: 0 }} />
      <span>
        Today is <b style={{ color: 'var(--ink)' }}>{day.feast.name}</b>
      </span>
      <span style={{ color: 'var(--edge)' }}>›</span>
    </motion.button>
  )
}

