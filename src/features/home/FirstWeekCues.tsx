import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Button } from '@/components/Button'
import { ChurchArt } from '@/features/church/ChurchArt'
import { churchLevelInfo, nextTier, tierForLevel } from '@/features/church/levels'
import { useBibleMarks } from '@/features/bible/useBibleMarks'
import { wholeBibleTiers } from '@/lib/bibleProgress'
import { useChurch } from '@/store/church'
import { useSettings } from '@/store/settings'
import { useJuice } from '@/juice/useJuice'
import { useInvitations } from '@/features/map/invitations'

// The first week's one-time cues on the Play tab. Every one of them is shown
// ONCE (a flag in local settings, the `tutorialSeen` shape), says one sentence,
// opens one place, and then never comes back — so the tab ends the first week
// looking exactly as it always has. None of them counts anything about anybody
// else, and none of them is a checklist: there is no "2 of 3 done", and a cue
// that has done its job simply stops rendering.

/** Plays under which a cue is still "early". Past this a player has found
 *  their way around and a first-week hint would be noise. */
export const EARLY_PLAYS = 14

// ── After the first drop: three places, once ───────────────────────────────
// Shown by HomeScreen as a sheet the first time somebody lands back on the
// tab having just finished their very first daily verse. Not now = never again.
// The middle card IS the church flow: for an account it opens in place (find →
// give → watch it grow) rather than being a second sheet days later; for a
// guest it opens /church, where the wall says what a church adds.
export function FirstDropTour({
  churchPhase,
  onFind,
  onDone,
}: {
  churchPhase: 'find' | 'give' | null
  onFind: () => void
  onDone: () => void
}) {
  const navigate = useNavigate()
  const juice = useJuice()
  const reduceMotion = useSettings((s) => s.reduceMotion)
  // Frozen at the tap: giving changes what HomeScreen computes, and the card
  // must not swap phases (or vanish) at the moment the building grows.
  const [inChurch, setInChurch] = useState<'find' | 'give' | null>(null)
  const go = (to: string) => {
    juice.select()
    if (to === '/church' && churchPhase) {
      setInChurch(churchPhase)
      return
    }
    onDone()
    navigate(to)
  }
  if (inChurch) {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <button
          className="pill"
          onClick={() => { juice.select(); setInChurch(null) }}
          style={{ justifySelf: 'start', fontWeight: 800 }}
        >
          ← Back
        </button>
        <ChurchMoment phase={inChurch} onFind={onFind} onDone={onDone} />
      </div>
    )
  }
  const stops = [
    { icon: '🕯️', title: 'Your Upper Room', line: 'A room of your own you furnish as you play.', to: '/you' },
    { icon: '⛪', title: 'Play for your church', line: 'Find your congregation and give your points to its building.', to: '/church' },
    { icon: '🕹️', title: 'The arcade', line: 'Free-play machines for after the drop — no rank, just play.', to: '/arcade' },
  ]
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <p className="dim" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
        That’s the day’s verse done. Three places worth knowing about — tap one, or come back to them whenever.
      </p>
      {stops.map((s, i) => (
        <motion.button
          key={s.to}
          className="card"
          onClick={() => go(s.to)}
          initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 * i }}
          style={{ display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer', width: '100%', color: 'var(--ink)' }}
        >
          <span style={{ fontSize: 28, flexShrink: 0 }} aria-hidden>{s.icon}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <b style={{ display: 'block', fontSize: 15 }}>{s.title}</b>
            <span className="dim" style={{ fontSize: 13 }}>{s.line}</span>
          </span>
          <span style={{ color: 'var(--gold)', fontFamily: 'var(--font-display)', fontSize: 18 }}>→</span>
        </motion.button>
      ))}
      <Button variant="ghost" full onClick={onDone}>Not now</Button>
    </div>
  )
}

// ── Your church, as a personal early win ───────────────────────────────────
// The tour's middle card, opened in place. Two phases:
//   'find' — no church yet: the building, one line, one door into /church
//            (the existing picker). Tapping it records 'found'.
//   'give' — WITH a church and nothing given: give the points in hand right
//            here (the store's own `contribute`), and watch the building take
//            them — the bar fills, and a new tier grows in.
// After 'found', HomeScreen offers the give once more on its own when the
// player comes back with a church; dismissed or done, it records 'done'.
export function ChurchMoment({ phase, onFind, onDone }: { phase: 'find' | 'give'; onFind: () => void; onDone: () => void }) {
  return phase === 'find' ? <FindPhase onFind={onFind} onDone={onDone} /> : <GivePhase onDone={onDone} />
}

