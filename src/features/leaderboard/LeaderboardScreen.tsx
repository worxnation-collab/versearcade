import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { useAuth } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import { Avatar } from '@/components/Avatar'
import { ThroneIcon } from '@/components/ThroneIcon'
import { useCollection } from '@/store/collection'
import { useJuice } from '@/juice/useJuice'
import { THRONE_KEY } from '@/data/collectibles'
import type { AvatarSpec } from '@/types'
import { CardBg } from '@/components/CardBg'

interface LbRow {
  rank: number
  username: string
  avatar_emoji: string
  avatar_border?: string
  avatar_badge?: string | null
  avatar_character?: AvatarSpec | null
  /** Equipped player-card background key; drives the row's colour wash. */
  card_background?: string | null
  xp: number
  level: number
}
type FeaturedRow = Omit<LbRow, 'rank'>
interface Board {
  featured?: FeaturedRow[]
  top: LbRow[]
  me: LbRow | null
  total: number
}

const medal = (rank: number) => (rank === 2 ? '🥈' : rank === 3 ? '🥉' : null)

// Standalone /leaderboard route — kept for deep links and shares. The ranks
// themselves now live inside the Play tab, so this is the same body under a
// full-page header.
export default function LeaderboardScreen() {
  return (
    <Page>
      <div style={{ paddingTop: 8, paddingBottom: 96 }}>
        <div className="center" style={{ marginBottom: 16 }}>
          <div className="floaty" style={{ fontSize: 44 }}>🏆</div>
          <h1 style={{ fontSize: 28, marginTop: 4 }}>Worldwide Ranks</h1>
        </div>
        <LeaderboardSection />
      </div>
    </Page>
  )
}

// The ranks themselves, with no page chrome — embeddable in a collapsible on
// the Play tab as well as on its own route above.
export function LeaderboardSection() {
  const navigate = useNavigate()
  const mode = useAuth((s) => s.mode)
  const profile = useAuth((s) => s.profile)
  const juice = useJuice()
  const [board, setBoard] = useState<Board | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!supabase) {
        setLoading(false)
        return
      }
      const { data, error } = await supabase.rpc('get_leaderboard', { p_limit: 100 })
      if (!alive) return
      if (error) setErr(error.message)
      else setBoard(data as Board)
      setLoading(false)
    })()
    return () => {
      alive = false
    }
  }, [])

  const meInTop = board?.me && board.top.some((r) => r.rank === board.me!.rank)

  // Are you the one who holds the throne? `me` is authoritative for signed-in
  // players; guests have no `me` row, so fall back to matching the #1 row's
  // handle against the local profile.
  const kingRow = board?.top?.find((r) => r.rank === 1) ?? null
  const iAmKing =
    board?.me?.rank === 1 ||
    (!!kingRow && !!profile?.username && kingRow.username === profile.username)

  // First time you're seen on the throne, mint the mythic "Leper King" card
  // (permanent — it stays in your collection even after you're dethroned) and
  // celebrate. Guarded so it fires once per visit, not on every render.
  const crowned = useRef(false)
  useEffect(() => {
    if (!iAmKing || crowned.current) return
    crowned.current = true
    useCollection
      .getState()
      .grant([THRONE_KEY])
      .then((fresh) => {
        if (fresh.includes(THRONE_KEY)) juice.celebrate()
      })
  }, [iAmKing, juice])

  return (
    <>
      <div>
        <p className="dim center" style={{ marginBottom: 14, fontSize: 13 }}>
          All-time, by XP{board ? ` · ${board.total.toLocaleString()} players` : ''}
        </p>

        {iAmKing && <ThroneBanner />}

        {board?.featured && board.featured.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <p className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Featured</p>
            <div style={{ display: 'grid', gap: 8 }}>
              {board.featured.map((f) => <FeaturedRow key={f.username} f={f} />)}
            </div>
          </div>
        )}

        {mode === 'local' || !supabase ? (
          <div className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 34 }}>🌍</div>
            <p style={{ margin: '8px 0 14px' }}>
              Create a free account to join the worldwide leaderboard and climb the ranks — your
              streak and XP sync across devices.
            </p>
            <Button variant="gold" full onClick={() => navigate('/auth')}>
              Sign in / Create account
            </Button>
          </div>
        ) : loading ? (
          <div className="center" style={{ padding: 48 }}>
            <div className="floaty" style={{ fontSize: 40 }}>🏆</div>
          </div>
        ) : err ? (
          <p style={{ color: 'var(--coral)', textAlign: 'center' }}>{err}</p>
        ) : board && board.top.length > 0 ? (
          <>
            <div style={{ display: 'grid', gap: 8 }}>
              {board.top.map((r) => (
                <Row key={r.rank} r={r} me={r.username === profile?.username} />
              ))}
            </div>
            {board.me && !meInTop && (
              <>
                <p className="faint center" style={{ margin: '16px 0 8px', letterSpacing: '0.3em' }}>
                  •••
                </p>
                <Row r={board.me} me />
              </>
            )}
          </>
        ) : (
          <p className="dim" style={{ textAlign: 'center' }}>No one has played yet — be the first!</p>
        )}
      </div>
    </>
  )
}

