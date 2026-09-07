import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Button } from '@/components/Button'
import { ArcadeShell } from './ArcadeShell'
import { ArcadeWelcome } from './ArcadeWelcome'
import { TapRunner, type TapSurface } from './TapRunner'
import { useArcadeInvite } from '@/store/arcadeInvite'
import { useArcadeXp, type ArcadePlayResult } from '@/store/arcadeXp'
import { todayLocalDate } from '@/lib/date'
import { isRestRound, type TapGameDef, type TapResult } from '@/lib/tapGame'
import { GENERATED_ART } from '@/data/generatedArt'

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
  hero,
  finale,
  onDeal,
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
   * The machine's painting, as a `GENERATED_ART` id, shown across the top of
   * the gate so the door looks like the room behind it.
   *
   * The gate was a card of text over sixty percent of an empty screen, on a
   * machine whose whole field is a painting one tap away. Absent (or not yet
   * generated) the gate is the text it always was.
   */
  hero?: string
  /**
   * What the run was for, shown under the two numbers once it's over.
   *
   * Word Catch spends a minute pulling a verse apart, so it hands the whole
   * thing back at the end — and "17 words, 1 of 4 lines clean" is a poor last
   * thing to leave somebody looking at when scripture is the point.
   */
  finale?: ReactNode
  /**
   * Called as each run begins, with the run's 1-based number, for a machine
   * whose content changes between goes.
   *
   * Word Catch is the one that needs it: run 1 is the day's shared verse (which
   * is what makes a share link mean anything), and "Play again" deals a
   * different one rather than the same four lines over and over. It fires
   * BEFORE `playing` flips, so the new `game` and `surface` are already on this
   * component by the time `TapRunner` remounts on `runs`.
   */
  onDeal?: (run: number) => void
  /** A free go from a shared link: pays nothing, and offers no "again". */
  demo?: boolean
}) {
  const navigate = useNavigate()
  const [runs, setRuns] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [result, setResult] = useState<TapResult | null>(null)
  const [reward, setReward] = useState<ArcadePlayResult | null>(null)

  // The run number lives in a ref as well as in state because `onDeal` must be
  // called exactly once per go: a state updater is not a safe place for a side
  // effect (StrictMode invokes it twice, which would deal two verses and show
  // the second).
  const runNo = useRef(0)
  const start = useCallback(() => {
    setResult(null)
    setReward(null)
    runNo.current += 1
    onDeal?.(runNo.current)
    setRuns(runNo.current)
    setPlaying(true)
  }, [onDeal])

  const done = useCallback(
    (r: TapResult) => {
      setPlaying(false)
      setResult(r)
      // The day's first run on this machine is worth 5 XP. Deliberately AFTER
      // the result is on screen and deliberately not awaited: the payout is a
      // small welcome, and a machine that made you wait on the network to see
      // how your run went would have the tail wagging the dog.
      //
      // A FREE GO PAYS NOTHING. There is no account behind a shared link to pay
      // into, and paying for one would make a share farmable in a way nothing
      // else in this app is — the same reason a demo records no relic, no road
      // step and no Bible mark.
      if (!demo) void useArcadeXp.getState().record(id).then(setReward)
      // On a shared link the run that just ended was the free go. The store
      // no-ops outside a demo, so this is flat rather than conditional.
      useArcadeInvite.getState().notePlayEnded(todayLocalDate())
    },
    [demo, id],
  )

  return (
    <ArcadeShell title={game.name} tagline={tagline} shareId={id}>
      {playing ? (
        <TapRunner key={runs} game={game} surface={surface} demo={demo} onDone={done} />
      ) : result ? (
        <>
          <Harvest
            game={game}
            result={result}
            reward={reward}
            // A free go is one run. Offering "again" under it would make the
            // sign-up card below a suggestion rather than the next step.
            onAgain={demo ? undefined : start}
            onLeave={demo ? undefined : () => navigate('/arcade')}
          />
          {finale}
        </>
      ) : (
        <Gate game={game} hero={hero} how={how} cta={cta} demo={demo} onStart={start} />
      )}
    </ArcadeShell>
  )
}

