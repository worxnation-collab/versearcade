import { useEffect, useState } from 'react'
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
// Drawn SVG rather than a Nano Banana render, for two reasons that both come
// from where it has to appear. It stands in a scene that the postcard
// serialises (lib/postcard.ts), and an SVG loaded into an <img> never fetches
// external resources — a room made of <image href> exports blank. And it has to
// read at about 40px in a churchyard, which is the same argument that keeps the
// church buildings a drawn kit.
//
// It is drawn around its GROUND POINT (0,0 is the middle of its feet), like
// every prop in KeepArt and RoomArt, so a caller places it by where it stands
// rather than by where its box happens to be.

const BODY = '#2f1b57'
const BODY_LIT = '#3d2470'
const BODY_DARK = '#1d0f3a'
const EDGE = '#6a44b8'
const SCREEN = '#0b0720'
const SAND = '#b4855a'
const GOLD = '#ffd23f'
const CORAL = '#ff6b6b'
const MINT = '#4ecdc4'

/** Natural size, so a caller can reason about how much room it needs. */
export const CABINET_W = 44
export const CABINET_H = 94

/**
 * What is playing on the little screen.
 *
 * `attract` cycles the games the way a real cabinet's attract mode does, and
 * that is doing a job rather than being cute: the machine standing in the hall
 * now opens a lobby with more than one game behind it, and a screen stuck on
 * one of them would promise the wrong thing. Reduce-motion holds the first
 * frame instead — the cycle is decoration, and the lobby says what's inside in
 * words anyway.
 */
export type CabinetScreen = 'manna' | 'words' | 'cross' | 'attract'

const SCREEN_ORDER: Exclude<CabinetScreen, 'attract'>[] = ['manna', 'words', 'cross']
/** How long each game holds the screen in attract mode. */
const ATTRACT_MS = 3200

export function ArcadeCabinet({
  x = 0,
  y = 0,
  scale = 1,
  screen = 'manna',
  onOpen,
}: {
  x?: number
  y?: number
  scale?: number
  /** Which game is on the screen; `attract` cycles them. */
  screen?: CabinetScreen
  /** Present only on the surfaces that own the room. Without it, furniture. */
  onOpen?: () => void
}) {
  const reduceMotion = useSettings((s) => s.reduceMotion)
  const showing = useAttract(screen, reduceMotion)

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
      <rect x="-16" y={-CABINET_H} width="32" height="10" rx="2" fill={GOLD} />
      <rect x="-11" y={-CABINET_H + 3.5} width="22" height="3" rx="1.5" fill="#7a4a00" opacity="0.55" />

      {/* Screen. Whatever is showing, it is drawn inside the same 28x24 well,
          so swapping games never changes the machine's silhouette. */}
      <rect x="-14" y={-CABINET_H + 13} width="28" height="24" rx="2" fill={SCREEN} />
      {showing === 'manna' ? (
        <MannaScreen reduceMotion={reduceMotion} />
      ) : showing === 'words' ? (
        <WordsScreen reduceMotion={reduceMotion} />
      ) : (
        <CrossScreen reduceMotion={reduceMotion} />
      )}
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
      <rect x="-3" y="-20" width="6" height="1.8" rx="0.9" fill={GOLD} opacity="0.8" />
      <ellipse cx="0" cy="-1" rx="26" ry="6" fill={GOLD} opacity="0.07" />
    </g>
  )
}

