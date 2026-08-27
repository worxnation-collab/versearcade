import { useEffect } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useAuth } from './store/auth'
import { useBuddies } from './store/buddies'
import { useReminders } from './store/reminders'
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
import ChurchesScreen from './features/churches/ChurchesScreen'
import ChurchScreen from './features/church/ChurchScreen'
import AdminScreen from './features/admin/AdminScreen'
import LeaderboardScreen from './features/leaderboard/LeaderboardScreen'
import CollectionScreen from './features/collection/CollectionScreen'
import ProfileScreen from './features/profile/ProfileScreen'
import BattleHub from './features/arena/BattleHub'
import BattleNew from './features/arena/BattleNew'
import BattlePlay from './features/arena/BattlePlay'
import BattleDetail from './features/arena/BattleDetail'
import BattleCpu from './features/arena/BattleCpu'
import StudyScreen from './features/study/StudyScreen'
import BibleScreen from './features/bible/BibleScreen'
import BibleBookScreen from './features/bible/BibleBookScreen'
import BibleChapterScreen from './features/bible/BibleChapterScreen'
import HighlightsScreen from './features/bible/HighlightsScreen'
import StampsScreen from './features/bible/StampsScreen'
import FocusPracticeScreen from './features/practice/FocusPracticeScreen'
import { BattleResume } from './features/arena/BattleResume'
import { StudyDropToast } from './features/study/StudyDropToast'
import { MusicDirector } from './juice/MusicDirector'
import { NowPlaying } from './components/NowPlaying'
import { BottomNav } from './components/BottomNav'
import { PlayerCardProvider } from './components/PlayerCardModal'

function RequireProfile({ children }: { children: JSX.Element }) {
  const { ready, profile } = useAuth()
  if (!ready) return <Splash />
  if (!profile) return <Navigate to="/welcome" replace />
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
    if (ready && mode === 'online') void useBuddies.getState().load()
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
    <BattleResume />
    {/* A study run finishes and immediately navigates, so the reveal for
        anything it turned up is mounted here and follows the player. */}
    <StudyDropToast />
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
              <PracticeQuizScreen />
            </RequireProfile>
          }
        />
        <Route
          path="/play/practice/:date/result"
          element={
            <RequireProfile>
              <PracticeResultScreen />
            </RequireProfile>
          }
        />
        <Route
          path="/review"
          element={
            <RequireProfile>
              <ReviewScreen />
            </RequireProfile>
          }
        />
        <Route
          path="/buddies"
          element={
            <RequireProfile>
              <TabShell>
                <BuddiesScreen />
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
                <ChurchScreen />
              </TabShell>
            </RequireProfile>
          }
        />
        {/* For Churches — the B2B congregation-partnership funnel that replaced
            the Groups tab. Public so it can be shared/linked without an account.
            Distinct from /church above, which is the player-facing tab. */}
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
                <BattleHub />
              </TabShell>
            </RequireProfile>
          }
        />
        {/* Study tab — practice surfaces that never touch your rank. */}
        <Route
          path="/study"
          element={
            <RequireProfile>
              <TabShell>
                <StudyScreen />
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
              <BibleScreen />
            </RequireProfile>
          }
        />
        {/* Static segment before the dynamic one, so a book can never be named
            "highlights" out from under this. */}
        <Route
          path="/bible/highlights"
          element={
            <RequireProfile>
              <HighlightsScreen />
            </RequireProfile>
          }
        />
        <Route
          path="/bible/stamps"
          element={
            <RequireProfile>
              <StampsScreen />
            </RequireProfile>
          }
        />
        <Route
          path="/bible/:book"
          element={
            <RequireProfile>
              <BibleBookScreen />
            </RequireProfile>
          }
        />
        <Route
          path="/bible/:book/:chapter"
          element={
            <RequireProfile>
              <BibleChapterScreen />
            </RequireProfile>
          }
        />
        {/* The favorites shelf became the highlights page inside the Bible;
            old links and bookmarks still land somewhere true. */}
        <Route path="/favorites" element={<Navigate to="/bible/highlights" replace />} />
        {/* Drill one book against a study companion, reached from Study. */}
        <Route
          path="/study/focus"
          element={
            <RequireProfile>
              <FocusPracticeScreen />
            </RequireProfile>
          }
        />
        {/* Solo practice battle vs a simulated opponent, reached from Study. */}
        <Route
          path="/battle/cpu"
          element={
            <RequireProfile>
              <BattleCpu />
            </RequireProfile>
          }
        />
        <Route
          path="/battle/new"
          element={
            <RequireProfile>
              <BattleNew />
            </RequireProfile>
          }
        />
        <Route
          path="/battle/:id/play"
          element={
            <RequireProfile>
              <BattlePlay />
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
                <LeaderboardScreen />
              </TabShell>
            </RequireProfile>
          }
        />
        <Route
          path="/collection"
          element={
            <RequireProfile>
              <TabShell>
                <CollectionScreen />
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
