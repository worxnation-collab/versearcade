import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/Button'
import { useJuice } from '@/juice/useJuice'
import { useOverlayHold } from '@/store/overlayHold'

// A small, tappable "how it works" walkthrough — opened once automatically for
// brand-new players, and from Settings after that.
//
// TWO SLIDES, THEN THE VERSE. It used to be six — one per tab, in nav order —
// which was a map of the building handed to somebody who hadn't decided to
// come in yet: by slide four a new player was hearing about focus drills and
// their own Bible before they had answered a single question. So the tour now
// says the two things that are true of the whole app (one verse a day; a
// wrong answer still teaches you) and opens the drop. The four tab slides
// became one-line tips on the tabs themselves (`FirstVisitTip`), shown the
// first time each is opened, which is the moment the information is useful.
//
// What the first session should end with isn't a tour; it's a score, a streak
// of 1, and one named thing to come back for tomorrow.
//
// It promised "the Armor of God" once, which is PARKED (ARMOR_ENABLED in
// data/avatar). If armor comes back, its copy comes back with it; until then
// nothing here may name it. Nothing here mentions a rank you could lose.
const STEPS = [
  { icon: '📖', title: 'One verse a day', body: 'Everyone plays the same daily Bible verse. Read it, then race the clock on five quick questions about it.' },
  { icon: '💡', title: 'You can’t lose', body: 'A wrong answer still teaches you something — every question ends with the fact behind it. Play each day and your streak grows; miss one and a freeze catches you.' },
]

export function Tutorial({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const juice = useJuice()
  const hold = useOverlayHold((s) => s.hold)
  const release = useOverlayHold((s) => s.release)
  const [i, setI] = useState(0)
  const last = i === STEPS.length - 1
  const step = STEPS[i]

  // The music card waits until this is off the screen — it used to land over
  // the first slide, which is the first thing the app ever shows anybody.
  useEffect(() => {
    hold('tutorial')
    return () => release('tutorial')
  }, [hold, release])

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.66)', display: 'grid', placeItems: 'center', zIndex: 200, padding: 20 }}
    >
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 360, width: '100%', textAlign: 'center' }}>
        <AnimatePresence mode="wait">
          <motion.div key={i} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }}>
            <div className="floaty" style={{ fontSize: 56 }}>{step.icon}</div>
            <h2 style={{ fontSize: 24, marginTop: 8 }}>{step.title}</h2>
            <p className="dim" style={{ marginTop: 8, lineHeight: 1.5, minHeight: 96 }}>{step.body}</p>
          </motion.div>
        </AnimatePresence>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, margin: '14px 0' }}>
          {STEPS.map((_, idx) => (
            <span key={idx} style={{ width: idx === i ? 18 : 7, height: 7, borderRadius: 999, background: idx === i ? 'var(--gold)' : 'var(--stroke)', transition: 'all 0.2s' }} />
          ))}
        </div>

        {last ? (
          <Button variant="gold" full onClick={() => { juice.coin(); onClose(); navigate('/play/run') }}>Play today’s verse →</Button>
        ) : (
          <Button variant="gold" full onClick={() => { juice.select(); setI(i + 1) }}>Next</Button>
        )}
        <button className="pill" style={{ marginTop: 10 }} onClick={onClose}>{last ? 'Look around first' : 'Skip'}</button>
      </div>
    </div>
  )
}
