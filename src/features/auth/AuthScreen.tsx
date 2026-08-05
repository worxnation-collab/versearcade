import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { useAuth } from '@/store/auth'
import { isSupabaseConfigured } from '@/lib/config'

// Email/password + Sign in with Google + Sign in with Apple. All wired through
// Supabase Auth. In LOCAL mode (no backend env yet) we explain and offer guest
// play so the app is never a dead end.
export default function AuthScreen() {
  const navigate = useNavigate()
  const { signInEmail, signUpEmail, signInOAuth, startAsGuest, error } = useAuth()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [localErr, setLocalErr] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setLocalErr(null)
    try {
      if (mode === 'up') await signUpEmail(email.trim(), password, username.trim().toLowerCase())
      else await signInEmail(email.trim(), password)
      navigate('/play', { replace: true })
    } catch (e: any) {
      setLocalErr(e.message ?? 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const oauth = async (p: 'google' | 'apple') => {
    try {
      await signInOAuth(p)
    } catch (e: any) {
      setLocalErr(e.message)
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
            <div style={{ display: 'grid', gap: 10 }}>
              <Button variant="secondary" full onClick={() => oauth('apple')}>
                <AppleIcon /> Sign in with Apple
              </Button>
              <Button variant="secondary" full onClick={() => oauth('google')}>
                <GoogleIcon /> Sign in with Google
              </Button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: 0.5 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--stroke)' }} />
              <span style={{ fontSize: 12 }}>or email</span>
              <div style={{ flex: 1, height: 1, background: 'var(--stroke)' }} />
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              {mode === 'up' && (
                <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" autoCapitalize="none" />
              )}
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" type="email" autoCapitalize="none" />
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" type="password" />
            </div>

            {(localErr || error) && (
              <p style={{ color: 'var(--coral)', fontSize: 14, textAlign: 'center' }}>{localErr || error}</p>
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

// Brand marks. Apple's is a single white glyph (button sits on a dark surface);
// Google's is the official four-color "G".
function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff" aria-hidden>
      <path d="M16.365 1.43c0 1.14-.42 2.2-1.12 3.02-.83.98-2.18 1.74-3.28 1.65-.14-1.09.4-2.24 1.06-2.98.75-.85 2.06-1.5 3.34-1.69zM20.5 17.2c-.6 1.38-.88 1.99-1.65 3.2-1.07 1.68-2.58 3.77-4.45 3.79-1.66.02-2.08-1.08-4.33-1.07-2.25.01-2.72 1.09-4.38 1.07-1.87-.02-3.3-1.9-4.37-3.58C-1.2 16.83-.9 10.5 2.35 8.6c1.16-.68 2.4-1.05 3.63-1.05 1.31 0 2.13.72 3.64.72 1.46 0 2.35-.72 3.86-.72 1.1 0 2.28.3 3.32 1.04-2.92 1.6-2.44 5.77.7 6.61z" />
    </svg>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.6 2.4-7.2 2.4-5.2 0-9.6-3.3-11.2-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.4l6.2 5.2C39.9 36 44 30.6 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  )
}
