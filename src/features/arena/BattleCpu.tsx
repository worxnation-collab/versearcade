import { useMemo, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Page } from '@/components/Page'
import { Button } from '@/components/Button'
import { Avatar } from '@/components/Avatar'
import { useAuth } from '@/store/auth'
import { useSeason } from '@/store/season'
import { useKeep } from '@/store/keep'
import { useJuice } from '@/juice/useJuice'
import { newBattleSeed, battleVerse, battleModeLabel, type BattleMode } from './battle'
import { ModePicker } from './ModePicker'
import { CpuVersusQuiz } from './CpuVersusQuiz'
import { CPU_PROFILES, CPU_LEVELS, type CpuLevel, type CpuProfile } from './cpu'
import { FavoriteButton } from '@/components/FavoriteButton'
import { MissedList, quoted } from '@/features/daily/MissedList'
import { nearestKeepChallenge } from '@/store/unlocks'
import { DecorThumb } from './KeepArt'
import type { AvatarSpec, DailyVerse, PlayResult } from '@/types'

// Solo Bible Battle vs a simulated CPU, reached from the Study tab. No account
// or opponent needed — you play the same seeded quiz while the CPU races the
// same clock, its score revealing live question-by-question for a real-time
// head-to-head feel.
export default function BattleCpu() {
  const navigate = useNavigate()
  const juice = useJuice()
  const [level, setLevel] = useState<CpuLevel | null>(null)
  const [mode, setMode] = useState<BattleMode>('verse')
  const [seed, setSeed] = useState(() => newBattleSeed())
  const [outcome, setOutcome] = useState<{ player: PlayResult; cpuScore: number } | null>(null)

  const profile = level ? CPU_PROFILES[level] : null
  const verse = useMemo(() => battleVerse(seed, mode), [seed, mode])

  if (!level || !profile) {
    return (
      <CpuPicker
        mode={mode}
        onMode={setMode}
        onExit={() => navigate('/study')}
        onPick={(lv) => {
          juice.coin()
          setLevel(lv)
          setSeed(newBattleSeed())
          setOutcome(null)
        }}
      />
    )
  }

  if (outcome) {
    return (
      <CpuResult
        profile={profile}
        verse={verse}
        outcome={outcome}
        onRematch={() => {
          juice.coin()
          setSeed(newBattleSeed())
          setOutcome(null)
        }}
        onChange={() => {
          juice.select()
          setLevel(null)
          setOutcome(null)
        }}
        onDone={() => navigate('/study')}
      />
    )
  }

  return (
    <CpuVersusQuiz
      key={seed}
      verse={verse}
      seed={seed}
      profile={profile}
      label={`🤖 vs ${profile.name} · ${battleModeLabel(seed, mode)}`}
      onFinish={(player, cpuScore) => setOutcome({ player, cpuScore })}
      onExit={() => setLevel(null)}
      studyDrop
    />
  )
}

