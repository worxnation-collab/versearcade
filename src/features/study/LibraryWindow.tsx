import { motion, useReducedMotion } from 'framer-motion'
import { GENERATED_ART } from '@/data/generatedArt'
import { LIBRARIAN_NAME } from '@/data/library'

// The lending library — the little world that belongs to the Study tab.
//
// Every other section of this app opens with the place it is about: the road at
// the top of /season, the hall under "Start a new battle", the churchyard as
// the hero of /church, your own room under the player card. Study opened with a
// menu. This is its room, and it follows the same two rules the others do:
//
//   ONE COMPONENT, EVERY SURFACE THAT SHOWS IT. Today that is the Study tab and
//   nothing else, but the sheet draws the same painting behind the librarian's
//   greeting, so the room you tapped and the room you are standing in are
//   provably the same room.
//
//   IT IS INERT WITHOUT A HANDLER. No `onEnter` and this is a picture — which
//   is what the sheet's own header needs, and what keeps a decorative copy from
//   quietly becoming a second control.
//
// THE ART: `study-library` is a full-bleed Nano Banana painting (art/
// library.json) laid over a drawn fallback, the same layering every tier ladder
// in this app uses — an ungenerated library still reads as a library rather
// than as a hole. The librarian herself is a keyed full-length figure through
// the same raster path Moses and Esther take, which is why the painting was
// prompted with its left and centre floor DELIBERATELY EMPTY: she stands there.

/** Where she stands, in the painting's own 560x300 coordinates.
 *
 *  She is on the CLEAR half of the floor on purpose — the painting was prompted
 *  with its left and centre deliberately empty so a figure could stand there
 *  without being drawn over a crate or a rug. Moving her right puts her through
 *  the desk. */
const HER_X = 188
const HER_FOOT_Y = 288
const HER_H = 176

export function LibraryWindow({
  onEnter,
  /** Skip the idle bob — the sheet draws this as a backdrop behind her own
      words, and a moving picture behind a paragraph is unreadable. */
  still = false,
  /** The title row above the picture. Off inside the sheet, whose own header
      already says whose desk this is. */
  label = true,
  height,
}: {
  onEnter?: () => void
  still?: boolean
  label?: boolean
  height?: number
}) {
  const reduceMotion = useReducedMotion()
  const painting = GENERATED_ART['study-library']
  const her = GENERATED_ART['librarian']
  const animate = !still && !reduceMotion

  return (
    <div>
      {/* The label sits ABOVE the picture, not on it. It used to be a gradient
          bar across the bottom, which put the text exactly where the librarian
          stands and buried her to the waist — found by looking at the screen,
          not at the diff. A room this small has no spare corner to letterbox. */}
      {label && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ fontFamily: 'var(--font-display)', fontSize: 16, display: 'block' }}>
              The lending library
            </b>
            <span className="dim" style={{ fontSize: 11.5, lineHeight: 1.4 }}>
              {onEnter
                ? `${LIBRARIAN_NAME} is at the desk — ask her for something to read`
                : `${LIBRARIAN_NAME}’s desk`}
            </span>
          </div>
          {onEnter && (
            <button className="pill" onClick={onEnter} style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
              Go in
            </button>
          )}
        </div>
      )}

      <div
        style={{
          position: 'relative',
          borderRadius: 'var(--r-md)',
          overflow: 'hidden',
          border: '1px solid var(--stroke)',
          cursor: onEnter ? 'pointer' : undefined,
          height,
        }}
      >
        <svg
          viewBox="0 0 560 300"
          style={{ display: 'block', width: '100%', height: height ? '100%' : 'auto' }}
          preserveAspectRatio="xMidYMax slice"
        >
          <DrawnLibrary />
          {painting && (
            <image
              href={painting}
              x="0"
              y="0"
              width="560"
              height="300"
              preserveAspectRatio="xMidYMid slice"
            />
          )}

          {/* Her. Bobs a hair, so the room has somebody alive in it rather than
              a sticker on a background — the same trick CrowdLife plays,
              without CrowdLife's waypoints, because she never leaves her desk. */}
          <motion.g
            animate={animate ? { y: [0, -2.5, 0] } : { y: 0 }}
            transition={animate ? { duration: 4.2, repeat: Infinity, ease: 'easeInOut' } : undefined}
          >
            {/* The floor takes her shadow, or she hovers. */}
            <ellipse
              cx={HER_X}
              cy={HER_FOOT_Y}
              rx={HER_H * 0.15}
              ry={HER_H * 0.04}
              fill="rgba(24,10,4,0.42)"
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

            {/* One small bubble over her head, so a figure standing in a
                painting reads as somebody you can talk to. The same idiom
                CrowdLife's CHATTER uses, and the same rule: an emoji from a
                fixed list, never a line anybody can author. Only when she is
                actually tappable — a bubble on a decorative copy would promise
                a conversation the sheet's backdrop cannot have. */}
            {onEnter && (
              <motion.g
                animate={animate ? { y: [0, -3, 0], opacity: [0.75, 1, 0.75] } : { y: 0, opacity: 1 }}
                transition={animate ? { duration: 2.8, repeat: Infinity, ease: 'easeInOut' } : undefined}
              >
                {/* Tail first, so the circle paints over the join. */}
                <path
                  d={`M${HER_X + 27} ${HER_FOOT_Y - HER_H + 4} L${HER_X + 15} ${HER_FOOT_Y - HER_H + 20} L${HER_X + 37} ${HER_FOOT_Y - HER_H + 8} z`}
                  fill="rgba(12,6,26,0.86)"
                  stroke="var(--gold)"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <circle cx={HER_X + 34} cy={HER_FOOT_Y - HER_H - 4} r="15" fill="rgba(12,6,26,0.86)" stroke="var(--gold)" strokeWidth="1.5" />
                <text
                  x={HER_X + 34}
                  y={HER_FOOT_Y - HER_H + 2}
                  textAnchor="middle"
                  fontSize="15"
                >
                  📖
                </text>
              </motion.g>
            )}
          </motion.g>
        </svg>

        {/* The whole picture is the tap target. Entering a little world by
            tapping it is how every other one in this app works, so the pill
            above is a signpost rather than the only door. */}
        {onEnter && (
          <button
            onClick={onEnter}
            aria-label={`The lending library — talk to ${LIBRARIAN_NAME}`}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
          />
        )}
      </div>
    </div>
  )
}

