import { useEffect } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useAuth } from './store/auth'
import { useJuiceSync } from './juice/useJuice'
import { initNative } from './lib/native'

import Landing from './pages/Landing'
import Onboarding from './features/onboarding/Onboarding'
import AuthScreen from './features/auth/AuthScreen'
import HomeScreen from './features/home/HomeScreen'
import QuizScreen from './features/daily/QuizScreen'
import ResultScreen from './features/daily/ResultScreen'
import ReviewScreen from './features/review/ReviewScreen'
import GroupsScreen from './features/groups/GroupsScreen'
import LeaderboardScreen from './features/leaderboard/LeaderboardScreen'
import CollectionScreen from './features/collection/CollectionScreen'
import ProfileScreen from './features/profile/ProfileScreen'
import { BottomNav } from './components/BottomNav'

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

// The four tab routes share the bottom nav.
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
  const navigate = useNavigate()
  useJuiceSync()

  useEffect(() => {
    init()
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
    })
  }, [init, navigate])

  if (!ready) return <Splash />

  return (
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
          path="/review"
          element={
            <RequireProfile>
              <ReviewScreen />
            </RequireProfile>
          }
        />
        <Route
          path="/groups"
          element={
            <RequireProfile>
              <TabShell>
                <GroupsScreen />
              </TabShell>
            </RequireProfile>
          }
        />
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
  )
}

// Supabase parses the OAuth hash automatically (detectSessionInUrl); we just
// wait for the profile to load, then bounce into the app.
function AuthCallback() {
  const { profile, ready } = useAuth()
  if (ready && profile) return <Navigate to="/play" replace />
  return <Splash />
}
