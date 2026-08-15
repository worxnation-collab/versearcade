import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '@/store/auth'
import { useSettings } from '@/store/settings'
import { useJuice } from '@/juice/useJuice'
import { READING_TRANSLATIONS } from '@/lib/config'

// Everything that used to sit inline on the profile (sound, haptics, motion,
// volume, reading translation) lives here instead — one ⚙️ tap away, so the
// profile itself stays about *you* rather than about knobs.
export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const juice = useJuice()
  const settings = useSettings()
  const updateProfile = useAuth((s) => s.updateProfile)

  // Close on Escape and freeze the page behind the sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  // Settings write to BOTH the local settings store (drives juice instantly) and
  // the profile (persists to Supabase when online).
  const setSound = (v: boolean) => { settings.set({ soundEnabled: v }); updateProfile({ soundEnabled: v }); if (v) juice.select() }
  const setHaptics = (v: boolean) => { settings.set({ hapticsEnabled: v }); updateProfile({ hapticsEnabled: v }); if (v) juice.tap() }
  const setMotion = (v: boolean) => { settings.set({ reduceMotion: v }); updateProfile({ reduceMotion: v }) }

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.62)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100 }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 420, damping: 38 }}
        style={{
          width: '100%', maxWidth: 520, maxHeight: '86vh', overflowY: 'auto',
          background: 'var(--bg-1)', borderTop: '1px solid var(--stroke)',
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          padding: '10px 16px calc(24px + env(safe-area-inset-bottom))',
        }}
      >
        {/* Grabber + header */}
        <div style={{ width: 42, height: 4, borderRadius: 999, background: 'var(--stroke)', margin: '0 auto 12px' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: 22, margin: 0 }}>⚙️ Settings</h2>
          <button onClick={onClose} className="pill" style={{ fontSize: 13, fontWeight: 800, padding: '7px 14px' }}>Done</button>
        </div>

        {/* Sound & feel */}
        <h3 style={{ fontSize: 14, margin: '0 0 8px' }} className="dim">Sound &amp; feel</h3>
        <div className="card" style={{ display: 'grid', gap: 4, marginBottom: 18 }}>
          <Row label="🔊 Sound effects" on={settings.soundEnabled} onToggle={() => setSound(!settings.soundEnabled)} />
          <Divider />
          <Row label="📳 Haptics" on={settings.hapticsEnabled} onToggle={() => setHaptics(!settings.hapticsEnabled)} />
          <Divider />
          <Row label="🌀 Reduce motion" on={settings.reduceMotion} onToggle={() => setMotion(!settings.reduceMotion)} />
          <Divider />
          <div style={{ padding: '10px 4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span>🎚️ Volume</span><span className="faint">{Math.round(settings.volume * 100)}%</span>
            </div>
            <input type="range" min={0} max={1} step={0.05} value={settings.volume}
              onChange={(e) => settings.set({ volume: Number(e.target.value) })}
              onMouseUp={() => juice.coin()} style={{ width: '100%' }} />
          </div>
        </div>

        {/* Reading translation — the version used to read the full chapter. */}
        <h3 style={{ fontSize: 14, margin: '0 0 8px' }} className="dim">
          Reading translation <span className="faint" style={{ fontSize: 12 }}>· {READING_TRANSLATIONS.find((t) => t.code === settings.readingTranslation)?.short ?? 'WEB'}</span>
        </h3>
        <div className="card" style={{ marginBottom: 6 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            {READING_TRANSLATIONS.map((t) => {
              const on = settings.readingTranslation === t.code
              return (
                <button
                  key={t.code}
                  onClick={() => { juice.select?.(); settings.set({ readingTranslation: t.code }) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', width: '100%',
                    padding: '11px 12px', borderRadius: 12,
                    background: on ? 'var(--grape)' : 'var(--card-solid)',
                    border: on ? '1px solid var(--gold)' : '1px solid var(--stroke)', cursor: 'pointer',
                  }}
                >
                  <span className="pill" style={{ fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{t.short}</span>
                  <b style={{ flex: 1, fontSize: 14 }}>{t.name}</b>
                  {on && <span style={{ color: 'var(--gold)', fontWeight: 800 }}>✓</span>}
                </button>
              )
            })}
          </div>
        </div>
        <p className="faint" style={{ fontSize: 11, lineHeight: 1.4 }}>
          Used when you read the full chapter. All free &amp; public domain — more versions coming. The daily quiz uses the Berean Standard Bible.
        </p>
      </motion.div>
    </div>
  )
}

function Row({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 4px', width: '100%' }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      <span style={{
        width: 50, height: 30, borderRadius: 999, background: on ? 'var(--good)' : 'rgba(255,255,255,0.15)',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}>
        <span style={{
          position: 'absolute', top: 3, left: on ? 23 : 3, width: 24, height: 24, borderRadius: 999,
          background: '#fff', transition: 'left 0.2s', boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
        }} />
      </span>
    </button>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--stroke)' }} />
}
