import { motion, useReducedMotion } from 'framer-motion'
import { GENERATED_ART } from '@/data/generatedArt'

// The lending library — the Study tab, as a place rather than a menu.
//
// This is the whole tab now. It replaced a grid of book tiles, and the argument
// is the one every other section of this app already made: the road is the top
// of /season, the hall is under "Start a new battle", the churchyard is the
// hero of /church, your Upper Room is under the player card. Study was the last
// section that opened with a list of things instead of the place they are in.
//
// THREE THINGS IN THE ROOM, THREE THINGS STUDY CAN DO:
//
//   TABITHA, on the clear floor  -> she lends the five practice surfaces
//   THE LEDGER, on her desk      -> your reports
//   THE SATCHEL, on the floor    -> your bag
//
// Nothing else is tappable, and that ceiling is deliberate: a room with a
// hotspot on every object is a menu with a painting behind it. Anything new in
// Study belongs in Tabitha's offer (one list, `StudyBook.lend`) rather than as
// a fourth glowing thing on the floor.
//
// THE ART is a full-bleed Nano Banana painting (art/library.json) laid over a
// drawn fallback, the same layering every tier ladder here uses — a build whose
// generation failed shows a library rather than a hole. It is PORTRAIT because
// the frame is: a 16:9 band at the top of a tab is a picture of a room, and
// this has to be the room. Its left and centre floor were prompted DELIBERATELY
// EMPTY, three times over, because figures stand there.

// The painting's own coordinates. 398x640 — a 5:8 portrait, because the FRAME
// is one. A 16:9 band at the top of a tab is a picture of a room; this has to
// BE the room, so the render was re-prompted until its aspect matched a phone's
// content area (390 x ~620) and it fills the tab with nothing cropped.
const W = 398
const H = 640

/** Where Tabitha stands: the clear half of the floor. The painting was
 *  prompted empty there on purpose — moving her right puts her through the
 *  desk, which is painted and cannot move. */
const HER_X = 158
const HER_FOOT_Y = 566
const HER_H = 300

/** The ledger painted on the desk top, right of frame. */
const LEDGER = { x: 334, y: 336 }
/** The satchel, ours rather than painted, set down on the near floor. */
const SATCHEL = { x: 64, y: 632 }
const SATCHEL_W = 100

export interface Hotspot {
  onTap: () => void
  /** Shown on the marker. Kept to a word or two — this is a label, not a row. */
  label: string
  /** A count worth seeing without opening anything, e.g. verses due. */
  badge?: string
}

