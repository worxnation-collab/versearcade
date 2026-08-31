import { motion } from 'framer-motion'
import { useId } from 'react'
import { crossJoint, crossSize, type CrossPuzzle } from '@/data/crossword'

// The board a Cross Word is played on, and the wood it becomes.
//
// Two layers over the same geometry, crossfaded: an HTML grid of real buttons
// while you're solving (so a cell can be tapped, focused and read out), and an
// SVG cross once it's done. They're sized from the same cell in pixels, so the
// letters don't move a hair when the puzzle turns to wood — the whole trick is
// that the thing you filled in IS the thing that's now carved.
//
// The wood is drawn rather than generated, like the church kit and the keep's
// props: it takes runtime geometry (a cross is a different shape for every pair
// of words — 5x4 here, 9x7 there), and a baked image can't be re-cut per puzzle.

/** Ink for the carved letters, and the timbers they're cut into. */
const WOOD = {
  face: '#9c6634',
  faceLit: '#c08b4f',
  faceDark: '#6b4220',
  edge: '#4a2c12',
  grain: '#5c3618',
  carve: '#3d240f',
  carveLit: '#d3a970',
}

export interface BoardCell {
  row: number
  col: number
  letter: string
  /** True for the one cell the two words share. */
  joint: boolean
  /** The cell the next typed letter lands in. */
  focused: boolean
  /** In the word currently being typed — the row or column being worked on. */
  active: boolean
  /** Filled in by a hint rather than by the player. */
  given: boolean
}

export function boardCells(
  p: CrossPuzzle,
  letters: Record<string, string>,
  cursor: string | null,
  direction: 'down' | 'across',
  given: Record<string, boolean>,
): BoardCell[] {
  const { rows, cols } = crossSize(p)
  const joint = crossJoint(p)
  const cells: BoardCell[] = []
  const push = (row: number, col: number) => {
    const k = `${row},${col}`
    cells.push({
      row,
      col,
      letter: letters[k] ?? '',
      joint: row === joint.row && col === joint.col,
      focused: cursor === k,
      active: direction === 'down' ? col === joint.col : row === joint.row,
      given: !!given[k],
    })
  }
  for (let r = 0; r < rows; r++) push(r, joint.col)
  for (let c = 0; c < cols; c++) if (c !== joint.col) push(joint.row, c)
  return cells
}

export function CrossBoard({
  puzzle,
  cells,
  cell,
  wood,
  instant,
  onTapCell,
}: {
  puzzle: CrossPuzzle
  cells: BoardCell[]
  /** One square, in px. The caller measures its column and picks this. */
  cell: number
  /** Finished — show the timber. */
  wood: boolean
  /** Reduce-motion: arrive at the wood rather than watch it happen. */
  instant?: boolean
  onTapCell?: (row: number, col: number) => void
}) {
  const { rows, cols } = crossSize(puzzle)
  const height = rows * cell
  // Centred on the UPRIGHT rather than on the bounding box: a crossbar with a
  // longer arm on one side would otherwise stand visibly off-centre on the
  // card, which reads as a mistake rather than as a cross.
  const half = Math.max(puzzle.acrossIndex + 0.5, cols - puzzle.acrossIndex - 0.5)
  const width = half * 2 * cell
  const offset = half * cell - (puzzle.acrossIndex + 0.5) * cell
  const swap = instant ? { duration: 0 } : { duration: 0.5, ease: 'easeOut' as const }

  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        margin: '0 auto',
        // The grid is the interactive layer; once it's wood there's nothing
        // left to tap, and a stray tap shouldn't move a cursor nobody can see.
        pointerEvents: wood ? 'none' : undefined,
      }}
    >
      <motion.div
        aria-hidden={wood}
        animate={{ opacity: wood ? 0 : 1 }}
        transition={swap}
        style={{ position: 'absolute', top: 0, left: offset, width: cols * cell, height }}
      >
        {cells.map((c) => (
          <PlayCell key={`${c.row},${c.col}`} c={c} cell={cell} onTap={onTapCell} />
        ))}
      </motion.div>

      <motion.div
        aria-hidden
        initial={false}
        animate={{ opacity: wood ? 1 : 0, scale: wood ? 1 : 0.96 }}
        transition={swap}
        style={{
          position: 'absolute',
          top: 0,
          left: offset,
          width: cols * cell,
          height,
          transformOrigin: '50% 40%',
        }}
      >
        <WoodCross puzzle={puzzle} cells={cells} cell={cell} />
      </motion.div>
    </div>
  )
}

