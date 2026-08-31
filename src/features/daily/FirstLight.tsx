import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Avatar } from '@/components/Avatar'
import { supabase } from '@/lib/supabase'
import { usePlayerCard } from '@/components/PlayerCardModal'
import { useAuth } from '@/store/auth'
import { useGame } from '@/store/game'
import { useFirstLight } from '@/store/firstLight'
import { firstLightLine } from '@/data/firstLight'
import { denominationColor } from '@/data/denominations'

// First light — the day's card for whoever opened today's verse first.
//
// It sits directly under the daily drop because it is a fact about that verse,
// and because the one thing it wants anybody to do is open it.
//
// THE THING THIS CARD MUST NEVER GROW IS A SECOND ROW. One person is named per
// day and nobody else has a position — no runner-up, no "you were 400th", no
// list of who came after. A follower reads a fact about the DAY, and the RPC
// behind this deliberately cannot say anything else (0081): it returns one
// holder and two counts, and there is no ordering of openers to render even if
// somebody wanted one. See data/firstLight.ts for the whole argument.
//
// The holder's face is drawn by the app's own Avatar and the card opens their
// PLAYER CARD — the same pop-up tapping a figure in the churchyard or a row on
// the board opens, through the one PlayerCardProvider. Nothing here is a second
// card component that could drift from that one.
export function FirstLight() {
  const load = useFirstLight((s) => s.load)
  const available = useFirstLight((s) => s.available)
  const claimed = useFirstLight((s) => s.claimed)
  const holder = useFirstLight((s) => s.holder)
  const mine = useFirstLight((s) => s.mine)
  const followers = useFirstLight((s) => s.followers)
  const xpAwarded = useFirstLight((s) => s.xpAwarded)
  const iOpened = useFirstLight((s) => s.iOpened)
  const mode = useAuth((s) => s.mode)
  const { open: openCard } = usePlayerCard()
  // Finishing a run can have claimed the day (submit_play records the open
  // too), so re-read when the played flag flips rather than leaving a stale
  // "nobody yet" sitting over the player who just took it.
  const playedToday = useGame((s) => s.playedToday)

  useEffect(() => {
    void load()
  }, [load, playedToday])

  // Nothing came back — no keys at all (a keyless LOCAL build has no shared day
  // to be first in), or a server without 0081. The card disappears rather than
  // drawing its unclaimed state, which would announce that nobody has opened a
  // verse somebody is holding.
  if (!supabase || !available) return null

  const canHold = mode === 'online'
  const line = firstLightLine({ claimed, mine, holder: holder?.username ?? null, followers, iOpened, canHold })

  // Somebody else holds it: the whole card is the way to their player card, so
  // the tap target is a row rather than a pill. The Avatar goes plain
  // (`username` unset) inside it — it would otherwise render its own button,
  // and a button inside a button is neither valid nor tappable.
  const tappable = !!holder && !mine
  const style: CSSProperties = {
    marginBottom: 14,
    width: '100%',
    textAlign: 'left',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    position: 'relative',
    overflow: 'hidden',
    cursor: tappable ? 'pointer' : undefined,
    // The one gold note, and only when the day is yours.
    border: mine ? '1px solid var(--gold)' : undefined,
  }

  const inner: ReactNode = (
    <>
      {mine && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: 'radial-gradient(320px 120px at 0% 0%, rgba(255,210,63,0.16), transparent 70%)',
          }}
        />
      )}

      {holder ? (
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <Avatar
            emoji={holder.avatarEmoji}
            character={holder.avatarCharacter}
            border={holder.avatarBorder}
            badge={holder.avatarBadge}
            username={tappable ? null : holder.username}
            size={46}
          />
          {holder.denomination && (
            <span
              aria-hidden
              style={{
                position: 'absolute',
                right: -1,
                bottom: -1,
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: denominationColor(holder.denomination),
                boxShadow: `0 0 8px ${denominationColor(holder.denomination)}`,
                border: '2px solid var(--bg)',
              }}
            />
          )}
        </div>
      ) : (
        <div
          aria-hidden
          style={{
            width: 46,
            height: 46,
            flexShrink: 0,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            fontSize: 24,
            border: '1px solid var(--stroke)',
            background: 'linear-gradient(180deg, rgba(255,210,63,0.10), transparent)',
          }}
        >
          🌅
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>First light</b>
          {mine && xpAwarded > 0 && (
            <span className="pill" style={{ fontSize: 11, color: 'var(--gold)', borderColor: 'var(--gold)' }}>
              +{xpAwarded} XP
            </span>
          )}
        </div>
        <div className="faint" style={{ fontSize: 12.5, lineHeight: 1.45, marginTop: 2 }}>
          {line}
        </div>
      </div>

      {/* A way in, never a number. */}
      {tappable && (
        <span style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)', fontSize: 18, flexShrink: 0 }}>→</span>
      )}
    </>
  )

  return tappable ? (
    <motion.button
      className="card"
      onClick={() => openCard(holder!.username)}
      whileTap={{ scale: 0.98 }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      aria-label={`Player card for @${holder!.username}, who opened today’s verse first`}
      style={style}
    >
      {inner}
    </motion.button>
  ) : (
    <motion.div className="card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} style={style}>
      {inner}
    </motion.div>
  )
}
