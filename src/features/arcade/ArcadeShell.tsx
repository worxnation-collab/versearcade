import { useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Page } from '@/components/Page'
import { AccountWallCard } from '@/components/AccountWall'
import { useAuth } from '@/store/auth'
import { useArcadeInvite } from '@/store/arcadeInvite'
import { useJuice } from '@/juice/useJuice'
import { shareResult, inviteUrl } from '@/features/daily/shareCard'
import { arcadeGameById, arcadeInvitePath } from './games'

// The chrome every arcade screen wears: a way out, a name, a line saying what
// this machine is, and the button that hands the machine to a friend.
//
// Extracted the moment a second game wanted it — two copies of a header drift,
// which is the same rule `KeepScene` and `QuizRunner` are built on. Sharing
// lives here for the same reason: "each game can be shared" has to mean every
// game that will ever exist, and a share button per screen is a rule you have
// to remember rather than one the code keeps.
//
// `noNav` on purpose: a game takes the screen. The way back is the arrow, and
// the arrow goes where you actually came from — the lobby if you picked the
// machine there, the room if you tapped the cabinet standing in it.
export function ArcadeShell({
  title,
  tagline,
  home = '/arcade',
  /** The game's id. Present ⇒ this screen can be shared. */
  shareId,
  children,
}: {
  title: string
  tagline: string
  /** Where the arrow goes when there's no history to go back to. */
  home?: string
  shareId?: string
  children: ReactNode
}) {
  const navigate = useNavigate()
  const location = useLocation()
  // A deep link (a shared URL, a reload on this screen) has nothing behind it,
  // and `navigate(-1)` there walks the player out of the app. React Router
  // marks that first entry with the default key.
  const canGoBack = location.key !== 'default'

  // Whoever is here on a shared link gets one go, then the invitation. The
  // state is in a store rather than in props because the game between this
  // header and this card has no business knowing what an invite is.
  const demo = useArcadeInvite((s) => s.demo)
  const from = useArcadeInvite((s) => s.from)
  const played = useArcadeInvite((s) => s.played)
  const inviting = !!shareId && demo === shareId

  return (
    <Page noNav>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* A visitor on a shared link has nowhere of their own to go back to
              yet, so the arrow would be a door onto an app they haven't met. */}
          {!inviting && (
            <button
              type="button"
              onClick={() => (canGoBack ? navigate(-1) : navigate(home))}
              aria-label={home === '/arcade' ? 'Back to the arcade' : 'Leave the arcade'}
              style={{
                fontSize: 20,
                lineHeight: 1,
                padding: '8px 12px',
                borderRadius: 'var(--r-pill)',
                background: 'var(--card)',
                border: '1px solid var(--stroke)',
                flexShrink: 0,
              }}
            >
              ←
            </button>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 style={{ fontSize: 26 }}>{title}</h1>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-dim)', lineHeight: 1.4 }}>
              {tagline}
            </p>
          </div>
          {shareId && !inviting && <ShareButton gameId={shareId} title={title} />}
        </div>

        {inviting && !played && <InviteRibbon from={from} />}

        {children}

        {/* The ask, after the go. Never before it: the machine is the pitch. */}
        <AnimatePresence>
          {inviting && played && (
            <motion.div
              key="signup"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 26, delay: 0.5 }}
            >
              <AccountWallCard
                icon="🕹️"
                title="That was your free go"
                line={`The whole arcade is open once you have an account — every machine, as often as you like, plus today's verse and a character of your own. It's free, and it takes a minute.`}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ height: 24 }} />
      </div>
    </Page>
  )
}

/** "Somebody sent you this" — the one thing the link says before you play. */
function InviteRibbon({ from }: { from: string | null }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 'var(--r-pill)',
        background: 'rgba(255,210,63,0.10)',
        border: '1px solid rgba(255,210,63,0.35)',
        fontSize: 13,
      }}
    >
      {/* Sized up a little: the ticket glyph is mostly a flat rectangle, and at
          body size it reads as a coloured box rather than a ticket. */}
      <span aria-hidden style={{ fontSize: 17, lineHeight: 1 }}>🎟️</span>
      <span>
        {from ? <b>@{from}</b> : 'Someone'} sent you a free go — no account needed.
      </span>
    </div>
  )
}

function ShareButton({ gameId, title }: { gameId: string; title: string }) {
  const juice = useJuice()
  const username = useAuth((s) => s.profile?.username ?? null)
  const refCode = useAuth((s) => s.profile?.referralCode ?? null)
  const [msg, setMsg] = useState<string | null>(null)

  const onShare = async () => {
    juice.coin()
    // `from` is only ever a username the server issued, and it's sanitised again
    // on the way in — the receiving end treats a URL as somebody else's text.
    const path = username
      ? `${arcadeInvitePath(gameId)}?from=${encodeURIComponent(username)}`
      : arcadeInvitePath(gameId)
    const link = inviteUrl(refCode, path)
    // No score in here, ever. The arcade's safety argument is that a result
    // can't be set beside anybody else's, and a share is where that would
    // quietly stop being true.
    const line = arcadeGameById(gameId)?.shareLine ?? ''
    const text = `🕹️ ${title}\n${line}\n\nHere's a free go, no account needed:\n${link}`
    const r = await shareResult(text, link)
    setMsg(r === 'shared' ? 'Shared!' : r === 'copied' ? 'Link copied!' : 'Could not share')
    window.setTimeout(() => setMsg(null), 2200)
  }

  return (
    <button
      type="button"
      onClick={onShare}
      aria-label={`Share ${title} — sends a free go`}
      style={{
        flexShrink: 0,
        padding: '8px 12px',
        borderRadius: 'var(--r-pill)',
        background: 'var(--card)',
        border: '1px solid var(--stroke)',
        fontSize: 13,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {msg ?? '↗ Share'}
    </button>
  )
}
