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

/** The clouds' own two colours. Deep violet out of the app's own night sky
 *  rather than the room's browns — a marker is the app speaking, not the
 *  painting — with the brand gold as its edge. */
const CLOUD_FILL = 'rgba(24,12,58,0.92)'
const CLOUD_EDGE = 'var(--gold)'

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
        {ledger && <Tappable spot={ledger} x={LEDGER.x} y={LEDGER.y - 52} alive={alive} trail="down" />}

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
              y={HER_FOOT_Y - HER_H - 26}
              alive={alive}
              trail="down-left"
            />
          )}
        </motion.g>

        {/* The satchel, nearest the camera and therefore last. Ours rather than
            painted — the room's floor was prompted empty on purpose, so
            anything standing on it is something we put there. */}
        {satchel && (
          <Tappable spot={satchel} x={SATCHEL.x + 2} y={SATCHEL.y - 104} alive={alive} trail="down">
            <Satchel x={SATCHEL.x} y={SATCHEL.y} />
          </Tappable>
        )}
      </svg>
    </div>
  )
}

/**
 * How many scallops the top and bottom of a cloud that wide should carry.
 *
 * A fixed count makes a two-word marker lumpy and a one-word one nearly round,
 * so the bumps are sized instead: ~20 units of straight span each, at least
 * two, which keeps every label in the room wearing the same size of puff.
 */
function bumpsFor(span: number) {
  return Math.max(2, Math.round(span / 20))
}

/**
 * A thought cloud, as ONE closed path.
 *
 * Drawing it the obvious way — a rounded rect with circles overlapping its edge
 * — needs every piece to share a fill AND leaves the stroke running through the
 * middle of the shape, so the outline shows all the seams. Tracing the whole
 * scalloped outline instead gives a single fill and a single unbroken stroke,
 * which is what lets it be painted twice (shadow, then body) without the copies
 * disagreeing about where the edge is.
 *
 * The caps are true semicircles, so `w` is the real width; only the bumps
 * push past `h`, by about a quarter of a bump each side.
 */
function cloudPath(cx: number, cy: number, w: number, h: number) {
  const hr = h / 2
  const left = cx - w / 2
  const right = cx + w / 2
  const top = cy - hr
  const bot = cy + hr
  const span = w - h
  const n = bumpsFor(span)
  const bw = span / n
  // Radius > half the chord, so each arc is a shallow bulge rather than a
  // half-circle: about 0.27 * bw of relief, which reads as a puff at 14px text
  // without turning the label into a flower.
  const rb = bw * 0.56
  const parts: string[] = [`M${left + hr} ${top}`]
  for (let i = 1; i <= n; i++) parts.push(`A${rb} ${rb} 0 0 1 ${left + hr + i * bw} ${top}`)
  parts.push(`A${hr} ${hr} 0 0 1 ${right - hr} ${bot}`)
  for (let i = 1; i <= n; i++) parts.push(`A${rb} ${rb} 0 0 1 ${right - hr - i * bw} ${bot}`)
  parts.push(`A${hr} ${hr} 0 0 1 ${left + hr} ${top}`, 'Z')
  return parts.join(' ')
}

/** How far a cloud's bumps reach past `h`, so hit areas and trails can allow
 *  for them without re-deriving the arc maths. */
function cloudBulge(w: number, h: number) {
  const span = w - h
  const bw = span / bumpsFor(span)
  const rb = bw * 0.56
  return rb - Math.sqrt(Math.max(0, rb * rb - (bw / 2) * (bw / 2)))
}

/** The trail of puffs, shrinking towards whatever the cloud is about. */
const TRAIL = [
  { t: 0.0, r: 5.5 },
  { t: 0.5, r: 3.6 },
  { t: 1.0, r: 2.2 },
]

/**
 * One thing in the room you can touch.
 *
 * A thought cloud, a label and a generous invisible hit area — never a bare
 * region of painting, because a hotspot nobody can see is a room that feels
 * broken rather than mysterious. The label is always drawn: this is a tab, not
 * a puzzle, and somebody arriving must not have to hunt for the way to their
 * own reports.
 *
 * WHY A CLOUD RATHER THAN A PILL. These markers are the one place in this app
 * where chrome sits directly on a painting, and they shipped wearing the shape
 * of a button — a flat gold-outlined pill with a hard triangular tail, three of
 * them stuck to a warm oil-painted room. The house aesthetic is chunky, rounded
 * and springy (index.css), and the room's own subject is somebody thinking
 * about a book: a scalloped cloud trailing puffs says "this has something to
 * say" without pretending to be a control. It also fixes the tail, which as a
 * triangle could only ever point one way and had to be aimed by hand — a trail
 * of puffs points anywhere by moving its last puff.
 */
