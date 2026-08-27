import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { QuizRunner } from '@/features/daily/QuizRunner'
import { useBattles } from '@/store/battles'
import { useBuddies, type BuddyCard } from '@/store/buddies'
import { useAuth } from '@/store/auth'
import { newBattleSeed, battleVerse } from './battle'
import { shareResult, inviteUrl } from '@/features/daily/shareCard'
import { useJuice } from '@/juice/useJuice'
import { FavoriteButton } from '@/components/FavoriteButton'
import type { PlayResult } from '@/types'

// Challenger flow: pick who you're battling, play a fresh random-verse quiz,
// and the challenge goes out on its own. Opponents come from your BUDDIES first,
// plus a few suggested active players so a friendless user still gets someone
// likely to battle back — challenging a suggested player also sends them a buddy
// request, kicking off the friends flow.
//
// The ORDER matters, and it used to be the other way round. "Start a new battle"
// dropped you straight into the quiz and only asked who at the end, which reads
// as a results screen — players finished a run, tapped away, and never sent
// anything. Choosing first matches what people expect from "battle a friend",
// and it doesn't weaken the rule that a challenge has to be earned: nothing is
// created until the run is over.
//
// "I'll decide after I play" keeps the old order for anyone who wants it, and
// it's also where the share-a-link (broadcast) challenge lives, since that one
// needs a score to exist before there's anything to share.
type Choice = { kind: 'player'; username: string } | { kind: 'later' }

export default function BattleNew() {
  const navigate = useNavigate()
  const location = useLocation()
  const seed = useMemo(() => newBattleSeed(), [])
  const verse = useMemo(() => battleVerse(seed), [seed])
  const [result, setResult] = useState<PlayResult | null>(null)
  // Arriving from someone's player card or a buddy row ("⚔️ Battle") already
  // names the opponent, so that path skips the picker entirely.
  const target = (location.state as { challenge?: string } | null)?.challenge ?? null
  const [choice, setChoice] = useState<Choice | null>(target ? { kind: 'player', username: target } : null)

  if (!choice) return <OpponentPicker onPick={setChoice} onExit={() => navigate('/battle')} />

  if (!result) {
    return (
      <QuizRunner
        verse={verse}
        onComplete={async (r) => setResult(r)}
        onExit={() => navigate('/battle')}
        // Name the opponent for the whole run — otherwise the quiz looks like a
        // solo game and nobody can tell whether picking them did anything.
        label={choice.kind === 'player' ? `⚔️ Battle vs @${choice.username}` : '⚔️ Bible Battle'}
      />
    )
  }
  return <InvitePicker seed={seed} result={result} target={choice.kind === 'player' ? choice.username : null} />
}

// Step one: who are you battling? Shown before the quiz so the tap that names a
// person is the tap that starts the battle.
function OpponentPicker({ onPick, onExit }: { onPick: (c: Choice) => void; onExit: () => void }) {
  const juice = useJuice()
  const { buddies, suggested, load, loadSuggested } = useBuddies()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    Promise.all([load(), loadSuggested(3)]).then(() => setReady(true))
  }, [load, loadSuggested])

  // Nobody to show (brand-new account, or offline): don't gate the run behind an
  // empty list — fall through to the old play-then-pick order, which at least
  // offers the share link.
  const empty = ready && buddies.length === 0 && suggested.length === 0
  useEffect(() => {
    if (empty) onPick({ kind: 'later' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empty])

  if (!ready || empty) {
    return (
      <Page noNav>
        <div style={{ display: 'grid', placeItems: 'center', height: '70dvh' }}>
          <div className="floaty" style={{ fontSize: 56 }}>⚔️</div>
        </div>
      </Page>
    )
  }

  const pick = (u: BuddyCard) => {
    juice.coin()
    onPick({ kind: 'player', username: u.username })
  }

  return (
    <Page noNav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <button className="pill" onClick={onExit} aria-label="Back">✕</button>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Who are you battling?</b>
      </div>

      <div className="card" style={{ textAlign: 'center', marginBottom: 14 }}>
        <div className="floaty" style={{ fontSize: 40 }}>⚔️</div>
        <p style={{ marginTop: 8, fontSize: 15, lineHeight: 1.5 }}>
          Pick someone, then play your round — <b>your score is what they’ll have to beat</b>. The
          challenge goes out the moment you finish.
        </p>
      </div>

      {buddies.length > 0 && (
        <>
          <Divider>YOUR BUDDIES</Divider>
          <div style={{ display: 'grid', gap: 8 }}>
            {buddies.map((u) => (
              <PlayerRow key={u.username} u={u} label="Battle" onClick={() => pick(u)} />
            ))}
          </div>
        </>
      )}

      {suggested.length > 0 && (
        <>
          <Divider>SUGGESTED — ACTIVE PLAYERS</Divider>
          <div style={{ display: 'grid', gap: 8 }}>
            {suggested.map((u) => (
              <PlayerRow key={u.username} u={u} label="Battle + add" onClick={() => pick(u)} />
            ))}
          </div>
        </>
      )}

      {/* The old order, kept as a choice: play now, decide at the end. It's also
          the only route to a share-a-link challenge, which needs a score first. */}
      <div style={{ marginTop: 18 }}>
        <Button variant="secondary" full onClick={() => { juice.select(); onPick({ kind: 'later' }) }}>
          I’ll decide after I play
        </Button>
        <p className="faint center" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.4 }}>
          Play first and pick at the end — or share a link to invite someone who isn’t here yet.
        </p>
      </div>
      <div style={{ height: 30 }} />
    </Page>
  )
}

