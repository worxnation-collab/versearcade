import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { QuizRunner } from '@/features/daily/QuizRunner'
import { useBattles, type PoolUser } from '@/store/battles'
import { newBattleSeed, battleVerse } from './battle'
import { shareResult, APP_URL } from '@/features/daily/shareCard'
import { useJuice } from '@/juice/useJuice'
import type { PlayResult } from '@/types'

// Challenger flow: play a fresh random-verse quiz, then pick who to challenge
// from the player list. Each invite lands as a pending challenge on that
// player's Battle tab. (A share link is still available for inviting people who
// aren't on Verse Arcade yet.)
export default function BattleNew() {
  const navigate = useNavigate()
  const seed = useMemo(() => newBattleSeed(), [])
  const verse = useMemo(() => battleVerse(seed), [seed])
  const [result, setResult] = useState<PlayResult | null>(null)

  if (!result) {
    return (
      <QuizRunner
        verse={verse}
        onComplete={async (r) => setResult(r)}
        onExit={() => navigate('/battle')}
        label="⚔️ Bible Battle"
      />
    )
  }
  return <InvitePicker seed={seed} result={result} />
}

function InvitePicker({ seed, result }: { seed: number; result: PlayResult }) {
  const navigate = useNavigate()
  const juice = useJuice()
  const { createBattle, userPool } = useBattles()
  const [users, setUsers] = useState<PoolUser[] | null>(null)
  const [q, setQ] = useState('')
  const [sent, setSent] = useState<Record<string, boolean>>({})
  const [shareMsg, setShareMsg] = useState<string | null>(null)

  useEffect(() => {
    userPool().then(setUsers)
  }, [userPool])

  const filtered = (users ?? []).filter((u) =>
    q.trim() ? u.username.toLowerCase().includes(q.trim().toLowerCase()) : true,
  )
  const sentCount = Object.keys(sent).length

  const invite = async (u: PoolUser) => {
    if (sent[u.username]) return
    juice.coin()
    const id = await createBattle(seed, result.score, result.timeMs, u.username)
    if (id) {
      juice.correct?.()
      setSent((s) => ({ ...s, [u.username]: true }))
    }
  }

  const [shareId, setShareId] = useState<string | null>(null)
  const shareLink = async () => {
    juice.coin()
    // Reuse one broadcast challenge for repeated shares — anyone who opens it
    // can take you on (each gets their own battle vs your score).
    let id = shareId
    if (!id) {
      id = await createBattle(seed, result.score, result.timeMs, undefined, true)
      if (!id) {
        setShareMsg('Could not create the invite — try again.')
        return
      }
      setShareId(id)
    }
    const r = await shareResult(`⚔️ I challenge you to a Bible Battle! Same quiz, beat my score:\n${APP_URL}/battle/${id}`)
    setShareMsg(r === 'shared' ? 'Shared!' : r === 'copied' ? 'Link copied!' : 'Could not share')
  }

  return (
    <Page noNav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <button className="pill" onClick={() => navigate('/battle')} aria-label="Done">✕</button>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Send your challenge</b>
      </div>

      <div className="card" style={{ textAlign: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 40 }}>⚔️</div>
        <h2 style={{ fontSize: 22, marginTop: 4 }}>
          You scored <span className="gradient-text">{result.score.toLocaleString()}</span>
        </h2>
        <p className="dim" style={{ marginTop: 6, fontSize: 14 }}>
          Two ways to send it — challenge players here, or share the link anywhere.
        </p>
      </div>

      {/* External share — the growth button: Facebook, texts, group chats. */}
      <Button variant="secondary" full onClick={shareLink}>
        📤 Share the battle — Facebook, texts, anywhere
      </Button>
      {shareMsg && <p style={{ color: 'var(--good)', fontSize: 13, marginTop: 8, textAlign: 'center' }}>{shareMsg}</p>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 12px' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--stroke)' }} />
        <span className="faint" style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em' }}>OR CHALLENGE PLAYERS HERE</span>
        <div style={{ flex: 1, height: 1, background: 'var(--stroke)' }} />
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search players by @username"
        autoCapitalize="none"
        autoCorrect="off"
        style={{ marginBottom: 12 }}
      />

      {users === null ? (
        <div className="center" style={{ padding: 30 }}>
          <div className="floaty" style={{ fontSize: 34 }}>⚔️</div>
        </div>
      ) : filtered.length === 0 ? (
        <p className="faint center" style={{ fontSize: 14, padding: '10px 0' }}>
          {q.trim() ? 'No players match that name.' : 'No other players yet — share a link below to invite someone.'}
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {filtered.map((u) => {
            const done = !!sent[u.username]
            return (
              <div
                key={u.username}
                className="card"
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px' }}
              >
                <Avatar emoji={u.avatar_emoji} character={u.avatar_character} size={38} ring={false} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                    @{u.username}
                  </b>
                  <span className="faint" style={{ fontSize: 12 }}>Level {u.level}</span>
                </div>
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={() => invite(u)}
                  disabled={done}
                  className="pill"
                  style={{
                    fontWeight: 800,
                    fontSize: 13,
                    padding: '8px 14px',
                    background: done ? 'transparent' : 'var(--gold)',
                    color: done ? 'var(--good)' : '#241f0a',
                    border: done ? '1px solid var(--good)' : 'none',
                  }}
                >
                  {done ? '✓ Sent' : 'Challenge'}
                </motion.button>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <Button variant="gold" full onClick={() => navigate('/battle')}>
          {sentCount ? `Done — ${sentCount} challenge${sentCount > 1 ? 's' : ''} sent` : 'Done'}
        </Button>
      </div>
      <div style={{ height: 30 }} />
    </Page>
  )
}
