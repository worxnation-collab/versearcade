import { useEffect } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useAuth } from './store/auth'
import { useBuddies } from './store/buddies'
import { useGifts } from './store/gifts'
import { useReminders } from './store/reminders'
import { useSeason } from './store/season'
import { useCatalog } from './store/catalog'
import { useJuiceSync } from './juice/useJuice'
import { initNative } from './lib/native'

import Landing from './pages/Landing'
import Onboarding from './features/onboarding/Onboarding'
import AuthScreen from './features/auth/AuthScreen'
import HomeScreen from './features/home/HomeScreen'
import QuizScreen from './features/daily/QuizScreen'
import ResultScreen from './features/daily/ResultScreen'
import PracticeQuizScreen from './features/practice/PracticeQuizScreen'
import PracticeResultScreen from './features/practice/PracticeResultScreen'
import ReviewScreen from './features/review/ReviewScreen'
import BuddiesScreen from './features/buddies/BuddiesScreen'
import MailScreen from './features/mail/MailScreen'
import JournalScreen from './features/journal/JournalScreen'
import ChurchesScreen from './features/churches/ChurchesScreen'
import ChurchScreen from './features/church/ChurchScreen'
import ChurchPublicScreen from './features/church/ChurchPublicScreen'
import AdminScreen from './features/admin/AdminScreen'
import LeaderboardScreen from './features/leaderboard/LeaderboardScreen'
import CollectionScreen from './features/collection/CollectionScreen'
import ProfileScreen from './features/profile/ProfileScreen'
import BattleHub from './features/arena/BattleHub'
import BattleNew from './features/arena/BattleNew'
import BattlePlay from './features/arena/BattlePlay'
import BattleDetail from './features/arena/BattleDetail'
import BattleCpu from './features/arena/BattleCpu'
import LiveLobby, { LiveRoom } from './features/arena/LiveBattle'
import ArcadeScreen, { MannaScreen, WordCatchScreen } from './features/arcade/ArcadeScreen'
import StudyScreen from './features/study/StudyScreen'
import StudyReportsScreen from './features/study/StudyReportsScreen'
import StudyRecentScreen from './features/study/StudyRecentScreen'
import StudyBagScreen from './features/study/StudyBagScreen'
import BibleScreen from './features/bible/BibleScreen'
import BibleBookScreen from './features/bible/BibleBookScreen'
import BibleChapterScreen from './features/bible/BibleChapterScreen'
import HighlightsScreen from './features/bible/HighlightsScreen'
import StampsScreen from './features/bible/StampsScreen'
import FocusPracticeScreen from './features/practice/FocusPracticeScreen'
import { BattleResume } from './features/arena/BattleResume'
import { ChurchResume } from './features/church/ChurchResume'
import { StudyDropToast } from './features/study/StudyDropToast'
import { WaystationToast } from './features/season/WaystationToast'
import PilgrimageScreen from './features/season/PilgrimageScreen'
import { MusicDirector } from './juice/MusicDirector'
import { NowPlaying } from './components/NowPlaying'
import { BottomNav } from './components/BottomNav'
import { PlayerCardProvider } from './components/PlayerCardModal'
import { AccountWall, useAccountLocked, type WallCopy } from './components/AccountWall'

function RequireProfile({ children }: { children: JSX.Element }) {
  const { ready, profile } = useAuth()
  if (!ready) return <Splash />
  // Landing, not /welcome: someone without a profile is either brand new or
  // just signed out, and only Landing offers both doors ("Play today's verse"
  // and "I already have an account"). Onboarding assumes you're new.
  if (!profile) return <Navigate to="/" replace />
  return children
}

