import { motion } from 'framer-motion'
import type { ArcadePlayResult } from '@/store/arcadeXp'

// What the day's first run on a machine was worth, said once.
//
// One component for all three machines, the choke-point habit `QuizRunner` and
// `CrowdLife` follow: three screens drawing their own version of this is three
// chances for one of them to start saying something the others don't — and what
// this line may say is the whole safety argument of the reward behind it.
//
// SO WHAT IT SAYS IS BOUNDED, deliberately:
//
//   * it names the payout and NOTHING about the run. No score, no "best yet",
//     no comparison, because a run's numbers are not what was paid for —
//     turning up is, and forty flakes and four are worth exactly the same;
//   * it says nothing at all on a later run. The reward is quiet rather than
//     refused: a "come back tomorrow" line turns a small welcome into a thing
//     you are now behind on, which is the version of this feature that would be
//     wrong (see 0084 and store/library.ts);
//   * there is no tally of days. It cannot say "3 days running", because
//     nothing on either path stores that.
//
// It renders where the run ENDED rather than as a toast, because both screens
// stay mounted after a run — the `StudyDropToast` problem (a reveal swept off
// screen by a route change) doesn't exist here.
export function ArcadeWelcome({ reward }: { reward: ArcadePlayResult | null }) {
  if (!reward || reward.awarded <= 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 26 }}
      // Announced, because it arrives after the run is already over and a
      // screen reader has no other signal that anything changed.
      role="status"
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'center',
        gap: 8,
        flexWrap: 'wrap',
      }}
    >
      <b
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 15,
          color: 'var(--gold)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        +{reward.awarded} XP
      </b>
      <span style={{ fontSize: 12.5, color: 'var(--ink-dim)' }}>
        {reward.leveledUp ? 'and that took you up a level' : 'for your first go on this machine today'}
      </span>
    </motion.div>
  )
}
