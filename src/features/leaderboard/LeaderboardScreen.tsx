import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { useAuth } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import { Avatar } from '@/components/Avatar'

interface LbRow {
  rank: number
  username: string
  avatar_emoji: string
  avatar_border?: string
  avatar_badge?: string | null
  xp: number
  level: number
}
interface Board {
  top: LbRow[]
  me: LbRow | null
  total: number
}

const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null)

export default function LeaderboardScreen() {
  const navigate = useNavigate()
  const mode = useAuth((s) => s.mode)
  const profile = useAuth((s) => s.profile)
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

function Row({ r, me }: { r: LbRow; me: boolean }) {
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
        borderColor: me ? 'var(--gold)' : undefined,
        background: me ? 'rgba(255,209,102,0.10)' : undefined,
      }}
    >
      <div
        style={{
          width: 34,
          textAlign: 'center',
          fontFamily: 'var(--font-display)',
          fontSize: medal(r.rank) ? 22 : 16,
          color: 'var(--ink-faint)',
        }}
      >
        {medal(r.rank) ?? r.rank}
      </div>
      <Avatar emoji={r.avatar_emoji} size={34} ring={false} border={r.avatar_border} badge={r.avatar_badge} />
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
