import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Page } from '@/components/Page'
import { CrowdLife, type CrowdWaypoint } from '@/components/CrowdLife'
import { useAuth } from '@/store/auth'
import { Collapsible } from '@/components/Collapsible'
import { useSeason } from '@/store/season'
import { useJuice } from '@/juice/useJuice'
import {
  ROAD_LENGTH,
  activeRoad,
  daysLeft,
  rewardLabel,
  type Reward,
} from '@/data/season'
import { MILES_PER_WAYSTATION, milesProgress } from '@/lib/season'
import { SeasonCosmetics } from './SeasonCosmetics'

// The road. A vertical scroller of waystations — vertical because the app is
// 520px wide at most and a horizontal track on a phone is a swipe nobody makes.
//
// What is deliberately NOT on this screen: any other player, any pace
// indicator, any percentage of the road walked, any count of what was missed.
// The road says where you are and what's next. That's the whole contract.

export default function PilgrimageScreen() {
  const navigate = useNavigate()
  const load = useSeason((s) => s.load)
  const miles = useSeason((s) => s.miles)
  const waystation = useSeason((s) => s.waystation)
  const road = activeRoad()

  useEffect(() => {
    void load()
  }, [load])

  if (!road) {
    return (
      <Page>
        <BackBar onBack={() => navigate('/play')} />
        <div className="card" style={{ textAlign: 'center', padding: 28 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🌾</div>
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>The road is resting</h2>
          <p className="dim" style={{ fontSize: 14, margin: 0, lineHeight: 1.5 }}>
            A new one opens soon. Everything you earned on the last one is still yours.
          </p>
        </div>
      </Page>
    )
  }

  const { into, span, pct } = milesProgress(miles)
  const left = daysLeft(road)

  return (
    <Page>
      <BackBar onBack={() => navigate('/play')} />

      {/* Header — the road, where you are, and how long it's open. Note what
          isn't here: no "34/50", no percentage complete. The number that goes
          up is miles walked, and it only ever goes up. */}
      <motion.div
        className="card"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: 16, position: 'relative', overflow: 'hidden' }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: 'radial-gradient(400px 200px at 50% 0%, rgba(255,210,63,0.14), transparent 70%)',
          }}
        />
        <div style={{ position: 'relative' }}>
          <span className="pill" style={{ marginBottom: 10 }}>🌾 The Pilgrimage</span>
          <h1 style={{ fontSize: 24, marginBottom: 4 }}>{road.name}</h1>
          <p className="dim" style={{ fontSize: 13.5, margin: '0 0 14px', lineHeight: 1.5 }}>
            {road.blurb}
          </p>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
            <span className="dim" style={{ fontWeight: 700 }}>Waystation {waystation}</span>
            <span className="faint">{into}/{span} miles</span>
          </div>
          <div
            style={{
              height: 12,
              borderRadius: 999,
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid var(--stroke)',
              overflow: 'hidden',
            }}
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct * 100}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 22 }}
              style={{ height: '100%', background: 'linear-gradient(90deg, var(--gold), var(--tangerine))' }}
            />
          </div>
          <p className="faint" style={{ fontSize: 11.5, margin: '8px 0 0' }}>
            {miles.toLocaleString()} miles walked · {left} day{left === 1 ? '' : 's'} left on this road
          </p>
        </div>
      </motion.div>

      <RoadScene />

      <QuestSection />

      <div style={{ marginBottom: 16 }}>
        <SeasonCosmetics />
      </div>

      {/* The road itself. */}
      <h2 style={{ fontSize: 18, margin: '4px 0 12px' }}>The road</h2>
      <div style={{ position: 'relative', paddingLeft: 46 }}>
        {/* The rail. Sits behind the nodes and runs the length of the list. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 17,
            top: 16,
            bottom: 16,
            width: 3,
            borderRadius: 2,
            background: 'linear-gradient(180deg, var(--gold) 0%, var(--grape) 45%, rgba(160,107,255,0.25) 100%)',
          }}
        />
        {road.waystations.map((w) => (
          <WayRow
            key={w.n}
            n={w.n}
            rewards={[...w.a, ...w.b]}
            milestone={!!w.milestone}
            reached={waystation >= w.n}
          />
        ))}
      </div>

      <p className="faint" style={{ fontSize: 11.5, marginTop: 16, lineHeight: 1.5 }}>
        {ROAD_LENGTH} waystations, {MILES_PER_WAYSTATION.toLocaleString()} miles each. Everything on
        this road is free, and everything you reach is yours to keep after it closes.
      </p>
    </Page>
  )
}

function BackBar({ onBack }: { onBack: () => void }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <button className="pill" onClick={onBack} aria-label="Back">
        ← Back
      </button>
    </div>
  )
}

function WayRow({
  n,
  rewards,
  milestone,
  reached,
}: {
  n: number
  rewards: Reward[]
  milestone: boolean
  reached: boolean
}) {
  return (
    <div
      style={{
        position: 'relative',
        padding: milestone ? '15px 0' : '11px 0',
        borderTop: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: -38,
          top: milestone ? 15 : 11,
          width: 33,
          height: 33,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'var(--font-display)',
          fontSize: 13,
          fontWeight: 800,
          background: milestone ? '#3a2a08' : 'var(--card-solid)',
          border: `2px solid ${milestone ? 'var(--gold)' : 'var(--stroke)'}`,
          color: milestone ? 'var(--gold)' : 'var(--ink-dim)',
          boxShadow: milestone ? '0 0 14px rgba(255,210,63,0.4)' : 'none',
          // Reached waystations read as solid; the rest are quieter but never
          // "locked" — there is no lock icon on this screen, because nothing
          // here is withheld, only not yet walked to.
          opacity: reached ? 1 : 0.75,
        }}
      >
        {n}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, opacity: reached ? 1 : 0.72 }}>
        {rewards.map((r, i) => {
          const label = rewardLabel(r.id)
          return (
            <span
              key={`${r.id}-${i}`}
              style={{
                fontSize: 12.5,
                padding: '5px 10px',
                borderRadius: 8,
                border: `1px solid ${reached ? 'rgba(255,210,63,0.4)' : 'var(--stroke)'}`,
                background: reached ? 'rgba(255,210,63,0.12)' : 'rgba(255,255,255,0.04)',
                color: reached ? 'var(--gold)' : 'var(--ink-dim)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span aria-hidden>{label.glyph}</span>
              {label.name}
              {r.qty && r.qty > 1 ? ` ×${r.qty}` : ''}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function QuestSection() {
  const juice = useJuice()
  const quests = useSeason((s) => s.liveQuests())
  const reroll = useSeason((s) => s.reroll)
  const rerolled = useSeason((s) => s.rerolled)
  const rerolledOn = useSeason((s) => s.rerolledOn)

  const dailies = quests.filter((q) => q.kind === 'daily')
  const weeklies = quests.filter((q) => q.kind === 'weekly')
  const open = dailies.filter((q) => !q.done).length

  const today = new Date()
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const d = String(today.getDate()).padStart(2, '0')
  const canReroll = rerolledOn !== `${y}-${m}-${d}` || rerolled.length === 0

  return (
    <div style={{ marginBottom: 16 }}>
      <Collapsible
        icon="📜"
        title="Quests"
        meta={open > 0 ? `${open} today` : 'all done today'}
        defaultOpen
      >
        <p className="faint" style={{ fontSize: 11.5, margin: '0 0 10px', lineHeight: 1.5 }}>
          Everyone gets the same three today. Weeklies stay until the road closes — miss a week and
          you lose nothing.
        </p>

        {dailies.map((q) => (
          <QuestRow
            key={q.id}
            text={q.text}
            progress={q.progress}
            goal={q.goal}
            done={q.done}
            miles={q.miles}
            onReroll={
              !q.done && canReroll
                ? () => {
                    juice.tap()
                    void reroll(q.key)
                  }
                : undefined
            }
          />
        ))}

        {weeklies.length > 0 && (
          <>
            <div
              className="faint"
              style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '14px 0 8px' }}
            >
              This road
            </div>
            {weeklies.map((q) => (
              <QuestRow
                key={q.id}
                text={q.text}
                progress={q.progress}
                goal={q.goal}
                done={q.done}
                miles={q.miles}
                gilded={q.gilded}
              />
            ))}
          </>
        )}
      </Collapsible>
    </div>
  )
}

function QuestRow({
  text,
  progress,
  goal,
  done,
  miles,
  gilded,
  onReroll,
}: {
  text: string
  progress: number
  goal: number
  done: boolean
  miles: number
  gilded?: boolean
  onReroll?: () => void
}) {
  const pct = Math.min(1, goal > 0 ? progress / goal : 0)
  return (
    <div style={{ padding: '9px 0', borderBottom: '1px solid var(--stroke)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 13.5, flex: 1, color: done ? 'var(--ink-faint)' : 'var(--ink)' }}>
          {done ? '✓ ' : ''}
          {text}
          {gilded && (
            <span style={{ color: 'var(--gold)', fontSize: 11, marginLeft: 6, fontWeight: 700 }}>
              GILDED
            </span>
          )}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 12,
            color: done ? 'var(--ink-faint)' : 'var(--gold)',
            whiteSpace: 'nowrap',
          }}
        >
          {miles} mi
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
        <div
          style={{
            flex: 1,
            height: 6,
            borderRadius: 999,
            background: 'rgba(0,0,0,0.35)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${pct * 100}%`,
              height: '100%',
              background: done ? 'var(--good)' : 'linear-gradient(90deg, var(--grape), var(--gold))',
            }}
          />
        </div>
        <span className="faint" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
          {Math.min(progress, goal)}/{goal}
        </span>
        {onReroll && (
          <button
            className="pill"
            onClick={onReroll}
            style={{ padding: '2px 8px', fontSize: 11 }}
            aria-label="Swap this quest"
          >
            ⟳
          </button>
        )}
      </div>
    </div>
  )
}

// ── The road itself, walked ─────────────────────────────────────────────────
// Your character wandering the season's landscape on the shared CrowdLife
// engine — the same living figures as the keep and the churchyard. ONE figure,
// deliberately: the Pilgrimage never shows another player, no pace, no
// comparison (docs/BATTLE-PASS.md), and that rule holds for the scenery too.
// The road is yours alone.

const ROAD_WAYPOINTS: CrowdWaypoint[] = [
  { x: 50, b: 4 },  // the path, front and centre
  { x: 44, b: 14 }, // the first bend
  { x: 53, b: 22 }, // further along
  { x: 48, b: 30 }, // where the path meets the hills
  { x: 24, b: 10 }, // out by the left sheaves
  { x: 72, b: 8 },  // the right verge
]

/** Depth cue: further up the road = smaller. b 4..30% -> 46..24px. */
const roadSizeFor = (b: number) =>
  Math.round(46 - ((Math.min(Math.max(b, 4), 30) - 4) / 26) * 22)

function RoadScene() {
  const me = useAuth((s) => s.profile)
  if (!me) return null
  const members = [
    { username: me.username, avatarEmoji: me.avatarEmoji, avatarCharacter: me.avatarCharacter, isMe: true },
  ]
  return (
    <div
      style={{
        position: 'relative',
        height: 176,
        borderRadius: 'var(--r-md)',
        overflow: 'hidden',
        border: '1px solid var(--stroke)',
        marginBottom: 16,
        // Anchored to the bottom of the painting so the walkable foreground
        // path survives whatever the banner crop takes from the sky.
        background: 'url(/road/harvest.jpg) center bottom / cover no-repeat, #6b4a18',
      }}
    >
      <CrowdLife members={members} waypoints={ROAD_WAYPOINTS} sizeFor={roadSizeFor} max={1} />
    </div>
  )
}
