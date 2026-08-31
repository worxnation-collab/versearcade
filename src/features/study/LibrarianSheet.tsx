import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Button } from '@/components/Button'
import { useJuice } from '@/juice/useJuice'
import { useLibrary } from '@/store/library'
import { GREETINGS, HANDOVER, LIBRARIAN_NAME, lineFrom } from '@/data/library'
import type { StudyBook } from '@/data/library'

// The cover paintings generated for the old shelf (scripts/generate-study-
// covers.mjs), keyed by book. The tiles they were painted for are gone; the
// paintings are not, and a real cover beside a title is worth more here than
// the emoji it replaces. Resolved at build time, so a book whose image is
// missing simply keeps its emblem.
const COVERS: Record<string, string> = Object.fromEntries(
  Object.entries(
    import.meta.glob('@/assets/study/*.{jpg,png,webp}', { eager: true, query: '?url', import: 'default' }),
  ).map(([file, url]) => [file.replace(/^.*\//, '').replace(/\.[a-z]+$/, ''), url as string]),
)

// The desk. Tabitha asks what you want and hands it over.
//
// SHE IS HANDED THE ROOM'S OWN LIST. The tab builds one `StudyBook[]` and both
// the room's hotspots and this offer are built from it, so a surface added to
// Study cannot appear in one and not the other — the same choke-point habit
// `QuizRunner` and `CrowdLife` keep. She offers the entries carrying `lend`;
// your reports and your bag have none, because they are yours rather than
// stock, and they stand in the room as themselves.
//
// TWO BEATS, AND THE SECOND ONE WAITS. Pick a book, she stamps it, and the
// sheet STAYS OPEN on the stamp with an "Open it" button — it does not navigate
// for you. The day's FIRST book pays 5 XP (0081), and a reveal that gets swept
// off screen by a route change is a reveal nobody sees; that is the whole
// reason `StudyDropToast` had to be lifted out of the run it belongs to. Here
// the sheet owns the moment, so it simply holds it.
//
// SHE NEVER MEASURES ANYBODY. No due dates, no "it's been a while", no count of
// visits, no opinion of how much you have read. The Study tab is rank-free and
// a librarian who tuts is the one version of this that would be worse than no
// librarian at all.

type Phase = 'choosing' | 'stamped'

export function LibrarianSheet({ items, onClose }: { items: StudyBook[]; onClose: () => void }) {
  const juice = useJuice()
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()

  const stock = useMemo(() => items.filter((i) => i.lend), [items])
  // Drawn once per opening, so she isn't a recording — but not per render, or
  // she'd change her mind mid-sentence on every keystroke elsewhere.
  const greeting = useMemo(() => lineFrom(GREETINGS), [])

  const [phase, setPhase] = useState<Phase>('choosing')
  const [chosen, setChosen] = useState<StudyBook | null>(null)
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
   * Every checkout after the day's first is a SUCCESS that pays nothing (0081
   * returns ok with awarded 0), not a refusal — she never turns anybody away
   * from the desk, and this sheet must never draw an error at somebody for
   * coming back. A failed call is the same: the book is still handed over,
   * because Study has no other door and refusing at this one would be refusing
   * the tab.
   */
  const take = async (item: StudyBook) => {
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
      setReward(`She stamps your card for the day. +${res.awarded} XP.`)
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

          {phase === 'choosing' ? (
            <>
              <Speech>{greeting}</Speech>
              <p className="faint" style={{ fontSize: 12, margin: '0 0 10px' }}>
                Nothing is ever due back, and none of it affects your rank.
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
                    <Cover item={item} />
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

/**
 * A book's own cover, small, or its emblem where no painting exists.
 *
 * The Bible deliberately has none: its board carries the player's name and is
 * drawn, not painted, so it keeps its emblem here rather than borrowing
 * somebody else's cover.
 */
function Cover({ item }: { item: StudyBook }) {
  const art = item.cover ? COVERS[item.cover] : undefined
  if (!art) {
    return (
      <span
        style={{
          fontSize: 20,
          lineHeight: 1,
          flexShrink: 0,
          width: 30,
          height: 42,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {item.emblem}
      </span>
    )
  }
  return (
    <span
      aria-hidden
      style={{
        flexShrink: 0,
        width: 30,
        height: 42,
        borderRadius: '2px 4px 4px 2px',
        overflow: 'hidden',
        boxShadow: '0 2px 7px rgba(0,0,0,0.5), inset 2px 0 0 rgba(0,0,0,0.35)',
        background: `center/cover no-repeat url(${art})`,
      }}
    />
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
