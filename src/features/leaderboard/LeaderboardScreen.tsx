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

interface LbRow {
  rank: number
  username: string
  avatar_emoji: string
  avatar_border?: string
  avatar_badge?: string | null
  avatar_character?: AvatarSpec | null
  xp: number
  level: number
}
interface Board {
  top: LbRow[]
  me: LbRow | null
  total: number
}

const medal = (rank: number) => (rank === 2 ? '🥈' : rank === 3 ? '🥉' : null)

export default function LeaderboardScreen() {
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
    <Page>
      <div style={{ paddingTop: 8, paddingBottom: 96 }}>
        <div className="center" style={{ marginBottom: 16 }}>
          <div className="floaty" style={{ fontSize: 44 }}>🏆</div>
          <h1 style={{ fontSize: 28, marginTop: 4 }}>Worldwide Ranks</h1>
          <p className="dim" style={{ marginTop: 4 }}>
            All-time, by XP{board ? ` · ${board.total.toLocaleString()} players` : ''}
          </p>
        </div>

        {iAmKing && <ThroneBanner />}

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
    </Page>
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
      <ThroneIcon size={46} />
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

function Row({ r, me }: { r: LbRow; me: boolean }) {
  const isKing = r.rank === 1
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      className="card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 14px',
        borderColor: isKing ? 'var(--gold)' : me ? 'var(--gold)' : undefined,
        background: isKing
          ? 'linear-gradient(120deg, rgba(255,210,63,0.14), rgba(255,246,207,0.04) 55%, transparent)'
          : me
            ? 'rgba(255,209,102,0.10)'
            : undefined,
        boxShadow: isKing ? '0 0 22px rgba(255,210,63,0.28)' : undefined,
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
        {isKing ? <ThroneIcon size={30} /> : (medal(r.rank) ?? r.rank)}
      </div>
      <Avatar emoji={r.avatar_emoji} character={r.avatar_character} size={34} ring={false} border={r.avatar_border} badge={r.avatar_badge} />
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
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 18 }} className="gradient-text">
        {r.xp.toLocaleString()}
        <span className="faint" style={{ fontSize: 11, marginLeft: 3 }}>
          XP
        </span>
      </div>
    </motion.div>
  )
}
