import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { XpBar } from '@/components/XpBar'
import { StreakFlame } from '@/components/StreakFlame'
import { useAuth } from '@/store/auth'
import { useSettings } from '@/store/settings'
import { useJuice } from '@/juice/useJuice'
import { READING_TRANSLATIONS } from '@/lib/config'
import { DENOMINATIONS, denominationColor } from '@/data/denominations'
import { shareResult, APP_URL } from '@/features/daily/shareCard'
import { useCollection } from '@/store/collection'
import { CustomizeSection } from './CustomizeSection'

export default function ProfileScreen() {
  const navigate = useNavigate()
  const juice = useJuice()
  const { profile, mode, updateProfile, changeUsername, signOut, deleteAccount } = useAuth()
  const settings = useSettings()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [feelOpen, setFeelOpen] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [nameErr, setNameErr] = useState<string | null>(null)
  const [savingName, setSavingName] = useState(false)
  const [refFlash, setRefFlash] = useState<string | null>(null)
  const owned = useCollection((s) => s.owned)
  const loadCollection = useCollection((s) => s.load)
  useEffect(() => {
    loadCollection()
  }, [loadCollection])

  if (!profile) return null
  const cards = owned.length

  // Settings write to BOTH the local settings store (drives juice instantly) and
  // the profile (persists to Supabase when online).
  const setSound = (v: boolean) => { settings.set({ soundEnabled: v }); updateProfile({ soundEnabled: v }); if (v) juice.select() }
  const setHaptics = (v: boolean) => { settings.set({ hapticsEnabled: v }); updateProfile({ hapticsEnabled: v }); if (v) juice.tap() }
  const setMotion = (v: boolean) => { settings.set({ reduceMotion: v }); updateProfile({ reduceMotion: v }) }

  const startEditName = () => { setNameDraft(profile.username); setNameErr(null); setEditingName(true) }
  const saveName = async () => {
    setSavingName(true)
    setNameErr(null)
    const res = await changeUsername(nameDraft)
    setSavingName(false)
    if (res.ok) { juice.correct?.(); setEditingName(false) }
    else setNameErr(res.error ?? 'Could not save')
  }

  return (
    <Page>
      {/* Identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <Avatar emoji={profile.avatarEmoji} character={profile.avatarCharacter} size={64} ring border={profile.avatarBorder} badge={profile.avatarBadge} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {!editingName ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ fontSize: 24, overflow: 'hidden', textOverflow: 'ellipsis' }}>@{profile.username}</h1>
              <button onClick={startEditName} aria-label="Edit username" className="pill" style={{ fontSize: 12, padding: '4px 10px', flexShrink: 0 }}>
                ✏️ Edit
              </button>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder="username"
                  maxLength={16}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoFocus
                  style={{ flex: 1, minWidth: 0 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <Button variant="gold" onClick={saveName} disabled={savingName}>{savingName ? '…' : 'Save'}</Button>
                <Button variant="ghost" onClick={() => setEditingName(false)} disabled={savingName}>Cancel</Button>
              </div>
              {nameErr && <p style={{ color: 'var(--coral)', fontSize: 13, marginTop: 6 }}>{nameErr}</p>}
            </div>
          )}
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

      {/* Streak-unlocked cosmetics */}
      <CustomizeSection />

      {/* Settings — collapsed by default so the profile isn't cluttered */}
      <button
        onClick={() => { juice.select?.(); setFeelOpen((o) => !o) }}
        aria-expanded={feelOpen}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'transparent', border: 'none', padding: '2px 0 10px', cursor: 'pointer' }}
      >
        <h3 style={{ fontSize: 16, margin: 0 }} className="dim">Sound &amp; feel</h3>
        <span style={{ color: 'var(--gold)', transform: feelOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
      </button>
      <AnimatePresence initial={false}>
      {feelOpen && (
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.25, ease: 'easeInOut' }}
        style={{ overflow: 'hidden' }}
      >
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
      </motion.div>
      )}
      </AnimatePresence>

      {/* Reading translation — the version used to read the full chapter. */}
      <h3 style={{ fontSize: 16, marginBottom: 10 }} className="dim">Reading translation</h3>
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
      <p className="faint" style={{ fontSize: 11, marginBottom: 14, lineHeight: 1.4 }}>
        Used when you read the full chapter. All free &amp; public domain — more versions coming. The daily quiz uses the Berean Standard Bible.
      </p>

      {/* Denomination — optional; only surfaces on the Battle ranks as a faction. */}
      <h3 style={{ fontSize: 16, marginBottom: 10 }} className="dim">Denomination</h3>
      <div className="card" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0, background: profile.denomination ? denominationColor(profile.denomination) : 'var(--stroke)', boxShadow: profile.denomination ? `0 0 8px ${denominationColor(profile.denomination)}` : 'none' }} />
        <select
          value={profile.denomination ?? ''}
          onChange={(e) => { juice.select?.(); updateProfile({ denomination: e.target.value || null }) }}
          style={{ flex: 1, padding: '10px 8px', borderRadius: 10, background: 'var(--card-solid)', color: 'var(--ink)', border: '1px solid var(--stroke)', fontSize: 14 }}
        >
          <option value="">Prefer not to say</option>
          {DENOMINATIONS.map((d) => (
            <option key={d.key} value={d.key}>{d.name}</option>
          ))}
        </select>
      </div>
      <p className="faint" style={{ fontSize: 11, marginBottom: 14, lineHeight: 1.4 }}>
        Optional &amp; friendly — pick your tradition to represent it on the <b>Battle</b> ranks. Your battle wins add to your denomination’s team total automatically.
      </p>

      {/* Invite friends — referral code + progress toward the carried-cross look. */}
      {profile.referralCode && (
        <>
          <h3 style={{ fontSize: 16, marginBottom: 10 }} className="dim">Invite friends</h3>
          <div className="card" style={{ marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your code</div>
                <b style={{ fontFamily: 'var(--font-display)', fontSize: 24, letterSpacing: '0.18em' }}>{profile.referralCode}</b>
              </div>
              <Button variant="gold" onClick={async () => {
                juice.coin()
                const link = `${APP_URL}/?ref=${profile.referralCode}`
                const r = await shareResult(`Join me on Verse Arcade! Use my code ${profile.referralCode} — daily Bible verse games, streaks & battles.\n${link}`)
                setRefFlash(r === 'shared' ? 'Shared!' : r === 'copied' ? 'Link copied!' : 'Could not share')
              }}>📤 Share</Button>
            </div>
            {refFlash && <p style={{ color: 'var(--good)', fontSize: 13, marginTop: 8 }}>{refFlash}</p>}

            <div style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, fontWeight: 700 }}>
                <span className="dim">✝️ Take Up Your Cross</span>
                <span style={{ color: (profile.referralCount ?? 0) >= 5 ? 'var(--good)' : 'var(--gold)' }}>
                  {Math.min(profile.referralCount ?? 0, 5)}/5 friends
                </span>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: 'rgba(0,0,0,0.3)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min((profile.referralCount ?? 0) / 5, 1) * 100}%`, borderRadius: 999, background: 'linear-gradient(90deg, var(--gold), var(--tangerine))', transition: 'width 0.3s' }} />
              </div>
              <p className="faint" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.4 }}>
                {(profile.referralCount ?? 0) >= 5
                  ? 'Unlocked! Equip it in Customize → Skins.'
                  : 'When 5 friends sign up with your code, the carried-cross look unlocks.'}
              </p>
            </div>
          </div>
          <p className="faint" style={{ fontSize: 11, marginBottom: 14, lineHeight: 1.4 }}>
            Friends enter your code (or tap your link) when they create an account.
          </p>
        </>
      )}

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

      {/* More */}
      <h3 style={{ fontSize: 16, margin: '18px 0 10px' }} className="dim">More</h3>
      <div style={{ display: 'grid', gap: 10 }}>
        <button
          onClick={() => { juice.select?.(); navigate('/churches') }}
          className="card"
          style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', width: '100%', cursor: 'pointer' }}
        >
          <span style={{ fontSize: 22 }}>⛪</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ fontSize: 14 }}>For Churches</b>
            <div className="faint" style={{ fontSize: 12 }}>Bring your congregation — get in touch</div>
          </div>
          <span style={{ color: 'var(--gold)' }}>›</span>
        </button>

        {/* Operator entry — rendered only for the admin account (others never get
            the flag, so it's invisible to them). Access is re-checked server-side. */}
        {profile.isAdmin && (
          <button
            onClick={() => { juice.select?.(); navigate('/admin') }}
            className="card"
            style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', width: '100%', cursor: 'pointer', borderColor: 'var(--grape)' }}
          >
            <span style={{ fontSize: 22 }}>🛠️</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: 14 }}>Admin</b>
              <div className="faint" style={{ fontSize: 12 }}>Operator dashboard</div>
            </div>
            <span style={{ color: 'var(--gold)' }}>›</span>
          </button>
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
