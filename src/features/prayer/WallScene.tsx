import { motion, useReducedMotion } from 'framer-motion'
import { GENERATED_ART } from '@/data/generatedArt'

// The Prayer Wall, as a place.
//
// A Nano Banana painting of bare limestone (art/prayer-wall.json) with the
// notes drawn ON it — the wall was prompted empty three times over for exactly
// the reason the arcade's backdrops were: anything painted into a crack can't
// be the note that slides out of it.
//
// EVERY NOTE LOOKS THE SAME. That is the load-bearing rule of this scene and
// not a limitation of it: a wall where one slip glows and another is dark is a
// ladder of who is loved. The slips here are a picture of how full the wall is
// tonight (a number about the room), never of any one note — they carry no
// category, no face, no age and no tally, and tapping one does nothing. The
// note you are handed comes out of the wall as a CARD below it, which is the
// only place a note has any detail at all.
//
// The stars are the week's answered prayers: a category glyph and nothing
// else, shining on the top course. A star is a picture, not a number.

// The painting's own coordinates (857x640, a 4:3 landscape). The scene shows
// its middle band so the wall reads wide on a phone.
const W = 857
const H = 640

/**
 * Where a slip can be tucked: the dark seams between courses, measured off the
 * render. Notes fill these in a fixed order, so the wall is the same picture
 * for everybody looking at it tonight.
 */
const SLOTS: Array<{ x: number; y: number; r: number }> = [
  { x: 96, y: 238, r: -8 }, { x: 305, y: 244, r: 5 }, { x: 512, y: 236, r: -4 },
  { x: 705, y: 246, r: 7 }, { x: 190, y: 406, r: 4 }, { x: 398, y: 402, r: -6 },
  { x: 604, y: 410, r: 3 }, { x: 792, y: 404, r: -3 }, { x: 44, y: 70, r: 6 },
  { x: 250, y: 66, r: -5 }, { x: 452, y: 74, r: 4 }, { x: 640, y: 62, r: -7 },
  { x: 820, y: 72, r: 5 }, { x: 140, y: 556, r: -4 }, { x: 350, y: 560, r: 6 },
  { x: 560, y: 552, r: -5 }, { x: 760, y: 558, r: 4 }, { x: 402, y: 322, r: -8 },
  { x: 606, y: 312, r: 6 }, { x: 178, y: 300, r: 3 }, { x: 728, y: 160, r: -5 },
  { x: 236, y: 480, r: 5 }, { x: 496, y: 486, r: -4 }, { x: 88, y: 160, r: 6 },
]

