import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { useSettings } from '@/store/settings'
import type { TapResult } from '@/lib/tapGame'
import { TapRunner } from './TapRunner'
import { MANNA_RUSH } from './manna'
import { mannaSurface } from './MannaField'

// The arcade cabinet's screen. One route, reached by tapping the machine
// standing in the hall, the churchyard or your own Upper Room.
//
// It is open to guests on purpose. Nothing here is persisted, so there is
// nothing an account would make yours tomorrow: the run pays a study drop
// (which already has both a guest and an online path) and nothing else. Walling
// it would be a padlock in front of a game that works perfectly without one.
//
// The start gate lives here rather than in TapRunner for the same reason
// QuizRunner owns StartGate: the run should begin when the player says so, and
// the engine should not have to know what a title screen is.

export default function ArcadeScreen() {
  const navigate = useNavigate()
  const reduceMotion = useSettings((s) => s.reduceMotion)
  const [runs, setRuns] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [result, setResult] = useState<TapResult | null>(null)

  const surface = useMemo(() => mannaSurface({ reduceMotion }), [reduceMotion])

  const start = useCallback(() => {
    setResult(null)
    setRuns((n) => n + 1)
    setPlaying(true)
  }, [])

  const done = useCallback((r: TapResult) => {
    setPlaying(false)
    setResult(r)
  }, [])

  return (
    <Page noNav>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Leave the arcade"
            style={{
              fontSize: 20,
              lineHeight: 1,
              padding: '8px 12px',
              borderRadius: 'var(--r-pill)',
              background: 'var(--card)',
              border: '1px solid var(--stroke)',
            }}
          >
            ←
          </button>
          <div>
            <h1 style={{ fontSize: 26 }}>Manna Rush</h1>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-dim)' }}>
              Seven days in the wilderness · Exodus 16
            </p>
          </div>
        </div>

        {playing ? (
          <TapRunner key={runs} game={MANNA_RUSH} surface={surface} onDone={done} />
        ) : result ? (
          <Harvest result={result} onAgain={start} onLeave={() => navigate(-1)} />
        ) : (
          <Gate onStart={start} />
        )}
      </div>
    </Page>
  )
}

function Gate({ onStart }: { onStart: () => void }) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20 }}>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55 }}>
        Manna falls with the dew. Tap the bright, round flakes to gather your omer.
      </p>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: 'var(--ink-dim)' }}>
        Leave the pale lumpy ones — those were kept from yesterday, and they bred worms.
        On the seventh day nothing falls, and the best thing you can do is keep still.
      </p>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>
        Nothing here touches your rank. A finished week can turn up a relic for your church.
      </p>
      <Button variant="gold" full onClick={onStart}>
        Go out and gather
      </Button>
    </div>
  )
}

function Harvest({
  result,
  onAgain,
  onLeave,
}: {
  result: TapResult
  onAgain: () => void
  onLeave: () => void
}) {
  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 20, alignItems: 'center', textAlign: 'center' }}
    >
      <h2 style={{ fontSize: 24 }}>The week&rsquo;s harvest</h2>

      {/* Your own two numbers, against your own bar. Nothing on this screen can
          be put beside somebody else's — that is what lets a game you can be
          better at than a friend exist in this app at all. */}
      <div style={{ display: 'flex', gap: 22, justifyContent: 'center' }}>
        <Tally value={String(result.taken)} label={MANNA_RUSH.labels.taken} />
        <Tally
          value={`${result.cleanRounds}/${result.scoringRounds}`}
          label={MANNA_RUSH.labels.clean}
        />
      </div>

      {result.restKept !== null &&
        (result.restKept ? (
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              padding: '6px 14px',
              borderRadius: 'var(--r-pill)',
              border: '2px solid var(--gold)',
              color: 'var(--gold)',
              transform: 'rotate(-4deg)',
            }}
          >
            {MANNA_RUSH.labels.restKept}
          </span>
        ) : (
          <span style={{ fontSize: 13.5, color: 'var(--ink-dim)' }}>
            {MANNA_RUSH.labels.restBroken}
          </span>
        ))}

      <div style={{ display: 'flex', gap: 10, width: '100%' }}>
        <Button variant="gold" full onClick={onAgain}>
          Walk the week again
        </Button>
        <Button variant="ghost" onClick={onLeave}>
          Done
        </Button>
      </div>
    </motion.div>
  )
}

function Tally({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <b
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 30,
          lineHeight: 1,
          color: 'var(--gold)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </b>
      <span
        style={{
          marginTop: 6,
          fontSize: 10,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--ink-faint)',
        }}
      >
        {label}
      </span>
    </div>
  )
}