function Steps({ at }: { at: 0 | 1 | 2 }) {
  const labels = ['Find your congregation', 'Give today’s points', 'Watch it grow']
  return (
    <ol style={{ display: 'flex', gap: 6, listStyle: 'none', padding: 0, margin: 0, flexWrap: 'wrap', justifyContent: 'center' }}>
      {labels.map((l, i) => (
        <li
          key={l}
          className="pill"
          style={{ fontSize: 11.5, fontWeight: 800, background: i === at ? 'var(--select)' : 'var(--card-raised)', color: i <= at ? 'var(--ink)' : 'var(--ink-dim)' }}
        >
          {l}
        </li>
      ))}
    </ol>
  )
}

function FindPhase({ onFind, onDone }: { onFind: () => void; onDone: () => void }) {
  return (
    <div style={{ display: 'grid', gap: 12, justifyItems: 'center', textAlign: 'center' }}>
      <Steps at={0} />
      <ChurchArt level={1} size={120} animate />
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>
        The points you earn here can build your <b>real</b> church — a little building
        that grows as your congregation plays.
      </p>
      <div style={{ display: 'grid', gap: 8, width: '100%' }}>
        <Button variant="gold" full onClick={onFind}>Find your congregation →</Button>
        <Button variant="ghost" full onClick={onDone}>Not now</Button>
      </div>
    </div>
  )
}

function GivePhase({ onDone }: { onDone: () => void }) {
  const juice = useJuice()
  const reduceMotion = useSettings((s) => s.reduceMotion)
  const church = useChurch((s) => s.church)
  const available = useChurch((s) => s.available)
  const contribute = useChurch((s) => s.contribute)
  // Frozen when the sheet opens, so the "before" survives the store updating.
  const [beforeXp] = useState(() => church?.xp ?? 0)
  const [state, setState] = useState<'ready' | 'giving' | 'grown' | 'failed'>('ready')
  const [given, setGiven] = useState(0)

  const before = useMemo(() => churchLevelInfo(beforeXp), [beforeXp])
  const after = useMemo(() => churchLevelInfo(beforeXp + given), [beforeXp, given])
  const grown = state === 'grown'
  const shown = grown ? after : before
  const tierBefore = tierForLevel(before.level)
  const tierNow = tierForLevel(shown.level)
  const next = nextTier(shown.level)

  if (!church) return null

  const give = async () => {
    if (state !== 'ready' || available <= 0) return
    setState('giving')
    const r = await contribute(available)
    if (!r.ok) {
      setState('failed')
      return
    }
    setGiven(r.given)
    setState('grown')
    const a = churchLevelInfo(beforeXp + r.given)
    if (tierForLevel(a.level).id !== tierBefore.id) juice.levelUp()
    else if (a.level > before.level) juice.streak()
    else juice.celebrate()
  }

  return (
    <div style={{ display: 'grid', gap: 12, justifyItems: 'center', textAlign: 'center' }}>
      <Steps at={grown ? 2 : 1} />
      <div style={{ height: 150, display: 'grid', placeItems: 'end center', position: 'relative', width: '100%' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={tierNow.id}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: 20 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
            transition={reduceMotion ? { duration: 0.25 } : { type: 'spring', stiffness: 180, damping: 14 }}
          >
            <ChurchArt level={shown.level} skin={church.skin} size={140} animate={!reduceMotion} />
          </motion.div>
        </AnimatePresence>
      </div>
      <div>
        <b style={{ fontFamily: 'var(--font-body)', fontSize: 17, display: 'block' }}>{church.name}</b>
        <span className="dim" style={{ fontSize: 13 }}>{tierNow.name} · Level {shown.level}</span>
      </div>
      {/* The church's own bar — a church total, never a person's. */}
      <div style={{ width: '100%', height: 10, borderRadius: 999, background: 'var(--card-raised)', overflow: 'hidden' }}>
        <motion.div
          initial={{ width: `${before.pct * 100}%` }}
          animate={{ width: `${shown.pct * 100}%` }}
          transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 90, damping: 18 }}
          style={{ height: '100%', background: 'var(--gold)' }}
        />
      </div>
      {grown ? (
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>
          {tierNow.id !== tierBefore.id
            ? `+${given.toLocaleString()} — it’s a ${tierNow.name} now!`
            : after.level > before.level
              ? `+${given.toLocaleString()} — up to level ${after.level}.`
              : `+${given.toLocaleString()} into the walls.`}
          {next && <span className="dim"> Every member’s gift builds toward the {next.name}.</span>}
        </p>
      ) : state === 'failed' ? (
        <p className="dim" style={{ margin: 0, fontSize: 14 }}>That didn’t go through — the Church tab’s Give card can try again any time.</p>
      ) : (
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>
          You have <b style={{ color: 'var(--gold)' }}>{available.toLocaleString()}</b> points to give. Giving them grows the
          building for everybody who plays there — and keeps nothing from you.
        </p>
      )}
      <div style={{ display: 'grid', gap: 8, width: '100%' }}>
        {state === 'ready' || state === 'giving' ? (
          <>
            <Button variant="gold" full disabled={state === 'giving' || available <= 0} onClick={give}>
              {state === 'giving' ? 'Giving…' : `Give ${available.toLocaleString()} to ${church.name}`}
            </Button>
            <Button variant="ghost" full onClick={onDone}>Not now</Button>
          </>
        ) : (
          <Button variant="gold" full onClick={onDone}>Done</Button>
        )}
      </div>
    </div>
  )
}

