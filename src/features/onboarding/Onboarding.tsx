import { useEffect, useState } from 'react'
import { useOverlayHold } from '@/store/overlayHold'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { CharacterPicker } from '@/components/CharacterPicker'
import { DEFAULT_AVATAR } from '@/data/avatar'
import { useAuth } from '@/store/auth'
import { isSupabaseConfigured } from '@/lib/config'
import { useSettings } from '@/store/settings'
import { useJuice } from '@/juice/useJuice'
import type { AvatarSpec } from '@/types'

// The emoji is now only a fallback — for anything rendering a player before
// their character has loaded, and for accounts made before characters existed.
// Step 1 builds an actual character instead of picking a glyph.
const FALLBACK_EMOJI = '📖'

// Onboarding is two steps and guest-first. The FIRST thing anybody does is
// answer one real question — not read a paragraph claiming wrong answers
// teach. Whatever they tap, the fact behind the answer lands with the same
// reveal, sound and haptic a real run uses (QuizRunner's teach card), so the
// thesis is felt before it is ever stated. Step 2 is the character, the name
// and the sound/haptic toggles. The old "Feel the arcade" demo buttons went:
// the question already fires the real feedback.
export default function Onboarding() {
  const navigate = useNavigate()
  const juice = useJuice()
  const startAsGuest = useAuth((s) => s.startAsGuest)
  const setPendingCharacter = useAuth((s) => s.setPendingCharacter)
  const settings = useSettings()

  // The "music is on" toast waits until onboarding is over: on the first
  // screen it landed squarely on the sample verse.
  useEffect(() => {
    useOverlayHold.getState().hold('onboarding')
    return () => useOverlayHold.getState().release('onboarding')
  }, [])

  const [step, setStep] = useState(0)
  const [spec, setSpec] = useState<AvatarSpec>(DEFAULT_AVATAR)
  const [username, setUsername] = useState('')

  const clean = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '')
  const canContinue = clean.length >= 2

  const finish = () => {
    juice.celebrate()
    startAsGuest(clean, FALLBACK_EMOJI, spec)
    // Parked as well as saved: a guest who later creates an account keeps the
    // character they made here (see applyPendingCharacter in store/auth).
    setPendingCharacter(spec)
    navigate('/play', { replace: true })
  }

  return (
    <Page noNav>
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div>
          {step === 0 && (
            <Step key="0">
              <SampleQuestion onContinue={() => setStep(1)} />
              {/* Onboarding is guest-first, but it's also where a signed-out
                  player can land, so the first screen keeps a way back into an
                  existing account. Hidden in a LOCAL build, where there's no
                  backend to sign in to. */}
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
                Make your character
              </h1>
              <p className="dim center" style={{ fontSize: 15, marginTop: -2 }}>
                This is you, everywhere in the arcade. You can change it any time.
              </p>
              <CharacterPicker value={spec} onChange={setSpec} layout="tiles" />
              <div style={{ marginTop: 4 }}>
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
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <Toggle label="🔊 Sound" on={settings.soundEnabled} onClick={() => settings.set({ soundEnabled: !settings.soundEnabled })} />
                <Toggle label="📳 Haptics" on={settings.hapticsEnabled} onClick={() => settings.set({ hapticsEnabled: !settings.hapticsEnabled })} />
              </div>
              <Button variant="gold" full disabled={!canContinue} onClick={finish}>
                Start playing →
              </Button>
              <p className="faint center" style={{ fontSize: 13, marginTop: -2 }}>
                Playing as a guest.{' '}
                <span style={{ color: 'var(--sky)', textDecoration: 'underline' }} onClick={() => navigate('/auth?mode=signup')}>
                  Create an account
                </span>{' '}
                to save your streak across devices.
              </p>
            </Step>
          )}
        </div>
      </div>
    </Page>
  )
}

function Step({ children }: { children: React.ReactNode }) {
  const reduceMotion = useSettings((s) => s.reduceMotion)
  return (
    <motion.div
      initial={{ opacity: 0, x: reduceMotion ? 0 : 40 }}
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
      style={{ background: on ? 'var(--select)' : 'var(--card)', fontWeight: 800 }}
    >
      {label} {on ? 'ON' : 'OFF'}
    </button>
  )
}

