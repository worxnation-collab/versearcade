import { useCallback, useMemo, useState } from 'react'
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

/**
 * What this screen needs of a verse, which is all `VerseSeed` and `DailyVerse`
 * have in common — the day's rotation hands back the second, the pool holds the
 * first, and the game itself only ever reads these four fields.
 */
type PlayableVerse = { reference: string; text: string; book: string; chapter: number }

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
  const [verse, setVerse] = useState<PlayableVerse>(today)

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
      if (run === 1) {
        setVerse(today)
        return
      }
      const others = VERSE_POOL.filter((v) => v.reference !== verse.reference)
      setVerse(others[Math.floor(Math.random() * others.length)] ?? today)
    },
    [today, verse.reference],
  )

  const wc = useMemo(() => buildWordCatch(verse), [verse])
  const surface = useMemo(() => wordCatchSurface(wc, { reduceMotion }), [wc, reduceMotion])
  const isToday = verse.reference === today.reference

  return (
    <TapGameScreen
      id="word-catch"
      game={wc.game}
      surface={surface}
      tagline={isToday ? `Today’s verse · ${wc.reference}` : `Another verse · ${wc.reference}`}
      how={[
        'The words of today’s verse have come loose from the page. Tap them in the order they belong.',
        'Play again afterwards and a different verse comes apart — there are 726 of them in the pool.',
        'The line at the top shows what you have put back and how long each missing word is. Tap one out of turn and it just drops back — it comes round again.',
      ]}
      cta="Put it back together"
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