function PlayCell({
  c,
  cell,
  onTap,
}: {
  c: BoardCell
  cell: number
  onTap?: (row: number, col: number) => void
}) {
  const pad = Math.max(2, Math.round(cell * 0.06))
  return (
    <motion.button
      type="button"
      onClick={() => onTap?.(c.row, c.col)}
      whileTap={{ scale: 0.92 }}
      aria-label={`${c.joint ? 'Shared letter' : 'Letter'}, ${c.letter || 'empty'}`}
      style={{
        position: 'absolute',
        left: c.col * cell + pad / 2,
        top: c.row * cell + pad / 2,
        width: cell - pad,
        height: cell - pad,
        borderRadius: Math.round(cell * 0.22),
        display: 'grid',
        placeItems: 'center',
        fontFamily: 'var(--font-display)',
        fontWeight: 800,
        fontSize: Math.round(cell * 0.5),
        lineHeight: 1,
        // A hinted letter reads as given rather than earned — dimmer, so the
        // player can see what they worked out and what they were shown.
        color: c.given ? 'var(--ink-dim)' : 'var(--ink)',
        background: c.focused
          ? 'rgba(255,210,63,0.18)'
          : c.active
            ? 'rgba(255,255,255,0.10)'
            : 'var(--card)',
        border: `2px solid ${
          c.focused ? 'var(--gold)' : c.joint ? 'rgba(255,210,63,0.45)' : 'var(--stroke)'
        }`,
        boxShadow: c.focused ? '0 0 0 4px rgba(255,210,63,0.16)' : 'none',
      }}
    >
      {c.letter}
    </motion.button>
  )
}

