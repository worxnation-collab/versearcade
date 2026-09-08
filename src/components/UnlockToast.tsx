import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useUnlocks } from '@/store/unlocks'
import { useAuth } from '@/store/auth'
import { useBible } from '@/store/bible'
import { useCollection } from '@/store/collection'
import { useJuice } from '@/juice/useJuice'
import { useHeld } from '@/store/overlayHold'
import { useSeason } from '@/store/season'
import { useDrops } from '@/store/drops'
import { useSkinUnlocks } from '@/store/skinUnlocks'
import { DecorThumb } from '@/features/arena/KeepArt'
import { FurnishingThumb } from '@/features/room/RoomArt'
import { Seal } from '@/components/Seal'
import { sealFor } from '@/data/seals'
import { ItemShapeThumb } from '@/data/itemArt'
import { itemById } from '@/data/avatar'

// "You've earned a piece" — for the keep and the Upper Room, mounted once,
// app-wide. See the header in store/unlocks.ts for why it exists.
//
// The same shape as SkinUnlockToast, on purpose: top of the screen (every
// primary action here is bottom-anchored), the thing itself drawn on the card,
// one line saying why, tap to go and do the one thing there is to do about it.
// It waits behind overlayHold like NowPlaying does — a reward landing over a
// run's own header is a reward that gets dismissed by accident.

const LINGER_MS = 11_000

export function UnlockToast() {
  const navigate = useNavigate()
  const juice = useJuice()
  const pending = useUnlocks((s) => s.pending)
  const dismiss = useUnlocks((s) => s.dismiss)
  const checkRoom = useUnlocks((s) => s.checkRoom)
  const checkSeals = useUnlocks((s) => s.checkSeals)
  const checkSets = useUnlocks((s) => s.checkSets)
  const held = useHeld()
  const timer = useRef<ReturnType<typeof setTimeout>>()
  // The other top-of-screen reveals. A CPU race can land a waystation, a study
  // find and a keep piece in the same second, and three cards on one spot is
  // one card. This one steps down under whichever of them is showing.
  const waystation = useSeason((s) => !!s.pending)
  const drop = useDrops((s) => !!s.found)
  const skin = useSkinUnlocks((s) => !!s.pending)
  const step = (waystation ? 1 : 0) + (drop ? 1 : 0) + (skin ? 1 : 0)

  // The room's six requirements, watched where they live. `roomProgress()`
  // reads these exact numbers; when any moves, re-derive the shelf.
  const uid = useAuth((s) => s.profile?.id)
  const level = useAuth((s) => s.profile?.level)
  const longest = useAuth((s) => s.profile?.longestStreak)
  const plays = useAuth((s) => s.profile?.totalPlays)
  const studied = useBible((s) => Object.keys(s.studied).length)
  const read = useBible((s) => Object.keys(s.chapters).length)
  const bibleLoaded = useBible((s) => s.loaded)
  const cards = useCollection((s) => s.owned.length)
  const itemCount = useAuth((s) => s.profile?.ownedItems?.length ?? 0)
  const collectionLoaded = useCollection((s) => s.loaded)
  useEffect(() => {
    checkRoom()
    // `read` is the chapter-mark count, so this fires on the very chapter that
    // finishes a book — which is the only moment a seal can be pressed.
    checkSeals()
    checkSets()
  }, [checkRoom, checkSeals, checkSets, uid, level, longest, plays, studied, read, cards, itemCount, bibleLoaded, collectionLoaded])

  useEffect(() => {
    clearTimeout(timer.current)
    if (!pending || held) return
    juice.celebrate()
    timer.current = setTimeout(() => useUnlocks.getState().dismiss(), LINGER_MS)
    return () => clearTimeout(timer.current)
    // juice is rebuilt each render; the unlock is what matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, held])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {pending && !held && (
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
            top: `calc(var(--safe-top) + ${12 + step * 78}px)`,
            transition: 'top 0.25s ease',
            zIndex: 120,
            margin: '0 auto',
            maxWidth: 496,
          }}
        >
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => { juice.coin(); dismiss(); navigate(pending.to) }}
              className="card"
              style={{
                width: '100%',
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '11px 40px 11px 13px',
                cursor: 'pointer',
                borderColor: 'var(--gold)',
                background: 'var(--card-solid)',
                boxShadow: '0 10px 40px rgba(0,0,0,0.5), 0 0 26px rgba(255,210,63,0.3)',
              }}
            >
              <motion.span
                initial={{ scale: 0.5, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 12, delay: 0.05 }}
                style={{ flexShrink: 0, lineHeight: 0, display: 'grid', placeItems: 'center', width: 48, height: 48 }}
              >
                {pending.kind === 'keep' ? (
                  <DecorThumb id={pending.piece} size={46} />
                ) : pending.kind === 'seal' ? (
                  <Seal seal={sealFor(pending.piece)!} pressed size={46} />
                ) : pending.kind === 'set' ? (
                  <ItemShapeThumb id={pending.piece} slot={itemById(pending.piece)?.slot ?? 'hat'} size={46} />
                ) : (
                  <FurnishingThumb id={pending.piece} size={46} />
                )}
              </motion.span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 10, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {pending.kicker}
                </span>
                <b style={{ fontFamily: 'var(--font-display)', fontSize: 15, display: 'block' }}>{pending.title}</b>
                <span className="dim" style={{ display: 'block', fontSize: 11.5, lineHeight: 1.4 }}>{pending.line}</span>
              </span>
            </button>
            {/* A sibling, not a child: a button inside a button is invalid. */}
            <button
              onClick={() => { juice.select(); dismiss() }}
              aria-label="Dismiss"
              className="pill"
              style={{ position: 'absolute', top: 8, right: 8, padding: '3px 9px', fontSize: 12 }}
            >
              ✕
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
