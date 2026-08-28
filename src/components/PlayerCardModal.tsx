import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { PlayerCard, type PlayerCardData } from '@/components/PlayerCard'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/store/auth'
import { useCollection } from '@/store/collection'
import { useBuddies } from '@/store/buddies'
import { useSeason } from '@/store/season'
import { titleById } from '@/data/season'
import { useJuice } from '@/juice/useJuice'
import { Button } from '@/components/Button'
import { WashFeetButton } from '@/components/WashFeetButton'
import { supabase } from '@/lib/supabase'
import { ProfileHero } from '@/features/profile/ProfileHero'
import { denominationColor, denominationName } from '@/data/denominations'
import { RoomVisitSheet } from '@/features/room/RoomVisitSheet'
import { GiveGiftSheet } from '@/features/gifts/GiveGiftSheet'

// Tap any avatar anywhere and their card pops up. A single provider owns the
// one open card, so avatars stay dumb: they just say "open @handle".
interface Ctx {
  open: (username: string) => void
}
const PlayerCardCtx = createContext<Ctx>({ open: () => {} })

export const usePlayerCard = () => useContext(PlayerCardCtx)

export function PlayerCardProvider({ children }: { children: ReactNode }) {
  const [handle, setHandle] = useState<string | null>(null)
  const open = useCallback((username: string) => setHandle(username.replace(/^@/, '')), [])

  return (
    <PlayerCardCtx.Provider value={{ open }}>
      {children}
      <AnimatePresence>
        {handle && <CardSheet username={handle} onClose={() => setHandle(null)} />}
      </AnimatePresence>
    </PlayerCardCtx.Provider>
  )
}