// What a guest can reach, and what asks for a free account first.
//
// The product rule, stated once so it isn't guessed from the route table: a
// guest gets TODAY'S VERSE and THEIR OWN PROFILE. Everything else — battles,
// the keep, Study, the Bible, the church, the road, ranks, cards, buddies —
// wants an account, because every one of those either pools with other people
// or is a record that has to survive a lost phone.
//
// The gate lives here rather than in the screens on purpose: one list, one
// place to read it, and the screens keep whatever guest behaviour they already
// had (BattleHub and ChurchScreen still carry theirs), so lifting a wall is
// deleting one wrapper. See components/AccountWall.tsx for why this doesn't
// contradict the two-mode invariant in CLAUDE.md, and why a keyless LOCAL build
// is never walled.
const WALL: Record<string, WallCopy> = {
  battle: {
    icon: '\u2694\ufe0f',
    title: 'Battles need an account',
    line: 'Challenging a friend, the ranks and your faction\u2019s keep all live on your account \u2014 so a score means the same thing on both your phones.',
  },
  study: {
    icon: '\ud83d\udcda',
    title: 'Study needs an account',
    line: 'Replays, focus drills and the verses you\u2019re keeping are a record of what you\u2019ve worked on. An account is what makes that record yours tomorrow.',
  },
  bible: {
    icon: '\ud83d\udcd6',
    title: 'Your Bible needs an account',
    line: 'Every chapter you open and verse you keep is marked on your own Bible \u2014 31,102 slots that fill in as you play. That belongs on an account, not on one device.',
  },
  church: {
    icon: '\u26ea',
    title: 'Playing for a church needs an account',
    line: 'Your points pool with everyone else who goes there, and the building grows for all of them. There\u2019s no way to do that from one phone alone.',
  },
  road: {
    icon: '\ud83c\udf3e',
    title: 'The Harvest Road needs an account',
    line: 'The season\u2019s road, its waystations and everything you earn walking it are saved to your account.',
  },
  ranks: {
    icon: '\ud83c\udfc6',
    title: 'Ranks need an account',
    line: 'A board of one person isn\u2019t a board. Create a free account to stand on it.',
  },
  cards: {
    icon: '\ud83c\udccf',
    title: 'Your collection needs an account',
    line: 'Verse cards, relics and skins are yours to keep \u2014 an account is what keeps them.',
  },
  mail: {
    icon: '\ud83d\udcec',
    title: 'Your mailbox needs an account',
    line: 'Gifts, buddy requests and the news a season brings are addressed to a person. An account is the address.',
  },
  buddies: {
    icon: '\ud83e\udd1d',
    title: 'Bible Buddies need an account',
    line: 'Adding a friend takes two accounts. Yours is free.',
  },
  review: {
    icon: '\ud83e\udde0',
    title: 'Keeping verses needs an account',
    line: 'Reviews come back on a schedule built from what you got wrong \u2014 that schedule has to outlive this browser tab.',
  },
  replay: {
    icon: '\ud83d\udd01',
    title: 'Replays need an account',
    line: 'Today\u2019s verse is yours to play. Every day before it, and beating your own best on them, comes with an account.',
  },
}

function RequireAccount({ copy, children }: { copy: WallCopy; children: JSX.Element }) {
  const locked = useAccountLocked()
  if (locked) return <AccountWall {...copy} />
  return children
}

function Splash() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
      <div className="floaty" style={{ fontSize: 64 }}>
        📖
      </div>
    </div>
  )
}

// The five tab routes share the bottom nav.
function TabShell({ children }: { children: JSX.Element }) {
  return (
    <>
      {children}
      <BottomNav />
    </>
  )
}

