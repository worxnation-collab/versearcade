import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { useSettings } from '@/store/settings'
import { useJuice } from '@/juice/useJuice'
import { getVerseForDate } from '@/data/bible/questions'
import { todayLocalDate } from '@/lib/date'
import { PAPER } from '@/features/bible/paper'
import type { TapGameDef, TapResult } from '@/lib/tapGame'
import { TapRunner, type TapSurface } from './TapRunner'
import { ArcadeCabinetBox } from './ArcadeCabinet'
import { MANNA_RUSH } from './manna'
import { mannaSurface } from './MannaField'
import { buildWordCatch } from './wordCatch'
import { wordCatchSurface } from './WordCatchField'

// The arcade cabinet's screens: the machine's front page, and the games on it.
//
// Everything here is open to guests. Nothing an arcade run produces is
// persisted — the one payout is a study drop, which already has both a guest
// path and an online one — so an account would make nothing here yours
// tomorrow, and a padlock in front of that is a padlock in front of nothing.
//
// GameShell is the reason a third game costs one screen and not four: the back
// header, the start gate and the harvest are identical for every game, and the
// only thing that varies is the definition and the surface. The start gate
// lives here rather than in TapRunner for the same reason QuizRunner owns
// StartGate — the engine should not have to know what a title screen is.

// ── the machine's front page ─────────────────────────────────────────────────

export default function ArcadeScreen() {
  const navigate = useNavigate()
  const juice = useJuice()
  const go = (path: string) => {
    juice.select()
    navigate(path)
  }

  return (
    <Page noNav>
      <ArcadeHeader title="The Arcade" subtitle="Two machines, a minute each, no ranks" />

      {/* Flex rather than `.center`: the cabinet is a display:block svg, and
          text-align does not move one of those. */}
      <div style={{ display: 'flex', justifyContent: 'center', margin: '4px 0 18px' }}>
        <ArcadeCabinetBox width={74} />
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <GameCard
          onClick={() => go('/arcade/manna')}
          emblem={<i className="tap-flake manna" style={{ width: 34, height: 34 }} />}
          name="Manna Rush"
          line="Gather what falls, leave what was kept. Seven days in the wilderness."
        />
        <GameCard
          onClick={() => go('/arcade/word-catch')}
          emblem={
            <span
              style={{
                padding: '6px 9px',
                borderRadius: 7,
                background: 'rgba(255,255,255,0.82)',
                border: `1px solid ${PAPER.rule}`,
                color: PAPER.ink,
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: 13,
                transform: 'rotate(-4deg)',
                display: 'inline-block',
              }}
            >
              love
            </span>
          }
          name="Word Catch"
          line="Today’s verse, come loose from the page. Put it back in order."
        />
      </div>

      <p className="faint center" style={{ marginTop: 16, fontSize: 12.5, lineHeight: 1.5 }}>
        Nothing in here touches your rank or your streak. A finished run can turn up a
        relic for your church.
      </p>
    </Page>
  )
}

function GameCard({
  onClick,
  emblem,
  name,
  line,
}: {
  onClick: () => void
  emblem: React.ReactNode
  name: string
  line: string
}) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.985 }}
      className="card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        textAlign: 'left',
        padding: 16,
        width: '100%',
      }}
    >
      <span
        style={{
          width: 46,
          height: 46,
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {emblem}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 17, display: 'block' }}>{name}</b>
        <span className="faint" style={{ fontSize: 12.5, lineHeight: 1.45, display: 'block' }}>
          {line}
        </span>
      </span>
      <span className="pill" style={{ fontSize: 11, flexShrink: 0 }}>
        Play
      </span>
    </motion.button>
  )
}

// ── the games ────────────────────────────────────────────────────────────────

export function MannaScreen() {
  const reduceMotion = useSettings((s) => s.reduceMotion)
  const surface = useMemo(() => mannaSurface({ reduceMotion }), [reduceMotion])
  return (
    <GameShell
      game={MANNA_RUSH}
      surface={surface}
      subtitle="Seven days in the wilderness · Exodus 16"
      how={[
        'Manna falls with the dew. Tap the bright, round flakes to gather your omer.',
        'Leave the pale lumpy ones — those were kept from yesterday, and they bred worms. On the seventh day nothing falls, and the best thing you can do is keep still.',
      ]}
      cta="Go out and gather"
    />
  )
}

export function WordCatchScreen() {
  const reduceMotion = useSettings((s) => s.reduceMotion)
  // The day's verse, straight from the deterministic rotation rather than from
  // the game store: the arcade is reachable from four places, and three of them
  // have no reason to have loaded today's drop.
  const wc = useMemo(() => buildWordCatch(getVerseForDate(todayLocalDate())), [])
  const surface = useMemo(() => wordCatchSurface(wc, { reduceMotion }), [wc, reduceMotion])
  return (
    <GameShell
      game={wc.game}
      surface={surface}
      subtitle={`Today’s verse · ${wc.reference}`}
      how={[
        'The words of today’s verse have come loose from the page. Tap them in the order they belong.',
        'The line at the top shows what you have put back and how long each missing word is. Tap one out of turn and it just drops back — it comes round again.',
      ]}
      cta="Put it back together"
    />
  )
}

// ── the shell both games wear ────────────────────────────────────────────────

function GameShell({
  game,
  surface,
  subtitle,
  how,
  cta,
}: {
  game: TapGameDef
  surface: TapSurface
  subtitle: string
  how: string[]
  cta: string
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
  }, [])

  return (
    <Page noNav>
      <ArcadeHeader title={game.name} subtitle={subtitle} />
      {playing ? (
        <TapRunner key={runs} game={game} surface={surface} onDone={done} />
      ) : result ? (
        <Harvest game={game} result={result} onAgain={start} onLeave={() => navigate('/arcade')} />
      ) : (
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
            Nothing here touches your rank. A finished run can turn up a relic for your church.
          </p>
          <Button variant="gold" full onClick={start}>
            {cta}
          </Button>
        </div>
      )}
    </Page>
  )
}

function ArcadeHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const navigate = useNavigate()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <button
        type="button"
        onClick={() => navigate(-1)}
        aria-label="Back"
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
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontSize: 24 }}>{title}</h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-dim)' }}>{subtitle}</p>
      </div>
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
      <h2 style={{ fontSize: 24 }}>How it went</h2>

      {/* Your own two numbers, against your own bar. Nothing on this screen can
          be put beside somebody else's — that is what lets a game you can be
          better at than a friend exist in this app at all. */}
      <div style={{ display: 'flex', gap: 22, justifyContent: 'center' }}>
        <Tally value={String(result.taken)} label={game.labels.taken} />
        <Tally
          value={`${result.cleanRounds}/${result.scoringRounds}`}
          label={game.labels.clean}
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
            {game.labels.restKept}
          </span>
        ) : (
          <span style={{ fontSize: 13.5, color: 'var(--ink-dim)' }}>{game.labels.restBroken}</span>
        ))}

      <div style={{ display: 'flex', gap: 10, width: '100%' }}>
        <Button variant="gold" full onClick={onAgain}>
          Play again
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