export function LibraryScene({
  librarian,
  ledger,
  satchel,
  /** Freeze the idle motion. The room is drawn behind the postcard-flat
      thumbnail in the sheet, and a moving picture behind a paragraph is
      unreadable. */
  still = false,
}: {
  librarian?: Hotspot
  ledger?: Hotspot
  satchel?: Hotspot
  still?: boolean
}) {
  const reduceMotion = useReducedMotion()
  const painting = GENERATED_ART['study-library']
  const her = GENERATED_ART['librarian']
  const alive = !still && !reduceMotion

  return (
    <div
      style={{
        position: 'relative',
        borderRadius: 'var(--r-md)',
        overflow: 'hidden',
        border: '1px solid var(--stroke)',
        // `isolate` for the reason CrowdLife's container needs it: this scene
        // stacks its own layers, and without a stacking context of its own they
        // escape into the page root and paint over whatever a tap opened.
        isolation: 'isolate',
      }}
    >
      <svg viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', height: 'auto' }}>
        <DrawnLibrary />
        {painting && (
          <image href={painting} x="0" y="0" width={W} height={H} preserveAspectRatio="xMidYMid slice" />
        )}

        {/* LAYERED BACK TO FRONT, and that ordering is load-bearing: the desk is
            deepest, Tabitha stands in front of it, and the satchel is at your
            feet. Painting them in any other order lets her hem cover the bag's
            own label — SVG has no z-index, only document order. */}

        {/* The ledger, already painted on the desk — this only rings it. */}
        {ledger && <Tappable spot={ledger} x={LEDGER.x} y={LEDGER.y - 36} alive={alive} anchor="above" />}

        {/* Her. Bobs a hair, so the room has somebody alive in it rather than a
            sticker on a background — the trick CrowdLife plays, without its
            waypoints, because she never leaves her desk. */}
        <motion.g
          animate={alive ? { y: [0, -3, 0] } : { y: 0 }}
          transition={alive ? { duration: 4.2, repeat: Infinity, ease: 'easeInOut' } : undefined}
        >
          {/* Narrow and faint: the render's ink is only ~103 units wide (it
              fits by HEIGHT inside its box), so a shadow sized off the box
              rather than off her reads as a puddle she is standing beside. */}
          <ellipse
            cx={HER_X}
            cy={HER_FOOT_Y}
            rx={HER_H * 0.115}
            ry={HER_H * 0.022}
            fill="rgba(24,10,4,0.34)"
          />
          {her ? (
            <image
              href={her}
              x={HER_X - HER_H * 0.24}
              y={HER_FOOT_Y - HER_H}
              width={HER_H * 0.48}
              height={HER_H}
              preserveAspectRatio="xMidYMax meet"
            />
          ) : (
            <DrawnLibrarian x={HER_X} footY={HER_FOOT_Y} h={HER_H} />
          )}
          {librarian && (
            <Tappable
              spot={librarian}
              x={HER_X + 54}
              y={HER_FOOT_Y - HER_H - 4}
              alive={alive}
              anchor="bubble"
            />
          )}
        </motion.g>

        {/* The satchel, nearest the camera and therefore last. Ours rather than
            painted — the room's floor was prompted empty on purpose, so
            anything standing on it is something we put there. */}
        {satchel && (
          <Tappable spot={satchel} x={SATCHEL.x + 6} y={SATCHEL.y - 74} alive={alive} anchor="above">
            <Satchel x={SATCHEL.x} y={SATCHEL.y} />
          </Tappable>
        )}
      </svg>
    </div>
  )
}

/**
 * One thing in the room you can touch.
 *
 * A ring, a label and a generous invisible hit area — never a bare region of
 * painting, because a hotspot nobody can see is a room that feels broken rather
 * than mysterious. The label is always drawn: this is a tab, not a puzzle, and
 * somebody arriving must not have to hunt for the way to their own reports.
 */
