import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  isRestRound,
  pickKind,
  scoringRounds as countScoringRounds,
  type TapGameDef,
  type TapPlot,
  type TapResult,
  type TeachLine,
} from '@/lib/tapGame'
import { useJuice } from '@/juice/useJuice'
import { useSettings } from '@/store/settings'
import { useDrops } from '@/store/drops'
import { useSeason } from '@/store/season'

// TapRunner owns tap gameplay for EVERY arcade game, the way QuizRunner owns
// quiz gameplay for every quiz mode. The caller supplies rules (a TapGameDef)
// and a look (a TapSurface); this file supplies the clock, the spawns, the
// verdicts, the teach lines, the juice and — the part that must never be
// duplicated — what a finished run is worth.
//
// Anything that should count for every tap game belongs in here once, rather
// than in each game's screen. Concretely, and these are the ones that would
// rot if copied:
//
//   - the study-drop roll, and the fact that it is the ONLY payout. A tap game
//     is something you can be better at than your friend, so it can pay nothing
//     rankable; a relic can only be given to a church. See lib/drops.ts.
//   - season tracking, so a road can ask for tap runs as content.
//   - a run that ends in a harvest and never in a loss.
//
// A second game (the Sower, Word Catch) is a definition and two renderers. If
// you find yourself reaching into this file to special-case one game, add the
// knob to TapGameDef instead.

/** How a game draws itself. Rules are TapGameDef; this is everything visual. */
export interface TapSurface {
  /** Where targets may appear, as percentages of the field box. */
  plots: TapPlot[]
  /** The backdrop, drawn behind everything. */
  field: React.ReactNode
  /** One target. `leaving` is true for the last frames of its life. */
  renderTarget: (t: { kind: string; taken: boolean; leaving: boolean }) => React.ReactNode
}

interface LiveTarget {
  id: number
  kind: string
  leave: boolean
  plot: number
  x: number
  y: number
  scale: number
  taken: boolean
  leaving: boolean
}

/** How long a target's exit animation is given before it leaves the DOM. */
const EXIT_MS = 300
/** The interstitial card between rounds. */
const INTRO_MS = 1500
/** The pause after a round, so the last teach line can be read. */
const BEAT_MS = 1400

type Phase = 'intro' | 'play' | 'beat' | 'done'