function Tappable({
  spot,
  x,
  y,
  alive,
  /** Where the puffs lead: straight down to the object under the cloud, or
   *  down-left to a head the cloud is standing beside. */
  trail,
  children,
}: {
  spot: Hotspot
  x: number
  y: number
  alive: boolean
  trail: 'down' | 'down-left'
  children?: React.ReactNode
}) {
  // Roughly 7px per character at this font size, plus padding. Measuring text
  // in SVG needs a layout pass and a ref per marker; the labels here are one or
  // two words, so an estimate that errs wide is the right trade.
  const w = Math.max(64, spot.label.length * 7.4 + 26)
  const h = 26
  const bulge = cloudBulge(w, h)
  const path = cloudPath(x, y, w, h)
  // Where the puffs go. They start at the cloud's own edge and run to a point
  // just short of the thing being pointed at, so the last one lands on the
  // ledger's corner or by her shoulder rather than on top of it.
  const down = trail === 'down'
  const from = { x: down ? x - 8 : x - w / 2 + 8, y: y + h / 2 + bulge }
  const to = { x: down ? x - 20 : x - w / 2 - 26, y: from.y + (down ? 26 : 24) }
  return (
    <g style={{ cursor: 'pointer' }} onClick={spot.onTap}>
      {children}
      {/* The hit area, well beyond the marker — a 26px cloud is under Apple's
          44px minimum on its own, and the puffs are far too small to aim at.
          Derived from the marker's real extent rather than from its width: the
          trail leans left, so a box centred on the cloud misses one edge or the
          other depending on which way it points. */}
      <rect
        x={Math.min(x - w / 2, to.x - 6) - 14}
        y={y - h / 2 - bulge - 16}
        width={Math.max(x + w / 2, to.x + 6) - Math.min(x - w / 2, to.x - 6) + 28}
        height={to.y + 20 - (y - h / 2 - bulge - 16)}
        fill="transparent"
      />
      <motion.g
        animate={alive ? { y: [0, -3, 0] } : { y: 0 }}
        transition={alive ? { duration: 3.4, repeat: Infinity, ease: 'easeInOut' } : undefined}
      >
        {/* The puffs first, so the cloud paints over the join — SVG has no
            z-index, only document order. Each fades a beat after the one above
            it, which is what makes the trail read as a direction rather than as
            three dots. */}
        {TRAIL.map((puff, i) => {
          const cx = from.x + (to.x - from.x) * puff.t
          const cy = from.y + (to.y - from.y) * puff.t
          return (
            <motion.g
              key={i}
              animate={alive ? { opacity: [0.55, 1, 0.55] } : { opacity: 1 }}
              transition={
                alive
                  ? { duration: 2.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.35 }
                  : undefined
              }
            >
              <circle cx={cx} cy={cy + 3} r={puff.r} fill="rgba(0,0,0,0.3)" />
              <circle
                cx={cx}
                cy={cy}
                r={puff.r}
                fill={CLOUD_FILL}
                stroke={CLOUD_EDGE}
                strokeWidth="1.6"
              />
            </motion.g>
          )
        })}
        {/* Chunky drop shadow, the SVG version of --shadow-pop: the same
            outline again, three units down. It is what stops a dark cloud from
            sinking into a dark shelf behind it. */}
        <path d={path} fill="rgba(0,0,0,0.32)" transform="translate(0 3)" />
        {/* A soft gold bloom, drawn as a fat translucent stroke rather than a
            filter — no <defs>, same rule the church kit follows, and it costs
            nothing on a scene that already carries a full-bleed image. */}
        <path d={path} fill="none" stroke="rgba(255,210,63,0.16)" strokeWidth="7" />
        <path d={path} fill={CLOUD_FILL} stroke={CLOUD_EDGE} strokeWidth="2" />
        <text
          x={x}
          y={y + 5}
          textAnchor="middle"
          fill="#ffe08a"
          fontSize="14"
          fontWeight="700"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          {spot.label}
        </text>
        {spot.badge && (
          <>
            <circle cx={x + w / 2 - 6} cy={y - h / 2 - 3} r="11" fill="#e8b93f" stroke="#3a1663" strokeWidth="1.5" />
            <text
              x={x + w / 2 - 6}
              y={y - h / 2 + 2}
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
