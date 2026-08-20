import { useState } from 'react'
import { motion } from 'framer-motion'
import { useSettings } from '@/store/settings'
import { useJuice } from '@/juice/useJuice'
import { useInstallMode, promptInstall } from '@/lib/install'

// The "Add to Home Screen" nudge on the home screen — one tap fires the
// browser's real install prompt (Chrome/Edge/Android). iOS is deliberately not
// here: it gets the App Store app instead, via `AppStoreNudge`. Hidden entirely
// once installed, inside the native app, or after a dismiss.
export function InstallPrompt() {
  const mode = useInstallMode()
  const juice = useJuice()
  const dismissed = useSettings((s) => s.installPromptDismissed)
  const setSettings = useSettings((s) => s.set)
  const [done, setDone] = useState(false)

  if (mode === 'unavailable' || dismissed || done) return null

  const onTap = async () => {
    const outcome = await promptInstall()
    if (outcome === 'accepted') {
      juice.coin()
      setDone(true)
    }
  }

  return (
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
            Install Verse Arcade — full screen, one tap from your phone.
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
  )
}

// The same action as a settings row — always available (it ignores the
// home-screen dismissal), so someone who tapped ✕ can still install later.
export function InstallRow() {
  const mode = useInstallMode()
  const juice = useJuice()
  const [done, setDone] = useState(false)

  if (mode === 'unavailable' || done) return null

  const onTap = async () => {
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
          <span className="pill" style={{ fontSize: 11, fontWeight: 800 }}>Install</span>
        </button>
      </div>
    </>
  )
}
