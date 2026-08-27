import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '@/store/auth'
import { useSettings } from '@/store/settings'
import { useJuice } from '@/juice/useJuice'
import { READING_TRANSLATIONS } from '@/lib/config'
import { pushSupported, pushPermission, isPushSubscribed, enablePush, disablePush } from '@/lib/push'
import { useReminders } from '@/store/reminders'
import { MusicSection } from './MusicSection'
import { InstallRow } from '@/features/home/InstallPrompt'
import { AppStoreRow } from '@/features/home/AppStoreNudge'

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

  // Web Push — reflects the *actual* browser subscription, not a stored flag, so
  // it stays honest if permission is revoked in browser settings.
  // Local reminders — the native counterpart to Web Push. Scheduled on the
  // device (lib/reminders.ts), so guests get them too.
  const reminders = useReminders()
  useEffect(() => {
    if (!reminders.loaded) void reminders.load()
  }, [reminders.loaded, reminders])
  const [remErr, setRemErr] = useState('')

  const toggleReminder = async (which: 'drop' | 'study', on: boolean) => {
    setRemErr('')
    const ok = await reminders.setEnabled(which, on)
    if (on && !ok) {
      setRemErr(
        useReminders.getState().permission === 'denied'
          ? 'Notifications are turned off for Verse Arcade in iOS Settings — turn them back on there, then flip this on.'
          : 'Could not turn on reminders.',
      )
    } else if (on && ok) juice.coin()
  }

  const supportsPush = pushSupported()
  const [pushOn, setPushOn] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushErr, setPushErr] = useState('')
  const denied = pushPermission() === 'denied'

  useEffect(() => {
    isPushSubscribed().then(setPushOn).catch(() => setPushOn(false))
  }, [])

  const togglePush = async () => {
    if (pushBusy) return
    setPushErr('')
    setPushBusy(true)
    try {
      if (pushOn) {
        await disablePush()
        setPushOn(false)
      } else {
        const ok = await enablePush()
        setPushOn(ok)
        if (!ok) setPushErr(pushPermission() === 'denied'
          ? 'Notifications are blocked in your browser settings.'
          : 'Could not turn on notifications.')
        else juice.coin()
      }
    } catch {
      setPushErr('Something went wrong. Try again.')
    } finally {
      setPushBusy(false)
    }
  }

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

        {/* The soundtrack — its own toggle and its own level, deliberately not
            wired to the sound-effects ones above. */}
        <MusicSection />

        {/* The App Store app — a review ask inside it, a download link outside. */}
        <AppStoreRow />

        {/* Install — only renders where the browser can actually install us. */}
        <InstallRow />

        {/* Notifications — Web Push. Only shown where the browser supports it. */}
        {supportsPush && (
          <>
            <h3 style={{ fontSize: 14, margin: '0 0 8px' }} className="dim">Notifications</h3>
            <div className="card" style={{ marginBottom: 6 }}>
              <Row
                label={pushBusy ? '🔔 Working…' : '🔔 Daily reminders'}
                on={pushOn}
                onToggle={togglePush}
              />
            </div>
            <p className="faint" style={{ fontSize: 11, lineHeight: 1.4, marginBottom: 18 }}>
              {denied
                ? 'Notifications are blocked for this site — turn them back on in your browser settings, then flip this on.'
                : 'A gentle nudge when a new verse drops and when your streak’s about to break. Add Verse Arcade to your home screen for the most reliable delivery.'}
              {pushErr && <span style={{ color: 'var(--coral)', display: 'block', marginTop: 4 }}>{pushErr}</span>}
            </p>
          </>
        )}

        {/* Local reminders — native only. Web keeps Web Push above; the
            Capacitor plugin has no real web implementation, and these two
            nudges are predictable enough not to need a server at all. Unlike
            Web Push these reach GUESTS, who have no push_subscriptions row. */}
        {reminders.supported && (
          <>
            <h3 style={{ fontSize: 14, margin: '0 0 8px' }} className="dim">Reminders</h3>
            <div className="card" style={{ marginBottom: 6 }}>
              <Row
                label="📖 Today's verse"
                on={reminders.dropEnabled}
                onToggle={() => void toggleReminder('drop', !reminders.dropEnabled)}
              />
              {reminders.dropEnabled && (
                <TimePicker
                  value={reminders.dropTime}
                  onChange={(t) => void reminders.setTime('drop', t)}
                />
              )}
              <Divider />
              <Row
                label="🧠 Your study is calling"
                on={reminders.studyEnabled}
                onToggle={() => void toggleReminder('study', !reminders.studyEnabled)}
              />
              {reminders.studyEnabled && (
                <TimePicker
                  value={reminders.studyTime}
                  onChange={(t) => void reminders.setTime('study', t)}
                />
              )}
            </div>
            <p className="faint" style={{ fontSize: 11, lineHeight: 1.4, marginBottom: 18 }}>
              Scheduled on this device, so they arrive even offline. The study nudge only
              shows up on days you actually have something waiting.
              {remErr && <span style={{ color: 'var(--coral)', display: 'block', marginTop: 4 }}>{remErr}</span>}
            </p>
          </>
        )}

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

// A short list of sensible hours rather than a free time field: a wheel of
// every minute is a worse choice on a phone, and nobody needs 7:43am.
const TIME_CHOICES = ['06:00', '07:00', '08:00', '09:00', '12:00', '17:00', '19:00', '20:00', '21:00']

function timeLabel(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const suffix = h < 12 ? 'AM' : 'PM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`
}

function TimePicker({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 4px 12px' }}>
      <span className="faint" style={{ fontSize: 12 }}>Remind me at</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: '7px 10px', borderRadius: 10, background: 'var(--card-solid)',
          border: '1px solid var(--stroke)', color: 'var(--ink)', fontSize: 13, fontWeight: 700,
        }}
      >
        {TIME_CHOICES.map((t) => (
          <option key={t} value={t}>{timeLabel(t)}</option>
        ))}
      </select>
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
