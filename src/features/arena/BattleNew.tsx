import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { QuizRunner } from '@/features/daily/QuizRunner'
import { useBattles } from '@/store/battles'
import { useBuddies, type BuddyCard } from '@/store/buddies'
import { newBattleSeed, battleVerse } from './battle'
import { shareResult, APP_URL } from '@/features/daily/shareCard'
import { useJuice } from '@/juice/useJuice'
import type { PlayResult } from '@/types'

// Challenger flow: play a fresh random-verse quiz, then pick who to challenge —
// from your BUDDIES first, plus a few suggested active players so a friendless
// user still gets an opponent likely to battle back. Challenging a suggested
// player also sends them a buddy request, kicking off the friends flow. (A share
// link stays available for inviting people who aren't on Verse Arcade yet.)
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
  const { createBattle } = useBattles()
  const { buddies, suggested, load, loadSuggested, sendRequest } = useBuddies()
  const [ready, setReady] = useState(false)
  const [shareMsg, setShareMsg] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([load(), loadSuggested(3)]).then(() => setReady(true))
  }, [load, loadSuggested])

  // One targeted invite per run → go straight to that battle so it's clear who
  // you're waiting on. Challenging someone who ISN'T a buddy yet also sends them
  // a buddy request, starting the friends flow. (Broadcast link is "challenge
  // many".)
  const invite = async (u: BuddyCard, isBuddy: boolean) => {
    juice.coin()
    if (!isBuddy) void sendRequest(u.username)
    const id = await createBattle(seed, result.score, result.timeMs, u.username)
    if (id) navigate(`/battle/${id}`, { replace: true, state: { justCreated: true } })
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
          Challenge a buddy below — or share a link to invite someone new.
        </p>
      </div>

      {shareId ? (
        // You committed this run to an OPEN challenge — one play, one challenge.
        // (Challenging a specific buddy instead navigates away on tap.)
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="floaty" style={{ fontSize: 40 }}>📨</div>
          <h3 style={{ fontSize: 18, marginTop: 4 }}>Challenge shared!</h3>
          <p className="dim" style={{ fontSize: 14, marginTop: 6 }}>
            Anyone who opens your link plays your score — results land in your battles as they come in.
          </p>
          <div style={{ marginTop: 14 }}>
            <Button variant="secondary" full onClick={shareLink}>📤 Share the link again</Button>
          </div>
          {shareMsg && <p style={{ color: 'var(--good)', fontSize: 13, marginTop: 8 }}>{shareMsg}</p>}
        </div>
      ) : (
        <>
          {/* External share — for people who aren't on Verse Arcade yet. */}
          <Button variant="secondary" full onClick={shareLink}>
            📤 Invite someone new — share a link
          </Button>
          <p className="faint center" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.4 }}>
            For friends who aren’t on Verse Arcade yet — anyone who opens it can play your score.
          </p>
          {shareMsg && <p style={{ color: 'var(--coral)', fontSize: 13, marginTop: 8, textAlign: 'center' }}>{shareMsg}</p>}

          {!ready ? (
            <div className="center" style={{ padding: 30 }}>
              <div className="floaty" style={{ fontSize: 34 }}>⚔️</div>
            </div>
          ) : (
            <>
              {/* Buddies */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 12px' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--stroke)' }} />
                <span className="faint" style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em' }}>CHALLENGE A BUDDY</span>
                <div style={{ flex: 1, height: 1, background: 'var(--stroke)' }} />
              </div>

              {buddies.length === 0 ? (
                <p className="faint center" style={{ fontSize: 14, padding: '4px 0 8px' }}>
                  No buddies yet — challenge a suggested player below and they’ll be added.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {buddies.map((u) => (
                    <PlayerRow key={u.username} u={u} label="Challenge" onClick={() => invite(u, true)} />
                  ))}
                </div>
              )}

              {/* Suggested active players */}
              {suggested.length > 0 && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 12px' }}>
                    <div style={{ flex: 1, height: 1, background: 'var(--stroke)' }} />
                    <span className="faint" style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em' }}>SUGGESTED — ACTIVE PLAYERS</span>
                    <div style={{ flex: 1, height: 1, background: 'var(--stroke)' }} />
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {suggested.map((u) => (
                      <PlayerRow key={u.username} u={u} label="Battle + add" onClick={() => invite(u, false)} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      <div style={{ marginTop: 18 }}>
        <Button variant="gold" full onClick={() => navigate('/battle')}>
          Done
        </Button>
      </div>
      <div style={{ height: 30 }} />
    </Page>
  )
}

function PlayerRow({ u, label, onClick }: { u: BuddyCard; label: string; onClick: () => void }) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px' }}>
      <Avatar emoji={u.avatar_emoji} character={u.avatar_character} size={38} ring={false} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
          @{u.username}
        </b>
        <span className="faint" style={{ fontSize: 12 }}>Level {u.level} · 🔥 {u.current_streak}</span>
      </div>
      <motion.button
        whileTap={{ scale: 0.94 }}
        onClick={onClick}
        className="pill"
        style={{ fontWeight: 800, fontSize: 13, padding: '8px 14px', background: 'var(--gold)', color: '#241f0a', border: 'none' }}
      >
        {label}
      </motion.button>
    </div>
  )
}