/**
 * The room, drawn.
 *
 * Never seen once `study-library` has been generated, and it still has to be
 * right: generated art LAYERS OVER a drawn fallback in this codebase rather
 * than replacing it, so a build whose painting failed shows a library instead
 * of a black rectangle. Flat fills, no <defs> — same rule as ChurchArt.
 */
function DrawnLibrary() {
  const shelfRow = (y: number, h: number) => (
    <g key={y}>
      <rect x="0" y={y} width="560" height={h} fill="#3a2415" />
      {Array.from({ length: 34 }, (_, i) => {
        // A deterministic scatter: books of four heights and five colours, so
        // the row reads as spines rather than as a striped rectangle.
        const spine = ['#8c3b2e', '#7a5a2c', '#3f5c4a', '#5b3a63', '#94733a'][(i * 7 + y) % 5]
        const bh = h - 6 - ((i * 5 + y) % 4) * 2
        const x = 8 + i * 16
        if (x > 520) return null
        return <rect key={i} x={x} y={y + h - 3 - bh} width={11} height={bh} fill={spine} />
      })}
      <rect x="0" y={y + h - 3} width="560" height="3" fill="#26170d" />
    </g>
  )

  return (
    <g>
      <rect x="0" y="0" width="560" height="300" fill="#2b1a0f" />
      {[10, 82, 154].map((y) => shelfRow(y, 62))}
      {/* The arched window in the back wall, punched through the middle bay. */}
      <rect x="248" y="10" width="64" height="130" fill="#2b1a0f" />
      <path d="M280 24 a22 22 0 0 1 22 22 v82 h-44 v-82 a22 22 0 0 1 22 -22 z" fill="#16244a" />
      <line x1="280" y1="24" x2="280" y2="128" stroke="#4a3018" strokeWidth="3" />
      <line x1="258" y1="76" x2="302" y2="76" stroke="#4a3018" strokeWidth="3" />
      {/* Floor */}
      <rect x="0" y="216" width="560" height="84" fill="#8a5f34" />
      <rect x="0" y="216" width="560" height="5" fill="#5c3d1f" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <line key={i} x1={i * 80} y1="221" x2={i * 80} y2="300" stroke="#734f2b" strokeWidth="2" />
      ))}
      {/* The checkout desk, on the right where the painting puts it. */}
      <rect x="402" y="196" width="150" height="18" rx="3" fill="#6b4525" />
      <rect x="414" y="214" width="126" height="72" fill="#4d3018" />
      <rect x="426" y="226" width="46" height="48" fill="#3c2412" />
      <rect x="484" y="226" width="46" height="48" fill="#3c2412" />
      {/* Desk lamp — the one warm point on that side of the room. */}
      <rect x="500" y="180" width="4" height="18" fill="#b08a3c" />
      <path d="M486 180 h32 l-6 -12 h-20 z" fill="#d6a944" />
      {/* Hanging lamps */}
      {[112, 224, 336, 448].map((x) => (
        <g key={x}>
          <line x1={x} y1="0" x2={x} y2="30" stroke="#54371c" strokeWidth="2" />
          <circle cx={x} cy="38" r="9" fill="#ffd257" />
          <circle cx={x} cy="38" r="16" fill="#ffd257" opacity="0.18" />
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
      {/* Robe */}
      <path
        d={`M${x - w * 0.30} ${headY + headR * 1.5}
            h${w * 0.60}
            l${w * 0.16} ${h * 0.74}
            h-${w * 0.92}
            z`}
        fill="#2f6b6b"
      />
      {/* Shawl over one shoulder */}
      <path
        d={`M${x - w * 0.32} ${headY + headR * 1.5} l${w * 0.34} ${h * 0.10} l-${w * 0.10} ${h * 0.34} l-${w * 0.30} -${h * 0.06} z`}
        fill="#c08b3f"
      />
      {/* Belt */}
      <rect x={x - w * 0.34} y={footY - h * 0.46} width={w * 0.68} height={h * 0.035} fill="#9a7333" />
      {/* The book she is holding */}
      <rect x={x + w * 0.02} y={footY - h * 0.52} width={w * 0.30} height={h * 0.18} rx="1" fill="#6b3b28" />
      {/* Head + pinned hair */}
      <circle cx={x} cy={headY} r={headR} fill="#e3b58c" />
      <path
        d={`M${x - headR} ${headY - headR * 0.15} a${headR} ${headR} 0 0 1 ${headR * 2} 0 z`}
        fill="#8d8d94"
      />
      <circle cx={x + headR * 0.55} cy={headY - headR * 0.75} r={headR * 0.34} fill="#8d8d94" />
    </g>
  )
}
