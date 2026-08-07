import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { XpBar } from '@/components/XpBar'
import { StreakFlame } from '@/components/StreakFlame'
import { useAuth } from '@/store/auth'
import { useSettings } from '@/store/settings'
import { useJuice } from '@/juice/useJuice'
import { TRANSLATIONS, DEFAULT_TRANSLATION } from '@/lib/config'
import { useCollection } from '@/store/collection'

export default function ProfileScreen() {
  const navigate = useNavigate()
  const juice = useJuice()
  const { profile, mode, updateProfile, signOut, deleteAccount } = useAuth()
  const settings = useSettings()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const owned = useCollection((s) => s.owned)
  const loadCollection = useCollection((s) => s.load)
  useEffect(() => {
    loadCollection()
  }, [loadCollection])

  if (!profile) return null
  const cards = owned.length
  const translation = TRANSLATIONS[DEFAULT_TRANSLATION]

  // Settings write to BOTH the local settings store (drives juice instantly) and
  // the profile (persists to Supabase when online).
  const setSound = (v: boolean) => { settings.set({ soundEnabled: v }); updateProfile({ soundEnabled: v }); if (v) juice.select() }
  const setHaptics = (v: boolean) => { settings.set({ hapticsEnabled: v }); updateProfile({ hapticsEnabled: v }); if (v) juice.tap() }
  const setMotion = (v: boolean) => { settings.set({ reduceMotion: v }); updateProfile({ reduceMotion: v }) }

  return (
    <Page>
      {/* Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <Avatar emoji={profile.avatarEmoji} size={64} ring />
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 24 }}>@{profile.username}</h1>
          <div style={{ marginTop: 8 }}><XpBar xp={profile.xp} /></div>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 18 }}>
        <Stat label="Streak" node={<StreakFlame days={profile.currentStreak} size={18} />} />
        <Stat label="Longest" value={`${profile.longestStreak}d`} />
        <Stat label="Cards" value={`${cards}`} />
        <Stat label="Level" value={`${profile.level}`} />
        <Stat label="Total XP" value={profile.xp.toLocaleString()} />
        <Stat label="Plays" value={`${profile.totalPlays}`} />
      </div>

      {/* Settings */}
      <h3 style={{ fontSize: 16, marginBottom: 10 }} className="dim">Feel</h3>
      <div className="card" style={{ display: 'grid', gap: 4, marginBottom: 14 }}>
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

      {/* Translation (swappable; premium ones behind IAP later) */}
      <h3 style={{ fontSize: 16, marginBottom: 10 }} className="dim">Translation</h3>
      <div className="card" style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <b>{translation.name}</b>
          <div className="faint" style={{ fontSize: 12 }}>{translation.publicDomain ? 'Public domain' : 'Licensed'} · more coming</div>
        </div>
        <span className="pill">{translation.shortName}</span>
      </div>

      {/* Account */}
      <h3 style={{ fontSize: 16, marginBottom: 10 }} className="dim">Account</h3>
      <div style={{ display: 'grid', gap: 10 }}>
        {mode === 'local' && (
          <Button variant="gold" full onClick={() => navigate('/auth')}>✨ Create account to sync & invite friends</Button>
        )}
        {mode === 'online' && <Button variant="secondary" full onClick={() => { signOut(); navigate('/') }}>Sign out</Button>}

        {!confirmDelete ? (
          <Button variant="ghost" full onClick={() => setConfirmDelete(true)}>Delete my account</Button>
        ) : (
          <div className="card" style={{ borderColor: 'var(--coral)' }}>
            <b style={{ color: 'var(--coral)' }}>Delete everything?</b>
            <p className="dim" style={{ fontSize: 14, marginTop: 4 }}>This permanently removes your profile, streak, and cards. This can’t be undone.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
              <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Keep it</Button>
              <Button variant="ghost" onClick={async () => { await deleteAccount(); navigate('/') }}>Delete</Button>
            </div>
          </div>
        )}
      </div>

      <p className="faint center" style={{ fontSize: 11, marginTop: 20 }}>
        Verse Arcade · Berean Standard Bible (public domain)
      </p>
    </Page>
  )
}

function Stat({ label, value, node }: { label: string; value?: string; node?: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: 12, textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, minHeight: 26, display: 'grid', placeItems: 'center' }}>{node ?? value}</div>
      <div className="faint" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
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
