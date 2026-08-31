import { useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArcadeShell } from './ArcadeShell'
import { ArcadeCabinetBox, CABINET_H, CABINET_W } from './ArcadeCabinet'
import { ARCADE_GAMES, type ArcadeGame } from './games'
import { useAccountLocked } from '@/components/AccountWall'
import { useJuice } from '@/juice/useJuice'

// The arcade: a row of machines against a wall, and you pick one.
//
// The cabinet standing in the hall, the churchyard and the Upper Room used to
// open a game directly. It opens this instead, because there is more than one
// game in there now and a door that always led to the same machine would be
// lying about what the arcade is.
//
// Two things it deliberately doesn't do. There is **no score on any cabinet** —
// no high score, no last run, no "best today", because a list of games with
// your numbers on it is a scoreboard with a coin slot. And there is **no
// ordering that means anything**: the list is the order they were built, not a
// ranking, a popularity chart or a difficulty ladder.

/** Cap the cabinet so it stays a machine on a wide screen, not a wardrobe. */
const MAX_CABINET = 132
const GAP = 18

export default function ArcadeLobby() {
  const wall = useRef<HTMLDivElement | null>(null)
  const width = useWallWidth(wall)
  const cabinetW = Math.min(Math.floor(((width - GAP) / 2) * 0.82), MAX_CABINET)

  return (
    <ArcadeShell
      title="The arcade"
      tagline={`${ARCADE_GAMES.length} machines · nothing in here touches your rank`}
      home="/play"
    >
      <div ref={wall}>
        {rows(ARCADE_GAMES).map((row) => (
          <div key={row.map((g) => g.id).join('-')} style={{ position: 'relative', marginBottom: 26 }}>
            {/* The floor the machines stand on, positioned off the known
                cabinet height so it lands at their feet and the captions hang
                under it like the labels on the Study shelf's plank. */}
            <div
              aria-hidden
              style={{
                position: 'absolute',
                left: -6,
                right: -6,
                top: Math.round((cabinetW / CABINET_W) * (CABINET_H + 8)) - 6,
                height: 9,
                borderRadius: 3,
                background:
                  'linear-gradient(180deg, rgba(255,210,63,0.30) 0%, rgba(160,107,255,0.16) 45%, rgba(0,0,0,0.42) 100%)',
                boxShadow: '0 8px 18px rgba(0,0,0,0.45)',
              }}
            />
            <div
              style={{
                position: 'relative',
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: GAP,
                alignItems: 'start',
              }}
            >
              {row.map((game, i) => (
                <Machine key={game.id} game={game} width={cabinetW} delay={0.05 * i} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </ArcadeShell>
  )
}

function Machine({ game, width, delay }: { game: ArcadeGame; width: number; delay: number }) {
  const navigate = useNavigate()
  const juice = useJuice()
  // The padlock is the nav's convention, and it exists for the nav's reason:
  // a locked machine still stands in the room, and tapping it explains itself
  // rather than doing nothing.
  const locked = useAccountLocked() && !!game.needsAccount

  return (
    <motion.button
      onClick={() => {
        juice.select()
        navigate(game.to)
      }}
      aria-label={`${game.title} — ${game.tagline}${locked ? ' (needs an account)' : ''}`}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26, delay }}
      whileTap={{ scale: 0.97 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 0,
        background: 'none',
        border: 'none',
        justifySelf: 'center',
        width,
      }}
    >
      <div style={{ position: 'relative' }}>
        <ArcadeCabinetBox width={width} screen={game.screen} />
        {locked && (
          // On the corner of the marquee rather than the corner of the box:
          // the cabinet is drawn narrower than its own bounding box, so a badge
          // pinned to the box floats in the air beside the machine.
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: Math.round(width * 0.02),
              right: Math.round(width * 0.1),
              width: 20,
              height: 20,
              borderRadius: 999,
              display: 'grid',
              placeItems: 'center',
              fontSize: 11,
              background: 'var(--card-solid)',
              border: '1px solid var(--stroke)',
              boxShadow: '0 3px 8px rgba(0,0,0,0.55)',
            }}
          >
            🔒
          </span>
        )}
      </div>

      <div
        style={{
          marginTop: 16,
          fontFamily: 'var(--font-display)',
          fontWeight: 800,
          fontSize: 15,
          textAlign: 'center',
        }}
      >
        {game.title}
      </div>
      <div
        style={{
          marginTop: 3,
          fontSize: 11.5,
          lineHeight: 1.35,
          color: 'var(--ink-dim)',
          textAlign: 'center',
        }}
      >
        {game.tagline}
      </div>
    </motion.button>
  )
}

function rows(games: ArcadeGame[]): ArcadeGame[][] {
  const out: ArcadeGame[][] = []
  for (let i = 0; i < games.length; i += 2) out.push(games.slice(i, i + 2))
  return out
}

/** The wall's own width, so the cabinets can be sized in real pixels. */
function useWallWidth(ref: React.RefObject<HTMLDivElement>) {
  const [width, setWidth] = useState(() =>
    Math.min(typeof window === 'undefined' ? 390 : window.innerWidth, 520) - 36,
  )

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setWidth(el.getBoundingClientRect().width)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])

  return width
}
