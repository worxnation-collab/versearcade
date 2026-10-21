import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useSettings } from '@/store/settings'
import { TapGameScreen } from './TapGameScreen'
import { VerseCard } from './VerseCard'
import { VerseActions } from './VerseActions'
import { buildWordCatch } from './wordCatch'
import { wordCatchSurface } from './WordCatchField'
import { getVerseForDate } from '@/data/bible/questions'
import { VERSE_POOL } from '@/data/bible/pool'
import { todayLocalDate } from '@/lib/date'
import { fetchVerse, peekVerse } from '@/lib/bible'
import { quizTranslation } from '@/lib/translations'

/**
 * What this screen needs of a verse, which is all `VerseSeed` and `DailyVerse`
 * have in common — the day's rotation hands back the second, the pool holds the
 * first, and the game itself only ever reads these four fields.
 */
type PlayableVerse = {
  reference: string
  text: string
  book: string
  chapter: number
  verseStart: number
  verseEnd?: number
  /** Set when `text` is the player's own Bible rather than the bundled BSB. */
  abbr?: string
}

const refOf = (v: PlayableVerse) => ({ book: v.book, chapter: v.chapter, start: v.verseStart, end: v.verseEnd })

// Word Catch: the machine about recall — what comes next?
export default function WordCatchScreen({ demo }: { demo?: boolean }) {
  const reduceMotion = useSettings((s) => s.reduceMotion)
  // The FIRST run is the day's verse, straight from the deterministic rotation
  // rather than from the game store: the arcade is reachable from five places
  // now, and most of them have no reason to have loaded today's drop. It's also
  // what makes the machine shareable — whoever opens the link gets the same
  // verse everybody else is playing today, with nothing of theirs needed to
  // build it.
  const today = useMemo(() => getVerseForDate(todayLocalDate()), [])

  // In the player's own Bible, where it is cleared for quizzing (lib/
  // translations `quizzable`) — the machine rebuilds whatever words it is
  // given. Only text ALREADY ON THE DEVICE is used when a run is dealt: a run
  // must never change its words once it has started, so the network is asked
  // ahead of time instead (today's verse at once, and the next "Play again"
  // verse while this one is being played). Not there in time ⇒ the BSB.
  const tid = useSettings((s) => s.readingTranslation)
  const bible = quizTranslation(tid)
  const inBible = useCallback(
    (v: PlayableVerse): PlayableVerse => {
      if (!bible) return v
      const hit = peekVerse(refOf(v), bible.id)
      return hit ? { ...v, text: hit.text, abbr: bible.abbr } : v
    },
    [bible],
  )
  const [verse, setVerse] = useState<PlayableVerse>(() => inBible(today))
  const started = useRef(false)
  const pickOther = (avoid: string) => {
    const others = VERSE_POOL.filter((v) => v.reference !== avoid)
    return others[Math.floor(Math.random() * others.length)] ?? today
  }
  const upcoming = useRef<PlayableVerse>(pickOther(today.reference))
  const warm = useCallback((v: PlayableVerse) => {
    if (bible) void fetchVerse(refOf(v), bible.id).catch(() => {})
  }, [bible])
  useEffect(() => {
    if (!bible) return
    // Today's verse may still be on its way: take it if no run has begun.
    void fetchVerse(refOf(today), bible.id)
      .then(() => { if (!started.current) setVerse(inBible(today)) })
      .catch(() => {})
    warm(upcoming.current)
  }, [bible, today, inBible, warm])

  // ...and "Play again" deals a different one, from the whole 726-verse pool.
  //
  // Locking every run to today's verse made a second go the same four lines
  // again, which is a poor answer to a button labelled "Play again" — and the
  // machine is about recall, so re-reciting a verse you have just finished
  // reciting teaches the least of anything it could offer. Nothing about the
  // run changes with the verse: it pays what it always paid (the day's first
  // run on this machine, once), and a longer or shorter verse only changes how
  // its lines are chunked.
  const deal = useCallback(
    (run: number) => {
      started.current = true
      if (run === 1) {
        setVerse(inBible(today))
        return
      }
      const next = upcoming.current.reference === verse.reference ? pickOther(verse.reference) : upcoming.current
      setVerse(inBible(next))
      upcoming.current = pickOther(next.reference)
      warm(upcoming.current)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [today, verse.reference, inBible, warm],
  )

  const wc = useMemo(() => buildWordCatch(verse), [verse])
  const surface = useMemo(() => wordCatchSurface(wc, { reduceMotion }), [wc, reduceMotion])
  const isToday = verse.reference === today.reference

  return (
    <TapGameScreen
      id="word-catch"
      game={wc.game}
      surface={surface}
      tagline={`${isToday ? 'Today’s verse' : 'Another verse'} · ${wc.reference}${verse.abbr ? ` · ${verse.abbr}` : ''}`}
      how={[
        'The words of today’s verse have come loose from the page. Tap them in the order they belong.',
        'Play again afterwards and a different verse comes apart — there are 726 of them in the pool.',
        'The line at the top shows what you have put back and how long each missing word is. Tap one out of turn and it just drops back — it comes round again.',
      ]}
      cta="Put it back together"
      hero="arcade_page"
      heroCaption={`${verse.text.split(/\s+/).slice(0, 7).join(' ')} …`}
      // The whole verse, whole, once the run is over. You have just spent a
      // minute with it in pieces — reading it through is the point of having
      // done that, and it lands a beat after the numbers so it reads as what
      // the run was for rather than as part of the scoreline.
      finale={
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            type: 'spring',
            stiffness: 260,
            damping: 26,
            delay: reduceMotion ? 0 : 0.45,
          }}
          role="status"
        >
          <VerseCard
            reference={verse.reference}
            text={verse.text}
            note="That’s the whole of it. Read it once more before you go."
          >
            {!demo && (
              <VerseActions
                reference={verse.reference}
                book={verse.book}
                chapter={verse.chapter}
                text={verse.text}
              />
            )}
          </VerseCard>
        </motion.div>
      }
      onDeal={deal}
      demo={demo}
    />
  )
}
