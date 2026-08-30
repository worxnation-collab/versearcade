import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { Page } from '@/components/Page'
import { BibleCover } from '@/features/bible/BibleCover'
import { Button } from '@/components/Button'
import { PlayerCard } from '@/components/PlayerCard'
import { useAuth } from '@/store/auth'
import { useJuice } from '@/juice/useJuice'
import { shareResult, inviteUrl } from '@/features/daily/shareCard'
import { useCollection } from '@/store/collection'
import { Collapsible } from '@/components/Collapsible'
import { CollectionSection } from '@/features/collection/CollectionScreen'
import { InventorySection } from '@/features/collection/InventorySection'
import { useInventory } from '@/store/inventory'
import { BuddiesSection } from '@/features/buddies/BuddiesScreen'
import { BasinSection } from '@/features/washing/BasinSection'
import { useBuddies } from '@/store/buddies'
import { useGifts } from '@/store/gifts'
import { useWashing } from '@/store/washing'
import { useSeason } from '@/store/season'
import { titleById } from '@/data/season'
import { CustomizeSection } from './CustomizeSection'
import { ProfileHero } from './ProfileHero'
import { RoomSection } from '@/features/room/RoomSection'
import { SettingsSheet } from './SettingsSheet'

export default function ProfileScreen() {
  const navigate = useNavigate()
  const juice = useJuice()
  const inHand = useInventory((s) =>
    Object.values(s.items).reduce((n, q) => n + (q > 0 ? q : 0), 0),
  )
  const loadInventory = useInventory((s) => s.load)
  const { profile, mode, changeUsername, signOut, deleteAccount } = useAuth()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // ?customize=1 deep-links straight into the customizer — the home screen's
  // "build your character" nudge uses it, so it doesn't dump you on the profile
  // with nothing obviously to do.
  const [searchParams, setSearchParams] = useSearchParams()
  const wantsCustomize = searchParams.get('customize') === '1'
  const [customizing, setCustomizing] = useState(wantsCustomize)
  // ?inventory=1 does the same for the bag — the home screen's one-time relic
  // nudge uses it. Captured once, because the param is cleared straight after
  // and the section must stay open when it goes.
  const [openInventory] = useState(() => searchParams.get('inventory') === '1')
  const inventoryRef = useRef<HTMLDivElement>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [nameErr, setNameErr] = useState<string | null>(null)
  const [savingName, setSavingName] = useState(false)
  const [refFlash, setRefFlash] = useState<string | null>(null)
  // Buddy requests have to be counted from out here, not from inside the
  // drawer: Collapsible only mounts its children once opened, so leaving the
  // load to BuddiesSection meant the count was always 0 until you'd already
  // found the thing the count exists to point at.
  const buddyRequests = useBuddies((st) => st.requests.length)
  // Same "something for you" signal the bottom nav shows, so the pill and the
  // tab can't disagree about whether the mailbox has anything in it.
  const unseenGifts = useGifts((st) => st.unseen)
  const mailWaiting = buddyRequests + unseenGifts
  const loadBuddies = useBuddies((st) => st.load)
  useEffect(() => {
    if (mode === 'online') void loadBuddies()
  }, [mode, loadBuddies])
  // Same reason the buddy count is loaded out here: a folded section that
  // reports nothing is a row nobody opens. The basin's meta is the one number
  // this feature has, and it's yours alone.
  const washLifetime = useWashing((st) => st.lifetime)
  const loadWashing = useWashing((st) => st.load)
  useEffect(() => {
    if (mode === 'online') void loadWashing()
  }, [mode, loadWashing])
  const owned = useCollection((s) => s.owned)
  const loadCollection = useCollection((s) => s.load)
  useEffect(() => {
    loadCollection()
    // The header's "N in hand" used to read zero until the section was opened,
    // because InventorySection was the only thing that ever loaded the store —
    // and a folded section reporting nothing is exactly what the nudge exists
    // to fix.
    void loadInventory()
  }, [loadCollection, loadInventory])
  useEffect(() => {
    if (wantsCustomize) setCustomizing(true)
  }, [wantsCustomize])

  // Above the early return: a hook can't sit behind a conditional.
  const myTitle = titleById(useSeason((s) => s.equipped.title))?.text ?? null

  // Arriving from the relic nudge: the bag is already open, so put it under the
  // thumb instead of leaving it below the fold. A beat late, so the expand
  // animation isn't moving the target while we aim at it. The param is dropped
  // on the way past — a back-navigation shouldn't re-scroll.
  useEffect(() => {
    if (!openInventory) return
    const t = setTimeout(() => {
      inventoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('inventory')
          return next
        },
        { replace: true },
      )
    }, 60)
    return () => clearTimeout(t)
  }, [openInventory, setSearchParams])

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
    title: myTitle,
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
          <ProfileHero
            spec={profile.avatarCharacter}
            emoji={profile.avatarEmoji}
            username={profile.username}
            pet={profile.pet}
            cardBackground={profile.cardBackground}
            title={myTitle}
          />
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
      {/* You, at the size the skin was drawn for, with your pet and the
          background you earned. The tab is called You, so it opens with you in
          it — everywhere else your character is a 44px cropped circle. It's a
          portrait: no numbers, because the card right underneath is all
          numbers. */}
      <div style={{ marginBottom: 14 }}>
        <ProfileHero
          spec={profile.avatarCharacter}
          emoji={profile.avatarEmoji}
          username={profile.username}
          pet={profile.pet}
          cardBackground={profile.cardBackground}
          title={myTitle}
        />
      </div>

      {/* The numbers, and only the numbers. The hero above is already you at
          full size on your own background, so the card here drops its identity
          block — the same avatar and handle twice on one screen was the thing
          that made the hero feel like a duplicate rather than the header. What
          other players see when they tap your pfp is unchanged: that's the same
          component with its identity intact (PlayerCardModal). */}
      <div style={{ marginBottom: 18 }}>
        <PlayerCard
          p={cardData}
          statsOnly
          actions={
            <>
              <button onClick={openCustomize} aria-label="Customize your card" className="pill" style={{ fontSize: 12, padding: '4px 10px', flexShrink: 0 }}>
                ✨ Customize
              </button>
              <button
                onClick={() => { juice.select?.(); navigate('/journal') }}
                aria-label="Journal"
                className="pill"
                style={{ fontSize: 12, padding: '4px 10px', flexShrink: 0 }}
              >
                📔 Journal
              </button>
              {/* The mailbox. It lives behind a pill rather than a sixth tab
                  (five already have to clear a 320px phone), and it carries the
                  same one dot the nav does — no count, nothing to clear. */}
              <button
                onClick={() => { juice.select?.(); navigate('/mail') }}
                aria-label="Mail"
                className="pill"
                style={{ fontSize: 12, padding: '4px 10px', flexShrink: 0, position: 'relative' }}
              >
                📬 Mail
                {mailWaiting > 0 && (
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute', top: -2, right: -2, width: 8, height: 8,
                      borderRadius: 999, background: 'var(--gold)',
                      border: '2px solid rgba(20,10,52,0.95)', boxSizing: 'content-box',
                    }}
                  />
                )}
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

      {/* The fourth little world, and the only one that is yours alone. It opens
          its section here rather than sitting behind a row that describes it —
          the same rule the road, the hall and the churchyard follow. Below the
          card rather than above it, because the hero and the card are a pair:
          a portrait and its numbers, and a room between them would split them. */}
      <RoomSection />

      {/* Not a row in a list — a book, sitting on the profile, that opens.
          It sits directly under the room because those two are the pair this
          tab is actually for: the place that is yours, and the book that is
          yours. It used to be ninth, below five folded rows — "the thing a
          player comes back to look at", parked under everything they don't. */}
      <h3 style={{ fontSize: 16, margin: '18px 0 10px' }} className="dim">Your Bible</h3>
      <div style={{ marginBottom: 6 }}>
        <BibleCover />
      </div>

      {/* ── Your people ──────────────────────────────────────────────────
          Three folded rows that are all about somebody else, under one word
          that says so. Buddies, Basin and Invite friends used to sit in an
          undifferentiated stack of six identical closed rows with Inventory and
          Cards — same shape, same chevron, no way to tell from the outside
          which ones were people and which were things. The heading is the
          whole fix: it costs one line and it halves what you have to read to
          find the row you came for. */}
      <h3 style={{ fontSize: 16, margin: '18px 0 10px' }} className="dim">Your people</h3>
      {/* This one used to advertise nothing, so a player with people waiting
          saw an identical closed row and 71% of every buddy request ever sent
          was still unanswered. It now counts, and opens itself when the answer
          is someone else's to receive. */}
      <Collapsible
        icon="🤝"
        title="Bible Buddies"
        meta={buddyRequests > 0 ? `${buddyRequests} waiting` : undefined}
        defaultOpen={buddyRequests > 0}
      >
        <BuddiesSection />
      </Collapsible>

      {/* The one social gesture in the app that asks nothing back. Sits under
          Buddies because it's the same people, one row down. */}
      <Collapsible
        icon="🫗"
        title="The Basin"
        meta={washLifetime > 0 ? `${washLifetime} washed` : 'wash a friend’s feet'}
      >
        <BasinSection />
      </Collapsible>

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
                const link = inviteUrl(profile.referralCode)
                const r = await shareResult(`Join me on Verse Arcade! Use my code ${profile.referralCode} — daily Bible verse games, streaks & battles.\n${link}`, link)
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

      {/* ── Your things ──────────────────────────────────────────────────
          The other half of that stack: what you're carrying and what you've
          collected. Same reasoning as "Your people" above. */}
      <h3 style={{ fontSize: 16, margin: '18px 0 10px' }} className="dim">Your things</h3>
      {/* What you're holding, and what it's for. Sits above the collection wall
          because it's the actionable one — the wall is a gallery, this is a bag.
          Cards used to own a tab; it's the same full screen (/collection), just
          folded in here. */}
      <div ref={inventoryRef} style={{ scrollMarginTop: 12 }}>
        <Collapsible icon="🎒" title="Inventory" meta={`${inHand} in hand`} defaultOpen={openInventory}>
          <InventorySection />
        </Collapsible>
      </div>

      <Collapsible icon="🃏" title="Cards" meta={`${cards} collected`}>
        <CollectionSection />
      </Collapsible>

      <h3 style={{ fontSize: 16, margin: '18px 0 10px' }} className="dim">Account</h3>
      <div style={{ display: 'grid', gap: 10 }}>
        {mode === 'local' && (
          <Button variant="gold" full onClick={() => navigate('/auth')}>✨ Create account to sync & invite friends</Button>
        )}
        {/* Await the sign-out before leaving. Firing it and navigating in the
            same tick left `profile` still set when Landing mounted, so Landing
            bounced us to /play, and /play's guard then bounced us on to the
            onboarding flow — a screen with no way back into an account. */}
        {mode === 'online' && (
          <Button
            variant="secondary"
            full
            onClick={async () => {
              await signOut()
              navigate('/', { replace: true })
            }}
          >
            Sign out
          </Button>
        )}

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