// Shown to the reigning #1 — celebrates the throne and the card it unlocks.
function ThroneBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 220, damping: 20 }}
      className="card"
      style={{
        marginBottom: 14,
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        borderColor: 'var(--gold)',
        background:
          'linear-gradient(120deg, rgba(255,210,63,0.16), rgba(255,246,207,0.06) 60%, transparent)',
        boxShadow: '0 0 26px rgba(255,210,63,0.30)',
      }}
    >
      <ThroneIcon size={38} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18 }} className="gradient-text">
          You hold the throne
        </div>
        <p className="dim" style={{ fontSize: 13, marginTop: 2 }}>
          #1 in the world. <b>The Leper King</b> card is yours forever — find it in your
          Collection.
        </p>
      </div>
    </motion.div>
  )
}

// A curated spotlight player — shown above the ranks, not competing for #1.
function FeaturedRow({ f }: { f: FeaturedRow }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="card"
      style={{
        // Same grid-item min-width:auto trap as the ranked rows: without this
        // the score is pushed off the right edge of a phone.
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', minWidth: 0,
        borderColor: 'var(--sky)',
        background: 'linear-gradient(120deg, rgba(94,231,223,0.12), transparent 62%)',
      }}
    >
      <div style={{ width: 34, display: 'grid', placeItems: 'center', fontSize: 18 }}>⭐</div>
      <Avatar emoji={f.avatar_emoji} character={f.avatar_character} size={34} ring={false} border={f.avatar_border} badge={f.avatar_badge} username={f.username} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {f.username}
          <span style={{ color: 'var(--sky)', fontSize: 11, marginLeft: 6, letterSpacing: '0.04em' }}>⭐ Featured</span>
        </div>
        <div className="faint" style={{ fontSize: 12 }}>Level {f.level}</div>
      </div>
      <div
        style={{ fontFamily: 'var(--font-display)', fontSize: 18, flexShrink: 0, whiteSpace: 'nowrap' }}
        className="gradient-text"
      >
        {f.xp.toLocaleString()}
        <span className="faint" style={{ fontSize: 11, marginLeft: 3 }}>XP</span>
      </div>
    </motion.div>
  )
}

function Row({ r, me }: { r: LbRow; me: boolean }) {
  // Ids must be unique per rendered instance, and a hundred rows are on screen
  // at once.
  const artId = `lb-${r.rank}-${r.card_background ?? 'default'}`
  const isKing = r.rank === 1
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      className="card"
      style={{
        // The row is a grid item, and grid items default to min-width:auto, so
        // without this it refuses to shrink below its own content and pushes the
        // score off the right edge of a phone.
        minWidth: 0,
        position: 'relative',
        overflow: 'hidden',
        padding: 0,
        borderColor: isKing ? 'var(--gold)' : me ? 'var(--gold)' : undefined,
        boxShadow: isKing ? '0 0 22px rgba(255,210,63,0.28)' : undefined,
      }}
    >
      {/* The player's own card background, as a wash behind the row. Same art
          the card uses, cropped to a band — it is the cheapest way to make a
          list of a hundred strangers feel like a list of people. */}
      <CardBg bgKey={r.card_background} id={artId} />
      {/* Scrim: heavy on the left where the name and level sit, lighter on the
          right so the art still reads. Without it the brighter scenes take the
          username with them. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: isKing
            ? 'linear-gradient(90deg, rgba(8,3,24,0.80) 0%, rgba(8,3,24,0.52) 55%, rgba(255,210,63,0.12) 100%)'
            : me
              ? 'linear-gradient(90deg, rgba(8,3,24,0.82) 0%, rgba(255,209,102,0.10) 100%)'
              : 'linear-gradient(90deg, rgba(8,3,24,0.84) 0%, rgba(8,3,24,0.56) 100%)',
        }}
      />
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 14px',
          minWidth: 0,
        }}
      >
      <div
        style={{
          width: 34,
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'var(--font-display)',
          fontSize: medal(r.rank) ? 22 : 16,
          color: 'var(--ink-faint)',
        }}
      >
        {isKing ? <ThroneIcon size={24} /> : (medal(r.rank) ?? r.rank)}
      </div>
      <Avatar emoji={r.avatar_emoji} character={r.avatar_character} size={34} ring={false} border={r.avatar_border} badge={r.avatar_badge} username={r.username} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 800,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {r.username}
          {isKing && (
            <span style={{ color: 'var(--gold)', fontSize: 11, marginLeft: 6, letterSpacing: '0.04em' }}>
              👑 The Leper King
            </span>
          )}
          {me && <span style={{ color: 'var(--gold)', fontSize: 12, marginLeft: 6 }}>you</span>}
        </div>
        <div className="faint" style={{ fontSize: 12 }}>
          Level {r.level}
        </div>
      </div>
      <div
        style={{ fontFamily: 'var(--font-display)', fontSize: 18, flexShrink: 0, whiteSpace: 'nowrap' }}
        className="gradient-text"
      >
        {r.xp.toLocaleString()}
        <span className="faint" style={{ fontSize: 11, marginLeft: 3 }}>
          XP
        </span>
      </div>
      </div>
    </motion.div>
  )
}