function Divider({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 12px' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--stroke)' }} />
      <span className="faint" style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em' }}>{children}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--stroke)' }} />
    </div>
  )
}

function InvitePicker({ seed, result, target }: { seed: number; result: PlayResult; target: string | null }) {
  const navigate = useNavigate()
  const verse = useMemo(() => battleVerse(seed), [seed])
  const juice = useJuice()
  const { createBattle } = useBattles()
  const { buddies, suggested, load, loadSuggested, sendRequest } = useBuddies()
  const referralCode = useAuth((s) => s.profile?.referralCode)
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
    return !!id
  }

  // Pre-picked opponent (came from their player card): fire the challenge as
  // soon as the buddy list is in, so we know whether to attach a buddy request.
  // The ref guards against a double-send if this re-renders mid-flight.
  const sent = useRef(false)
  const [targetFailed, setTargetFailed] = useState(false)
  const sendToTarget = () => {
    if (!target) return
    setTargetFailed(false)
    const isBuddy = buddies.some((b) => b.username.toLowerCase() === target.toLowerCase())
    void invite({ username: target } as BuddyCard, isBuddy).then((ok) => {
      // A failed create used to leave this stuck on "Sending…" forever — the run
      // is still good, so drop into the picker and let them retry or pick again.
      if (!ok) setTargetFailed(true)
    })
  }
  useEffect(() => {
    if (!target || !ready || sent.current) return
    sent.current = true
    sendToTarget()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, ready, buddies])

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
    const link = inviteUrl(referralCode, `/battle/${id}`)
    const r = await shareResult(`⚔️ I challenge you to a Bible Battle! Same quiz, beat my score:\n${link}`, link)
    setShareMsg(r === 'shared' ? 'Shared!' : r === 'copied' ? 'Link copied!' : 'Could not share')
  }

  if (target && !targetFailed) {
    return (
      <Page noNav>
        <div className="card" style={{ textAlign: 'center', marginTop: 40 }}>
          <div className="floaty" style={{ fontSize: 40 }}>⚔️</div>
          <h2 style={{ fontSize: 22, marginTop: 6 }}>
            You scored <span className="gradient-text">{result.score.toLocaleString()}</span>
          </h2>
          <p className="dim" style={{ marginTop: 8, fontSize: 14 }}>
            Sending your challenge to <b>@{target}</b>…
          </p>
        </div>
      </Page>
    )
  }

  return (
    <Page noNav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <button className="pill" onClick={() => navigate('/battle')} aria-label="Leave without sending">✕</button>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Send your challenge</b>
      </div>

      {/* This screen looks like a results screen but it's a required step: the
          run isn't a challenge until somebody is picked. Say so out loud —
          players were reading "You scored X" as the end and leaving. */}
      <div className="card" style={{ textAlign: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 40 }}>⚔️</div>
        <h2 style={{ fontSize: 22, marginTop: 4 }}>
          You scored <span className="gradient-text">{result.score.toLocaleString()}</span>
        </h2>
        <p style={{ marginTop: 8, fontSize: 15, fontWeight: 700, color: 'var(--gold)' }}>
          Last step — pick who has to beat it 👇
        </p>
        <p className="faint" style={{ marginTop: 4, fontSize: 13, lineHeight: 1.4 }}>
          Tap a name below to send them this score, or share a link to invite someone new. Nothing
          goes out until you pick.
        </p>
        {/* You've just played this verse, so you can keep it here rather than
            waiting on an opponent. The text stays hidden — this screen is one
            tap from sharing, and the challenge should still be a challenge. */}
        <div style={{ marginTop: 12 }}>
          <FavoriteButton
            reference={verse.reference}
            label={`Save ${verse.reference}`}
            savedLabel={`${verse.reference} saved`}
          />
        </div>
      </div>

      {targetFailed && target && (
        <div className="card" style={{ marginBottom: 14, borderColor: 'var(--coral)' }}>
          <p style={{ fontSize: 14, lineHeight: 1.5 }}>
            Couldn’t send that to <b>@{target}</b> — your run is safe, so try again or pick someone else.
          </p>
          <div style={{ marginTop: 12 }}>
            <Button variant="secondary" full onClick={sendToTarget}>Try @{target} again ⚔️</Button>
          </div>
        </div>
      )}

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
              <Divider>CHALLENGE A BUDDY</Divider>

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
                  <Divider>SUGGESTED — ACTIVE PLAYERS</Divider>
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

      {/* Gold is the "do the thing" colour, and it was sitting on the control
          that quietly drops the run. The names above are the primary action;
          leaving is a quiet exit that says what it costs. */}
      <div style={{ marginTop: 18 }}>
        {shareId ? (
          <Button variant="gold" full onClick={() => navigate('/battle')}>
            Done
          </Button>
        ) : (
          <button
            onClick={() => navigate('/battle')}
            className="pill"
            style={{ width: '100%', padding: '12px', background: 'transparent', border: '1px solid var(--stroke)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
          >
            Skip — don’t send this one
          </button>
        )}
      </div>
      <div style={{ height: 30 }} />
    </Page>
  )
}

function PlayerRow({ u, label, onClick }: { u: BuddyCard; label: string; onClick: () => void }) {
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px' }}>
      <Avatar emoji={u.avatar_emoji} character={u.avatar_character} size={38} ring={false} username={u.username} />
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