export function WallScene({
  /** Notes in the wall tonight. Drawn as identical slips, capped at the slots. */
  count,
  /** Answered this week: one star each, glyph only. */
  stars,
  /** A note is being drawn out — one slip lifts and slides free. */
  dealing = false,
}: {
  count: number
  stars: string[]
  dealing?: boolean
}) {
  const reduceMotion = useReducedMotion()
  const painting = GENERATED_ART['prayer-wall']
  const slips = Math.max(0, Math.min(count, SLOTS.length))

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 'var(--r-md)',
        overflow: 'hidden',
        border: '1px solid var(--stroke)',
        // Its own stacking context, for the reason CrowdLife's container needs
        // one: this scene stacks layers, and without it they escape into the
        // page root and paint over whatever a tap opened.
        isolation: 'isolate',
      }}
    >
      <svg viewBox={`0 40 ${W} ${H - 80}`} style={{ display: 'block', width: '100%', height: 'auto' }}>
        <DrawnWall />
        {painting && (
          <image href={painting} x="0" y="0" width={W} height={H} preserveAspectRatio="xMidYMid slice" />
        )}

        {/* Lamplight. The painting has it; the drawn fallback gets it here so
            the two read as one wall. */}
        <defs>
          <radialGradient id="wall-lamp" cx="0.12" cy="0.1" r="0.9">
            <stop offset="0" stopColor="#ffd98a" stopOpacity="0.28" />
            <stop offset="1" stopColor="#ffd98a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width={W} height={H} fill="url(#wall-lamp)" />

        {/* The stars: answered this week, on the top course. */}
        {stars.slice(0, 8).map((glyph, i) => {
          const x = 70 + i * 100
          const y = 118
          return (
            <motion.g
              key={i}
              animate={reduceMotion ? undefined : { opacity: [0.75, 1, 0.75] }}
              transition={reduceMotion ? undefined : { duration: 3 + (i % 3), repeat: Infinity, ease: 'easeInOut' }}
            >
              <path
                d={starPath(x, y, 22)}
                fill="var(--gold)"
                stroke="rgba(120,80,0,0.45)"
                strokeWidth="2"
              />
              <text x={x} y={y + 6} textAnchor="middle" fontSize="16" style={{ pointerEvents: 'none' }}>
                {glyph}
              </text>
            </motion.g>
          )
        })}

        {/* The slips. Identical on purpose — see the header. The first one is
            the one that slides out when a note is dealt. */}
        {SLOTS.slice(0, slips).map((s, i) => {
          const isDealt = dealing && i === 0
          return (
            <motion.g
              key={i}
              initial={false}
              animate={
                isDealt && !reduceMotion
                  ? { x: [0, 0, 0], y: [0, 40, 140], opacity: [1, 1, 0] }
                  : { x: 0, y: 0, opacity: 1 }
              }
              transition={isDealt && !reduceMotion ? { duration: 0.9, ease: 'easeIn' } : { duration: 0 }}
            >
              <Slip x={s.x} y={s.y} rotate={s.r} />
            </motion.g>
          )
        })}

        {/* Ground shadow along the foot of the wall, so the slips at the
            bottom course don't float. */}
        <rect x="0" y={H - 60} width={W} height="60" fill="rgba(20,10,40,0.18)" />
      </svg>
    </div>
  )
}

/** One folded slip of cream paper, tucked into a seam. */
function Slip({ x, y, rotate }: { x: number; y: number; rotate: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <rect x="-16" y="-9" width="32" height="18" rx="2" fill="rgba(30,15,5,0.35)" transform="translate(2 3)" />
      <rect x="-16" y="-9" width="32" height="18" rx="2" fill="#f4e8c8" stroke="#c9b48c" strokeWidth="1.2" />
      <path d="M-16 -9 L0 2 L16 -9" fill="none" stroke="#c9b48c" strokeWidth="1.2" />
      <line x1="-9" y1="3" x2="9" y2="3" stroke="#d8c7a0" strokeWidth="1" />
    </g>
  )
}

function starPath(cx: number, cy: number, r: number): string {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    pts.push(`${(cx + Math.cos(a) * rad).toFixed(1)} ${(cy + Math.sin(a) * rad).toFixed(1)}`)
  }
  return `M${pts.join(' L')} Z`
}

/**
 * The drawn fallback: four courses of limestone in the painting's own palette.
 * A build whose generation failed shows a wall, not a hole.
 */
function DrawnWall() {
  const rows = [
    { y: 0, h: 70 }, { y: 70, h: 170 }, { y: 240, h: 165 }, { y: 405, h: 150 }, { y: 555, h: 85 },
  ]
  const blocks: JSX.Element[] = []
  rows.forEach((row, ri) => {
    const offset = ri % 2 === 0 ? 0 : 120
    for (let x = -120 + offset; x < W; x += 230) {
      blocks.push(
        <rect
          key={`${ri}-${x}`}
          x={x + 4}
          y={row.y + 4}
          width={222}
          height={row.h - 8}
          rx="14"
          fill={ri % 2 === 0 ? '#d9c39a' : '#cdb48c'}
        />,
      )
    }
  })
  return (
    <g>
      <rect x="0" y="0" width={W} height={H} fill="#6b5340" />
      {blocks}
      <rect x="0" y={H - 60} width={W} height="60" fill="#8a6f4e" />
    </g>
  )
}
