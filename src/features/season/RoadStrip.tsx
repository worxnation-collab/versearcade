import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useSeason } from '@/store/season'
import { useAuth } from '@/store/auth'
import { useSettings } from '@/store/settings'
import { Character } from '@/components/Character'
import { roadBackground } from './roadArt'
import { RewardArt } from './RewardArt'
import { activeRoad, nextPayout, rewardLabel } from '@/data/season'
import { milesProgress } from '@/lib/season'

// The Pilgrimage's front door, on the Play tab.
//
// The bottom nav is full at five tabs and a sixth would crowd a thumb, so the
// road gets a strip here instead — a bar, the next reward, today's quests, and
// a tap. This is how the feature is seen at all; the screen behind it is where
// you go to look at the whole road.
//
// **Today's quests are on the strip now, and that is the point of it.** The
// strip used to show the mileage bar alone — the SCORE — while the three things
// a player could actually do about it sat one route away. Miles are what you
// cannot act on; the quests are what you can. So the instructions sit above
// the score. Same rules as the road screen: the three are everyone's three,
// each is a bar toward a goal it names, and a finished one simply reads as
// finished — no streak of days, no count of days missed.
//
// It shows what's NEXT and never how far behind you are. There is no pace bar,
// no "63% of players are past this", no percentage of the road walked — that
// comparison is the one thing this app doesn't do. And the next reward is drawn
// as the THING (`RewardArt`), not named: a picture of a headscarf is a reason
// to walk; the words "Harvest Headscarf" are a fact.
//
// The tile on the left is a WINDOW INTO THE ROAD, not an icon: the same
// painting the Pilgrimage screen opens with, cropped small, with you standing
// in it. The crop is shared (roadArt.ts) so the peek and the screen behind it
// can't drift into two different pictures.
export function RoadStrip() {
  const navigate = useNavigate()
  const load = useSeason((s) => s.load)
  const miles = useSeason((s) => s.miles)
  const waystation = useSeason((s) => s.waystation)
  const quests = useSeason((s) => s.liveQuests())
  const road = activeRoad()
  const me = useAuth((s) => s.profile)
  const reduceMotion = useSettings((s) => s.reduceMotion)

  useEffect(() => {
    void load()
  }, [load])

  // Between roads there is nothing to show, and an empty card saying so would
  // just be a hole on the busiest screen in the app.
  if (!road) return null

  const { into, span, pct } = milesProgress(miles)
  const next = nextPayout(road, waystation)
  const nextRewards = next ? [...next.a, ...next.b] : []
  const dailies = quests.filter((q) => q.kind === 'daily')

  return (
    <motion.button
      onClick={() => navigate('/pilgrimage')}
      whileTap={{ scale: 0.98 }}
      className="card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        width: '100%',
        textAlign: 'left',
        marginBottom: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
        {/* The window. Deliberately still — CrowdLife's glide between waypoints
            reads as pacing rather than walking at this size, and this sits on the
            busiest screen in the app, so the figure just breathes. */}
        <div
          aria-hidden
          style={{
            position: 'relative',
            width: 72,
            height: 68,
            flexShrink: 0,
            borderRadius: 12,
            overflow: 'hidden',
            border: '1px solid var(--stroke)',
            background: roadBackground(road),
          }}
        >
          <span
            style={{
              position: 'absolute',
              inset: 'auto 0 0 0',
              height: 22,
              background: 'linear-gradient(180deg, rgba(24,10,4,0) 0%, rgba(24,10,4,0.45) 100%)',
            }}
          />
          {/* Centring and bobbing are on SEPARATE elements on purpose: the bob
              animates `transform`, which would overwrite the translateX that
              centres this and slam the figure against the left edge. */}
          <span
            style={{
              position: 'absolute',
              left: '50%',
              bottom: me?.avatarCharacter ? 4 : 12,
              transform: 'translateX(-50%)',
              display: 'block',
              lineHeight: 0,
            }}
          >
            <span className={reduceMotion ? undefined : 'road-bob'} style={{ display: 'block', lineHeight: 0 }}>
              {me?.avatarCharacter ? (
                <Character spec={me.avatarCharacter} size={48} fullBody />
              ) : (
                <span style={{ fontSize: 27, lineHeight: 1 }}>{me?.avatarEmoji ?? '🌾'}</span>
              )}
            </span>
          </span>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* The name on its own line: beside two art tiles at 390px it was
              sharing the line with "Waystation 0" and truncating to "Th…". */}
          <b
            style={{
              display: 'block',
              fontFamily: 'var(--font-display)',
              fontSize: 15,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {road.name}
          </b>

          <div
            style={{
              height: 8,
              borderRadius: 999,
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid var(--stroke)',
              overflow: 'hidden',
              margin: '6px 0 4px',
            }}
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct * 100}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 22 }}
              style={{ height: '100%', background: 'linear-gradient(90deg, var(--gold), var(--tangerine))' }}
            />
          </div>

          <div className="faint" style={{ fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Waystation {waystation} · {into}/{span} mi{next ? ' · next:' : ''}
          </div>
        </div>

        {/* What's at the next waystation, as pictures. Up to two: a station
            can pay from both columns, and the second one is the reason the
            first is worth walking past. */}
        {nextRewards.length > 0 ? (
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
            aria-label={`Next: ${nextRewards.map((r) => rewardLabel(r.id).name).join(' and ')}`}
          >
            {nextRewards.slice(0, 2).map((r, i) => (
              <span
                key={`${r.id}-${i}`}
                style={{
                  borderRadius: 12,
                  border: '1px solid rgba(255,210,63,0.45)',
                  background: 'rgba(255,210,63,0.10)',
                  overflow: 'hidden',
                }}
              >
                <RewardArt id={r.id} size={40} spec={me?.avatarCharacter} />
              </span>
            ))}
          </div>
        ) : (
          <div style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)', fontSize: 18, flexShrink: 0 }}>→</div>
        )}
      </div>

      {/* Today's three, under the road. The bars are the road screen's own,
          slimmed: what to do, and how close it is. */}
      {dailies.length > 0 && (
        <div style={{ display: 'grid', gap: 6, width: '100%', borderTop: '1px solid var(--stroke)', paddingTop: 10 }}>
          {dailies.map((q) => {
            const p = Math.min(1, q.goal > 0 ? q.progress / q.goal : 0)
            return (
              <div key={q.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: '2px 10px', alignItems: 'center' }}>
                <span
                  style={{
                    fontSize: 12.5,
                    color: q.done ? 'var(--ink-faint)' : 'var(--ink)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {q.done ? '✓ ' : ''}
                  {q.text}
                </span>
                <span
                  className="faint"
                  style={{ fontSize: 11, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
                >
                  {q.done ? `+${q.miles} mi` : `${Math.min(q.progress, q.goal)}/${q.goal}`}
                </span>
                <div
                  style={{
                    gridColumn: '1 / -1',
                    height: 4,
                    borderRadius: 999,
                    background: 'rgba(0,0,0,0.35)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${p * 100}%`,
                      height: '100%',
                      background: q.done ? 'var(--good)' : 'linear-gradient(90deg, var(--grape), var(--gold))',
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </motion.button>
  )
}
