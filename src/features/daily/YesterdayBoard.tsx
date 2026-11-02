import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useJuice } from '@/juice/useJuice'
import { addDays } from '@/lib/date'
import { takeBoardLink } from '@/lib/boardLink'
import { canonBook, chapterCount } from '@/data/bible/structure'
import { scriptedQuiz, scriptedMyth, scriptedNo } from '@/data/tiktokScripted'

// "Yesterday's board" — the social reveal loop, carried into the app.
//
// The morning chalkboard quiz asks and never answers; the answer is chalked
// on the top of the NEXT day's board. The evening myth corrects something
// most people believe. Both lived only on YouTube, Facebook, Instagram and
// TikTok, so somebody who argued in the comments and tapped through found
// nothing in the app about the thing they just watched. This card is that
// thing: yesterday's question with its answer and its teach line, and
// yesterday's myth with the passage to read it in.
//
// Four rules, and they are why it can sit on the Play tab:
//
//  - **It reveals only what the board has already revealed.** It shows the
//    quiz from YESTERDAY (local date), whose answer today's video opens on,
//    so the app is never the place the answer leaks early. Today's quiz is
//    named nowhere here.
//  - **It is new today**, which is the Play tab's test for a card: it changes
//    every day and is gone tomorrow. A day with no scripted entry renders
//    NOTHING — no empty state, no "coming soon".
//  - **Nobody is scored.** No "were you right?", no tally of who guessed what,
//    no XP. The answer and the fact behind it, the missed list's frame: what
//    you now know.
//  - **The passage is the payoff.** "Read it" opens the chapter in the
//    player's Bible (behind the account wall for a guest, which says what an
//    account keeps — the intended pitch, the `?d=` replay's choice). A myth
//    whose point is that the saying is NOT in the Bible has no chapter, and
//    shows no button rather than one that goes nowhere.
//
// A post's first comment carries `&b=1` (lib/boardLink.ts); arriving that way
// scrolls this card into view and lights it once.
export function YesterdayBoard({ today }: { today: string }) {
  const navigate = useNavigate()
  const juice = useJuice()
  const yesterday = addDays(today, -1)
  const quiz = scriptedQuiz(yesterday)
  const myth = scriptedMyth(yesterday)
  const ref = useRef<HTMLDivElement>(null)
  const [glow] = useState(() => takeBoardLink())

  useEffect(() => {
    if (!glow || !ref.current) return
    const t = setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250)
    return () => clearTimeout(t)
  }, [glow])

  if (!quiz && !myth) return null
  const no = scriptedNo(yesterday)

  const read = (reference: string) => {
    const to = chapterOf(reference)
    if (!to) return null
    return (
      <button
        type="button"
        className="pill"
        onClick={() => { juice.select(); navigate(to) }}
        style={{ alignSelf: 'flex-start', marginTop: 8, fontSize: 13 }}
      >
        Read {reference} →
      </button>
    )
  }

  return (
    <motion.div
      ref={ref}
      className="card"
      initial={glow ? { boxShadow: '0 0 0 2px var(--gold)' } : false}
      animate={{ boxShadow: '0 0 0 0px rgba(0,0,0,0)' }}
      transition={{ duration: 2.4, delay: 0.8 }}
      style={{ marginTop: 14, display: 'grid', gap: 16 }}
    >
      {quiz && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 11, letterSpacing: 1.2, color: 'var(--ink-dim)', textTransform: 'uppercase' }}>
            Yesterday's board · Daily Bible Quiz No. {no}
          </div>
          <div style={{ marginTop: 6, fontWeight: 600 }}>{quiz.prompt}</div>
          <div style={{ marginTop: 6, fontFamily: 'var(--font-display)', color: 'var(--gold)', fontSize: 17 }}>
            {quiz.options[quiz.answerIndex]}
          </div>
          <div style={{ marginTop: 4, color: 'var(--ink-dim)', fontSize: 14, lineHeight: 1.45 }}>{quiz.teach}</div>
          {read(quiz.reference)}
        </div>
      )}
      {myth && (
        <div style={{ display: 'flex', flexDirection: 'column', borderTop: quiz ? '1px solid var(--edge)' : undefined, paddingTop: quiz ? 14 : 0 }}>
          <div style={{ fontSize: 11, letterSpacing: 1.2, color: 'var(--ink-dim)', textTransform: 'uppercase' }}>
            Last night · Most people get this wrong No. {no}
          </div>
          <div style={{ marginTop: 6, fontWeight: 600 }}>{myth.hook}</div>
          <div style={{ marginTop: 4, color: 'var(--ink-dim)', fontSize: 14, lineHeight: 1.45 }}>{myth.caption}</div>
          {read(myth.reference)}
        </div>
      )}
    </motion.div>
  )
}

/** "Jonah 1:17" → /bible/Jonah/1; "Psalm 23:1" → /bible/Psalms/23; "Not in the Bible" → null. */
export function chapterOf(reference: string): string | null {
  const m = /^(.+?)\s+(\d+)(?::[\d\-–]+)?$/.exec(reference.trim())
  if (!m) return null
  const book = canonBook(m[1])
  const chapter = Number(m[2])
  if (!(chapter >= 1 && chapter <= chapterCount(book))) return null
  return `/bible/${encodeURIComponent(book)}/${chapter}`
}
