// The artwork on a player card. Modern Warfare calling cards are little painted
// scenes rather than flat colour, so these are too — each background is a
// composed SVG landscape (sun over hills, a starfield, embers, a rainbow over
// water, a lamp in the dark) built from reusable layers. Strictly wordless: the
// scene carries the theme, the card's own UI carries all the text.
//
// Scenes are composed rather than hand-drawn one by one so 40+ backgrounds stay
// maintainable: pick a scene archetype and a palette, get a distinct painting.

import type { ReactNode } from 'react'

export interface Palette {
  /** Sky, top to bottom. */
  sky: [string, string]
  /** Ground / foreground silhouettes. */
  land: string
  /** The light source and highlights. */
  glow: string
  /** Small detail accents (birds, sparks, ripples). */
  accent: string
}

export type Scene =
  | 'sunrise' | 'night' | 'star' | 'flames' | 'water' | 'rainbow' | 'mountain'
  | 'temple' | 'scroll' | 'lamp' | 'radiance' | 'field' | 'storm'
  | 'stone' | 'garden' | 'deep' | 'ladder' | 'host'

const W = 400
const H = 240

// ── Where the art is actually seen ─────────────────────────────────────────
// Measured in the browser, not guessed. The SVG is 400×240 and every card
// renders it with preserveAspectRatio="slice", but the card box is 260 tall at
// any width, so there are two different crops:
//
//   380 wide (phone)   → full height, x cropped to 25…375
//   520 wide (app max) → full width,  y cropped to 20…220
//
// Only x 25…375, y 20…220 survives both. Nothing load-bearing goes outside it.
//
// The card's own contents then cover nearly all of what is left. Measured boxes,
// in viewBox coordinates:
//
//   avatar disc  x  40…99,  y 20…79   opaque
//   username     x 112…240, y 18…43   large type, has a shadow
//   XP figure    x 281…360, y 51…64   small type, no shadow — the fragile one
//   XP bar       x 112…360, y 66…82   solid element
//   stat grid    x  40…360, y 97…222  rgba(10,4,28,0.5) tiles + 3px backdrop blur
//
// So there is no unoccupied region on this card at all. Every scene is read
// through type or through translucent tiles, and the art's job is a tonal field,
// not a picture. Two rules follow, and every scene below obeys them:
//
//  1. Detail finer than ~6px dies below y 97 — the tiles blur it away. Only
//     broad masses survive down there, and the bottom should stay dark so the
//     white stat numerals keep their contrast.
//  2. The one low-ink pocket is x 240…375, y 18…48, right of the short username
//     and above the XP figure. A bright, hard-edged element belongs there and
//     nowhere else. Soft haloes may spill anywhere; it is only the hot core that
//     has to respect the pocket.
//
// Hence HERO below. Scenes that ignored this (sunrise centred its sun at y 150,
// lamp its flame at y 120, stone put its tablets at y 108…208, host its
// multitude behind the username) were painting their subject where nobody could
// see it, which is most of why so many cards read as flat washes.
const HERO_X = 322
const HERO_Y = 38

// ── Layer primitives ───────────────────────────────────────────────────────
// Every layer is pure SVG so a card renders at any size with no image bytes.

const sky = (p: Palette, id: string) => (
  <g key="sky">
    <defs>
      <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={p.sky[0]} />
        <stop offset="100%" stopColor={p.sky[1]} />
      </linearGradient>
    </defs>
    <rect width={W} height={H} fill={`url(#${id}-sky)`} />
  </g>
)

const sunDisc = (p: Palette, id: string, cx = HERO_X, cy = HERO_Y, r = 17) => (
  <g key="sun">
    <defs>
      <radialGradient id={`${id}-sun`}>
        <stop offset="0%" stopColor={p.glow} stopOpacity="1" />
        <stop offset="45%" stopColor={p.glow} stopOpacity="0.55" />
        <stop offset="100%" stopColor={p.glow} stopOpacity="0" />
      </radialGradient>
    </defs>
    <circle cx={cx} cy={cy} r={r * 3.2} fill={`url(#${id}-sun)`} />
    <circle cx={cx} cy={cy} r={r} fill={p.glow} opacity="0.95" />
  </g>
)

