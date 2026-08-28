import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { useAuth } from '@/store/auth'
import { PushNudge } from '@/components/PushNudge'
import { useBuddies, type BuddyCard } from '@/store/buddies'
import { WashFeetButton } from '@/components/WashFeetButton'
import { useJuice } from '@/juice/useJuice'

// Bible Buddies — a personal friends layer. Add someone by @username (a "be my
// buddy" request), accept the ones who ask you, and your buddies become your
// go-to Battle opponents. Suggested active players help a brand-new user get
// started with nobody on their list yet.
// Standalone /buddies route — kept for deep links. The list itself now also
// lives in a collapsible on the You tab.
export default function BuddiesScreen() {
  return (
    <Page>
      <Header />
      <BuddiesSection />
      <div style={{ height: 90 }} />
    </Page>
  )
}

// The buddies list with no page chrome, so it can be embedded on the You tab.
export function BuddiesSection() {
  const navigate = useNavigate()
  const juice = useJuice()
  const mode = useAuth((s) => s.mode)
  const { buddies, requests, suggested, load, loadSuggested, sendRequest, respond, remove } = useBuddies()
  const [handle, setHandle] = useState('')
  const [flash, setFlash] = useState<{ text: string; good: boolean } | null>(null)
  // Set when a request goes out and is left pending — the one case where the
  // answer arrives later and from another person, so a notification is the
  // honest solution rather than an interruption.
  const [awaitingReply, setAwaitingReply] = useState(false)
  const isGuest = mode === 'local'

  useEffect(() => {
    if (isGuest) return
    load()
    loadSuggested(3)
  }, [isGuest, load, loadSuggested])

  const add = async (username: string) => {
    juice.coin()
    const clean = username.trim().replace(/^@/, '')
    if (clean.length < 2) return
    const res = await sendRequest(clean)
    if (!res.ok) {
      setFlash({ text: res.reason === 'not_found' ? `No player @${clean}` : 'Couldn’t send that request', good: false })
      return
    }
    setHandle('')
    loadSuggested(3)
    setFlash({
      text: res.status === 'accepted' ? `You’re buddies with @${clean}! 🎉` : `Buddy request sent to @${clean} 📨`,
      good: true,
    })
    if (res.status !== 'accepted') setAwaitingReply(true)
  }

  if (isGuest) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 34 }}>🔐</div>
        <p style={{ margin: '8px 0 14px' }}>Buddies are tied to your account so your friends list sticks. Create a free one to add buddies.</p>
        <Button variant="gold" full onClick={() => navigate('/auth')}>Create an account</Button>
      </div>
    )
  }

  return (
    <>
      {/* Add a buddy by @username */}
      <div className="card" style={{ marginBottom: 16 }}>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>Add a buddy</b>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@username"
            autoCapitalize="none"
            autoCorrect="off"
            onKeyDown={(e) => { if (e.key === 'Enter') add(handle) }}
            style={{ flex: 1 }}
          />
          <Button variant="gold" disabled={handle.trim().replace(/^@/, '').length < 2} onClick={() => add(handle)}>
            Add
          </Button>
        </div>
        {flash && <p style={{ color: flash.good ? 'var(--good)' : 'var(--coral)', fontSize: 13, marginTop: 8 }}>{flash.text}</p>}
        <PushNudge reason="buddy" when={awaitingReply} />
      </div>

      {/* Incoming "be my buddy" requests */}
      {requests.length > 0 && (
        <>
          <h3 className="dim" style={{ fontSize: 16, margin: '4px 0 10px' }}>
            Buddy requests <span style={{ color: 'var(--gold)' }}>· {requests.length}</span>
          </h3>
          <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
            {requests.map((u) => (
              <div key={u.username} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, borderColor: 'var(--gold)', background: 'rgba(255,210,63,0.08)' }}>
                <Avatar emoji={u.avatar_emoji} character={u.avatar_character} size={40} ring={false} username={u.username} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontWeight: 800 }}>@{u.username}</b>
                  <div className="faint" style={{ fontSize: 12 }}>Level {u.level} · wants to be your buddy</div>
                </div>
                <button className="pill" onClick={() => { juice.coin(); respond(u.username, true) }}
                  style={{ background: 'var(--gold)', color: '#241f0a', fontWeight: 800, fontSize: 13, border: 'none' }}>Accept</button>
                <button className="pill" onClick={() => { juice.select(); respond(u.username, false) }}
                  style={{ fontWeight: 700, fontSize: 13 }}>✕</button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* My buddies */}
      <h3 className="dim" style={{ fontSize: 16, margin: '4px 0 10px' }}>Your buddies</h3>
      {buddies.length === 0 ? (
        <p className="faint" style={{ fontSize: 14, marginBottom: 20 }}>
          No buddies yet. Add someone by @username above, or send a battle to one of the players below.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
          {buddies.map((u) => (
            <BuddyRow key={u.username} u={u}
              // The row names a person, so the challenge has to carry that
              // person — landing on the generic picker made people think the
              // tap did nothing and re-pick the same buddy after playing.
              onBattle={() => { juice.coin(); navigate('/battle/new', { state: { challenge: u.username } }) }}
              onRemove={() => { juice.select(); remove(u.username) }} />
          ))}
        </div>
      )}

      {/* Suggested active players */}
      {suggested.length > 0 && (
        <>
          <h3 className="dim" style={{ fontSize: 16, margin: '4px 0 10px' }}>Suggested — active players</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {suggested.map((u) => (
              <div key={u.username} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar emoji={u.avatar_emoji} character={u.avatar_character} size={38} ring={false} username={u.username} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontWeight: 800 }}>@{u.username}</b>
                  <div className="faint" style={{ fontSize: 12 }}>Level {u.level} · 🔥 {u.current_streak}</div>
                </div>
                <button className="pill" onClick={() => add(u.username)}
                  style={{ fontWeight: 800, fontSize: 13, background: 'var(--gold)', color: '#241f0a', border: 'none' }}>+ Buddy</button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

function Header() {
  return (
    <div className="center" style={{ marginBottom: 16 }}>
      <div className="floaty" style={{ fontSize: 44 }}>🤝</div>
      <h1 style={{ fontSize: 28, marginTop: 4 }}>Bible Buddies</h1>
      <p className="dim" style={{ marginTop: 4 }}>Add friends, cheer each other on, and battle head to head.</p>
    </div>
  )
}

function BuddyRow({ u, onBattle, onRemove }: { u: BuddyCard; onBattle: () => void; onRemove: () => void }) {
  const [confirm, setConfirm] = useState(false)
  return (
    <motion.div className="card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      style={{ display: 'flex', alignItems: 'center', gap: 12, borderColor: u.official ? 'var(--gold)' : undefined }}>
      <Avatar emoji={u.avatar_emoji} character={u.avatar_character} size={40} ring={false} username={u.username} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontWeight: 800 }}>
          @{u.username}
          {u.official && <span className="pill" style={{ marginLeft: 6, fontSize: 10, background: 'var(--gold)', color: '#241f0a', fontWeight: 800 }}>★ Official</span>}
        </b>
        <div className="faint" style={{ fontSize: 12 }}>
          {u.official ? 'Verse Arcade · say hi!' : <>Level {u.level} · 🔥 {u.current_streak}</>}
        </div>
      </div>
      {/* The official account has no feet to wash — it never plays. */}
      {!u.official && <WashFeetButton username={u.username} />}
      <button className="pill" onClick={onBattle}
        style={{ fontWeight: 800, fontSize: 13, background: 'var(--gold)', color: '#241f0a', border: 'none' }}>⚔️ Battle</button>
      {/* Official account is always everyone's buddy — no remove control. */}
      {!u.official && (confirm ? (
        <button className="pill" onClick={onRemove} style={{ fontWeight: 700, fontSize: 12, color: 'var(--coral)' }}>Remove?</button>
      ) : (
        <button className="pill" onClick={() => setConfirm(true)} aria-label="Remove buddy" style={{ fontWeight: 700, fontSize: 13 }}>⋯</button>
      ))}
    </motion.div>
  )
}
