import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button } from '@/components/Button'
import { Page } from '@/components/Page'
import { AppStoreBadge } from '@/components/AppStoreBadge'
import { useAuth } from '@/store/auth'
import { appStoreAsk } from '@/lib/appStore'
import { isSupabaseConfigured } from '@/lib/config'
import { useEffect } from 'react'

// Marketing / hero landing. On web this is the front door; inside the iOS app a
// returning user with a profile is bounced straight to /play.
//
// THE HEADLINE IS THE ACCOUNT. A guest can play today's verse and keep their own
// profile; battles, the keep, Study, the Bible and the church all ask for a free
// account first (see the WALL table in App.tsx). So the front door leads with
// the thing that opens the game, and the guest path stays as a quiet third
// option rather than the gold button — someone who taps it should be choosing
// "not yet", not being handed the smaller game by default.
//
// The one exception is a keyless LOCAL build, where there is no backend to sign
// up to at all. There the guest path leads again, because the alternative is a
// front door whose main button can't work.
export default function Landing() {
  const navigate = useNavigate()
  const profile = useAuth((s) => s.profile)
  // On an iPhone the App Store is the better front door, so the badge leads and
  // "play in the browser" sits under it. Everywhere else the web game leads and
  // the badge is a footnote — nobody on Android should be handed an iOS link as
  // their primary call to action, and nobody standing *inside* the iOS app
  // should be invited to go download it.
  const ask = appStoreAsk()
  const iosFirst = ask === 'download'
  const inApp = ask === 'review'

  useEffect(() => {
    if (profile) navigate('/play', { replace: true })
  }, [profile, navigate])

  return (
    <Page noNav>
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: iosFirst ? 16 : 22,
            paddingTop: iosFirst ? 10 : 30,
          }}
        >
          <motion.div
            className="floaty"
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 12 }}
            style={{ fontSize: iosFirst ? 68 : 92, textAlign: 'center' }}
          >
            📖
          </motion.div>

          <div style={{ textAlign: 'center' }}>
            {/* The news flag — skipped on iOS, where the badge below says it
                louder and the screen needs the room. */}
            {!iosFirst && !inApp && (
              <motion.span
                className="pill"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                style={{ marginBottom: 12, color: 'var(--gold)' }}
              >
                ✦ Now on the App Store
              </motion.span>
            )}
            <h1 style={{ fontSize: 46, lineHeight: 1.02 }}>
              <span className="gradient-text">Verse</span> Arcade
            </h1>
            <p className="dim" style={{ fontSize: 18, marginTop: 12, maxWidth: 340, marginInline: 'auto' }}>
              One verse. One shared drop a day. Beat the clock, keep your streak,
              and actually <b style={{ color: 'var(--gold)' }}>remember</b> it.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {['🔥 Daily streaks', '⚡ Beat the clock', '👥 Play with friends', '🃏 Collect verse cards'].map((t) => (
              <span key={t} className="pill">
                {t}
              </span>
            ))}
          </div>

          <p className="faint center" style={{ fontSize: 14, maxWidth: 320, marginInline: 'auto' }}>
            No shame, no pop quiz energy. Miss one? You still learn something
            surprising. It’s the Bible, but it’s a <i>game</i>.
          </p>

          {/* The honest version of what an account is: free, and it's the whole
              game rather than a nag about syncing. */}
          {isSupabaseConfigured && (
            <p className="center" style={{ fontSize: 13.5, maxWidth: 340, marginInline: 'auto', lineHeight: 1.5 }}>
              <b style={{ color: 'var(--gold)' }}>Free account</b>
              <span className="dim">
                {' '}opens battles, your keep, Study, your own Bible and playing for your church.
              </span>
            </p>
          )}
        </div>

        <div style={{ display: 'grid', gap: 12, paddingBottom: 'calc(var(--safe-bottom) + 20px)' }}>
          {iosFirst && (
            <>
              <AppStoreBadge />
              <p className="faint center" style={{ fontSize: 12.5, margin: '-4px 0 0' }}>
                Free on iPhone &amp; iPad — or play in your browser.
              </p>
            </>
          )}
          {isSupabaseConfigured ? (
            <>
              <Button variant="gold" full onClick={() => navigate('/auth?mode=signup')}>
                Create a free account →
              </Button>
              <Button variant="ghost" full onClick={() => navigate('/auth')}>
                I already have an account
              </Button>
              <p className="faint center" style={{ fontSize: 13, margin: '-2px 0 0' }}>
                <span
                  style={{ textDecoration: 'underline', cursor: 'pointer' }}
                  onClick={() => navigate('/welcome')}
                >
                  or just play today’s verse
                </span>
              </p>
            </>
          ) : (
            <>
              <Button variant="gold" full onClick={() => navigate('/welcome')}>
                Play today’s verse →
              </Button>
              <Button variant="ghost" full onClick={() => navigate('/auth')}>
                I already have an account
              </Button>
            </>
          )}
          {!iosFirst && !inApp && (
            <div style={{ display: 'grid', gap: 8, justifyItems: 'center', marginTop: 2 }}>
              <p className="faint center" style={{ fontSize: 12.5, margin: 0 }}>
                Got an iPhone? Verse Arcade is free on the App Store.
              </p>
              <AppStoreBadge compact />
            </div>
          )}
        </div>
      </div>
    </Page>
  )
}
