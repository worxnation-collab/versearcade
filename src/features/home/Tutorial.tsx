import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/Button'
import { useJuice } from '@/juice/useJuice'

// A small, tappable "how it works" walkthrough — opened from the home-screen
// button (and once automatically for brand-new players). Ends on a nudge to
// build your character.
//
// THE TOUR IS A MAP OF THE NAV, and it has to be kept as one. It used to be
// four steps about the app as it stood months ago — daily verse, streak,
// battle, character — which left a new player with no idea that Study, their
// own Bible, a church, a road or a room they can pray in existed at all. Four
// of the five tabs went unnamed. So there is now one step per tab, in nav
// order, and the icons match the icons down there on purpose: the point of
// this is not to explain the rules, it is to say where things are.
//
// It also promised "the Armor of God", which is PARKED (ARMOR_ENABLED in
// data/avatar) — the very first thing the app ever said to a new player was
// about a feature it doesn't have. If armor comes back, this copy comes back
// with it; until then nothing here may name it.
//
// Every line is a thing a guest can see or a free account opens. Nothing here
// mentions a rank you could lose, and the Battle step says "highest score
// wins" rather than anything about standing — same rule as the rest of the app.
const STEPS = [
  { icon: '📖', title: 'One verse a day', body: 'Everyone plays the same daily Bible verse. Read it, then race the clock on a few quick questions — a wrong answer still teaches you something.' },
  { icon: '🔥', title: 'Keep your streak', body: 'Play each day to grow your streak and earn XP. Miss one and a streak freeze catches you.' },
  { icon: '⚔️', title: 'Battle', body: 'Challenge a friend to the same quiz, head to head — highest score wins. Your wins raise your team’s keep, a hall you get to furnish.' },
  { icon: '📚', title: 'Study', body: 'A shelf of ways to practise, and none of it touches your rank: race the CPU, drill one book, replay a verse, or open your own Bible — all 66 of them, lighting up as you read.' },
  { icon: '⛪', title: 'Church', body: 'Play for the church you actually go to. Your points pool with everyone else there, the building grows for all of you, and you plant the garden out front.' },
  { icon: '⭐', title: 'You', body: 'Build your character, earn borders and badges, and unlock hero skins — plus your own Upper Room to furnish, and a quiet place in it to pray.' },
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
            <p className="dim" style={{ marginTop: 8, lineHeight: 1.5, minHeight: 116 }}>{step.body}</p>
          </motion.div>
        </AnimatePresence>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, margin: '14px 0' }}>
          {STEPS.map((_, idx) => (
            <span key={idx} style={{ width: idx === i ? 18 : 7, height: 7, borderRadius: 999, background: idx === i ? 'var(--gold)' : 'var(--stroke)', transition: 'all 0.2s' }} />
          ))}
        </div>

        {last ? (
          // ?customize=1 opens the customizer directly. Plain /you drops a
          // brand-new player at the top of a long profile with nothing
          // obviously to do — the deep link exists for exactly this and had
          // no caller at all, so the one nudge to build a character was
          // landing in the wrong place.
          <Button variant="gold" full onClick={() => { juice.coin(); onClose(); navigate('/you?customize=1') }}>Build my character →</Button>
        ) : (
          <Button variant="gold" full onClick={() => { juice.select(); setI(i + 1) }}>Next</Button>
        )}
        <button className="pill" style={{ marginTop: 10 }} onClick={onClose}>{last ? 'Maybe later' : 'Skip'}</button>
      </div>
    </div>
  )
}