function Gate({
  game,
  hero,
  how,
  cta,
  demo,
  onStart,
}: {
  game: TapGameDef
  hero?: string
  how: string[]
  cta: string
  demo?: boolean
  onStart: () => void
}) {
  const art = hero ? GENERATED_ART[hero] : undefined
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 20, overflow: 'hidden' }}>
      {art && (
        // Bled to the card's edges and faded into it at the bottom, so it reads
        // as the room seen through the door rather than a picture on a card.
        <div
          aria-hidden
          style={{
            margin: '-20px -20px 0',
            height: 168,
            position: 'relative',
            background: `url(${art}) center 48% / cover no-repeat`,
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg, rgba(20,10,52,0) 45%, var(--card-solid) 100%)',
            }}
          />
        </div>
      )}

      {/* The run's shape, at a glance: every round as a chip, in order, with a
          rest round drawn as one. Derived from the definition so it can't say
          something the game doesn't do. "Day 1 … Day 7 (rest)" is the whole
          of Manna Rush in one line; four "Line" chips is Word Catch's. */}
      <RoundStrip game={game} />

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

function RoundStrip({ game }: { game: TapGameDef }) {
  if (game.rounds.length < 2) return null
  const rests = game.rounds.filter(isRestRound).length
  const scoring = game.rounds.length - rests
  // The chips carry a number and the caption carries the noun — "Day 1" and
  // "Line 1 of 4" both start with it — because one word per round is all a
  // strip of seven has room for on a 320px phone.
  const noun = game.rounds[0].title.split(/\s/)[0].toLowerCase()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {game.rounds.map((r, i) => {
          const rest = isRestRound(r)
          return (
            <span
              key={r.key}
              title={r.title}
              style={{
                flex: '1 1 0',
                minWidth: 30,
                textAlign: 'center',
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: 11,
                padding: '5px 0',
                borderRadius: 8,
                border: `1px solid ${rest ? 'var(--gold)' : 'var(--stroke)'}`,
                color: rest ? 'var(--gold)' : 'var(--ink-dim)',
                background: rest ? 'rgba(255,210,63,0.08)' : 'rgba(0,0,0,0.22)',
                whiteSpace: 'nowrap',
              }}
            >
              {rest ? '☀' : i + 1}
            </span>
          )
        })}
      </div>
      <span style={{ fontSize: 11.5, color: 'var(--ink-faint)' }}>
        {scoring} {noun}s{rests ? ` to gather · ${rests === 1 ? 'one' : rests} to keep still` : ''}
      </span>
    </div>
  )
}

function Harvest({
  game,
  result,
  reward,
  onAgain,
  onLeave,
}: {
  game: TapGameDef
  result: TapResult
  /** The day's welcome, if this run earned it. Null until the call lands. */
  reward: ArcadePlayResult | null
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

      {/* Above the rest-day stamp and the buttons, under the two numbers: it
          belongs to the run that just ended, not to what happens next. */}
      <ArcadeWelcome reward={reward} />

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

      <Taught lines={result.taught} />

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

/**
 * The verses the run turned up.
 *
 * Every teach line was a two-second toast under a falling flake, read once by
 * whoever was quick enough. This hands them back in the same frame the missed
 * list uses on a quiz result: what you now know, never what you got wrong — no
 * count of taps, no ✗, and a run that never needed teaching shows nothing. Only
 * lines with a citation land here; Word Catch's "that one comes later" is
 * about the game, not the world.
 */
function Taught({ lines }: { lines: TapResult['taught'] }) {
  const cited = lines.filter((l) => l.cite)
  if (!cited.length) return null
  return (
    <div style={{ width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span
        style={{
          fontSize: 10,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--ink-faint)',
          textAlign: 'center',
        }}
      >
        What the run turned up
      </span>
      {cited.map((l) => (
        <div
          key={l.text}
          style={{
            padding: '9px 12px',
            borderRadius: 'var(--r-md)',
            background: 'rgba(0,0,0,0.22)',
            border: '1px solid var(--stroke)',
            fontSize: 13.5,
            lineHeight: 1.45,
          }}
        >
          <span style={{ fontStyle: 'italic' }}>“{l.text}”</span>
          <span
            style={{
              display: 'block',
              marginTop: 3,
              fontSize: 10.5,
              letterSpacing: '0.09em',
              textTransform: 'uppercase',
              color: 'var(--gold)',
            }}
          >
            {l.cite}
          </span>
        </div>
      ))}
    </div>
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