/** A strip of sand under a night sky, with manna falling on it. */
function MannaScreen({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <g>
      <rect x="-14" y={-CABINET_H + 28} width="28" height="9" fill={SAND} />
      <motion.g
        initial={false}
        animate={reduceMotion ? { opacity: 1 } : { opacity: [1, 0.55, 1] }}
        transition={reduceMotion ? { duration: 0 } : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <circle cx="-7" cy={-CABINET_H + 20} r="2.4" fill="#fff6dc" />
        <circle cx="3" cy={-CABINET_H + 24} r="2" fill="#fff6dc" />
        <circle cx="9" cy={-CABINET_H + 18} r="1.6" fill="#fff6dc" />
      </motion.g>
    </g>
  )
}

/**
 * A line of paper words, landing.
 *
 * Word Catch is played on paper rather than in the app's dark, so its screen is
 * a pale page with ink bars on it — the same "tell the machines apart from
 * across the room" job the sand and the gold cross do, and legible at nine
 * pixels because it is bars rather than letters.
 */
function WordsScreen({ reduceMotion }: { reduceMotion: boolean }) {
  const top = -CABINET_H + 16
  // Three lines of "words", of uneven length, the way a verse breaks up.
  const bars: [number, number, number][] = [
    [-11, 0, 9],
    [-1, 0, 7],
    [-11, 1, 6],
    [-4, 1, 11],
    [-11, 2, 13],
  ]
  return (
    <g>
      <rect x="-12" y={top - 2} width="24" height="18" rx="1" fill="#f2e5c8" />
      {bars.map(([x, row, w], i) => (
        <motion.rect
          key={i}
          x={x}
          y={top + 1 + row * 5}
          width={w}
          height={2.6}
          rx="1.1"
          fill="#4a3a24"
          initial={false}
          animate={reduceMotion ? { opacity: 0.85 } : { opacity: [0.2, 0.9, 0.9, 0.2] }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: 3, repeat: Infinity, ease: 'easeInOut', delay: i * 0.28 }
          }
        />
      ))}
      {/* The word still in the air, over the page.

          The bob is a RELATIVE translate, not the rect's `y`: framer-motion
          maps x/y on an SVG element to a transform rather than to the
          attribute, so animating to an absolute viewBox coordinate translates
          the rect by that whole distance and throws it clean off the cabinet
          (it landed up beside the page title). `attrY` would animate the
          attribute; a small offset is what this actually wants. */}
      <motion.rect
        x="1"
        y={top + 11}
        width="8"
        height="2.8"
        rx="1.2"
        fill={GOLD}
        initial={false}
        animate={reduceMotion ? { y: 0 } : { y: [-2.5, 2.5, -2.5] }}
        transition={
          reduceMotion ? { duration: 0 } : { duration: 1.8, repeat: Infinity, ease: 'easeInOut' }
        }
      />
    </g>
  )
}

/**
 * A cross of squares, filling in.
 *
 * Not a legible crossword: at churchyard size the whole screen is nine pixels
 * tall, so this is the SHAPE of the game — the same argument that keeps
 * lettering off the marquee.
 */
function CrossScreen({ reduceMotion }: { reduceMotion: boolean }) {
  // A 5x5 of squares centred in the 28x24 well, with the bar on the SECOND row
  // — the same upper-third rule the puzzles themselves are checked against, or
  // this draws a plus sign and the machine advertises the wrong game.
  const cell = 3.6
  const step = 4.2
  const left = -10.2
  const top = -CABINET_H + 14.8
  const squares: [number, number][] = [
    [2, 0], [0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [2, 2], [2, 3], [2, 4],
  ]
  return (
    <g>
      {squares.map(([c, r], i) => (
        <motion.rect
          key={`${c},${r}`}
          x={left + c * step}
          y={top + r * step}
          width={cell}
          height={cell}
          rx="0.7"
          fill={GOLD}
          initial={false}
          animate={reduceMotion ? { opacity: 0.9 } : { opacity: [0.25, 0.95, 0.25] }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: 2.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.16 }
          }
        />
      ))}
    </g>
  )
}

/** Which game the screen is showing right now. */
function useAttract(screen: CabinetScreen, reduceMotion: boolean) {
  const [i, setI] = useState(0)
  const cycling = screen === 'attract' && !reduceMotion
  useEffect(() => {
    if (!cycling) return
    const t = window.setInterval(() => setI((n) => n + 1), ATTRACT_MS)
    return () => window.clearInterval(t)
  }, [cycling])
  if (screen !== 'attract') return screen
  return SCREEN_ORDER[i % SCREEN_ORDER.length]
}

/**
 * The same cabinet as a standalone box, for a scene built out of DOM rather
 * than one SVG — the churchyard is positioned divs on a lawn, not a viewBox.
 */
export function ArcadeCabinetBox({
  width,
  screen = 'manna',
  onOpen,
  title,
}: {
  width: number
  screen?: CabinetScreen
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
      <ArcadeCabinet screen={screen} onOpen={onOpen} />
    </svg>
  )
}
