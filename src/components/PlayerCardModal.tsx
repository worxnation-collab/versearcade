import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { PlayerCard, type PlayerCardData } from '@/components/PlayerCard'
import { useAuth } from '@/store/auth'
import { useCollection } from '@/store/collection'
import { supabase } from '@/lib/supabase'

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
  const me = useAuth((s) => s.profile)
  const myCards = useCollection((s) => s.owned.length)
  const loadCollection = useCollection((s) => s.load)
  const collectionLoaded = useCollection((s) => s.loaded)
  const isMe = !!me && me.username.toLowerCase() === username.toLowerCase()

  const [data, setData] = useState<PlayerCardData | null>(null)
  const [err, setErr] = useState<string | null>(null)

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
        xp: me.xp,
        level: me.level,
        currentStreak: me.currentStreak,
        longestStreak: me.longestStreak,
        totalPlays: me.totalPlays,
        cards: myCards,
        denomination: me.denomination,
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
  }, [username, isMe, me, myCards])

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
        style={{ width: '100%', maxWidth: 420 }}
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
          <PlayerCard p={data} compact />
        )}
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button className="pill" onClick={onClose} style={{ fontWeight: 800, fontSize: 13, padding: '8px 16px' }}>Close</button>
        </div>
      </motion.div>
    </div>
  )
}
