import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { XpBar } from '@/components/XpBar'
import { StreakFlame } from '@/components/StreakFlame'
import { useAuth } from '@/store/auth'
import { useJuice } from '@/juice/useJuice'
import { shareResult, APP_URL } from '@/features/daily/shareCard'
import { useCollection } from '@/store/collection'
import { CustomizeSection } from './CustomizeSection'
import { SettingsSheet } from './SettingsSheet'

export default function ProfileScreen() {
  const navigate = useNavigate()
  const juice = useJuice()
  const { profile, mode, changeUsername, signOut, deleteAccount } = useAuth()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [nameErr, setNameErr] = useState<string | null>(null)
  const [savingName, setSavingName] = useState(false)
  const [refFlash, setRefFlash] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const owned = useCollection((s) => s.owned)
  const loadCollection = useCollection((s) => s.load)
  useEffect(() => {
    loadCollection()
  }, [loadCollection])

  if (!profile) return null
  const cards = owned.length

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
              <h1 style={{ fontSize: 24, overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>@{profile.username}</h1>
              <button onClick={startEditName} aria-label="Edit username" className="pill" style={{ fontSize: 12, padding: '4px 10px', flexShrink: 0 }}>
                ✏️ Edit
              </button>
              {/* Sound, haptics, motion and translation all live behind here so
                  the profile stays about the player, not the knobs. */}
              <button
                onClick={() => { juice.select?.(); setSettingsOpen(true) }}
                aria-label="Settings"
                className="pill"
                style={{ fontSize: 14, padding: '4px 10px', flexShrink: 0, lineHeight: 1 }}
              >
                ⚙️
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

      {/* Invite friends — referral code + progress toward the carried-cross look.
          Collapsed by default behind an obvious Show/Hide button; the header
          keeps the friend count visible so the goal still reads when closed. */}
      {profile.referralCode && (
        <>
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => { juice.select?.(); setInviteOpen((o) => !o) }}
            aria-expanded={inviteOpen}
            className="card"
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between', padding: '13px 14px', marginBottom: 10, cursor: 'pointer', borderColor: inviteOpen ? 'var(--gold)' : 'var(--stroke)' }}
          >
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16 }}>
              🎁 Invite friends{' '}
              <span className="faint" style={{ fontWeight: 400, fontSize: 13 }}>
                · {Math.min(profile.referralCount ?? 0, 5)}/5
              </span>
            </span>
            <span className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--gold)', color: '#241f0a', fontWeight: 800, fontSize: 13, padding: '6px 12px', flexShrink: 0 }}>
              {inviteOpen ? 'Hide' : 'Show'}
              <span style={{ fontSize: 15, transform: inviteOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
            </span>
          </motion.button>
          <AnimatePresence initial={false}>
          {inviteOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
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
          </motion.div>
          )}
          </AnimatePresence>
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

      <AnimatePresence>
        {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
      </AnimatePresence>
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