// The one sample question. A real pool verse (Psalm 23:1) and a question built
// the way the generator builds its "who said it" kind, so it is honest about
// what the game is. Every choice reveals the same fact — right or not — framed
// exactly as QuizRunner's teach card frames it: "Nice!" or "Good to know",
// never a red X and never the word wrong. Nothing here is scored or stored.
const SAMPLE = {
  reference: 'Psalm 23:1',
  text: 'The LORD is my shepherd; I shall not want.',
  prompt: 'Who wrote these words?',
  choices: ['Moses', 'David', 'Solomon', 'Paul'],
  answer: 1,
  teach:
    'David wrote Psalm 23 — and before he was a king he was a shepherd boy, so he knew exactly what a shepherd does for the sheep.',
}

function SampleQuestion({ onContinue }: { onContinue: () => void }) {
  const juice = useJuice()
  const reduceMotion = useSettings((s) => s.reduceMotion)
  const [picked, setPicked] = useState<number | null>(null)
  const done = picked !== null
  const right = picked === SAMPLE.answer

  const choose = (i: number, e: React.MouseEvent) => {
    if (done) return
    juice.unlock()
    setPicked(i)
    if (i === SAMPLE.answer) juice.correct(e.clientX, e.clientY)
    else juice.wrong()
  }

  return (
    <>
      <p className="faint center" style={{ fontSize: 13, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 800 }}>
        Try one
      </p>
      <div className="card" style={{ textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: 22, lineHeight: 1.35, margin: 0 }}>
          “{SAMPLE.text}”
        </p>
        <p className="dim" style={{ fontSize: 14, marginTop: 8 }}>{SAMPLE.reference}</p>
      </div>
      <h2 className="center" style={{ fontSize: 22 }}>{SAMPLE.prompt}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {SAMPLE.choices.map((c, i) => {
          const isAnswer = done && i === SAMPLE.answer
          const isPick = done && i === picked && !right
          return (
            <motion.button
              key={c}
              className="card"
              onClick={(e) => choose(i, e)}
              disabled={done}
              whileTap={reduceMotion || done ? undefined : { scale: 0.96 }}
              animate={isAnswer && !reduceMotion ? { scale: [1, 1.05, 1] } : undefined}
              transition={{ type: 'spring', stiffness: 300, damping: 16 }}
              style={{
                padding: '14px 10px',
                fontWeight: 800,
                fontSize: 17,
                color: 'var(--ink)',
                cursor: done ? 'default' : 'pointer',
                // The answer is lit; the other pick is simply left as it was,
                // dimmed with the rest — no red, nothing marked against it.
                borderColor: isAnswer ? 'var(--good)' : undefined,
                background: isAnswer ? 'rgba(67,233,123,0.12)' : undefined,
                opacity: done && !isAnswer && !isPick ? 0.55 : 1,
              }}
            >
              {c}
            </motion.button>
          )
        })}
      </div>

      <AnimatePresence>
        {done && (
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
            style={{ overflow: 'hidden', display: 'grid', gap: 12 }}
          >
            <div
              className="card"
              style={{
                background: right ? 'rgba(67,233,123,0.1)' : 'rgba(94,231,223,0.1)',
                borderColor: right ? 'var(--good)' : 'var(--sky)',
              }}
            >
              <b style={{ color: right ? 'var(--good)' : 'var(--sky)' }}>
                {right ? '🎯 Nice!' : '💡 Good to know'}
              </b>
              <p style={{ marginTop: 6, fontSize: 15, lineHeight: 1.5 }}>{SAMPLE.teach}</p>
            </div>
            <p className="dim center" style={{ fontSize: 15, margin: 0 }}>
              That’s the whole game: every answer leaves you knowing something.
              Nobody here is behind.
            </p>
            <Button variant="gold" full onClick={onContinue}>
              Continue →
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
