import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { useAuth } from '@/store/auth'
import { isSupabaseConfigured } from '@/lib/config'
import { useSettings } from '@/store/settings'
import { useJuice } from '@/juice/useJuice'

const EMOJI = ['📖', '🕊️', '✨', '🔥', '🌿', '⭐', '🙏', '🌅', '🦁', '🐟', '👑', '🎵']

// Onboarding is short and reassuring by design. The middle step lets people
// *feel* the juice (sound/haptics) immediately — a tiny "aha, this is a game"
// moment before they've committed anything. Guest-first: no account required.
export default function Onboarding() {
  const navigate = useNavigate()
  const juice = useJuice()
  const startAsGuest = useAuth((s) => s.startAsGuest)
  const settings = useSettings()

  const [step, setStep] = useState(0)
  const [emoji, setEmoji] = useState('📖')
  const [username, setUsername] = useState('')

  const clean = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
  const canContinue = clean.length >= 2

  const finish = () => {
    juice.celebrate()
    startAsGuest(clean, emoji)
    navigate('/play', { replace: true })
  }

  return (
    <Page noNav>
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div>
          {step === 0 && (
            <Step key="0">
              <div className="floaty center" style={{ fontSize: 72 }}>👋</div>
              <h1 className="center" style={{ fontSize: 34, marginTop: 8 }}>
                Welcome in
              </h1>
              <p className="dim center" style={{ fontSize: 17, marginTop: 10 }}>
                Here’s the deal: <b style={{ color: 'var(--gold)' }}>nobody</b> starts knowing
                every verse. This isn’t a test. Wrong answers just teach you
                something cool. You literally can’t lose — you can only learn.
              </p>
              <Button variant="gold" full onClick={() => setStep(1)}>
                Let’s go →
              </Button>
              {/* Onboarding is guest-first, but it's also where a signed-out
                  player can land, and step 0 used to be a dead end for anyone
                  who already had an account. Hidden in a LOCAL build, where
                  there's no backend to sign in to. */}
              {isSupabaseConfigured && (
                <p className="faint center" style={{ fontSize: 13, marginTop: 2 }}>
                  Already have an account?{' '}
                  <span
                    style={{ color: 'var(--sky)', textDecoration: 'underline' }}
                    onClick={() => navigate('/auth')}
                  >
                    Sign in
                  </span>
                </p>
              )}
            </Step>
          )}

          {step === 1 && (
            <Step key="1">
              <h1 className="center" style={{ fontSize: 30 }}>
                Pick your look
              </h1>
              <div className="center" style={{ marginTop: 16 }}>
                <motion.div
                  key={emoji}
                  initial={{ scale: 0.5 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 14 }}
                  style={{ display: 'inline-block' }}
                >
                  <Avatar emoji={emoji} size={88} ring />
                </motion.div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginTop: 18 }}>
                {EMOJI.map((e) => (
                  <motion.button
                    key={e}
                    whileTap={{ scale: 0.8 }}
                    onClick={() => {
                      juice.select()
                      setEmoji(e)
                    }}
                    style={{
                      fontSize: 26,
                      padding: 8,
                      borderRadius: 14,
                      background: e === emoji ? 'var(--grape)' : 'var(--card)',
                      border: '1px solid var(--stroke)',
                    }}
                  >
                    {e}
                  </motion.button>
                ))}
              </div>
              <div style={{ marginTop: 18 }}>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="pick a username"
                  maxLength={16}
                  autoCapitalize="none"
                  autoCorrect="off"
                />
                <p className="faint" style={{ fontSize: 12, marginTop: 6 }}>
                  {clean ? `You’ll show up as @${clean}` : 'letters, numbers, underscores'}
                </p>
              </div>
              <Button variant="gold" full disabled={!canContinue} onClick={() => setStep(2)}>
                Continue →
              </Button>
            </Step>
          )}

          {step === 2 && (
            <Step key="2">
              <h1 className="center" style={{ fontSize: 30 }}>
                Feel the arcade
              </h1>
              <p className="dim center" style={{ fontSize: 16, marginTop: 8 }}>
                Tap the buttons. Sound + rumble on? Good. You can dial it down
                anytime in settings.
              </p>
              <div style={{ display: 'grid', gap: 10, marginTop: 20 }}>
                <Button full onClick={() => juice.correct()}>
                  ✅ Try a “correct!”
                </Button>
                <Button variant="secondary" full onClick={() => juice.combo(4)}>
                  ⚡ Try a combo
                </Button>
                <Button variant="secondary" full onClick={() => juice.levelUp()}>
                  🎉 Try a level-up
                </Button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'center' }}>
                <Toggle label="🔊 Sound" on={settings.soundEnabled} onClick={() => settings.set({ soundEnabled: !settings.soundEnabled })} />
                <Toggle label="📳 Haptics" on={settings.hapticsEnabled} onClick={() => settings.set({ hapticsEnabled: !settings.hapticsEnabled })} />
              </div>
              <div style={{ marginTop: 22 }}>
                <Button variant="gold" full onClick={finish}>
                  Start playing →
                </Button>
                <p className="faint center" style={{ fontSize: 13, marginTop: 12 }}>
                  Playing as a guest.{' '}
                  <span style={{ color: 'var(--sky)', textDecoration: 'underline' }} onClick={() => navigate('/auth')}>
                    Create an account
                  </span>{' '}
                  to save your streak across devices.
                </p>
              </div>
            </Step>
          )}
        </div>
      </div>
    </Page>
  )
}

function Step({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      style={{ display: 'grid', gap: 14 }}
    >
      {children}
    </motion.div>
  )
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="pill"
      style={{ background: on ? 'var(--grape)' : 'var(--card)', fontWeight: 800 }}
    >
      {label} {on ? 'ON' : 'OFF'}
    </button>
  )
}
