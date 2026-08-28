import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useSeason } from '@/store/season'
import { useAuth } from '@/store/auth'
import { useSettings } from '@/store/settings'
import { Character } from '@/components/Character'
import { roadBackground } from './roadArt'
import { activeRoad, nextPayout, rewardLabel } from '@/data/season'
import { milesProgress } from '@/lib/season'

// The Pilgrimage's front door, on the Play tab.
//
// The bottom nav is full at five tabs and a sixth would crowd a thumb, so the
// road gets a strip here instead — a bar, the next reward, and a tap. This is
// how the feature is seen at all; the screen behind it is where you go to look
// at the whole road.
//
// It shows what's NEXT and never how far behind you are. There is no pace bar,
// no "63% of players are past this", no percentage of the road walked — that
// comparison is the one thing this app doesn't do.
//
// The tile on the left is a WINDOW INTO THE ROAD, not an icon: the same
// painting the Pilgrimage screen opens with, cropped small, with you standing
// in it. A wheat emoji described the place; this shows it, which is a much
// better reason to tap. The crop is shared (roadArt.ts) so the peek and the
// screen behind it can't drift into two different pictures.
export function RoadStrip() {
  const navigate = useNavigate()
  const load = useSeason((s) => s.load)
  const miles = useSeason((s) => s.miles)
  const waystation = useSeason((s) => s.waystation)
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
  const nextLabel = next
    ? rewardLabel([...next.a, ...next.b][0]?.id ?? '')
    : null

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
        alignItems: 'center',
        gap: 12,
        cursor: 'pointer',
      }}
    >
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
        {/* A soft floor shadow so the figure stands on the road rather than
            hovering over it, and the bottom edge doesn't cut it off flat. */}
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
            // Character draws its own ground shadow at the foot of its viewBox,
            // so it lands on the path at 4. An emoji glyph sits centred in its
            // line box with air underneath, so it needs pushing down to stand
            // on the same road instead of hovering over it.
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
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <b style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>{road.name}</b>
          <span className="faint" style={{ fontSize: 11.5 }}>
            Waystation {waystation}
          </span>
        </div>

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

        <div className="faint" style={{ fontSize: 11.5 }}>
          {into}/{span} miles
          {next && nextLabel ? (
            <>
              {' · next: '}
              <span style={{ color: 'var(--gold)' }}>
                {nextLabel.glyph} {nextLabel.name}
              </span>
            </>
          ) : null}
        </div>
      </div>
      <div style={{ fontFamily: 'var(--font-display)', color: 'var(--gold)', fontSize: 18, flexShrink: 0 }}>→</div>
    </motion.button>
  )
}
