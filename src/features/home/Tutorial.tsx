import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/Button'
import { useJuice } from '@/juice/useJuice'

// A small, tappable "how it works" walkthrough — opened from the home-screen
// button (and once automatically for brand-new players). Ends on a nudge to
// build your character.
const STEPS = [
  { icon: '📖', title: 'One verse a day', body: 'Everyone plays the same daily Bible verse. Read it, then race the clock on a few quick questions.' },
  { icon: '🔥', title: 'Keep your streak', body: 'Play each day to grow your streak, earn XP, and climb the worldwide ranks.' },
  { icon: '⚔️', title: 'Battle your buddies', body: 'Challenge friends to the same quiz, head to head — highest score wins.' },
  { icon: '⭐', title: 'Make it yours', body: 'Build your own character with the Armor of God, earn borders and badges, and unlock hero skins.' },
]

export function Tutorial({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const juice = useJuice()
  const [i, setI] = useState(0)
  const last = i === STEPS.length - 1
  const step = STEPS[i]

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
            <p className="dim" style={{ marginTop: 8, lineHeight: 1.5, minHeight: 68 }}>{step.body}</p>
          </motion.div>
        </AnimatePresence>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, margin: '14px 0' }}>
          {STEPS.map((_, idx) => (
            <span key={idx} style={{ width: idx === i ? 18 : 7, height: 7, borderRadius: 999, background: idx === i ? 'var(--gold)' : 'var(--stroke)', transition: 'all 0.2s' }} />
          ))}
        </div>

        {last ? (
          <Button variant="gold" full onClick={() => { juice.coin(); onClose(); navigate('/you') }}>Build my character →</Button>
        ) : (
          <Button variant="gold" full onClick={() => { juice.select(); setI(i + 1) }}>Next</Button>
        )}
        <button className="pill" style={{ marginTop: 10 }} onClick={onClose}>{last ? 'Maybe later' : 'Skip'}</button>
      </div>
    </div>
  )
}