function Tappable({
  spot,
  x,
  y,
  alive,
  anchor,
  children,
}: {
  spot: Hotspot
  x: number
  y: number
  alive: boolean
  anchor: 'above' | 'bubble'
  children?: React.ReactNode
}) {
  // Roughly 7px per character at this font size, plus padding. Measuring text
  // in SVG needs a layout pass and a ref per marker; the labels here are one or
  // two words, so an estimate that errs wide is the right trade.
  const w = Math.max(64, spot.label.length * 7.4 + 26)
  const h = 26
  return (
    <g style={{ cursor: 'pointer' }} onClick={spot.onTap}>
      {children}
      {/* The hit area, well beyond the marker — a 26px pill is under Apple's
          44px minimum on its own. */}
      <rect x={x - w / 2 - 10} y={y - h / 2 - 14} width={w + 20} height={h + 28} fill="transparent" />
      <motion.g
        animate={alive ? { y: [0, -3, 0], opacity: [0.86, 1, 0.86] } : { y: 0, opacity: 1 }}
        transition={alive ? { duration: 2.8, repeat: Infinity, ease: 'easeInOut' } : undefined}
      >
        {anchor === 'bubble' && (
          // A speech tail, so the marker over a person reads as her talking
          // rather than as a label pinned to her head. Drawn before the pill so
          // the pill paints over the join.
          <path
            d={`M${x - w / 2 + 6} ${y + h / 2 - 2} L${x - w / 2 - 14} ${y + h / 2 + 20} L${x - w / 2 + 30} ${y + h / 2}z`}
            fill="rgba(12,6,26,0.9)"
            stroke="var(--gold)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        )}
        <rect
          x={x - w / 2}
          y={y - h / 2}
          width={w}
          height={h}
          rx={h / 2}
          fill="rgba(12,6,26,0.9)"
          stroke="var(--gold)"
          strokeWidth="2"
        />
        <text
          x={x}
          y={y + 5}
          textAnchor="middle"
          fill="#ffd257"
          fontSize="14"
          fontWeight="700"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {spot.label}
        </text>
        {spot.badge && (
          <>
            <circle cx={x + w / 2 - 2} cy={y - h / 2 + 2} r="11" fill="#e8b93f" stroke="#3a1663" strokeWidth="1.5" />
            <text
              x={x + w / 2 - 2}
              y={y - h / 2 + 7}
              textAnchor="middle"
              fill="#3a1663"
              fontSize="12"
              fontWeight="800"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {spot.badge}
            </text>
          </>
        )}
      </motion.g>
    </g>
  )
}

/**
 * The bag on the floor, since the painting deliberately has nothing on it.
 *
 * A generated `prop` (art/library.json, keyed and cropped) over a drawn
 * fallback, like everything else here — a build without the render still shows
 * a bag rather than a gap where the tap target is.
 */
function Satchel({ x, y }: { x: number; y: number }) {
  const art = GENERATED_ART['study_satchel']
  // The render is 185x150; keep its ratio so the buckle doesn't stretch.
  const h = Math.round(SATCHEL_W * (150 / 185))
  return (
    <g>
      <ellipse cx={x} cy={y - 4} rx={SATCHEL_W * 0.38} ry={SATCHEL_W * 0.07} fill="rgba(24,10,4,0.34)" />
      {art ? (
        <image
          href={art}
          x={x - SATCHEL_W / 2}
          y={y - h}
          width={SATCHEL_W}
          height={h}
          preserveAspectRatio="xMidYMax meet"
        />
      ) : (
        <g>
          <path d={`M${x - 30} ${y - 34} h60 l-5 34 h-50 z`} fill="#7a4a25" />
          <path d={`M${x - 32} ${y - 40} h64 v12 h-64 z`} fill="#96602f" />
          <path d={`M${x - 12} ${y - 44} a12 9 0 0 1 24 0`} fill="none" stroke="#5d3418" strokeWidth="4" />
          <rect x={x - 5} y={y - 32} width="10" height="12" rx="2" fill="#d6a944" />
        </g>
      )}
    </g>
  )
}

/**
 * The room, drawn.
 *
 * Never seen once `study-library` has been generated, and it still has to be
 * right: generated art LAYERS OVER a drawn fallback in this codebase rather
 * than replacing it, so a build whose painting failed shows a library instead
 * of a black rectangle — and this is the entire Study tab, so that fallback is
 * the difference between a degraded tab and a broken one. Flat fills, no
 * <defs> — same rule as ChurchArt.
 */
function DrawnLibrary() {
  const shelfRow = (y: number, h: number) => (
    <g key={y}>
      <rect x="0" y={y} width={W} height={h} fill="#3a2415" />
      {Array.from({ length: 26 }, (_, i) => {
        // A deterministic scatter: books of four heights and five colours, so
        // the row reads as spines rather than as a striped rectangle.
        const spine = ['#8c3b2e', '#7a5a2c', '#3f5c4a', '#5b3a63', '#94733a'][(i * 7 + y) % 5]
        const bh = h - 7 - ((i * 5 + y) % 4) * 3
        const x = 7 + i * 15
        if (x > W - 13) return null
        return <rect key={i} x={x} y={y + h - 4 - bh} width={10} height={bh} fill={spine} />
      })}
      <rect x="0" y={y + h - 4} width={W} height="4" fill="#26170d" />
    </g>
  )

  return (
    <g>
      <rect x="0" y="0" width={W} height={H} fill="#2b1a0f" />
      {[6, 72, 138, 204, 270, 336].map((y) => shelfRow(y, 58))}
      {/* The arched window, punched through the middle bay of the top rows. */}
      <rect x="150" y="6" width="98" height="150" fill="#2b1a0f" />
      <path d="M199 22 a32 32 0 0 1 32 32 v90 h-64 v-90 a32 32 0 0 1 32 -32 z" fill="#16244a" />
      <line x1="199" y1="22" x2="199" y2="144" stroke="#4a3018" strokeWidth="4" />
      <line x1="167" y1="86" x2="231" y2="86" stroke="#4a3018" strokeWidth="4" />
      {/* Floor — the bottom third, as the prompt specifies. */}
      <rect x="0" y="402" width={W} height={H - 402} fill="#8a5f34" />
      <rect x="0" y="402" width={W} height="6" fill="#5c3d1f" />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <line key={i} x1={i * 80} y1="408" x2={i * 80} y2={H} stroke="#734f2b" strokeWidth="2" />
      ))}
      {/* The checkout desk, right of frame where the painting puts it. */}
      <rect x="242" y="316" width={W - 242} height="20" rx="3" fill="#6b4525" />
      <rect x="256" y="336" width={W - 256} height="240" fill="#4d3018" />
      <rect x="272" y="358" width="52" height="70" fill="#3c2412" />
      <rect x="334" y="358" width="52" height="70" fill="#3c2412" />
      {/* The ledger on the desk top — the thing the reports hotspot rings. */}
      <rect x={LEDGER.x - 32} y={LEDGER.y - 14} width="64" height="16" rx="2" fill="#6b3b28" />
      <rect x={LEDGER.x - 32} y={LEDGER.y} width="64" height="4" fill="#e8d9a8" />
      {/* Desk lamp — the one warm point on that side of the room. */}
      <rect x="272" y="284" width="5" height="32" fill="#b08a3c" />
      <path d="M256 284 h38 l-8 -16 h-22 z" fill="#d6a944" />
      <circle cx="275" cy="272" r="20" fill="#ffd257" opacity="0.16" />
      {/* Hanging lamps */}
      {[70, 328].map((x) => (
        <g key={x}>
          <line x1={x} y1="0" x2={x} y2="150" stroke="#54371c" strokeWidth="3" />
          <circle cx={x} cy="164" r="13" fill="#ffd257" />
          <circle cx={x} cy="164" r="24" fill="#ffd257" opacity="0.18" />
        </g>
      ))}
    </g>
  )
}

