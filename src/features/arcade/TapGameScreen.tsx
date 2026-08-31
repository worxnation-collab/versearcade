import { useCallback, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button } from '@/components/Button'
import { ArcadeShell } from './ArcadeShell'
import { TapRunner, type TapSurface } from './TapRunner'
import { useArcadeInvite } from '@/store/arcadeInvite'
import { todayLocalDate } from '@/lib/date'
import type { TapGameDef, TapResult } from '@/lib/tapGame'

// The screen every tap game wears: the gate that explains it, the run, and the
// two numbers afterwards.
//
// A third machine costs one small file because of this: the header, the start
// gate and the harvest are the same for all of them, and the only things that
// vary are the definition, the surface and three lines of copy. The gate lives
// here rather than in `TapRunner` for the reason `QuizRunner` owns `StartGate`
// — the engine should not have to know what a title screen is.
export function TapGameScreen({
  id,
  game,
  surface,
  tagline,
  how,
  cta,
  finale,
  demo,
}: {
  /** The machine's id in `ARCADE_GAMES` — what a share hands out. */
  id: string
  game: TapGameDef
  surface: TapSurface
  tagline: string
  /** How it works, in the player's terms. First line leads, the rest are dim. */
  how: string[]
  cta: string
  /**
   * What the run was for, shown under the two numbers once it's over.
   *
   * Word Catch spends a minute pulling a verse apart, so it hands the whole
   * thing back at the end — and "17 words, 1 of 4 lines clean" is a poor last
   * thing to leave somebody looking at when scripture is the point.
   */
  finale?: ReactNode
  /** A free go from a shared link: pays nothing, and offers no "again". */
  demo?: boolean
}) {
  const navigate = useNavigate()
  const [runs, setRuns] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [result, setResult] = useState<TapResult | null>(null)

  const start = useCallback(() => {
    setResult(null)
    setRuns((n) => n + 1)
    setPlaying(true)
  }, [])

  const done = useCallback((r: TapResult) => {
    setPlaying(false)
    setResult(r)
    // On a shared link the run that just ended was the free go. The store
    // no-ops outside a demo, so this is flat rather than conditional.
    useArcadeInvite.getState().notePlayEnded(todayLocalDate())
  }, [])

  return (
    <ArcadeShell title={game.name} tagline={tagline} shareId={id}>
      {playing ? (
        <TapRunner key={runs} game={game} surface={surface} demo={demo} onDone={done} />
      ) : result ? (
        <>
          <Harvest
            game={game}
            result={result}
            // A free go is one run. Offering "again" under it would make the
            // sign-up card below a suggestion rather than the next step.
            onAgain={demo ? undefined : start}
            onLeave={demo ? undefined : () => navigate('/arcade')}
          />
          {finale}
        </>
      ) : (
        <Gate how={how} cta={cta} demo={demo} onStart={start} />
      )}
    </ArcadeShell>
  )
}

function Gate({
  how,
  cta,
  demo,
  onStart,
}: {
  how: string[]
  cta: string
  demo?: boolean
  onStart: () => void
}) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20 }}>
      {how.map((line, i) => (
        <p
          key={i}
          style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: i ? 'var(--ink-dim)' : undefined }}
        >
          {line}
        </p>
      ))}
      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-faint)' }}>
        {demo
          ? 'Nothing here touches anybody’s rank, and there’s nothing to sign up for first.'
          : 'Nothing here touches your rank. A finished run can turn up a relic for your church.'}
      </p>
      <Button variant="gold" full onClick={onStart}>
        {cta}
      </Button>
    </div>
  )
}

function Harvest({
  game,
  result,
  onAgain,
  onLeave,
}: {
  game: TapGameDef
  result: TapResult
  /** Absent on a free go — one run is the whole offer. */
  onAgain?: () => void
  onLeave?: () => void
}) {
  return (
    <motion.div
      className="card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        padding: 20,
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      <h2 style={{ fontSize: 24 }}>How it went</h2>

      {/* Your own two numbers, against your own bar. Nothing on this screen can
          be put beside somebody else's — that is what lets a game you can be
          better at than a friend exist in this app at all. */}
      <div style={{ display: 'flex', gap: 22, justifyContent: 'center' }}>
        <Tally value={String(result.taken)} label={game.labels.taken} />
        <Tally value={`${result.cleanRounds}/${result.scoringRounds}`} label={game.labels.clean} />
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
            {game.labels.restKept}
          </span>
        ) : (
          <span style={{ fontSize: 13.5, color: 'var(--ink-dim)' }}>{game.labels.restBroken}</span>
        ))}

      {onAgain && (
        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          <Button variant="gold" full onClick={onAgain}>
            Play again
          </Button>
          {onLeave && (
            <Button variant="ghost" onClick={onLeave}>
              Done
            </Button>
          )}
        </div>
      )}
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