// A fan of light from a point. Widths and opacities vary so it reads as light
// rather than a pinwheel — the version this replaces drew 16 identical wedges,
// which striped the card and fought the type on top of it.
const rayFan = (p: Palette, cx: number, cy: number, count = 22, opacity = 0.28) => (
  <g key="rays" opacity={opacity}>
    {Array.from({ length: count }, (_, i) => {
      const a = (i * Math.PI * 2) / count
      const w = 0.014 + ((i * 7) % 5) * 0.012
      return (
        <polygon
          key={i}
          points={`${cx},${cy} ${cx + Math.cos(a - w) * 520},${cy + Math.sin(a - w) * 520} ${cx + Math.cos(a + w) * 520},${cy + Math.sin(a + w) * 520}`}
          fill={p.glow}
          opacity={0.45 + ((i * 3) % 4) * 0.18}
        />
      )
    })}
  </g>
)

// Warm air stacked on the horizon. Cheap, and it does most of the work of making
// a sky read as depth rather than as a vertical gradient.
const horizonHaze = (p: Palette, id: string, y: number, strength = 0.5) => (
  <g key="haze">
    <defs>
      <linearGradient id={`${id}-haze`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={p.glow} stopOpacity="0" />
        <stop offset="100%" stopColor={p.glow} stopOpacity={strength} />
      </linearGradient>
    </defs>
    <rect y={y - 96} width={W} height={96} fill={`url(#${id}-haze)`} />
  </g>
)

// Land in three planes. Depth is aerial perspective — one land colour at three
// opacities — plus a lit top edge on each. The rim is a separate open path
// because stroking the closed shape would draw a hairline down both frame edges.
// Two families so nine landscape scenes don't share one silhouette, and `lift`
// slides the whole set up or down for scenes that want more or less sky.
const RIDGE_SETS: Record<'rolling' | 'broken', [string, string, string]> = {
  rolling: [
    'M0 158 Q 62 140 126 152 T 248 142 T 340 152 T 400 144',
    'M0 186 Q 86 164 162 180 T 306 170 T 400 184',
    'M0 214 Q 72 198 148 210 T 276 204 T 400 218',
  ],
  broken: [
    'M0 164 L48 146 L96 162 L152 138 L214 160 L268 144 L330 164 L400 148',
    'M0 190 L58 172 L118 190 L182 166 L246 188 L308 172 L360 192 L400 178',
    'M0 216 L66 202 L132 218 L198 198 L262 216 L330 202 L400 218',
  ],
}

const ridges = (
  p: Palette,
  set: 'rolling' | 'broken' = 'rolling',
  lift = 0,
  rims: [number, number, number] = [0.5, 0.34, 0.2],
) => (
  <g key="ridges" transform={lift ? `translate(0 ${lift})` : undefined}>
    {RIDGE_SETS[set].map((top, i) => (
      <g key={i}>
        <path d={`${top} L${W} ${H + 80} L0 ${H + 80} Z`} fill={p.land} opacity={[0.34, 0.62, 1][i]} />
        <path d={top} fill="none" stroke={p.glow} strokeWidth="1.8" opacity={rims[i]} strokeLinecap="round" />
      </g>
    ))}
  </g>
)

const stars = (p: Palette, count = 46, seed = 7) => (
  <g key="stars">
    {Array.from({ length: count }, (_, i) => {
      // Deterministic scatter — the same background always paints the same sky.
      const x = ((i * 97 + seed * 31) % 397) + 2
      const y = ((i * 53 + seed * 17) % 130) + 8
      const r = ((i * 13 + seed) % 10) / 9 + 0.5
      return <circle key={i} cx={x} cy={y} r={r} fill={p.accent} opacity={0.35 + ((i * 7) % 10) / 15} />
    })}
  </g>
)

// A big star with four points — the Bethlehem star, the "record time" flash.
const starburst = (p: Palette, cx = HERO_X, cy = HERO_Y, s = 20) => (
  <g key="burst">
    <circle cx={cx} cy={cy} r={s * 2.6} fill={p.glow} opacity="0.2" />
    <path
      d={`M${cx} ${cy - s * 2.4} L${cx + s * 0.34} ${cy - s * 0.34} L${cx + s * 2.4} ${cy} L${cx + s * 0.34} ${cy + s * 0.34} L${cx} ${cy + s * 2.4} L${cx - s * 0.34} ${cy + s * 0.34} L${cx - s * 2.4} ${cy} L${cx - s * 0.34} ${cy - s * 0.34} Z`}
      fill={p.glow}
      opacity="0.95"
    />
  </g>
)

const moon = (p: Palette, cx = HERO_X, cy = HERO_Y, r = 18) => (
  <g key="moon">
    <circle cx={cx} cy={cy} r={r * 2.6} fill={p.glow} opacity="0.16" />
    <circle cx={cx} cy={cy} r={r} fill={p.glow} opacity="0.9" />
    <circle cx={cx - r * 0.36} cy={cy - r * 0.22} r={r * 0.9} fill={p.sky[0]} opacity="0.92" />
  </g>
)

// Light spilling across water toward the viewer, from wherever the source is.
const waves = (p: Palette, y = 158, from = HERO_X) => (
  <g key="waves">
    <rect y={y} width={W} height={H - y} fill={p.land} opacity="0.85" />
    {Array.from({ length: 6 }, (_, i) => (
      <path
        key={i}
        d={`M0 ${y + 14 + i * 14} Q 50 ${y + 5 + i * 14} 100 ${y + 14 + i * 14} T 200 ${y + 14 + i * 14} T 300 ${y + 14 + i * 14} T ${W} ${y + 14 + i * 14}`}
        stroke={p.accent}
        strokeWidth="2"
        fill="none"
        opacity={0.4 - i * 0.05}
      />
    ))}
    <polygon points={`${from - 15},${y} ${from + 15},${y} ${from + 62},${H} ${from - 74},${H}`} fill={p.glow} opacity="0.24" />
  </g>
)

const clouds = (p: Palette, opacity = 0.4) => (
  <g key="clouds" opacity={opacity}>
    <ellipse cx="70" cy="62" rx="58" ry="19" fill={p.glow} />
    <ellipse cx="126" cy="52" rx="40" ry="15" fill={p.glow} />
    <ellipse cx="330" cy="74" rx="48" ry="16" fill={p.glow} />
  </g>
)

// Embers drifting upward.
const sparks = (p: Palette, count = 22) => (
  <g key="sparks">
    {Array.from({ length: count }, (_, i) => {
      const x = ((i * 73 + 19) % 392) + 4
      const y = ((i * 41 + 7) % 170) + 16
      return <circle key={i} cx={x} cy={y} r={((i * 11) % 7) / 5 + 0.6} fill={p.accent} opacity={0.25 + ((i * 3) % 10) / 14} />
    })}
  </g>
)

// A small winged figure in silhouette, for scenes that need a host of them.
// Upright, robed, haloed, wings raised — the things that keep it from reading as
// a bird at the size these get drawn.
const wingedFigure = (x: number, y: number, s: number, color: string, opacity: number, key: string) => (
  <g key={key} transform={`translate(${x} ${y}) scale(${s})`} opacity={opacity}>
    <path d="M-2 -4 C -10 -9, -18 -15, -21.5 -23 C -20 -12, -14 -4, -6 1 Z" fill={color} />
    <path d="M2 -4 C 10 -9, 18 -15, 21.5 -23 C 20 -12, 14 -4, 6 1 Z" fill={color} />
    <path d="M-3.4 -4 Q0 -6 3.4 -4 L5.4 13 L-5.4 13 Z" fill={color} />
    <circle cx="0" cy="-7.6" r="2.8" fill={color} />
    <ellipse cx="0" cy="-11.8" rx="3.6" ry="1.2" fill={color} opacity="0.8" />
  </g>
)

// ── Scenes ─────────────────────────────────────────────────────────────────
// Each one puts its hot core in the pocket and keeps its detail above y 97.

const sunriseScene = (p: Palette, id: string): ReactNode[] => [
  sky(p, id),
  horizonHaze(p, id, 168, 0.5),
  rayFan(p, HERO_X, HERO_Y, 22, 0.24),
  sunDisc(p, id),
  ridges(p, 'rolling'),
]

const nightScene = (p: Palette, id: string): ReactNode[] => [
  sky(p, id),
  stars(p, 46),
  moon(p),
  ridges(p, 'rolling', 12, [0.3, 0.2, 0.12]),
]

const starScene = (p: Palette, id: string): ReactNode[] => [
  sky(p, id),
  stars(p, 40, 11),
  starburst(p),
  ridges(p, 'broken', 16, [0.34, 0.22, 0.14]),
]

// Fire rising out of the bottom edge. The tongues are few and wide because the
// previous nine narrow ones all lived below y 124, entirely behind the stat
// tiles, which blurred them into a smudge; the tallest now reaches the pocket.
const flamesScene = (p: Palette, id: string): ReactNode[] => {
  const outer: [number, number, number][] = [[300, 56, 1], [216, 104, 0.8], [366, 92, 0.7], [128, 130, 0.6], [44, 152, 0.5]]
  const inner: [number, number][] = [[300, 98], [216, 142], [366, 134]]
  return [
    sky(p, id),
    sparks(p),
    <g key="flames">
      <defs>
        <linearGradient id={`${id}-fire`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={p.glow} stopOpacity="0.85" />
          <stop offset="100%" stopColor={p.glow} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect y="110" width={W} height="130" fill={`url(#${id}-fire)`} />
      {outer.map(([x, top, o], i) => (
        <path
          key={i}
          d={`M${x} ${H} C ${x - 46} ${(H + top) / 2}, ${x - 20} ${top + 34}, ${x} ${top} C ${x + 22} ${top + 34}, ${x + 48} ${(H + top) / 2}, ${x} ${H} Z`}
          fill={p.glow}
          opacity={0.2 + o * 0.28}
        />
      ))}
      {inner.map(([x, top], i) => (
        <path
          key={`i${i}`}
          d={`M${x} ${H} C ${x - 22} ${(H + top) / 2}, ${x - 10} ${top + 20}, ${x} ${top} C ${x + 11} ${top + 20}, ${x + 23} ${(H + top) / 2}, ${x} ${H} Z`}
          fill={p.accent}
          opacity="0.46"
        />
      ))}
    </g>,
  ]
}

const waterScene = (p: Palette, id: string): ReactNode[] => [
  sky(p, id),
  clouds(p, 0.2),
  sunDisc(p, id, HERO_X, HERO_Y, 15),
  horizonHaze(p, id, 158, 0.3),
  waves(p, 158, HERO_X),
]

// The arc is masked to fade out toward the left, where the avatar and username
// sit. A full-strength band across all seven colours ran straight through the
// player's name; this way the covenant still arcs the whole card but only
// resolves where there is nothing to read.
const rainbowScene = (p: Palette, id: string): ReactNode[] => {
  const bands = ['#ff6b6b', '#ff9f1c', '#ffd23f', '#6fce7f', '#4ecdc4', '#5b7cf0', '#a06bff']
  return [
    sky(p, id),
    clouds(p, 0.28),
    <g key="rainbow">
      <defs>
        <linearGradient id={`${id}-bowfade`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="38%" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="72%" stopColor="#fff" stopOpacity="0.72" />
          <stop offset="100%" stopColor="#fff" stopOpacity="1" />
        </linearGradient>
        <mask id={`${id}-bowmask`}>
          <rect width={W} height={H} fill={`url(#${id}-bowfade)`} />
        </mask>
      </defs>
      <g mask={`url(#${id}-bowmask)`} opacity="0.8">
        {bands.map((c, i) => (
          <path
            key={c}
            d="M-24 236 A 232 214 0 0 1 424 236"
            stroke={c}
            strokeWidth="8"
            fill="none"
            opacity="0.9"
            transform={`translate(0 ${i * 8})`}
          />
        ))}
      </g>
    </g>,
    ridges(p, 'rolling', 26, [0.26, 0.18, 0.1]),
  ]
}

const mountainScene = (p: Palette, id: string): ReactNode[] => [
  sky(p, id),
  horizonHaze(p, id, 150, 0.26),
  sunDisc(p, id),
  <g key="far" opacity="0.42">
    <path d="M0 240 L46 118 L92 150 L150 74 L214 132 L268 96 L340 146 L400 108 L400 240 Z" fill={p.land} />
    <path d="M150 74 L214 132 L176 132 Z" fill={p.glow} opacity="0.55" />
    <path d="M268 96 L340 146 L302 146 Z" fill={p.glow} opacity="0.4" />
  </g>,
  <g key="mid" opacity="0.72">
    <path d="M0 240 L38 166 L96 200 L156 128 L222 186 L286 152 L352 196 L400 168 L400 240 Z" fill={p.land} />
    <path d="M156 128 L222 186 L184 186 Z" fill={p.glow} opacity="0.4" />
  </g>,
  <g key="near">
    <path d="M0 240 L62 194 L124 224 L190 176 L256 218 L322 190 L400 222 L400 240 Z" fill={p.land} />
    <path d="M190 176 L256 218 L220 218 Z" fill={p.glow} opacity="0.22" />
  </g>,
]

// Colonnade dropped so its capitals clear the identity row: the columns are big
// enough to survive the tiles as masses, and the light between them lands in the
// pocket instead of behind the stat grid, where the old centred source sat.
const templeScene = (p: Palette, id: string): ReactNode[] => [
  sky(p, id),
  rayFan(p, HERO_X, HERO_Y + 8, 18, 0.16),
  sunDisc(p, id, HERO_X, HERO_Y, 19),
  <g key="pillars">
    <defs>
      <linearGradient id={`${id}-nave`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={p.glow} stopOpacity="0.5" />
        <stop offset="100%" stopColor={p.glow} stopOpacity="0.05" />
      </linearGradient>
    </defs>
    <rect y="104" width={W} height="110" fill={`url(#${id}-nave)`} />
    <rect y="212" width={W} height="28" fill={p.land} />
    {[8, 96, 184, 272, 358].map((x) => (
      <g key={x}>
        <rect x={x} y="112" width="34" height="102" fill={p.land} />
        <rect x={x - 7} y="102" width="48" height="12" fill={p.land} />
      </g>
    ))}
    <rect y="84" width={W} height="20" fill={p.land} opacity="0.9" />
  </g>,
]

// Parchment with fewer, heavier rules. The nine 3px lines it replaces all sat
// below y 78 under the blurred tiles and dissolved into grey.
const scrollScene = (p: Palette, id: string): ReactNode[] => {
  // Rules keep clear of the username (x 112…240, y 18…43) and stop short of the
  // XP figure (x 281…360, y 51…64); below y 97 they are faint, since the blurred
  // stat tiles turn anything finer into grey mush anyway.
  const rules: [number, number, number][] = [
    [50, 112, 150], [62, 112, 128], [88, 112, 244],
    [106, 112, 210], [124, 112, 248], [142, 112, 186],
  ]
  return [
    sky(p, id),
    <g key="parchment">
      <rect y="14" width={W} height="212" fill={p.land} opacity="0.9" />
      <rect y="14" width={W} height="16" fill={p.accent} opacity="0.28" />
      <rect y="210" width={W} height="16" fill={p.accent} opacity="0.28" />
      {rules.map(([y, x, w], i) => (
        <rect key={i} x={x} y={y} width={w} height="5" rx="2.5" fill={p.accent} opacity={y > 90 ? 0.13 : 0.24} />
      ))}
      <rect y="14" width={W} height="212" fill={`url(#${id}-scrollwarm)`} />
      <defs>
        <linearGradient id={`${id}-scrollwarm`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor={p.glow} stopOpacity="0.3" />
          <stop offset="100%" stopColor={p.glow} stopOpacity="0" />
        </linearGradient>
      </defs>
    </g>,
  ]
}

const lampScene = (p: Palette, id: string): ReactNode[] => {
  const cx = HERO_X
  const cy = 46
  return [
    sky(p, id),
    stars(p, 22, 3),
    <g key="pool">
      <defs>
        <radialGradient id={`${id}-pool`}>
          <stop offset="0%" stopColor={p.glow} stopOpacity="0.46" />
          <stop offset="45%" stopColor={p.glow} stopOpacity="0.13" />
          <stop offset="100%" stopColor={p.glow} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}-core`}>
          <stop offset="0%" stopColor={p.accent} stopOpacity="0.85" />
          <stop offset="100%" stopColor={p.glow} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r="170" fill={`url(#${id}-pool)`} />
      <circle cx={cx} cy={cy} r="38" fill={`url(#${id}-core)`} />
    </g>,
    <g key="flame">
      <path d={`M${cx} ${cy - 20} C ${cx - 9} ${cy - 4}, ${cx - 7} ${cy + 6}, ${cx} ${cy + 10} C ${cx + 7} ${cy + 6}, ${cx + 9} ${cy - 4}, ${cx} ${cy - 20} Z`} fill={p.glow} />
      <path d={`M${cx} ${cy - 10} C ${cx - 4} ${cy - 2}, ${cx - 3} ${cy + 4}, ${cx} ${cy + 7} C ${cx + 3} ${cy + 4}, ${cx + 4} ${cy - 2}, ${cx} ${cy - 10} Z`} fill={p.accent} />
    </g>,
    // Light falling on the land below the flame. This is what a lamp scene needs
    // instead of a drawn vessel — the earlier version put a clay bowl under the
    // flame and at card size it read as a black smear, while the ground never
    // acknowledged the light at all.
    <g key="spill">
      <defs>
        <radialGradient id={`${id}-spill`}>
          <stop offset="0%" stopColor={p.glow} stopOpacity="0.4" />
          <stop offset="100%" stopColor={p.glow} stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx={cx} cy="200" rx="150" ry="44" fill={`url(#${id}-spill)`} />
    </g>,
    ridges(p, 'rolling', 22, [0.34, 0.14, 0.08]),
  ]
}

const radianceScene = (p: Palette, id: string): ReactNode[] => [
  sky(p, id),
  <g key="radiance">
    <defs>
      <radialGradient id={`${id}-rad`}>
        <stop offset="0%" stopColor={p.glow} stopOpacity="0.9" />
        <stop offset="60%" stopColor={p.glow} stopOpacity="0.2" />
        <stop offset="100%" stopColor={p.glow} stopOpacity="0" />
      </radialGradient>
    </defs>
    <circle cx="300" cy="44" r="200" fill={`url(#${id}-rad)`} />
    {Array.from({ length: 26 }, (_, i) => {
      const a = (i * Math.PI * 2) / 26
      return (
        <polygon
          key={i}
          points={`300,44 ${300 + Math.cos(a - 0.028) * 460},${44 + Math.sin(a - 0.028) * 460} ${300 + Math.cos(a + 0.028) * 460},${44 + Math.sin(a + 0.028) * 460}`}
          fill={p.glow}
          opacity="0.17"
        />
      )
    })}
  </g>,
  ridges(p, 'rolling', 30, [0.22, 0.14, 0.08]),
]

// Grain, with the sun moved off the avatar. It used to sit at x 96 — directly
// behind the player's picture — and the 26 hairline stalks below y 180 were
// blurred into a comb by the tiles, so this uses 13 wider ones reaching higher.
const fieldScene = (p: Palette, id: string): ReactNode[] => [
  sky(p, id),
  sunDisc(p, id, HERO_X, HERO_Y, 16),
  horizonHaze(p, id, 176, 0.34),
  <g key="field">
    <rect y="168" width={W} height="72" fill={p.land} opacity="0.82" />
    {Array.from({ length: 13 }, (_, i) => {
      const x = i * 32 + 14
      const h = 62 + ((i * 23) % 34)
      return (
        <g key={i}>
          <path d={`M${x} ${H} L${x} ${H - h}`} stroke={p.accent} strokeWidth="3.4" opacity="0.5" />
          <ellipse cx={x} cy={H - h - 7} rx="6.5" ry="14" fill={p.glow} opacity="0.62" />
        </g>
      )
    })}
  </g>,
]

const stormScene = (p: Palette, id: string): ReactNode[] => [
  sky(p, id),
  <g key="storm">
    <polygon points="298,44 344,44 400,240 196,240" fill={p.glow} opacity="0.24" />
    <ellipse cx="70" cy="40" rx="96" ry="30" fill={p.land} opacity="0.88" />
    <ellipse cx="200" cy="26" rx="102" ry="27" fill={p.land} opacity="0.92" />
    <ellipse cx="368" cy="34" rx="82" ry="26" fill={p.land} opacity="0.88" />
    <circle cx={HERO_X} cy={HERO_Y + 6} r="26" fill={p.glow} opacity="0.5" />
  </g>,
  ridges(p, 'broken', 22, [0.3, 0.18, 0.1]),
]

// Two slabs, taller and lifted so their rounded tops clear the stat grid. At
// y 108…208 they were entirely behind the tiles — the card's whole subject was
// invisible — and the four 3px rules per tablet blurred to nothing.
const stoneScene = (p: Palette, id: string): ReactNode[] => [
  sky(p, id),
  <g key="radiance">
    <defs>
      <radialGradient id={`${id}-rad`}>
        <stop offset="0%" stopColor={p.glow} stopOpacity="0.85" />
        <stop offset="60%" stopColor={p.glow} stopOpacity="0.18" />
        <stop offset="100%" stopColor={p.glow} stopOpacity="0" />
      </radialGradient>
    </defs>
    <circle cx="300" cy="40" r="190" fill={`url(#${id}-rad)`} />
    {Array.from({ length: 20 }, (_, i) => {
      const a = (i * Math.PI * 2) / 20
      return (
        <polygon
          key={i}
          points={`300,40 ${300 + Math.cos(a - 0.03) * 440},${40 + Math.sin(a - 0.03) * 440} ${300 + Math.cos(a + 0.03) * 440},${40 + Math.sin(a + 0.03) * 440}`}
          fill={p.glow}
          opacity="0.14"
        />
      )
    })}
  </g>,
  <g key="tablets">
    <path d="M168 226 L168 66 A 33 33 0 0 1 234 66 L234 226 Z" fill={p.land} opacity="0.95" />
    <path d="M250 226 L250 66 A 33 33 0 0 1 316 66 L316 226 Z" fill={p.land} opacity="0.95" />
    <path d="M168 66 A 33 33 0 0 1 234 66" fill="none" stroke={p.glow} strokeWidth="2" opacity="0.4" />
    <path d="M250 66 A 33 33 0 0 1 316 66" fill="none" stroke={p.glow} strokeWidth="2" opacity="0.4" />
    {[80, 98, 116].map((y) => (
      <g key={y}>
        <rect x="180" y={y} width="42" height="5" rx="2.5" fill={p.accent} opacity="0.34" />
        <rect x="262" y={y} width="42" height="5" rx="2.5" fill={p.accent} opacity="0.34" />
      </g>
    ))}
  </g>,
]

const gardenScene = (p: Palette, id: string): ReactNode[] => {
  const vines: [string, number, number][] = [
    ['M412 40 C 344 24, 322 74, 262 56', 412, 40],
    ['M412 108 C 352 96, 330 138, 276 122', 412, 108],
    ['M-12 34 C 56 18, 88 62, 142 42', -12, 34],
  ]
  return [
    sky(p, id),
    sunDisc(p, id, HERO_X, HERO_Y, 15),
    <g key="garden" opacity="0.8">
      {vines.map(([d, ox, oy], i) => (
        <g key={i}>
          <path d={d} stroke={p.land} strokeWidth="5" fill="none" />
          {[0.18, 0.42, 0.66, 0.9].map((t, j) => {
            const dir = ox > 200 ? -1 : 1
            const cx = ox + dir * t * 150
            const cy = oy + (i === 2 ? t * 8 : t * 16)
            return (
              <ellipse
                key={j}
                cx={cx}
                cy={cy}
                rx="11"
                ry="6"
                fill={p.glow}
                opacity="0.72"
                transform={`rotate(${j * 44} ${cx} ${cy})`}
              />
            )
          })}
        </g>
      ))}
    </g>,
    ridges(p, 'rolling', 28, [0.3, 0.18, 0.1]),
  ]
}

const deepScene = (p: Palette, id: string): ReactNode[] => [
  sky(p, id),
  <g key="deep">
    <defs>
      <radialGradient id={`${id}-deep`} cx="0.72" cy="0.06">
        <stop offset="0%" stopColor={p.glow} stopOpacity="0.6" />
        <stop offset="100%" stopColor={p.glow} stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect width={W} height={H} fill={`url(#${id}-deep)`} />
    {/* shafts coming down off the surface */}
    {[[268, -18], [312, -6], [352, 10]].map(([x, skew], i) => (
      <polygon
        key={i}
        points={`${x - 11},14 ${x + 11},14 ${x + 30 + skew},176 ${x - 34 + skew},176`}
        fill={p.glow}
        opacity={0.11 - i * 0.02}
      />
    ))}
    {Array.from({ length: 16 }, (_, i) => {
      const x = ((i * 89 + 13) % 380) + 10
      const y = ((i * 47) % 150) + 18
      return <circle key={i} cx={x} cy={y} r={((i * 7) % 6) / 2 + 1.8} fill={p.accent} opacity="0.24" />
    })}
  </g>,
]

// Jacob's stairway: a lit ladder standing on the earth, its top reaching heaven,
// with figures going up and down it (Genesis 28:12). Moved into the right third
// — centred, its blaze sat directly behind the player's name.
const ladderScene = (p: Palette, id: string): ReactNode[] => {
  const railL = (t: number) => 288 + t * 22
  const railR = (t: number) => 348 - t * 16
  const rungY = (t: number) => 224 - t * 190
  return [
    sky(p, id),
    stars(p, 30, 5),
    <g key="ladder">
      <defs>
        <linearGradient id={`${id}-lad`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={p.glow} stopOpacity="0" />
          <stop offset="100%" stopColor={p.glow} stopOpacity="0.26" />
        </linearGradient>
        <radialGradient id={`${id}-lad-top`}>
          <stop offset="0%" stopColor={p.glow} stopOpacity="0.95" />
          <stop offset="100%" stopColor={p.glow} stopOpacity="0" />
        </radialGradient>
      </defs>
      <polygon points="270,240 366,240 340,18 306,18" fill={`url(#${id}-lad)`} />
      <circle cx={HERO_X} cy={HERO_Y - 6} r="58" fill={`url(#${id}-lad-top)`} />
      <path d={`M${railL(0)} 228 L${railL(1)} 32`} stroke={p.glow} strokeWidth="2.6" opacity="0.7" />
      <path d={`M${railR(0)} 228 L${railR(1)} 32`} stroke={p.glow} strokeWidth="2.6" opacity="0.7" />
      {Array.from({ length: 13 }, (_, i) => {
        const t = i / 12
        return (
          <path
            key={i}
            d={`M${railL(t)} ${rungY(t)} L${railR(t)} ${rungY(t)}`}
            stroke={p.accent}
            strokeWidth="2.4"
            opacity={0.28 + t * 0.55}
          />
        )
      })}
      {wingedFigure(258, 78, 0.95, p.accent, 0.85, 'up')}
      {wingedFigure(272, 152, 0.78, p.accent, 0.5, 'down')}
    </g>,
    ridges(p, 'rolling', 24, [0.28, 0.16, 0.1]),
  ]
}

// The heavenly host breaking over the fields (Luke 2:13), shifted right so the
// multitude is not hidden behind the username.
const hostScene = (p: Palette, id: string): ReactNode[] => {
  // Kept inside x 25…375 — a figure at 396 was sliced in half on a phone, and
  // one at 136 sat squarely under the username.
  const figures: [number, number, number, number][] = [
    [178, 98, 0.62, 0.38],
    [228, 70, 0.88, 0.6],
    [292, 44, 1.12, 0.9],
    [348, 72, 0.86, 0.58],
    [256, 116, 0.5, 0.3],
  ]
  return [
    sky(p, id),
    stars(p, 36, 13),
    sunDisc(p, id, 292, 34, 20),
    <g key="host">{figures.map(([x, y, s, o], i) => wingedFigure(x, y, s, p.accent, o, `h${i}`))}</g>,
    ridges(p, 'rolling', 20, [0.32, 0.2, 0.12]),
  ]
}

// ── Scene composition ──────────────────────────────────────────────────────

function layersFor(scene: Scene, p: Palette, id: string): ReactNode[] {
  switch (scene) {
    case 'sunrise': return sunriseScene(p, id)
    case 'night': return nightScene(p, id)
    case 'star': return starScene(p, id)
    case 'flames': return flamesScene(p, id)
    case 'water': return waterScene(p, id)
    case 'rainbow': return rainbowScene(p, id)
    case 'mountain': return mountainScene(p, id)
    case 'temple': return templeScene(p, id)
    case 'scroll': return scrollScene(p, id)
    case 'lamp': return lampScene(p, id)
    case 'radiance': return radianceScene(p, id)
    case 'field': return fieldScene(p, id)
    case 'storm': return stormScene(p, id)
    case 'stone': return stoneScene(p, id)
    case 'garden': return gardenScene(p, id)
    case 'deep': return deepScene(p, id)
    case 'ladder': return ladderScene(p, id)
    case 'host': return hostScene(p, id)
  }
}

/**
 * The painted scene for a background. Rendered behind the card's content and
 * cropped to fill, exactly like a calling card's art.
 */
export function CardArt({ scene, palette, id }: { scene: Scene; palette: Palette; id: string }) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      focusable="false"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
    >
      {layersFor(scene, palette, id)}
    </svg>
  )
}
