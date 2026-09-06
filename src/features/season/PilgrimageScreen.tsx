import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Page } from '@/components/Page'
import { CrowdLife, type CrowdWaypoint } from '@/components/CrowdLife'
import { useAuth } from '@/store/auth'
import { Collapsible } from '@/components/Collapsible'
import { useSeason } from '@/store/season'
import { useJuice } from '@/juice/useJuice'
import {
  roadLength,
  activeRoad,
  daysLeft,
  nextPayout,
  rewardLabel,
  type RoadDef,
} from '@/data/season'
import { MILES_PER_WAYSTATION, milesProgress } from '@/lib/season'
import { SeasonCosmetics } from './SeasonCosmetics'
import { roadBackground } from './roadArt'
import { RewardArt } from './RewardArt'

// The road. The waystations run as a HORIZONTAL rail of reward art now — the
// battle-pass shape — with the next unclaimed one enlarged and scrolled into
// the middle on load, so the first thing a player sees is the thing they are
// walking toward, drawn rather than named. It used to be a vertical list of
// text rows ("1 · Streak Freeze, Ruth the Gleaner"), which was the clearest
// goal list in the app rendered as the least appetising surface in it.
//
// Every station is drawn, including the ones that pay nothing, as a plain
// milestone dot — the gaps are pacing, and a list that skipped from 2 to 4
// read as broken rather than sparse.
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
      <h2 style={{ fontSize: 18, margin: '4px 0 10px' }}>The road</h2>
      <RewardRail road={road} waystation={waystation} />

      <p className="faint" style={{ fontSize: 11.5, marginTop: 16, lineHeight: 1.5 }}>
        {roadLength(road)} waystations, {MILES_PER_WAYSTATION.toLocaleString()} miles each. Everything on
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

function RewardRail({ road, waystation }: { road: RoadDef; waystation: number }) {
  const me = useAuth((s) => s.profile)
  const nextRef = useRef<HTMLDivElement>(null)
  const next = nextPayout(road, waystation)
  const length = roadLength(road)
  const byN = new Map(road.waystations.map((w) => [w.n, w]))

  // Centre the next prize on arrival, once. Not smooth: a rail that slides in
  // from the left on every mount is motion that says nothing.
  useEffect(() => {
    nextRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [])

  return (
    <div
      style={{
        overflowX: 'auto',
        overflowY: 'hidden',
        margin: '0 -18px',
        padding: '6px 18px 10px',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, position: 'relative', width: 'max-content' }}>
        {Array.from({ length }, (_, i) => i + 1).map((n) => {
          const w = byN.get(n)
          const rewards = w ? [...w.a, ...w.b] : []
          const reached = waystation >= n
          const isNext = !!next && next.n === n
          const milestone = !!w?.milestone

          // A station with nothing at it: a dot on the line and its number.
          if (rewards.length === 0) {
            return (
              <div
                key={n}
                aria-hidden
                style={{ display: 'grid', justifyItems: 'center', gap: 4, width: 22, paddingBottom: 2 }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: reached ? 'var(--gold)' : 'var(--stroke)',
                  }}
                />
                <span className="faint" style={{ fontSize: 9.5, fontVariantNumeric: 'tabular-nums' }}>{n}</span>
              </div>
            )
          }

          const tile = isNext ? 70 : milestone ? 60 : 52
          return (
            <div
              key={n}
              ref={isNext ? nextRef : undefined}
              aria-label={`Waystation ${n}: ${rewards.map((r) => rewardLabel(r.id).name).join(', ')}${reached ? ', yours' : ''}`}
              style={{
                display: 'grid',
                justifyItems: 'center',
                gap: 5,
                scrollSnapAlign: 'center',
              }}
            >
              {/* Both columns, stacked — and past two, a 2×2 block, so the
                  road's finale (four prizes at 50) doesn't set the height of
                  the whole rail and leave a band of nothing over every other
                  station. Measured: it did, 108px of it. */}
              <div style={{ display: 'grid', gap: 4, gridTemplateColumns: rewards.length > 2 ? '1fr 1fr' : '1fr' }}>
                {rewards.map((r, i) => (
                  <span
                    key={`${r.id}-${i}`}
                    style={{
                      position: 'relative',
                      borderRadius: 14,
                      overflow: 'hidden',
                      background: reached ? 'rgba(255,210,63,0.14)' : 'rgba(255,255,255,0.05)',
                      border: `${isNext ? 2 : 1}px solid ${reached || isNext ? 'var(--gold)' : 'var(--stroke)'}`,
                      boxShadow: isNext ? '0 0 22px rgba(255,210,63,0.35)' : undefined,
                    }}
                  >
                    <RewardArt id={r.id} size={tile} spec={me?.avatarCharacter} dim={!reached && !isNext} />
                    {r.qty && r.qty > 1 && (
                      <span
                        style={{
                          position: 'absolute',
                          right: 4,
                          bottom: 3,
                          fontFamily: 'var(--font-display)',
                          fontSize: 10.5,
                          fontWeight: 800,
                          color: 'var(--gold)',
                          background: 'rgba(10,4,28,0.75)',
                          borderRadius: 6,
                          padding: '1px 5px',
                        }}
                      >
                        ×{r.qty}
                      </span>
                    )}
                    {reached && (
                      <span
                        aria-hidden
                        style={{
                          position: 'absolute',
                          left: 4,
                          top: 3,
                          fontSize: 10,
                          lineHeight: 1,
                          color: 'var(--good)',
                        }}
                      >
                        ✓
                      </span>
                    )}
                  </span>
                ))}
              </div>
              <span
                style={{
                  width: milestone ? 26 : 22,
                  height: milestone ? 26 : 22,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  fontFamily: 'var(--font-display)',
                  fontSize: 11,
                  fontWeight: 800,
                  background: milestone ? '#3a2a08' : 'var(--card-solid)',
                  border: `2px solid ${reached || isNext ? 'var(--gold)' : 'var(--stroke)'}`,
                  color: reached || isNext ? 'var(--gold)' : 'var(--ink-dim)',
                  boxShadow: milestone ? '0 0 12px rgba(255,210,63,0.4)' : 'none',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {n}
              </span>
              <span
                className="faint"
                style={{
                  fontSize: 10,
                  maxWidth: Math.max(tile, 64),
                  textAlign: 'center',
                  lineHeight: 1.2,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {rewards.map((r) => rewardLabel(r.id).name).join(' · ')}
              </span>
            </div>
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
  // The painting belongs to the road being walked, so a catalog season brings
  // its own backdrop rather than standing everyone in a wheat field in December.
  const road = activeRoad()
  if (!me) return null
  const members = [
    { username: me.username, avatarEmoji: me.avatarEmoji, avatarCharacter: me.avatarCharacter, pet: me.pet, isMe: true },
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
        background: roadBackground(road),
      }}
    >
      <CrowdLife members={members} waypoints={ROAD_WAYPOINTS} sizeFor={roadSizeFor} max={1} />
    </div>
  )
}
