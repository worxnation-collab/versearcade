import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { CharacterPicker } from '@/components/CharacterPicker'
import { DEFAULT_AVATAR } from '@/data/avatar'
import { useAuth } from '@/store/auth'
import { isSupabaseConfigured } from '@/lib/config'
import { OAuthButtons } from './oauthUi'
import type { AvatarSpec } from '@/types'

// Email/password + Sign in with Google + Sign in with Apple. All wired through
// Supabase Auth. In LOCAL mode (no backend env yet) we explain and offer guest
// play so the app is never a dead end.
export default function AuthScreen() {
  const navigate = useNavigate()
  const { signIn, signUpEmail, startAsGuest, error } = useAuth()
  const setPendingCharacter = useAuth((s) => s.setPendingCharacter)
  const profile = useAuth((s) => s.profile)
  const authMode = useAuth((s) => s.mode)

  // Native OAuth (Apple/Google) completes asynchronously via a deep link, so the
  // oauth() handler below can't navigate itself. When a real online session lands,
  // leave the sign-in screen for the app. Gate on mode === 'online': a guest
  // already has a (local) profile, and redirecting on that would make this screen
  // unreachable for guests trying to upgrade to a real account.
  useEffect(() => {
    if (authMode === 'online' && profile) navigate('/play', { replace: true })
  }, [authMode, profile, navigate])
  // ?mode=signup opens on the sign-up form. Landing and every account wall link
  // here that way: the ask is "create an account", so landing on "Welcome back"
  // with a password field is one tap of friction in exactly the wrong place.
  const [params] = useSearchParams()
  const [mode, setMode] = useState<'in' | 'up'>(params.get('mode') === 'signup' ? 'up' : 'in')
  // Sign-up runs in two beats: make a character, then make the account. The
  // character comes FIRST on purpose — it's the part of signing up that's fun,
  // and it's the answer to "what do I actually get". It parks in localStorage
  // (setPendingCharacter) rather than travelling with the credentials, because
  // an OAuth sign-up reloads the whole page between these two beats.
  const [phase, setPhase] = useState<'look' | 'account'>('look')
  const [spec, setSpec] = useState<AvatarSpec>(DEFAULT_AVATAR)
  const signingUpLook = mode === 'up' && phase === 'look'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [localErr, setLocalErr] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [refCode, setRefCode] = useState(() => {
    try { return localStorage.getItem('va.ref') ?? '' } catch { return '' }
  })
  const goToMode = (m: 'in' | 'up') => {
    setMode(m)
    setPhase('look')
    setLocalErr(null)
  }
  const onRefChange = (v: string) => {
    const clean = v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
    setRefCode(clean)
    try { clean ? localStorage.setItem('va.ref', clean) : localStorage.removeItem('va.ref') } catch { /* ignore */ }
  }

  const submit = async () => {
    setBusy(true)
    setLocalErr(null)
    setNotice(null)
    try {
      if (mode === 'up') {
        setPendingCharacter(spec)
        const { needsConfirmation } = await signUpEmail(email.trim(), password, username.trim().toLowerCase())
        if (needsConfirmation) {
          setNotice(`Check ${email.trim()} to confirm your account, then sign in.`)
          // The parked character survives the confirmation round-trip and lands
          // when they come back and sign in, so it isn't cleared here.
          setMode('in')
          setPhase('look')
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
          {!signingUpLook && <div className="floaty" style={{ fontSize: 60 }}>📖</div>}
          <h1 style={{ fontSize: 32, marginTop: 8 }}>
            {mode === 'in' ? 'Welcome back' : signingUpLook ? 'Make your character' : 'Create account'}
          </h1>
          <p className="dim" style={{ marginTop: 6, lineHeight: 1.5 }}>
            {mode === 'in'
              ? 'Keep your streak safe across devices.'
              : signingUpLook
                ? 'This is you, everywhere in the arcade. Change it any time \u2014 nothing here is locked.'
                : 'Free, and it opens the whole game \u2014 battles, the keep, Study, your Bible and your church.'}
          </p>
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

        {/* ── Beat one: the character ──────────────────────────────────── */}
        {isSupabaseConfigured && signingUpLook && (
          <>
            <div className="card">
              <CharacterPicker value={spec} onChange={setSpec} layout="tiles" />
            </div>

            <Button
              variant="gold"
              full
              onClick={() => {
                // Parked before the account exists, and again at submit — an
                // OAuth sign-up leaves this page entirely between the two.
                setPendingCharacter(spec)
                setPhase('account')
              }}
            >
              That’s me →
            </Button>

            <p className="faint center" style={{ fontSize: 14 }}>
              Have an account?{' '}
              <span style={{ color: 'var(--sky)', textDecoration: 'underline' }} onClick={() => goToMode('in')}>
                Sign in
              </span>
            </p>
          </>
        )}

        {/* ── Beat two: the account ─────────────────────────────────────── */}
        {isSupabaseConfigured && !signingUpLook && (
          <>
            {mode === 'up' && (
              <button
                onClick={() => setPhase('look')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: 14,
                  background: 'var(--card-solid)',
                  border: '1px solid var(--stroke)',
                  color: 'inherit',
                  cursor: 'pointer',
                }}
              >
                <Avatar emoji="📖" character={spec} size={48} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: 'block', fontSize: 14 }}>Your character is ready</b>
                  <span className="faint" style={{ fontSize: 12 }}>It’s saved to your account the moment you create it.</span>
                </span>
                <span style={{ color: 'var(--sky)', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>Change</span>
              </button>
            )}

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
              {mode === 'up' && (
                <input value={refCode} onChange={(e) => onRefChange(e.target.value)} placeholder="referral code (optional)" autoCapitalize="characters" autoCorrect="off" maxLength={6} />
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
              <span style={{ color: 'var(--sky)', textDecoration: 'underline' }} onClick={() => goToMode(mode === 'in' ? 'up' : 'in')}>
                {mode === 'in' ? 'Create one' : 'Sign in'}
              </span>
            </p>

          </>
        )}

        {/* Never a dead end, in EITHER beat of sign-up: the character step is a
            step of this screen, so the doors back out belong to it too. */}
        {isSupabaseConfigured && (
          <GuestWayOut profile={!!profile} guest={authMode === 'local'} navigate={navigate} />
        )}
      </div>
    </Page>
  )
}

// The two ways off this screen that don't involve an account. Extracted so the
// character step and the credentials step can't drift on which of them shows.
function GuestWayOut({
  profile,
  guest,
  navigate,
}: {
  profile: boolean
  guest: boolean
  navigate: (to: string) => void
}) {
  // A guest arrived from an in-app "Create account" CTA — let them back to the
  // game they were already playing.
  if (profile && guest) {
    return (
      <p className="faint center" style={{ fontSize: 13 }}>
        <span style={{ textDecoration: 'underline' }} onClick={() => navigate('/play')}>
          ← Keep playing as guest
        </span>
      </p>
    )
  }
  // Someone who arrived straight from Landing has no profile yet and nothing
  // behind them, so this is their only door back to the guest path — today's
  // verse, without signing up for anything.
  if (!profile) {
    return (
      <p className="faint center" style={{ fontSize: 13 }}>
        <span style={{ textDecoration: 'underline' }} onClick={() => navigate('/welcome')}>
          Just try today’s verse first
        </span>
      </p>
    )
  }
  return null
}