export function TapRunner({
  game,
  surface,
  demo,
  onDone,
}: {
  game: TapGameDef
  surface: TapSurface
  /**
   * A free go from a shared link. The run is identical — it just pays nothing,
   * because the person playing it has no account to pay into and writing
   * relics into a stranger's browser is a promise this app can't keep.
   */
  demo?: boolean
  /** Called once, with the finished run. The caller decides what "done" means. */
  onDone: (result: TapResult) => void
}) {
  const juice = useJuice()
  const reduceMotion = useSettings((s) => s.reduceMotion)

  const [round, setRound] = useState(0)
  const [phase, setPhase] = useState<Phase>('intro')
  const [live, setLive] = useState<LiveTarget[]>([])
  const [teach, setTeach] = useState<TeachLine | null>(null)
  const [got, setGot] = useState(0)

  const def = game.rounds[round]
  const rest = isRestRound(def)

  // Everything the schedulers read has to come from a ref, not from the render
  // snapshot: a spawn fired 600ms ago would otherwise plan against the state
  // the last render saw. That is the same bug KeepSheet had on a fast
  // double-tap, and it looks like nothing until two things land on one spot.
  const liveRef = useRef<LiveTarget[]>([])
  const busy = useRef<Set<number>>(new Set())
  const gotRef = useRef(0)
  const cleanRef = useRef(true)
  const missedShown = useRef(false)
  const nextId = useRef(1)
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())
  const totals = useRef({ taken: 0, cleanRounds: 0, restKept: null as boolean | null })
  const finished = useRef(false)
  // Phase and round are mirrored into refs because the round transition has
  // side effects — bookkeeping, sound, a scheduled beat — and side effects must
  // never live inside a setState updater. React double-invokes updaters in
  // StrictMode precisely to surface that, and it did: the first build counted
  // "10 of 6 days clean" because the `cleanRounds += 1` inside setPhase ran
  // twice per round. Nothing here reads state to decide what to do next.
  const phaseRef = useRef<Phase>('intro')
  const roundRef = useRef(0)

  const goPhase = useCallback((p: Phase) => {
    phaseRef.current = p
    setPhase(p)
  }, [])

  const after = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.current.delete(t)
      fn()
    }, ms)
    timers.current.add(t)
    return t
  }, [])

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current.clear()
  }, [])

  useEffect(() => () => clearTimers(), [clearTimers])

  const say = useCallback(
    (line: TeachLine | undefined, ms = 2400) => {
      if (!line) return
      setTeach(line)
      after(() => setTeach((t) => (t === line ? null : t)), ms)
    },
    [after],
  )

  /** Take a target off the field: animate out, then drop it. */
  const retire = useCallback(
    (id: number, how: 'taken' | 'leaving') => {
      const t = liveRef.current.find((x) => x.id === id)
      if (!t || t.taken || t.leaving) return
      busy.current.delete(t.plot)
      liveRef.current = liveRef.current.map((x) =>
        x.id === id ? { ...x, [how]: true } : x,
      )
      setLive(liveRef.current)
      after(() => {
        liveRef.current = liveRef.current.filter((x) => x.id !== id)
        setLive(liveRef.current)
      }, EXIT_MS)
    },
    [after],
  )

  const endRound = useCallback(
    (reason: 'quota' | 'time') => {
      if (phaseRef.current !== 'play') return
      goPhase('beat')
      clearTimers()

      if (rest) {
        totals.current.restKept = cleanRef.current
        say({ text: cleanRef.current ? game.labels.restKept : game.labels.restBroken }, 1900)
      } else {
        if (cleanRef.current) totals.current.cleanRounds += 1
        if (reason === 'quota') {
          juice.merge()
          say(game.teach.quota, 1900)
        }
      }

      // The field clears on the beat rather than instantly: a round that
      // vanishes mid-animation reads as a crash.
      after(() => {
        liveRef.current = []
        busy.current.clear()
        setLive([])
        setTeach(null)
        const next = roundRef.current + 1
        if (next >= game.rounds.length) {
          goPhase('done')
          return
        }
        roundRef.current = next
        setRound(next)
        goPhase('intro')
      }, BEAT_MS)
    },
    [after, clearTimers, game, goPhase, juice, rest, say],
  )

  const tap = useCallback(
    (t: LiveTarget) => {
      if (t.taken || t.leaving) return
      if (t.leave) {
        // Never a punishment: no points come off, nothing ends. The run just
        // stops being a clean one, and the verse says why the rule exists.
        cleanRef.current = false
        juice.wrong()
        say(game.teach.wrong)
        retire(t.id, 'leaving')
        return
      }
      gotRef.current += 1
      totals.current.taken += 1
      setGot(gotRef.current)
      juice.coin()
      retire(t.id, 'taken')
      if (def.quota > 0 && gotRef.current >= def.quota) endRound('quota')
    },
    [def.quota, endRound, game.teach.wrong, juice, retire, say],
  )

  /** Tapping the bare field — only meaningful in a round with nothing to take. */
  const tapGround = useCallback(() => {
    if (phase !== 'play' || !rest) return
    cleanRef.current = false
    juice.wrong()
    say(game.teach.ground)
  }, [game.teach.ground, juice, phase, rest, say])

  const spawn = useCallback(() => {
    const free = surface.plots
      .map((_, i) => i)
      .filter((i) => !busy.current.has(i))
    if (!free.length) return
    const idx = free[Math.floor(Math.random() * free.length)]
    const plot = surface.plots[idx]
    const kind = pickKind(def.kinds)
    const t: LiveTarget = {
      id: nextId.current++,
      kind: kind.kind,
      leave: kind.verdict === 'leave',
      plot: idx,
      x: plot.x,
      y: plot.y,
      scale: plot.scale,
      taken: false,
      leaving: false,
    }
    busy.current.add(idx)
    liveRef.current = [...liveRef.current, t]
    setLive(liveRef.current)
    after(() => {
      const still = liveRef.current.find((x) => x.id === t.id)
      if (!still || still.taken || still.leaving) return
      // Said once per run. A fact about the world, not a scolding — and a line
      // that fires every few seconds becomes one.
      if (!t.leave && !missedShown.current && game.teach.missed) {
        missedShown.current = true
        say(game.teach.missed)
      }
      retire(t.id, 'leaving')
    }, def.lifeMs)
  }, [after, def.kinds, def.lifeMs, game.teach.missed, retire, say, surface.plots])

  // ── the round clock ────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'intro') {
      gotRef.current = 0
      cleanRef.current = true
      setGot(0)
      const t = setTimeout(() => goPhase('play'), INTRO_MS)
      return () => clearTimeout(t)
    }
    if (phase !== 'play') return

    say({ text: def.note }, 2600)
    let spawner: ReturnType<typeof setInterval> | undefined
    if (!rest) {
      spawn()
      spawner = setInterval(spawn, def.spawnEveryMs)
    }
    const ender = setTimeout(() => endRound('time'), def.durationMs)
    return () => {
      if (spawner) clearInterval(spawner)
      clearTimeout(ender)
    }
    // `spawn` and `endRound` are stable per round; re-running on every live
    // target would restart the clock mid-round.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, round])

  useEffect(() => {
    if (phase !== 'done' || finished.current) return
    finished.current = true
    clearTimers()
    juice.celebrate()

    // The one payout, and it is the whole reason a game about thumbs is
    // allowed to exist here: a relic, which buys nothing and ranks nobody.
    if (!demo) {
      void useDrops.getState().roll()
      void useSeason.getState().track('tap_run', { count: 1 })
      if (totals.current.taken > 0) {
        void useSeason.getState().track('tap_gather', { count: totals.current.taken })
      }
      if (totals.current.restKept) void useSeason.getState().track('tap_rest_kept')
    }

    onDone({
      taken: totals.current.taken,
      cleanRounds: totals.current.cleanRounds,
      scoringRounds: countScoringRounds(game),
      restKept: totals.current.restKept,
    })
  }, [clearTimers, demo, game, juice, onDone, phase])

  const pips = useMemo(
    () => Array.from({ length: def.quota }, (_, i) => i < got),
    [def.quota, got],
  )

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '10 / 15',
        maxHeight: '68vh',
        margin: '0 auto',
        borderRadius: 'var(--r-lg)',
        overflow: 'hidden',
        border: '1px solid var(--stroke)',
        boxShadow: 'var(--shadow-soft)',
        userSelect: 'none',
        touchAction: 'manipulation',
      }}
    >
      {surface.field}

      {/* HUD ───────────────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: '12px 14px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          zIndex: 6,
          pointerEvents: 'none',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 14,
            background: 'rgba(11,7,32,0.6)',
            border: '1px solid var(--stroke)',
            padding: '5px 12px',
            borderRadius: 'var(--r-pill)',
          }}
        >
          {def.title}
        </span>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '58%' }}>
          {rest ? (
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: 12,
                color: 'var(--mint)',
                background: 'rgba(11,7,32,0.6)',
                border: '1px solid var(--stroke)',
                padding: '5px 12px',
                borderRadius: 'var(--r-pill)',
              }}
            >
              Rest
            </span>
          ) : (
            pips.map((full, i) => (
              <span
                key={i}
                style={{
                  width: 9,
                  height: 12,
                  borderRadius: '3px 3px 5px 5px',
                  background: full ? 'var(--gold)' : 'rgba(255,255,255,0.13)',
                  border: `1px solid ${full ? '#fff0b8' : 'rgba(255,255,255,0.22)'}`,
                  boxShadow: full ? '0 0 8px rgba(255,210,63,0.7)' : undefined,
                }}
              />
            ))
          )}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 48,
          left: 14,
          right: 14,
          height: 4,
          borderRadius: 'var(--r-pill)',
          background: 'rgba(11,7,32,0.5)',
          overflow: 'hidden',
          zIndex: 6,
          pointerEvents: 'none',
        }}
      >
        {phase === 'play' && (
          <motion.i
            key={round}
            initial={{ scaleX: 1 }}
            animate={{ scaleX: 0 }}
            transition={{ duration: def.durationMs / 1000, ease: 'linear' }}
            style={{
              display: 'block',
              height: '100%',
              transformOrigin: 'left',
              background: 'linear-gradient(90deg, var(--grape), var(--mint))',
            }}
          />
        )}
      </div>

      {/* The field. The bottom is kept clear of the teach line — a target you
          cannot reach because a toast is over it is not a hard target, it is a
          broken one. */}
      <div
        onClick={tapGround}
        style={{ position: 'absolute', left: 0, right: 0, top: '44%', bottom: 84, zIndex: 4 }}
      >
        {live.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-label={t.leave ? 'leave this one' : 'take this one'}
            onClick={(e) => {
              e.stopPropagation()
              tap(t)
            }}
            style={{
              position: 'absolute',
              left: `${t.x}%`,
              top: `${t.y}%`,
              width: 46,
              height: 46,
              padding: 0,
              display: 'grid',
              placeItems: 'center',
              transform: `translate(-50%, -50%) scale(${t.scale})`,
            }}
          >
            {surface.renderTarget({ kind: t.kind, taken: t.taken, leaving: t.leaving })}
          </button>
        ))}
      </div>

      {/* The teach line ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {teach && (
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: 0.22 }}
            style={{
              position: 'absolute',
              left: 12,
              right: 12,
              bottom: 14,
              zIndex: 7,
              background: 'rgba(11,7,32,0.88)',
              border: '1px solid var(--stroke)',
              borderRadius: 'var(--r-md)',
              padding: '11px 14px',
              fontSize: 13.5,
              lineHeight: 1.45,
              pointerEvents: 'none',
            }}
          >
            {teach.text}
            {teach.cite && (
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
                {teach.cite}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* The card between rounds ────────────────────────────────────────── */}
      <AnimatePresence>
        {phase === 'intro' && (
          <motion.div
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24 }}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 9,
              display: 'grid',
              placeItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                background: 'rgba(11,7,32,0.9)',
                border: '1px solid var(--stroke)',
                borderRadius: 'var(--r-lg)',
                padding: '20px 26px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
              }}
            >
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 31 }}>
                {def.title}
              </span>
              <span style={{ fontSize: 13, color: 'var(--ink-dim)' }}>{def.note}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
