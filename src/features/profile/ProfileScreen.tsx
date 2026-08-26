import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Page } from '@/components/Page'
import { BibleCover } from '@/features/bible/BibleCover'
import { Button } from '@/components/Button'
import { PlayerCard } from '@/components/PlayerCard'
import { useAuth } from '@/store/auth'
import { useJuice } from '@/juice/useJuice'
import { shareResult, APP_URL } from '@/features/daily/shareCard'
import { useCollection } from '@/store/collection'
import { Collapsible } from '@/components/Collapsible'
import { CollectionSection } from '@/features/collection/CollectionScreen'
import { BuddiesSection } from '@/features/buddies/BuddiesScreen'
import { CustomizeSection } from './CustomizeSection'
import { SettingsSheet } from './SettingsSheet'

export default function ProfileScreen() {
  const navigate = useNavigate()
  const juice = useJuice()
  const { profile, mode, changeUsername, signOut, deleteAccount } = useAuth()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // ?customize=1 deep-links straight into the customizer — the home screen's
  // "build your character" nudge uses it, so it doesn't dump you on the profile
  // with nothing obviously to do.
  const [searchParams, setSearchParams] = useSearchParams()
  const wantsCustomize = searchParams.get('customize') === '1'
  const [customizing, setCustomizing] = useState(wantsCustomize)
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
  useEffect(() => {
    if (wantsCustomize) setCustomizing(true)
  }, [wantsCustomize])

  if (!profile) return null
  const cards = owned.length

  const cardData = {
    username: profile.username,
    avatarEmoji: profile.avatarEmoji,
    avatarCharacter: profile.avatarCharacter,
    avatarBorder: profile.avatarBorder,
    avatarBadge: profile.avatarBadge,
    cardBackground: profile.cardBackground,
    xp: profile.xp,
    level: profile.level,
    currentStreak: profile.currentStreak,
    longestStreak: profile.longestStreak,
    totalPlays: profile.totalPlays,
    cards,
    denomination: profile.denomination,
  }

  const startEditName = () => { setNameDraft(profile.username); setNameErr(null); setEditingName(true) }
  const saveName = async () => {
    setSavingName(true)
    setNameErr(null)
    const res = await changeUsername(nameDraft)
    setSavingName(false)
    if (res.ok) { juice.correct?.(); setEditingName(false) }
    else setNameErr(res.error ?? 'Could not save')
  }
  const openCustomize = () => { juice.select?.(); setCustomizing(true); window.scrollTo({ top: 0 }) }
  const closeCustomize = () => {
    juice.select?.()
    setEditingName(false)
    setCustomizing(false)
    if (wantsCustomize) setSearchParams({}, { replace: true })
    window.scrollTo({ top: 0 })
  }

  // ── Customize ────────────────────────────────────────────────────────────
  // Everything that changes how your card looks — name, character, skins,
  // items, background, borders, badges — lives on its own screen behind the
  // card's Customize button, so the profile itself stays a profile. The card
  // sits on top as a live preview: every tap below redraws it immediately.
  if (customizing) {
    return (
      <Page>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
          <h2 style={{ fontSize: 24, margin: 0 }}>✨ Customize</h2>
          <button onClick={closeCustomize} className="pill" style={{ fontSize: 13, fontWeight: 800, padding: '7px 14px', flexShrink: 0 }}>
            Done
          </button>
        </div>

        <div style={{ marginBottom: 14 }}>
          <PlayerCard p={cardData} />
        </div>

        {/* Name lives here too — it's part of the card, and Edit used to be the
            only thing this button did. */}
        <div className="card" style={{ marginBottom: 14 }}>
          {!editingName ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Username</div>
                <b style={{ fontFamily: 'var(--font-display)', fontSize: 18, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                  @{profile.username}
                </b>
              </div>
              <button onClick={startEditName} className="pill" style={{ fontSize: 12, padding: '5px 12px', fontWeight: 800, flexShrink: 0 }}>
                ✏️ Change
              </button>
            </div>
          ) : (
            <>
              <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Username</div>
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="username"
                maxLength={16}
                autoCapitalize="none"
                autoCorrect="off"
                autoFocus
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <Button variant="gold" onClick={saveName} disabled={savingName}>{savingName ? '…' : 'Save'}</Button>
                <Button variant="ghost" onClick={() => setEditingName(false)} disabled={savingName}>Cancel</Button>
              </div>
              {nameErr && <p style={{ color: 'var(--coral)', fontSize: 13, marginTop: 6 }}>{nameErr}</p>}
            </>
          )}
        </div>

        {/* Character, skins, items, card background, borders, badges. */}
        <CustomizeSection />

        <p className="faint" style={{ fontSize: 11, textAlign: 'center', marginBottom: 10, lineHeight: 1.4 }}>
          Everything saves as you tap — the card above is exactly what other players see.
        </p>
        <Button variant="gold" full onClick={closeCustomize}>Done</Button>
      </Page>
    )
  }

  return (
    <Page>
      {/* Your player card — the exact thing everyone else sees when they tap
          your pfp, background and all, so customizing it has a visible home. */}
      <div style={{ marginBottom: 18 }}>
        <PlayerCard
          p={cardData}
          actions={
            <>
              <button onClick={openCustomize} aria-label="Customize your card" className="pill" style={{ fontSize: 12, padding: '4px 10px', flexShrink: 0 }}>
                ✨ Customize
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
            </>
          }
        />
      </div>

      {/* Invite friends — referral code + progress toward the carried-cross look.
          Collapsed by default behind an obvious Show/Hide button; the header
          keeps the friend count visible so the goal still reads when closed. */}
      {profile.referralCode && (
        <Collapsible icon="🎁" title="Invite friends" meta={`${Math.min(profile.referralCount ?? 0, 5)}/5`}>
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
          <p className="faint" style={{ fontSize: 11, lineHeight: 1.4 }}>
            Friends enter your code (or tap your link) when they create an account.
          </p>
        </Collapsible>
      )}

      {/* Cards and Buddies used to own tabs of their own. They're the same full
          screens, just folded in here behind obvious dropdowns. */}
      <Collapsible icon="🃏" title="Cards" meta={`${cards} collected`}>
        <CollectionSection />
      </Collapsible>

      <Collapsible icon="🤝" title="Bible Buddies">
        <BuddiesSection />
      </Collapsible>

      {/* Account */}
      {/* Not a row in a list — a book, sitting on the profile, that opens. It
          sits above the account plumbing because it's the thing a player comes
          back to look at. */}
      <h3 style={{ fontSize: 16, margin: '18px 0 10px' }} className="dim">Your Bible</h3>
      <div style={{ marginBottom: 6 }}>
        <BibleCover />
      </div>

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