// ── Quiet rows ─────────────────────────────────────────────────────────────

function CueRow({ icon, title, line, onClick }: { icon: string; title: string; line: string; onClick: () => void }) {
  const reduceMotion = useSettings((s) => s.reduceMotion)
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        width: '100%', marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
        padding: '9px 12px', borderRadius: 14, border: '1px solid var(--edge)', background: 'transparent',
        color: 'var(--ink)', cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 20, flexShrink: 0 }} aria-hidden>{icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <b style={{ display: 'block', fontSize: 13.5 }}>{title}</b>
        <span className="faint" style={{ fontSize: 12 }}>{line}</span>
      </span>
      <span className="dim" style={{ fontFamily: 'var(--font-display)' }}>→</span>
    </motion.button>
  )
}

/** The arcade, once, after the day's verse — gone the first time the lobby
 *  opens (ArcadeLobby sets `arcadeLobbySeen`). Guests included: the arcade is
 *  open to them. */
export function ArcadeCue({ playedToday, totalPlays }: { playedToday: boolean; totalPlays: number }) {
  const navigate = useNavigate()
  const seen = useSettings((s) => s.arcadeLobbySeen)
  // The compass already lists the arcade from the first week's day 2; one
  // invitation in two places is the checklist this row must not become.
  const listed = useInvitations().some((i) => i.id === 'arcade')
  if (seen || listed || !playedToday || totalPlays > EARLY_PLAYS) return null
  return (
    <CueRow
      icon="🕹️"
      title="The arcade is open"
      line="Free-play machines for after the drop."
      onClick={() => navigate('/arcade')}
    />
  )
}

/** "Your copy is filling in" — a quiet row once a few verses are lit, until the
 *  Bible itself has been opened (BibleScreen sets `bibleMapSeen`). Your own
 *  number only; nothing here is compared with anybody. Both modes: the marks
 *  hook reads the account or the device. */
export function BibleCue({ totalPlays }: { totalPlays: number }) {
  const navigate = useNavigate()
  const seen = useSettings((s) => s.bibleMapSeen)
  const { marks, ready } = useBibleMarks()
  const lit = useMemo(() => {
    const t = wholeBibleTiers(marks)
    return t.saved + t.studied + t.read
  }, [marks])
  if (seen || !ready || lit < 3 || totalPlays > EARLY_PLAYS) return null
  return (
    <CueRow
      icon="📖"
      title={`${lit.toLocaleString()} verses lit in your Bible`}
      line="Every verse you read, study or keep fills in your own copy."
      onClick={() => navigate('/bible')}
    />
  )
}
