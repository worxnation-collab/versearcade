import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useSettings } from '@/store/settings'
import { TapGameScreen } from './TapGameScreen'
import { VerseCard } from './VerseCard'
import { VerseActions } from './VerseActions'
import { buildWordCatch } from './wordCatch'
import { wordCatchSurface } from './WordCatchField'
import { getVerseForDate } from '@/data/bible/questions'
import { todayLocalDate } from '@/lib/date'

// Word Catch: the machine about recall — what comes next?
export default function WordCatchScreen({ demo }: { demo?: boolean }) {
  const reduceMotion = useSettings((s) => s.reduceMotion)
  // The day's verse, straight from the deterministic rotation rather than from
  // the game store: the arcade is reachable from five places now, and most of
  // them have no reason to have loaded today's drop. It's also what makes the
  // machine shareable — whoever opens the link gets the same verse everybody
  // else is playing today, with nothing of theirs needed to build it.
  const verse = useMemo(() => getVerseForDate(todayLocalDate()), [])
  const wc = useMemo(() => buildWordCatch(verse), [verse])
  const surface = useMemo(() => wordCatchSurface(wc, { reduceMotion }), [wc, reduceMotion])

  return (
    <TapGameScreen
      id="word-catch"
      game={wc.game}
      surface={surface}
      tagline={`Today’s verse · ${wc.reference}`}
      how={[
        'The words of today’s verse have come loose from the page. Tap them in the order they belong.',
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
      demo={demo}
    />
  )
}