/** The finished cross: two timbers, the letters chiselled into them. */
function WoodCross({
  puzzle,
  cells,
  cell,
}: {
  puzzle: CrossPuzzle
  cells: BoardCell[]
  cell: number
}) {
  // Gradient ids must be unique per instance — two crosses on one page (the
  // board and a thumbnail) would otherwise share whichever <defs> rendered last.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const { rows, cols } = crossSize(puzzle)
  const joint = crossJoint(puzzle)
  const w = cols * cell
  const h = rows * cell
  const inset = Math.max(1.5, cell * 0.04)
  const r = Math.round(cell * 0.14)

  // The two timbers. The upright runs the full height of its column; the
  // crossbar the full width of its row.
  const up = { x: joint.col * cell + inset, y: inset, w: cell - inset * 2, h: h - inset * 2 }
  const bar = { x: inset, y: joint.row * cell + inset, w: w - inset * 2, h: cell - inset * 2 }

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      style={{ display: 'block', filter: 'drop-shadow(0 10px 18px rgba(0,0,0,0.55))' }}
    >
      <defs>
        {/* Grain runs ALONG each timber, so the two beams read as two boards
            cut from a log rather than as one painted shape. */}
        <linearGradient id={`${uid}-up`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={WOOD.faceDark} />
          <stop offset="26%" stopColor={WOOD.faceLit} />
          <stop offset="62%" stopColor={WOOD.face} />
          <stop offset="100%" stopColor={WOOD.faceDark} />
        </linearGradient>
        <linearGradient id={`${uid}-bar`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={WOOD.faceLit} />
          <stop offset="34%" stopColor={WOOD.face} />
          <stop offset="100%" stopColor={WOOD.faceDark} />
        </linearGradient>
        {/* Both beams are clipped to their own rounded rect, so grain lines and
            knots stay on the wood instead of running off the edge. */}
        <clipPath id={`${uid}-clip-up`}>
          <rect x={up.x} y={up.y} width={up.w} height={up.h} rx={r} />
        </clipPath>
        <clipPath id={`${uid}-clip-bar`}>
          <rect x={bar.x} y={bar.y} width={bar.w} height={bar.h} rx={r} />
        </clipPath>
      </defs>

      {/* Upright first, crossbar over it — a real cross is lashed on the front,
          and the overlap is what makes the joint read as one object. */}
      <g clipPath={`url(#${uid}-clip-up)`}>
        <rect x={up.x} y={up.y} width={up.w} height={up.h} fill={`url(#${uid}-up)`} />
        {grainLines(up, 'v', cell).map((d, i) => (
          <path key={i} d={d} stroke={WOOD.grain} strokeWidth={cell * 0.02} fill="none" opacity={0.5} />
        ))}
        <ellipse
          cx={up.x + up.w * 0.62}
          cy={up.y + up.h * 0.78}
          rx={cell * 0.1}
          ry={cell * 0.07}
          fill={WOOD.grain}
          opacity={0.65}
        />
      </g>
      <g clipPath={`url(#${uid}-clip-bar)`}>
        <rect x={bar.x} y={bar.y} width={bar.w} height={bar.h} fill={`url(#${uid}-bar)`} />
        {grainLines(bar, 'h', cell).map((d, i) => (
          <path key={i} d={d} stroke={WOOD.grain} strokeWidth={cell * 0.02} fill="none" opacity={0.45} />
        ))}
        {/* The shadow the crossbar throws down the upright — the one cue that
            says which timber is in front. */}
        <rect
          x={joint.col * cell}
          y={bar.y + bar.h - cell * 0.06}
          width={cell}
          height={cell * 0.16}
          fill="#000"
          opacity={0.22}
        />
      </g>

      {/* Edges last, over both, so the timbers are outlined as one silhouette. */}
      <rect
        x={up.x}
        y={up.y}
        width={up.w}
        height={up.h}
        rx={r}
        fill="none"
        stroke={WOOD.edge}
        strokeWidth={cell * 0.035}
      />
      <rect
        x={bar.x}
        y={bar.y}
        width={bar.w}
        height={bar.h}
        rx={r}
        fill="none"
        stroke={WOOD.edge}
        strokeWidth={cell * 0.035}
      />

      {/* The letters, chiselled: a lit copy under a dark one, so each stroke
          has a shadow above it and catches the light below — the way an incised
          letter actually reads. */}
      {cells.map((c) => {
        const cx = c.col * cell + cell / 2
        const cy = c.row * cell + cell / 2
        const size = cell * 0.52
        return (
          <g key={`${c.row},${c.col}`}>
            <text
              x={cx}
              y={cy + size * 0.36 + cell * 0.035}
              textAnchor="middle"
              fontFamily="var(--font-display)"
              fontWeight={800}
              fontSize={size}
              fill={WOOD.carveLit}
              opacity={0.75}
            >
              {c.letter}
            </text>
            <text
              x={cx}
              y={cy + size * 0.36}
              textAnchor="middle"
              fontFamily="var(--font-display)"
              fontWeight={800}
              fontSize={size}
              fill={WOOD.carve}
            >
              {c.letter}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** A few lines of grain running the length of a timber. */
function grainLines(
  beam: { x: number; y: number; w: number; h: number },
  dir: 'v' | 'h',
  cell: number,
): string[] {
  const out: string[] = []
  const n = 4
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1)
    if (dir === 'v') {
      const x = beam.x + beam.w * t
      const bow = cell * (i % 2 === 0 ? 0.09 : -0.07)
      out.push(
        `M ${x} ${beam.y} Q ${x + bow} ${beam.y + beam.h * 0.35} ${x} ${beam.y + beam.h * 0.62} T ${x} ${beam.y + beam.h}`,
      )
    } else {
      const y = beam.y + beam.h * t
      const bow = cell * (i % 2 === 0 ? 0.07 : -0.06)
      out.push(
        `M ${beam.x} ${y} Q ${beam.x + beam.w * 0.35} ${y + bow} ${beam.x + beam.w * 0.62} ${y} T ${beam.x + beam.w} ${y}`,
      )
    }
  }
  return out
}
