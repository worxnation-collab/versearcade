import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/Button'
import { useSettings } from '@/store/settings'
import { useJuice } from '@/juice/useJuice'
import { useInstallMode, promptInstall } from '@/lib/install'

// The "Add to Home Screen" nudge on the home screen. Two shapes:
//   • Chrome/Edge/Android — one tap fires the browser's real install prompt.
//   • iOS Safari — no API exists, so we show the Share → Add to Home Screen steps.
// Hidden entirely once installed, inside the native app, or after a dismiss.
export function InstallPrompt() {
  const mode = useInstallMode()
  const juice = useJuice()
  const dismissed = useSettings((s) => s.installPromptDismissed)
  const setSettings = useSettings((s) => s.set)
  const [howToOpen, setHowToOpen] = useState(false)
  const [done, setDone] = useState(false)

  if (mode === 'unavailable' || dismissed || done) return null

  const onTap = async () => {
    if (mode === 'ios') {
      setHowToOpen(true)
      return
    }
    const outcome = await promptInstall()
    if (outcome === 'accepted') {
      juice.coin()
      setDone(true)
    }
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="card"
        style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}
      >
        <button
          onClick={onTap}
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'none',
            border: 'none',
            padding: 0,
            textAlign: 'left',
            color: 'inherit',
            cursor: 'pointer',
          }}
        >
          <div style={{ fontSize: 22 }}>📲</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>Add to Home Screen</b>
            <div className="faint" style={{ fontSize: 12.5 }}>
              {mode === 'ios'
                ? 'Two taps in Safari — play full screen, never miss a drop.'
                : 'Install Verse Arcade — full screen, one tap from your phone.'}
            </div>
          </div>
          <div style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)', fontSize: 18, flexShrink: 0 }}>→</div>
        </button>
        <button
          aria-label="Dismiss"
          onClick={() => setSettings({ installPromptDismissed: true })}
          className="faint"
          style={{ background: 'none', border: 'none', fontSize: 16, padding: 4, cursor: 'pointer', flexShrink: 0 }}
        >
          ✕
        </button>
      </motion.div>

      <AnimatePresence>
        {howToOpen && <IOSInstructions onClose={() => setHowToOpen(false)} />}
      </AnimatePresence>
    </>
  )
}

// The same action as a settings row — always available (it ignores the
// home-screen dismissal), so someone who tapped ✕ can still install later.
export function InstallRow() {
  const mode = useInstallMode()
  const juice = useJuice()
  const [howToOpen, setHowToOpen] = useState(false)
  const [done, setDone] = useState(false)

  if (mode === 'unavailable' || done) return null

  const onTap = async () => {
    if (mode === 'ios') {
      setHowToOpen(true)
      return
    }
    const outcome = await promptInstall()
    if (outcome === 'accepted') {
      juice.coin()
      setDone(true)
    }
  }

  return (
    <>
      <h3 style={{ fontSize: 14, margin: '0 0 8px' }} className="dim">App</h3>
      <div className="card" style={{ marginBottom: 18 }}>
        <button
          onClick={onTap}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            width: '100%',
            padding: '10px 4px',
            background: 'none',
            border: 'none',
            color: 'inherit',
            textAlign: 'left',
            cursor: 'pointer',
          }}
        >
          <span style={{ flex: 1 }}>📲 Add to Home Screen</span>
          <span className="pill" style={{ fontSize: 11, fontWeight: 800 }}>
            {mode === 'ios' ? 'How' : 'Install'}
          </span>
        </button>
      </div>
      <AnimatePresence>
        {howToOpen && <IOSInstructions onClose={() => setHowToOpen(false)} />}
      </AnimatePresence>
    </>
  )
}

const IOS_STEPS = [
  { icon: '⬆️', text: 'Tap the Share button at the bottom of Safari' },
  { icon: '➕', text: 'Scroll down and pick “Add to Home Screen”' },
  { icon: '🎮', text: 'Tap Add — Verse Arcade lands on your home screen' },
]

function IOSInstructions({ onClose }: { onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.66)', display: 'grid', placeItems: 'center', zIndex: 200, padding: 20 }}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        className="card"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        style={{ maxWidth: 360, width: '100%' }}
      >
        <div className="floaty" style={{ fontSize: 48, textAlign: 'center' }}>📲</div>
        <h2 style={{ fontSize: 22, marginTop: 8, textAlign: 'center' }}>Add to Home Screen</h2>
        <p className="dim" style={{ marginTop: 6, textAlign: 'center', fontSize: 14 }}>
          Safari can put Verse Arcade right next to your other apps.
        </p>

        <ol style={{ listStyle: 'none', padding: 0, margin: '16px 0 0', display: 'grid', gap: 12 }}>
          {IOS_STEPS.map((s, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                className="pill"
                style={{ width: 26, height: 26, display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 13 }}
              >
                {i + 1}
              </span>
              <span style={{ flex: 1, fontSize: 14, lineHeight: 1.4 }}>{s.text}</span>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{s.icon}</span>
            </li>
          ))}
        </ol>

        <div style={{ marginTop: 18 }}>
          <Button variant="gold" full onClick={onClose}>
            Got it
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
