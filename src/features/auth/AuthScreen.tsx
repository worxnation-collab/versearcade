import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { useAuth } from '@/store/auth'
import { isSupabaseConfigured } from '@/lib/config'
import { OAuthButtons } from './oauthUi'

// Email/password + Sign in with Google + Sign in with Apple. All wired through
// Supabase Auth. In LOCAL mode (no backend env yet) we explain and offer guest
// play so the app is never a dead end.
export default function AuthScreen() {
  const navigate = useNavigate()
  const { signIn, signUpEmail, startAsGuest, error } = useAuth()
  const profile = useAuth((s) => s.profile)

  // Native OAuth (Apple/Google) completes asynchronously via a deep link, so the
  // oauth() handler below can't navigate itself. When the session lands and a
  // profile appears, leave the sign-in screen for the app.
  useEffect(() => {
    if (profile) navigate('/play', { replace: true })
  }, [profile, navigate])
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [localErr, setLocalErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setLocalErr(null)
    setNotice(null)
    try {
      if (mode === 'up') {
        const { needsConfirmation } = await signUpEmail(email.trim(), password, username.trim().toLowerCase())
        if (needsConfirmation) {
          setNotice(`Check ${email.trim()} to confirm your account, then sign in.`)
          setMode('in')
          return
        }
      } else {
        await signIn(email.trim(), password)
      }
      navigate('/play', { replace: true })
    } catch (e: any) {
      setLocalErr(e.message ?? 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page noNav>
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
        <div className="center">
          <div className="floaty" style={{ fontSize: 60 }}>📖</div>
          <h1 style={{ fontSize: 32, marginTop: 8 }}>{mode === 'in' ? 'Welcome back' : 'Create account'}</h1>
          <p className="dim" style={{ marginTop: 6 }}>Keep your streak safe across devices.</p>
        </div>

        {!isSupabaseConfigured && (
          <div className="card" style={{ background: 'rgba(255,159,28,0.12)', borderColor: 'var(--tangerine)' }}>
            <b>Backend not connected yet.</b>
            <p className="dim" style={{ fontSize: 14, marginTop: 4 }}>
              Add your Supabase keys to <code>.env.local</code> to enable accounts
              (see <code>docs/SETUP-SUPABASE.md</code>). Until then, play as a guest —
              everything works, saved on this device.
            </p>
            <div style={{ marginTop: 10 }}>
              <Button full onClick={() => navigate('/welcome')}>
                Play as guest →
              </Button>
            </div>
          </div>
        )}

        {isSupabaseConfigured && (
          <>
            <OAuthButtons onError={setLocalErr} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: 0.5 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--stroke)' }} />
              <span style={{ fontSize: 12 }}>or email</span>
              <div style={{ flex: 1, height: 1, background: 'var(--stroke)' }} />
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              {mode === 'up' && (
                <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" autoCapitalize="none" />
              )}
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={mode === 'up' ? 'email' : 'username or email'}
                type={mode === 'up' ? 'email' : 'text'}
                autoCapitalize="none"
                autoCorrect="off"
              />
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" type="password" />
            </div>

            {(localErr || error) && (
              <p style={{ color: 'var(--coral)', fontSize: 14, textAlign: 'center' }}>{localErr || error}</p>
            )}

            {notice && (
              <p style={{ color: 'var(--sky)', fontSize: 14, textAlign: 'center' }}>{notice}</p>
            )}

            <Button variant="gold" full disabled={busy} onClick={submit}>
              {busy ? '…' : mode === 'in' ? 'Sign in' : 'Create account'}
            </Button>

            <p className="faint center" style={{ fontSize: 14 }}>
              {mode === 'in' ? 'New here?' : 'Have an account?'}{' '}
              <span style={{ color: 'var(--sky)', textDecoration: 'underline' }} onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
                {mode === 'in' ? 'Create one' : 'Sign in'}
              </span>
            </p>
          </>
        )}
      </div>
    </Page>
  )
}