function CardSheet({ username, onClose }: { username: string; onClose: () => void }) {
  const navigate = useNavigate()
  const juice = useJuice()
  const me = useAuth((s) => s.profile)
  const isGuest = useAuth((s) => s.mode) === 'local'
  const { buddies, load: loadBuddies, sendRequest } = useBuddies()
  const myCards = useCollection((s) => s.owned.length)
  const loadCollection = useCollection((s) => s.load)
  const collectionLoaded = useCollection((s) => s.loaded)
  const isMe = !!me && me.username.toLowerCase() === username.toLowerCase()

  const [data, setData] = useState<PlayerCardData | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [buddyMsg, setBuddyMsg] = useState<string | null>(null)
  const [washCheer, setWashCheer] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  // Going to see where somebody lives. The sheet sits at the app's sheet tier
  // (100) and this card at 110, so it opens UNDER the card you came from and
  // closing it puts you straight back — the same relationship the keep sheet
  // has with the player card opened from a figure inside it.
  const [visiting, setVisiting] = useState(false)
  // Handing over a relic. Same tier and the same reason as visiting.
  const [gifting, setGifting] = useState(false)

  // Someone else's card, and you have an account: you can act on it.
  const canAct = !isMe && !isGuest && !!supabase
  const alreadyBuddy = buddies.some((b) => b.username.toLowerCase() === username.toLowerCase())

  // Need the buddy list to know whether to offer "Add buddy" at all.
  useEffect(() => {
    if (canAct) loadBuddies()
  }, [canAct, loadBuddies])

  const addBuddy = async () => {
    setSending(true)
    juice.coin()
    const res = await sendRequest(username)
    setSending(false)
    setBuddyMsg(
      !res.ok
        ? res.reason === 'not_found' ? `No player @${username}` : 'Couldn’t send that request'
        : res.status === 'accepted' ? `You’re buddies with @${username}! 🎉` : `Buddy request sent 📨`,
    )
  }

  // Challenging runs through the normal battle flow — you play first, then it
  // goes to this player — so a card can't create a battle you haven't earned.
  const battle = () => {
    juice.coin()
    onClose()
    navigate('/battle/new', { state: { challenge: username } })
  }

  // Your equipped road title. Only ever rendered on your own card — see the
  // note on PlayerCardData.title.
  const myTitle = titleById(useSeason((s) => s.equipped.title))?.text ?? null

  // The CARDS stat needs the collection, which not every screen has loaded yet.
  useEffect(() => {
    if (isMe && !collectionLoaded) loadCollection()
  }, [isMe, collectionLoaded, loadCollection])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    // Your own card comes straight from the local profile — no round-trip, and
    // it reflects an unsaved background change immediately.
    if (isMe && me) {
      setData({
        username: me.username,
        avatarEmoji: me.avatarEmoji,
        avatarCharacter: me.avatarCharacter,
        avatarBorder: me.avatarBorder,
        avatarBadge: me.avatarBadge,
        cardBackground: me.cardBackground,
        pet: me.pet,
        xp: me.xp,
        level: me.level,
        currentStreak: me.currentStreak,
        longestStreak: me.longestStreak,
        totalPlays: me.totalPlays,
        cards: myCards,
        denomination: me.denomination,
        title: myTitle,
      })
      return
    }
    let alive = true
    ;(async () => {
      if (!supabase) { setErr('Player cards need an account.'); return }
      const { data: row, error } = await supabase.rpc('get_player_card', { p_username: username })
      if (!alive) return
      if (error || !row) { setErr(`Couldn’t load @${username}`); return }
      const r = row as Record<string, unknown>
      setData({
        username: r.username as string,
        avatarEmoji: (r.avatar_emoji as string) ?? '😇',
        avatarCharacter: (r.avatar_character as PlayerCardData['avatarCharacter']) ?? null,
        avatarBorder: (r.avatar_border as string) ?? 'default',
        avatarBadge: (r.avatar_badge as string | null) ?? null,
        cardBackground: (r.card_background as string | null) ?? null,
        // Added to get_player_card by 0071. An older server simply omits it and
        // the hero draws a figure with no companion — the usual fail-closed
        // shape, not a crash.
        pet: (r.pet as string | null) ?? null,
        xp: Number(r.xp ?? 0),
        level: Number(r.level ?? 1),
        currentStreak: Number(r.current_streak ?? 0),
        longestStreak: Number(r.longest_streak ?? 0),
        totalPlays: Number(r.total_plays ?? 0),
        cards: Number(r.cards ?? 0),
        denomination: (r.denomination as string | null) ?? null,
      })
    })()
    return () => { alive = false }
  }, [username, isMe, me, myCards, myTitle])

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.66)', display: 'grid', placeItems: 'center', zIndex: 110, padding: 18 }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`Player card for @${username}`}
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        // The card grew a portrait on top of it, so on a short phone the whole
        // dialog — hero, six stats, three rows of buttons — can be taller than
        // the viewport. It scrolls inside itself rather than being clipped by
        // the centring grid, which silently cut the buttons off the bottom
        // before this. `overscrollBehavior` keeps the page behind it still.
        style={{
          width: '100%',
          maxWidth: 420,
          maxHeight: 'calc(100dvh - 36px)',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        }}
      >
        {err ? (
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 30 }}>🃏</div>
            <p className="dim" style={{ marginTop: 8, fontSize: 14 }}>{err}</p>
          </div>
        ) : !data ? (
          <div className="card" style={{ textAlign: 'center', padding: 40 }}>
            <div className="floaty" style={{ fontSize: 34 }}>🃏</div>
          </div>
        ) : (
          <>
            {/* The look, at the size it was drawn for, with their companion —
                the same ProfileHero /you opens with, so a player's card and
                their own profile can't show two different figures.

                It goes ABOVE the numbers and the card drops its identity block
                (statsOnly), which is the rule the profile already follows: a
                portrait and a scoreboard on one screen, not an avatar chip
                twice. The faction moves up into the hero's caption rather than
                being lost with the identity block.

                140 rather than /you's 190: this sits over a stats card and
                three rows of buttons on a 320px phone. */}
            <div style={{ marginBottom: 10 }}>
              <ProfileHero
                spec={data.avatarCharacter}
                emoji={data.avatarEmoji}
                username={data.username}
                pet={data.pet}
                cardBackground={data.cardBackground}
                title={data.title}
                size={140}
                // The faction comes FIRST, for anyone: it left the card with the
                // identity block, and it is the one piece of identity the
                // pop-up would otherwise drop entirely. "This is you" is the
                // fallback on your own card when you have no faction yet.
                caption={
                  data.denomination ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: denominationColor(data.denomination),
                          boxShadow: `0 0 7px ${denominationColor(data.denomination)}`,
                        }}
                      />
                      {denominationName(data.denomination)}
                    </span>
                  ) : isMe ? (
                    'This is you'
                  ) : null
                }
              />
            </div>
            <PlayerCard p={data} compact statsOnly />
          </>
        )}

        {/* Act on the player you're looking at, rather than having to go find
            them again on another screen. */}
        {data && canAct && (
          <>
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: alreadyBuddy ? '1fr' : '1fr 1fr', gap: 10 }}>
              {!alreadyBuddy && (
                <Button variant="secondary" full onClick={addBuddy} disabled={sending || !!buddyMsg}>
                  {buddyMsg ? '✓ Sent' : sending ? '…' : '🤝 Add buddy'}
                </Button>
              )}
              <Button variant="gold" full onClick={battle}>⚔️ Battle</Button>
            </div>
            {/* Every other way to act on a person here is a challenge. This is
                the one that asks nothing back — and this card is the app's one
                place where a single other player is on screen, so it belongs
                here rather than on five separate rows. */}
            {/* The two gestures that aren't a challenge. Visiting is the cozy
                half of the multiplayer (read-only by construction — see
                RoomVisitSheet); giving is the only way an object in this app
                reaches a PERSON rather than a church. */}
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Button variant="secondary" full onClick={() => { juice.select(); setVisiting(true) }}>
                🚪 Their room
              </Button>
              <Button variant="secondary" full onClick={() => { juice.select(); setGifting(true) }}>
                🎁 Give a relic
              </Button>
            </div>
            <div style={{ marginTop: 10 }}>
              <WashFeetButton
                username={username}
                size="wide"
                onWashed={(m) => { if (m) { juice.celebrate(); setWashCheer(`${m.emoji} ${m.name}`) } }}
              />
            </div>
            {washCheer && (
              <p className="center" style={{ color: 'var(--gold)', fontSize: 13, marginTop: 6, fontWeight: 800 }}>{washCheer}</p>
            )}
          </>
        )}
        {buddyMsg && (
          <p className="center" style={{ color: 'var(--good)', fontSize: 13, marginTop: 8 }}>{buddyMsg}</p>
        )}

        {visiting && <RoomVisitSheet username={username} onClose={() => setVisiting(false)} />}
        {gifting && <GiveGiftSheet username={username} onClose={() => setGifting(false)} />}

        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button className="pill" onClick={onClose} style={{ fontWeight: 800, fontSize: 13, padding: '8px 16px' }}>Close</button>
        </div>
      </motion.div>
    </div>
  )
}
