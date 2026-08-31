import { motion } from 'framer-motion'
import { useSettings } from '@/store/settings'

// The arcade machine that stands in the little worlds.
//
// One drawing, used by every room that has one — the hall, the churchyard and
// your own Upper Room. Same rule as KeepScene and CrowdLife: the instant a
// second surface wanted it, it became one thing, because three cabinets drawn
// three times would drift and the joke only works if it is obviously the same
// machine in every room.
//
// Drawn SVG rather than a Nano Banana render. The postcard reason is gone —
// lib/postcard.ts inlines images as data: URIs now, so a raster would survive
// the export — but the other one still stands on its own: it has to read at
// about 40px in a churchyard, which is the same argument that keeps the church
// buildings a drawn kit. Staying drawn is also what lets one machine sit in
// three differently-lit worlds without three renders of it.
//
// It is drawn around its GROUND POINT (0,0 is the middle of its feet), like
// every prop in KeepArt and RoomArt, so a caller places it by where it stands
// rather than by where its box happens to be.

// The CABINET is timber and brass; the SCREEN is the only thing that glows.
//
// It used to be built out of the app's chrome purple, which is right for a nav
// bar and wrong for furniture: standing in a lamplit clay chamber or a stone
// hall, a violet box read as a sticker pasted onto the painting rather than as
// something in the room. Warm wood and brass is an object that could plausibly
// be standing there — while the marquee, the lit screen, the buttons and the
// coin door still say arcade machine at a glance, which is the whole joke.
//
// Keep the accents. The coral and mint buttons are two small dots, and they are
// the fastest read that this is a machine rather than a cupboard.
const BODY = '#6b4a2e'
const BODY_LIT = '#8a6340'
const BODY_DARK = '#452e1c'
const EDGE = '#b98a3e'
const SCREEN = '#0b0720'
const SAND = '#b4855a'
const GOLD = '#ffd23f'
const CORAL = '#ff6b6b'
const MINT = '#4ecdc4'

/** Natural size, so a caller can reason about how much room it needs. */
export const CABINET_W = 44
export const CABINET_H = 94

export function ArcadeCabinet({
  x = 0,
  y = 0,
  scale = 1,
  onOpen,
}: {
  x?: number
  y?: number
  scale?: number
  /** Present only on the surfaces that own the room. Without it, furniture. */
  onOpen?: () => void
}) {
  const reduceMotion = useSettings((s) => s.reduceMotion)

  return (
    <g
      transform={`translate(${x} ${y}) scale(${scale})`}
      onClick={
        onOpen
          ? (e) => {
              // The scenes make the whole picture one big button (onOpen on the
              // wrapper opens the sheet). A cabinet that also opened the sheet
              // behind it would be a machine you cannot switch on.
              e.stopPropagation()
              onOpen()
            }
          : undefined
      }
      style={{ cursor: onOpen ? 'pointer' : undefined }}
    >
      {/* Standing on something, not floating. */}
      <ellipse cx="0" cy="0" rx="22" ry="5" fill="rgba(0,0,0,0.32)" />

      {/* Body: a shallow taper, wider at the base, with a lit left face so it
          reads as a box rather than a sticker. */}
      <path d={`M-19 0 L-21 -70 L-15 -${CABINET_H} L15 -${CABINET_H} L21 -70 L19 0 Z`} fill={BODY} />
      <path d={`M-19 0 L-21 -70 L-15 -${CABINET_H} L-9 -${CABINET_H} L-13 -70 L-11 0 Z`} fill={BODY_LIT} />
      <path d={`M11 0 L13 -70 L9 -${CABINET_H} L15 -${CABINET_H} L21 -70 L19 0 Z`} fill={BODY_DARK} />
      <path
        d={`M-19 0 L-21 -70 L-15 -${CABINET_H} L15 -${CABINET_H} L21 -70 L19 0 Z`}
        fill="none"
        stroke={EDGE}
        strokeWidth="1.2"
      />

      {/* Marquee. No lettering: at churchyard size type is a smudge, and a
          smudge that is trying to be a word looks like a bug. */}
      <rect x="-16" y={-CABINET_H} width="32" height="10" rx="2" fill={EDGE} />
      <rect x="-11" y={-CABINET_H + 3.5} width="22" height="3" rx="1.5" fill="#5c4220" opacity="0.55" />

      {/* Screen: a strip of sand under a night sky, with manna on it. */}
      <rect x="-14" y={-CABINET_H + 13} width="28" height="24" rx="2" fill={SCREEN} />
      <rect x="-14" y={-CABINET_H + 28} width="28" height="9" rx="0" fill={SAND} />
      <motion.g
        initial={false}
        animate={reduceMotion ? { opacity: 1 } : { opacity: [1, 0.55, 1] }}
        transition={reduceMotion ? { duration: 0 } : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <circle cx="-7" cy={-CABINET_H + 20} r="2.4" fill="#fff6dc" />
        <circle cx="3" cy={-CABINET_H + 24} r="2" fill="#fff6dc" />
        <circle cx="9" cy={-CABINET_H + 18} r="1.6" fill="#fff6dc" />
      </motion.g>
      <rect
        x="-14"
        y={-CABINET_H + 13}
        width="28"
        height="24"
        rx="2"
        fill="none"
        stroke={EDGE}
        strokeWidth="1"
      />

      {/* Control panel, tilted toward the player. */}
      <path d={`M-17 -46 L17 -46 L19 -37 L-19 -37 Z`} fill={BODY_LIT} />
      <path d={`M-17 -46 L17 -46 L19 -37 L-19 -37 Z`} fill="none" stroke={EDGE} strokeWidth="0.9" />
      <circle cx="-6" cy="-42" r="2.6" fill="#22143f" />
      <rect x="-6.9" y="-48" width="1.8" height="6" rx="0.9" fill="#c9b6ef" />
      <circle cx="-6" cy="-48.5" r="2.2" fill={CORAL} />
      <circle cx="4" cy="-42" r="2.4" fill={GOLD} />
      <circle cx="11" cy="-42" r="2.4" fill={MINT} />

      {/* Coin door and a warm spill of light on the floor in front of it. */}
      <rect x="-8" y="-24" width="16" height="11" rx="1.5" fill={BODY_DARK} />
      <rect x="-3" y="-20" width="6" height="1.8" rx="0.9" fill={EDGE} opacity="0.9" />
      <ellipse cx="0" cy="-1" rx="26" ry="6" fill={GOLD} opacity="0.07" />
    </g>
  )
}

/**
 * The same cabinet as a standalone box, for a scene built out of DOM rather
 * than one SVG — the churchyard is positioned divs on a lawn, not a viewBox.
 */
export function ArcadeCabinetBox({
  width,
  onOpen,
  title,
}: {
  width: number
  onOpen?: () => void
  title?: string
}) {
  const h = Math.round((width / CABINET_W) * (CABINET_H + 8))
  return (
    <svg
      viewBox={`${-CABINET_W / 2 - 4} ${-CABINET_H - 2} ${CABINET_W + 8} ${CABINET_H + 8}`}
      width={width}
      height={h}
      style={{ display: 'block', overflow: 'visible' }}
      role={onOpen ? 'button' : undefined}
      aria-label={onOpen ? title : undefined}
    >
      <ArcadeCabinet onOpen={onOpen} />
    </svg>
  )
}