export default function App() {
  const init = useAuth((s) => s.init)
  const ready = useAuth((s) => s.ready)
  const mode = useAuth((s) => s.mode)
  const navigate = useNavigate()
  useJuiceSync()

  // Pull buddy requests once the account is up, app-wide rather than on the You
  // tab. The nav dot has to be able to say "someone is waiting" from the Play
  // tab — loading this only where the list is rendered is what made a pending
  // request invisible until you'd already gone looking for it.
  useEffect(() => {
    if (ready && mode === 'online') {
      void useBuddies.getState().load()
      // Gifts, for the same reason: the nav dot has to be able to say "there's
      // something for you" from the Play tab, and loading this only where the
      // mailbox renders would make a gift invisible until you'd already gone
      // looking for it.
      void useGifts.getState().load()
    }
  }, [ready, mode])

  useEffect(() => {
    // Capture a referral code from the invite link (?ref=CODE) before anything
    // else, so it survives the guest→signup flow and gets applied on account load.
    try {
      const ref = new URLSearchParams(window.location.search).get('ref')
      if (ref) localStorage.setItem('va.ref', ref.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))
    } catch {
      /* ignore */
    }
    init()
    // The content catalog, BEFORE the season store reads it. Its cache is
    // already applied at import (store/catalog.ts), so this only refreshes;
    // whichever way it goes, activeRoad() has something to answer with.
    void useCatalog.getState().load()
    // The road, app-wide rather than on the Play tab: the streak flame, the
    // Daily Chest and the confetti engine all read equipped seasonal cosmetics,
    // and none of those is behind the strip that opens the road.
    void useSeason.getState().load()
    // Local reminders (native only) — load the device's preferences and lay down
    // the schedule. No-op on the web, where Web Push handles this instead.
    void useReminders.getState().load()
    // Handle the OAuth redirect deep link (com.versearcade.app://auth/callback)
    // returning from Sign in with Google/Apple on device.
    initNative(async (url) => {
      if (url.includes('auth/callback') || url.includes('code=')) {
        await useAuth.getState().completeNativeOAuth(url)
        // Native OAuth finishes here, asynchronously, long after the user tapped
        // "Sign in with Apple/Google" — so the sign-in screen can't navigate on
        // its own. Once the session + profile are in, move into the app.
        if (useAuth.getState().profile) navigate('/play', { replace: true })
      }
    }, () => {
      // Back in the foreground: rebuild the reminder plan against the current
      // review state and roll the horizon forward.
      void useReminders.getState().reschedule()
    })
  }, [init, navigate])

  if (!ready) return <Splash />

  return (
    <PlayerCardProvider>
    {/* Keeps scrolled content from colliding with the clock. Inert and 0px
        tall wherever there is no notch — see .status-scrim in index.css. */}
    <div className="status-scrim" aria-hidden />
    <BattleResume />
    <ChurchResume />
    {/* A study run finishes and immediately navigates, so the reveal for
        anything it turned up is mounted here and follows the player. */}
    <StudyDropToast />
    {/* Reaching a waystation reveals here for the same reason: a run navigates
        the instant it finishes, so the reveal has to follow the player. */}
    <WaystationToast />
    {/* The soundtrack follows the route rather than any one screen, so it lives
        up here with the other app-wide passengers. */}
    <MusicDirector />
    <NowPlaying />
    <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/welcome" element={<Onboarding />} />
        <Route path="/auth" element={<AuthScreen />} />
        <Route path="/auth/callback" element={<AuthCallback />} />

        <Route
          path="/play"
          element={
            <RequireProfile>
              <TabShell>
                <HomeScreen />
              </TabShell>
            </RequireProfile>
          }
        />
        <Route
          path="/play/run"
          element={
            <RequireProfile>
              <QuizScreen />
            </RequireProfile>
          }
        />
        <Route
          path="/play/result"
          element={
            <RequireProfile>
              <ResultScreen />
            </RequireProfile>
          }
        />
        <Route
          path="/play/practice/:date"
          element={
            <RequireProfile>
              <RequireAccount copy={WALL.replay}>
                <PracticeQuizScreen />
              </RequireAccount>
            </RequireProfile>
          }
        />
        <Route
          path="/play/practice/:date/result"
          element={
            <RequireProfile>
              <RequireAccount copy={WALL.replay}>
                <PracticeResultScreen />
              </RequireAccount>
            </RequireProfile>
          }
        />
        <Route
          path="/review"
          element={
            <RequireProfile>
              <RequireAccount copy={WALL.review}>
                <ReviewScreen />
              </RequireAccount>
            </RequireProfile>
          }
        />
        <Route
          path="/buddies"
          element={
            <RequireProfile>
              <TabShell>
                <RequireAccount copy={WALL.buddies}>
                  <BuddiesScreen />
                </RequireAccount>
              </TabShell>
            </RequireProfile>
          }
        />
        {/* The Journal — what you have done. Open to a guest, like /you itself:
            it is derived entirely from numbers this device already has, so it
            reads correctly with no account and walls nothing off. */}
        <Route
          path="/journal"
          element={
            <RequireProfile>
              <TabShell>
                <JournalScreen />
              </TabShell>
            </RequireProfile>
          }
        />
        {/* The mailbox — everything addressed to you, in one place. Reachable
            from the 📬 pill on your own card; not a tab, because a sixth tab
            would not clear a 320px phone. */}
        <Route
          path="/mail"
          element={
            <RequireProfile>
              <TabShell>
                <RequireAccount copy={WALL.mail}>
                  <MailScreen />
                </RequireAccount>
              </TabShell>
            </RequireProfile>
          }
        />
        {/* Church tab — the church you play FOR: pick it, pour points into it,
            watch it level up and climb the board against churches near it. */}
        <Route
          path="/church"
          element={
            <RequireProfile>
              <TabShell>
                <RequireAccount copy={WALL.church}>
                  <ChurchScreen />
                </RequireAccount>
              </TabShell>
            </RequireProfile>
          }
        />
        {/* For Churches — the B2B congregation-partnership funnel that replaced
            the Groups tab. Public so it can be shared/linked without an account.
            Distinct from /church above, which is the player-facing tab. */}
        <Route
          path="/pilgrimage"
          element={
            <RequireProfile>
              <TabShell>
                <RequireAccount copy={WALL.road}>
                  <PilgrimageScreen />
                </RequireAccount>
              </TabShell>
            </RequireProfile>
          }
        />
        {/* Public: one congregation, linkable by anybody — the page a church
            puts on a slide. Handles its own gate + signup resume exactly like
            /battle/:id, so it is NOT wrapped in RequireProfile or the wall.
            Distinct from /church above (the player-facing tab) and /churches
            below (the B2B funnel). */}
        <Route path="/church/:id" element={<ChurchPublicScreen />} />
        <Route path="/churches" element={<ChurchesScreen />} />
        {/* Old Groups deep links now land on the churches page. */}
        <Route path="/groups" element={<Navigate to="/churches" replace />} />
        {/* Private operator surface — gated to the admin account + PIN inside. */}
        <Route
          path="/admin"
          element={
            <RequireProfile>
              <AdminScreen />
            </RequireProfile>
          }
        />
        <Route
          path="/battle"
          element={
            <RequireProfile>
              <TabShell>
                <RequireAccount copy={WALL.battle}>
                  <BattleHub />
                </RequireAccount>
              </TabShell>
            </RequireProfile>
          }
        />
        {/* The arcade cabinet standing in the hall, the churchyard and your own
            Upper Room. Guest-open: the game persists nothing, so an account
            would make nothing here yours tomorrow. */}
        <Route
          path="/arcade"
          element={
            <RequireProfile>
              <ArcadeScreen />
            </RequireProfile>
          }
        />
        <Route
          path="/arcade/manna"
          element={
            <RequireProfile>
              <MannaScreen />
            </RequireProfile>
          }
        />
        <Route
          path="/arcade/word-catch"
          element={
            <RequireProfile>
              <WordCatchScreen />
            </RequireProfile>
          }
        />
        {/* Study tab — practice surfaces that never touch your rank. */}
        <Route
          path="/study"
          element={
            <RequireProfile>
              <TabShell>
                <RequireAccount copy={WALL.study}>
                  <StudyScreen />
                </RequireAccount>
              </TabShell>
            </RequireProfile>
          }
        />
        {/* The player's own Bible — all 66 books, shaded by what they've kept,
            studied and read. Reading, never scoring. Reached from the profile
            (the book you open) and from Study. */}
        <Route
          path="/bible"
          element={
            <RequireProfile>
              <RequireAccount copy={WALL.bible}>
                <BibleScreen />
              </RequireAccount>
            </RequireProfile>
          }
        />
        {/* Static segment before the dynamic one, so a book can never be named
            "highlights" out from under this. */}
        <Route
          path="/bible/highlights"
          element={
            <RequireProfile>
              <RequireAccount copy={WALL.bible}>
                <HighlightsScreen />
              </RequireAccount>
            </RequireProfile>
          }
        />
        <Route
          path="/bible/stamps"
          element={
            <RequireProfile>
              <RequireAccount copy={WALL.bible}>
                <StampsScreen />
              </RequireAccount>
            </RequireProfile>
          }
        />
        <Route
          path="/bible/:book"
          element={
            <RequireProfile>
              <RequireAccount copy={WALL.bible}>
                <BibleBookScreen />
              </RequireAccount>
            </RequireProfile>
          }
        />
        <Route
          path="/bible/:book/:chapter"
          element={
            <RequireProfile>
              <RequireAccount copy={WALL.bible}>
                <BibleChapterScreen />
              </RequireAccount>
            </RequireProfile>
          }
        />
        {/* The favorites shelf became the highlights page inside the Bible;
            old links and bookmarks still land somewhere true. */}
        <Route path="/favorites" element={<Navigate to="/bible/highlights" replace />} />
        {/* The books on the Study shelf that open onto pages of their own —
            reports (accuracy by book), the last-five replays, and the bag. */}
        <Route
          path="/study/reports"
          element={
            <RequireProfile>
              <RequireAccount copy={WALL.study}>
                <StudyReportsScreen />
              </RequireAccount>
            </RequireProfile>
          }
        />
        <Route
          path="/study/recent"
          element={
            <RequireProfile>
              <RequireAccount copy={WALL.study}>
                <StudyRecentScreen />
              </RequireAccount>
            </RequireProfile>
          }
        />
        <Route
          path="/study/bag"
          element={
            <RequireProfile>
              <RequireAccount copy={WALL.study}>
                <StudyBagScreen />
              </RequireAccount>
            </RequireProfile>
          }
        />
        {/* Drill one book against a study companion, reached from Study. */}
        <Route
          path="/study/focus"
          element={
            <RequireProfile>
              <RequireAccount copy={WALL.study}>
                <FocusPracticeScreen />
              </RequireAccount>
            </RequireProfile>
          }
        />
        {/* Live 1v1: a room code, a ready-check, one clock. Both segments are
            static-first, so they out-rank /battle/:id in the router's ranking. */}
        <Route
          path="/battle/live"
          element={
            <RequireProfile>
              <RequireAccount copy={WALL.battle}>
                <LiveLobby />
              </RequireAccount>
            </RequireProfile>
          }
        />
        <Route
          path="/battle/live/:code"
          element={
            <RequireProfile>
              <RequireAccount copy={WALL.battle}>
                <LiveRoom />
              </RequireAccount>
            </RequireProfile>
          }
        />
        {/* Solo practice battle vs a simulated opponent, reached from Study. */}
        <Route
          path="/battle/cpu"
          element={
            <RequireProfile>
              <RequireAccount copy={WALL.study}>
                <BattleCpu />
              </RequireAccount>
            </RequireProfile>
          }
        />
        <Route
          path="/battle/new"
          element={
            <RequireProfile>
              <RequireAccount copy={WALL.battle}>
                <BattleNew />
              </RequireAccount>
            </RequireProfile>
          }
        />
        <Route
          path="/battle/:id/play"
          element={
            <RequireProfile>
              <RequireAccount copy={WALL.battle}>
                <BattlePlay />
              </RequireAccount>
            </RequireProfile>
          }
        />
        {/* Public: an invite opened by someone without an account handles its own
            gate + signup resume, so it is NOT wrapped in RequireProfile. */}
        <Route path="/battle/:id" element={<BattleDetail />} />
        <Route
          path="/leaderboard"
          element={
            <RequireProfile>
              <TabShell>
                <RequireAccount copy={WALL.ranks}>
                  <LeaderboardScreen />
                </RequireAccount>
              </TabShell>
            </RequireProfile>
          }
        />
        <Route
          path="/collection"
          element={
            <RequireProfile>
              <TabShell>
                <RequireAccount copy={WALL.cards}>
                  <CollectionScreen />
                </RequireAccount>
              </TabShell>
            </RequireProfile>
          }
        />
        <Route
          path="/you"
          element={
            <RequireProfile>
              <TabShell>
                <ProfileScreen />
              </TabShell>
            </RequireProfile>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </PlayerCardProvider>
  )
}

// Supabase parses the OAuth hash automatically (detectSessionInUrl); we just
// wait for the profile to load, then bounce into the app.
function AuthCallback() {
  const { profile, ready } = useAuth()
  if (ready && profile) return <Navigate to="/play" replace />
  return <Splash />
}
