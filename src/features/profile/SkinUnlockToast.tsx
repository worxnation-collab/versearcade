import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useSkinUnlocks } from '@/store/skinUnlocks'
import { useAuth } from '@/store/auth'
import { Character } from '@/components/Character'
import { DEFAULT_AVATAR } from '@/data/avatar'
import { useJuice } from '@/juice/useJuice'

// "You've earned a look" — mounted once, app-wide.
//
// It has to be app-wide for the reason StudyDropToast does, only more so: the
// winner of an async battle isn't on any particular screen when their battle
// completes, and may not be in the app at all. The store parks the unlock and
// this shows it wherever they next land.
//
// It names the skin AND why, which is the whole point — the wardrobe shows a
// padlock and crossed swords on a locked one and never a ladder, so this is the
// only place the number is ever said. Tapping goes to the wardrobe, which is the
// one thing there is to do about it.
//
// Portalled to document.body: half the screens this can appear over sit inside a
// `.card`, and `.card` sets backdrop-filter — a containing block for
// position: fixed. Same family as the ChurchDetailSheet and BookOpening notes.

const LINGER_MS = 11_000

export function SkinUnlockToast() {
  const navigate = useNavigate()
  const juice = useJuice()
  const pending = useSkinUnlocks((s) => s.pending)
  const dismiss = useSkinUnlocks((s) => s.dismiss)
  const check = useSkinUnlocks((s) => s.check)
  const profile = useAuth((s) => s.profile)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  // Re-check whenever the numbers behind an unlock move. refreshProfile() is
  // what pulls them (a battle recorded, the app opened), so watching the two
  // counters is the same as watching for "something happened".
  useEffect(() => {
    check()
  }, [check, profile?.id, profile?.battleWins, profile?.liveBattles, profile?.sharedDays, profile?.referralCount])

  useEffect(() => {
    clearTimeout(timer.current)
    if (!pending) return
    juice.celebrate()
    timer.current = setTimeout(() => useSkinUnlocks.getState().dismiss(), LINGER_MS)
    return () => clearTimeout(timer.current)
    // juice is rebuilt each render; the unlock is what matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {pending && (
        <motion.div
          key={pending.id}
          initial={{ opacity: 0, y: -24, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          role="status"
          style={{
            position: 'fixed',
            left: 12,
            right: 12,
            // Top, like every other toast here: the primary action is anchored
            // to the bottom of every screen in this app.
            top: 'calc(var(--safe-top) + 12px)',
            // Above the sheet tier and the player card, below nothing that
            // matters — see the z-index ladder in CLAUDE.md.
            zIndex: 120,
            margin: '0 auto',
            maxWidth: 496,
          }}
        >
          <button
            onClick={() => { juice.coin(); dismiss(); navigate('/you') }}
            className="card"
            style={{
              width: '100%',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '11px 13px',
              cursor: 'pointer',
              borderColor: 'var(--gold)',
              background: 'var(--card-solid)',
              boxShadow: '0 10px 40px rgba(0,0,0,0.5), 0 0 26px rgba(255,159,28,0.27)',
            }}
          >
            {/* The look itself, cropped to a portrait the way every avatar chip
                is — the reward is a face, so show the face. */}
            <motion.span
              initial={{ scale: 0.5, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 12, delay: 0.05 }}
              style={{ flexShrink: 0, lineHeight: 0 }}
            >
              <Character
                spec={{ ...DEFAULT_AVATAR, ...(profile?.avatarCharacter ?? {}), skinId: pending.id }}
                size={44}
              />
            </motion.span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  display: 'block',
                  fontSize: 10,
                  color: 'var(--gold)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                New look earned
              </span>
              <b style={{ fontFamily: 'var(--font-display)', fontSize: 15, display: 'block' }}>
                {pending.name}
              </b>
              <span className="dim" style={{ fontSize: 12 }}>
                {pending.reason} · tap to wear it
              </span>
            </span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