/**
 * Her, drawn — the fallback for the same reason DrawnLibrary is one.
 *
 * Faceless, like every drawn figure in this app: the raster renders have faces
 * and the drawn ones do not, and a face on a fallback was the odd art out (see
 * the starter-character note in CLAUDE.md).
 */
function DrawnLibrarian({ x, footY, h }: { x: number; footY: number; h: number }) {
  const w = h * 0.36
  const headR = h * 0.093
  const headY = footY - h + headR
  return (
    <g>
      <path
        d={`M${x - w * 0.3} ${headY + headR * 1.5}
            h${w * 0.6}
            l${w * 0.16} ${h * 0.74}
            h-${w * 0.92}
            z`}
        fill="#2f6b6b"
      />
      <path
        d={`M${x - w * 0.32} ${headY + headR * 1.5} l${w * 0.34} ${h * 0.1} l-${w * 0.1} ${h * 0.34} l-${w * 0.3} -${h * 0.06} z`}
        fill="#c08b3f"
      />
      <rect x={x - w * 0.34} y={footY - h * 0.46} width={w * 0.68} height={h * 0.035} fill="#9a7333" />
      <rect x={x + w * 0.02} y={footY - h * 0.52} width={w * 0.3} height={h * 0.18} rx="1" fill="#6b3b28" />
      <circle cx={x} cy={headY} r={headR} fill="#e3b58c" />
      <path
        d={`M${x - headR} ${headY - headR * 0.15} a${headR} ${headR} 0 0 1 ${headR * 2} 0 z`}
        fill="#8d8d94"
      />
      <circle cx={x + headR * 0.55} cy={headY - headR * 0.75} r={headR * 0.34} fill="#8d8d94" />
    </g>
  )
}