// ── Difficulty picker ──
function CpuPicker({
  mode,
  onMode,
  onPick,
  onExit,
}: {
  mode: BattleMode
  onMode: (m: BattleMode) => void
  onPick: (lv: CpuLevel) => void
  onExit: () => void
}) {
  return (
    <Page noNav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <button className="pill" onClick={onExit} aria-label="Back">✕</button>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>Play vs CPU</b>
      </div>

      <div className="center" style={{ marginBottom: 18 }}>
        <div className="floaty" style={{ fontSize: 46 }}>🤖</div>
        <h1 style={{ fontSize: 26, marginTop: 4 }}>Race the CPU</h1>
        <p className="dim" style={{ marginTop: 4 }}>Live head-to-head against the same round. Pick what you're playing, then who.</p>
      </div>

      {/* Mode first, because the CPU rows are the START button — a control BELOW
          them would never be seen, and picking a difficulty is the tap that
          begins the run. */}
      <ModePicker value={mode} onChange={onMode} />

      <div style={{ display: 'grid', gap: 10 }}>
        {CPU_LEVELS.map((lv) => {
          const p = CPU_PROFILES[lv]
          return (
            <motion.button
              key={lv}
              whileTap={{ scale: 0.98 }}
              onClick={() => onPick(lv)}
              className="card"
              style={{ display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', width: '100%', padding: '14px 16px' }}
            >
              <div style={{ fontSize: 36, lineHeight: 1 }}>{p.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ fontWeight: 800, fontSize: 17 }}>{p.name}</b>
                <div className="faint" style={{ fontSize: 12, marginTop: 2, lineHeight: 1.35 }}>{p.blurb}</div>
              </div>
              <span className="pill" style={{ background: 'var(--gold)', color: '#241f0a', fontWeight: 800, fontSize: 13 }}>Play</span>
            </motion.button>
          )
        })}
      </div>
      <p className="faint center" style={{ fontSize: 11, marginTop: 14, lineHeight: 1.4 }}>
        Practice runs — CPU battles don’t affect your rank or win record.
      </p>
      <div style={{ height: 30 }} />
    </Page>
  )
}

// ── Result screen ──
function CpuResult({
  profile,
  verse,
  outcome,
  onRematch,
  onChange,
  onDone,
}: {
  profile: CpuProfile
  verse: DailyVerse
  outcome: { player: PlayResult; cpuScore: number }
  onRematch: () => void
  onChange: () => void
  onDone: () => void
}) {
  const juice = useJuice()
  const me = useAuth((s) => s.profile)
  const you = outcome.player.score
  const cpu = outcome.cpuScore
  const result: 'won' | 'lost' | 'tie' = you > cpu ? 'won' : you < cpu ? 'lost' : 'tie'
  // The line under the verdict used to say "So close — run it back" whatever
  // the margin, including 197 to 576. A player can see both numbers; copy that
  // contradicts them reads as a form letter. So the line comes from the gap.
  const gap = Math.abs(you - cpu)
  const close = gap <= 150
  const sub =
    result === 'won'
      ? close ? 'By a whisker. That was a real race.' : 'Faster and sharper. Nice run!'
      : result === 'tie'
        ? 'Down to the wire — rematch?'
        : close
          ? 'So close — run it back 👀'
          : `${profile.name} had the pace today. The rematch is a fresh verse.`
  // The next keep piece, read AFTER this run has been counted (the effect
  // below tracks first, then this re-reads). A rematch is a tap away and this
  // is the reason to take it.
  const counters = useKeep((s) => s.counters)
  const nextPiece = nearestKeepChallenge(counters)

  // One result = one payout. StrictMode remounts effects in dev, and this one
  // moves counters — the ref makes the double-invoke a no-op.
  const paidOut = useRef(false)
  useEffect(() => {
    result === 'won' ? juice.levelUp() : juice.celebrate()
    if (paidOut.current) return
    paidOut.current = true
    // Beating the CPU walks the road. The only "beat something" verb on the
    // track, and the something is a simulation — the line CpuVersusQuiz
    // already draws. A real battle pays nothing seasonal for winning.
    if (result === 'won') void useSeason.getState().track('cpu_win')
    // Keep challenges (data/keep): a CPU race counts as played, a win as won,
    // and the run's own quality feeds the perfect/combo ladders. Battles are
    // the only thing that moves these counters — see the header of data/keep.
    const k = useKeep.getState()
    void k.track('cpu_played')
    if (result === 'won') void k.track('cpu_won')
    const run = outcome.player
    if (run.correctCount === run.totalQuestions && run.totalQuestions > 0) void k.track('battle_perfect')
    if ((run.comboMax ?? 0) >= 4) void k.track('battle_combo')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Page noNav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <button className="pill" onClick={onDone} aria-label="Back">✕</button>
        <b style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>vs {profile.name}</b>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 16 }}
        style={{ textAlign: 'center', margin: '10px 0 18px' }}
      >
        <div style={{ fontSize: 56 }}>{result === 'won' ? '🏆' : result === 'tie' ? '🤝' : '💪'}</div>
        <h1 className="gradient-text" style={{ fontSize: 30, marginTop: 4 }}>
          {result === 'won' ? 'You won!' : result === 'tie' ? "It's a tie!" : `${profile.name} wins`}
        </h1>
        <p className="dim" style={{ marginTop: 4 }}>{sub}</p>
      </motion.div>

      <CpuScoreRow name={me?.username ? `@${me.username}` : 'You'} emoji={me?.avatarEmoji ?? '😇'} character={me?.avatarCharacter} score={you} winner={result === 'won'} />
      <div className="faint center" style={{ fontSize: 12, letterSpacing: '0.3em', margin: '2px 0' }}>VS</div>
      <CpuScoreRow name={profile.name} emoji={profile.emoji} score={cpu} winner={result === 'lost'} />

      {/* The verse you just raced over — a battle is still a verse challenge, so
          it ends with the same chance to keep it. */}
      <div className="card" style={{ marginTop: 16, textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 17, flex: 1, minWidth: 0 }}>{verse.reference}</b>
          <FavoriteButton reference={verse.reference} variant="icon" />
        </div>
        <p style={{ marginTop: 8, lineHeight: 1.5 }}>{quoted(verse.text)}</p>
      </div>

      <MissedList questions={verse.questions} result={outcome.player} />

      {/* What the next race is FOR. Keep challenges completed in silence and
          the ladder sat folded on the Battle tab; the piece you are closest to
          belongs on the screen with the rematch button. Never a count of what
          is locked — one piece, one bar. */}
      {nextPiece && (
        <div className="card" style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', padding: '10px 14px' }}>
          <span style={{ flexShrink: 0, display: 'grid', placeItems: 'center', width: 44, height: 44 }}>
            <DecorThumb id={nextPiece.decor} size={42} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 10, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Next for your keep
            </span>
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 14, display: 'block' }}>{nextPiece.name}</b>
            <span className="faint" style={{ fontSize: 12 }}>{nextPiece.text} · {nextPiece.have}/{nextPiece.goal}</span>
          </span>
        </div>
      )}

      <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
        <Button variant="gold" full onClick={onRematch}>🔁 Rematch {profile.name}</Button>
        <Button variant="secondary" full onClick={onChange}>Change difficulty</Button>
        <Button variant="ghost" full onClick={onDone}>← Back to Study</Button>
      </div>
      <div style={{ height: 30 }} />
    </Page>
  )
}

function CpuScoreRow({
  name,
  emoji,
  character,
  score,
  winner,
}: {
  name: string
  emoji: string
  character?: AvatarSpec | null
  score: number
  winner: boolean
}) {
  return (
    <div
      className="card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderColor: winner ? 'var(--gold)' : 'var(--stroke)',
        background: winner ? 'rgba(255,210,63,0.1)' : undefined,
      }}
    >
      <Avatar emoji={emoji} character={character} size={44} ring={false} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{name}</b>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className={winner ? 'gradient-text' : undefined} style={{ fontFamily: 'var(--font-display)', fontSize: 20 }}>
          {score.toLocaleString()}
        </div>
        <div className="faint" style={{ fontSize: 10 }}>{winner ? '👑 winner' : 'pts'}</div>
      </div>
    </div>
  )
}
