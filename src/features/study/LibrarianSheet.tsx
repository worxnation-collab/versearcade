import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Button } from '@/components/Button'
import { useJuice } from '@/juice/useJuice'
import { useLibrary } from '@/store/library'
import { GREETINGS, HANDOVER, LIBRARIAN_NAME, lineFrom } from '@/data/library'
import { LibraryWindow } from './LibraryWindow'
import type { ShelfItem } from './StudyShelf'

// The desk. Tabitha asks what you want and hands it over.
//
// EVERY DESTINATION HERE IS ALREADY ON THE SHELF. She takes the `ShelfItem`s
// the tab is already rendering and offers the ones marked `lend`, so the
// library can never become a second menu with surfaces of its own — a book
// added to Study is lendable or not, decided once, in one place. That is the
// same choke-point habit `QuizRunner` and `CrowdLife` keep.
//
// TWO BEATS, AND THE SECOND ONE WAITS. Pick a book, she stamps it, and the
// sheet STAYS OPEN on the stamp with an "Open it" button — it does not navigate
// for you. The first checkout pays 5 XP as an Easter egg (0081), and a reveal
// that gets swept off screen by a route change is a reveal nobody sees; that is
// the whole reason `StudyDropToast` had to be lifted out of the run it belongs
// to. Here the sheet owns the moment, so it simply holds it.
//
// SHE NEVER MEASURES ANYBODY. No due dates, no "it's been a while", no count of
// visits, no opinion of how much you have read. The Study tab is rank-free and
// a librarian who tuts is the one version of this that would be worse than no
// librarian at all.

type Phase = 'choosing' | 'stamped'

export function LibrarianSheet({ items, onClose }: { items: ShelfItem[]; onClose: () => void }) {
  const juice = useJuice()
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()

  const stock = useMemo(() => items.filter((i) => i.lend), [items])
  // Drawn once per opening, so she isn't a recording — but not per render, or
  // she'd change her mind mid-sentence on every keystroke elsewhere.
  const greeting = useMemo(() => lineFrom(GREETINGS), [])

  const [phase, setPhase] = useState<Phase>('choosing')
  const [chosen, setChosen] = useState<ShelfItem | null>(null)
  const [handover, setHandover] = useState('')
  const [reward, setReward] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void useLibrary.getState().load()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /**
   * Check one out.
   *
   * A second checkout is a SUCCESS that pays nothing (0081 returns ok with
   * awarded 0), not a refusal — she never turns anybody away from the desk, and
   * this sheet must never draw an error at somebody for coming back. A failed
   * call is the same: the book is still handed over, because the destination
   * was reachable from the shelf without her and refusing it here would make
   * the long way round the *worse* way round.
   */
  const take = async (item: ShelfItem) => {
    if (busy) return
    setBusy(true)
    setChosen(item)
    setHandover(lineFrom(HANDOVER))
    const res = await useLibrary.getState().checkout()
    setBusy(false)
    setPhase('stamped')
    if (res.ok && res.awarded > 0) {
      if (res.leveledUp) juice.celebrate()
      else juice.coin()
      setReward(`She slides a library card across the desk. +${res.awarded} XP.`)
    } else {
      juice.select()
      setReward(null)
    }
  }

  const go = () => {
    if (!chosen) return
    juice.whoosh?.()
    onClose()
    navigate(chosen.to)
  }

  const back = () => {
    juice.select()
    setPhase('choosing')
    setChosen(null)
    setReward(null)
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="library-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          // The app's sheet tier. Opened from a page rather than from the
          // player card, so 100 like the keep, church and prayer sheets.
          zIndex: 100,
          background: 'rgba(8,3,24,0.78)',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
        }}
      >
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 60, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 520,
            maxHeight: '88dvh',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            background: 'var(--bg-1)',
            borderRadius: 'var(--r-lg) var(--r-lg) 0 0',
            border: '1px solid var(--stroke)',
            borderBottom: 'none',
            padding: '14px 14px calc(var(--safe-bottom) + 20px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 18, flex: 1, minWidth: 0 }}>
              📚 {LIBRARIAN_NAME}’s desk
            </b>
            <button className="pill" onClick={() => { juice.select(); onClose() }} aria-label="Close">✕</button>
          </div>

          {/* The same room you tapped, still. A moving backdrop behind a
              paragraph is unreadable, which is what `still` is for. */}
          <div style={{ marginBottom: 12 }}>
            <LibraryWindow still label={false} height={124} />
          </div>

          {phase === 'choosing' ? (
            <>
              <Speech>{greeting}</Speech>
              <p className="faint" style={{ fontSize: 12, margin: '0 0 10px' }}>
                Everything she lends is on the shelf below too — this is just the long way round.
              </p>
              <div style={{ display: 'grid', gap: 8 }}>
                {stock.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => void take(item)}
                    disabled={busy}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 11,
                      textAlign: 'left',
                      padding: '11px 12px',
                      borderRadius: 12,
                      background: 'var(--card-solid)',
                      border: '1px solid var(--stroke)',
                      cursor: busy ? 'default' : 'pointer',
                      color: 'var(--ink)',
                      opacity: busy ? 0.6 : 1,
                      width: '100%',
                    }}
                  >
                    <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{item.emblem}</span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <b style={{ display: 'block', fontSize: 13.5 }}>{item.title}</b>
                      <span className="faint" style={{ fontSize: 11, lineHeight: 1.35 }}>{item.lend}</span>
                    </span>
                    <span className="faint" style={{ fontSize: 13, flexShrink: 0 }}>→</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <Speech>{handover}</Speech>

              {/* The stamp. A beat of theatre, and the thing the +5 XP line
                  hangs off — reduce-motion gets the stamp already down. */}
              <motion.div
                initial={reduceMotion ? false : { scale: 2.1, rotate: -14, opacity: 0 }}
                animate={{ scale: 1, rotate: -6, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 320, damping: 18 }}
                style={{
                  margin: '4px auto 12px',
                  width: 'fit-content',
                  padding: '8px 16px',
                  border: '2.5px solid var(--gold)',
                  borderRadius: 6,
                  color: 'var(--gold)',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 800,
                  fontSize: 15,
                  letterSpacing: 1.2,
                  textTransform: 'uppercase',
                }}
              >
                {chosen?.title ?? 'Checked out'}
              </motion.div>

              {reward && (
                <p
                  className="center"
                  style={{ fontSize: 13, margin: '0 0 12px', color: 'var(--gold)', lineHeight: 1.5 }}
                >
                  {reward}
                </p>
              )}

              {/* The house button, so the one thing she is asking you to tap
                  looks like every other primary action in the app. */}
              <Button full onClick={go}>Open it →</Button>
              <div style={{ marginTop: 10, textAlign: 'center' }}>
                <button className="pill" onClick={back}>Something else</button>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}

/** Her voice: a warm line, indented like speech rather than set as body copy. */
function Speech({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 13.5,
        lineHeight: 1.6,
        margin: '0 0 12px',
        paddingLeft: 11,
        borderLeft: '2px solid var(--gold)',
        color: 'var(--ink)',
      }}
    >
      “{children}”
    </p>
  )
}
