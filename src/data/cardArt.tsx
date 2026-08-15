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
  | 'stone' | 'garden' | 'deep'

const W = 400
const H = 240

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

const sunDisc = (p: Palette, id: string, cx = 300, cy = 96, r = 40) => (
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

const sunRays = (p: Palette, cx = 300, cy = 96) => (
  <g key="rays" opacity="0.34">
    {Array.from({ length: 16 }, (_, i) => {
      const a = (i * Math.PI * 2) / 16
      return (
        <polygon
          key={i}
          points={`${cx},${cy} ${cx + Math.cos(a - 0.05) * 460},${cy + Math.sin(a - 0.05) * 460} ${cx + Math.cos(a + 0.05) * 460},${cy + Math.sin(a + 0.05) * 460}`}
          fill={p.glow}
        />
      )
    })}
  </g>
)

const stars = (p: Palette, count = 46, seed = 7) => (
  <g key="stars">
    {Array.from({ length: count }, (_, i) => {
      // Deterministic scatter — the same background always paints the same sky.
      const x = ((i * 97 + seed * 31) % 397) + 2
      const y = ((i * 53 + seed * 17) % 150) + 4
      const r = ((i * 13 + seed) % 10) / 9 + 0.5
      return <circle key={i} cx={x} cy={y} r={r} fill={p.accent} opacity={0.35 + ((i * 7) % 10) / 15} />
    })}
  </g>
)

// A big star with four points — the Bethlehem star, the "record time" flash.
const starburst = (p: Palette, cx = 300, cy = 74, s = 30) => (
  <g key="burst">
    <circle cx={cx} cy={cy} r={s * 2.4} fill={p.glow} opacity="0.22" />
    <path
      d={`M${cx} ${cy - s * 2.4} L${cx + s * 0.34} ${cy - s * 0.34} L${cx + s * 2.4} ${cy} L${cx + s * 0.34} ${cy + s * 0.34} L${cx} ${cy + s * 2.4} L${cx - s * 0.34} ${cy + s * 0.34} L${cx - s * 2.4} ${cy} L${cx - s * 0.34} ${cy - s * 0.34} Z`}
      fill={p.glow}
      opacity="0.95"
    />
  </g>
)

const moon = (p: Palette, cx = 312, cy = 70, r = 30) => (
  <g key="moon">
    <circle cx={cx} cy={cy} r={r * 2.3} fill={p.glow} opacity="0.16" />
    <circle cx={cx} cy={cy} r={r} fill={p.glow} opacity="0.9" />
    <circle cx={cx - r * 0.34} cy={cy - r * 0.2} r={r * 0.9} fill={p.sky[0]} opacity="0.9" />
  </g>
)

const hills = (p: Palette, y = 168, dark = 0.55) => (
  <g key="hills">
    <path d={`M0 ${y + 26} Q 70 ${y - 20} 150 ${y + 10} T 300 ${y - 4} T ${W} ${y + 16} L${W} ${H} L0 ${H} Z`} fill={p.land} opacity={dark} />
    <path d={`M0 ${y + 52} Q 100 ${y + 14} 190 ${y + 44} T ${W} ${y + 36} L${W} ${H} L0 ${H} Z`} fill={p.land} />
  </g>
)

const peaks = (p: Palette) => (
  <g key="peaks">
    <path d={`M0 240 L96 108 L152 168 L214 88 L300 200 L${W} 132 L${W} ${H} Z`} fill={p.land} opacity="0.5" />
    <path d={`M0 240 L70 152 L140 206 L226 138 L308 226 L${W} 178 L${W} ${H} Z`} fill={p.land} />
    <path d="M214 88 L246 132 L182 132 Z" fill={p.glow} opacity="0.5" />
  </g>
)

const waves = (p: Palette, y = 160) => (
  <g key="waves">
    <rect y={y} width={W} height={H - y} fill={p.land} opacity="0.85" />
    {Array.from({ length: 7 }, (_, i) => (
      <path
        key={i}
        d={`M0 ${y + 12 + i * 12} Q 50 ${y + 4 + i * 12} 100 ${y + 12 + i * 12} T 200 ${y + 12 + i * 12} T 300 ${y + 12 + i * 12} T ${W} ${y + 12 + i * 12}`}
        stroke={p.accent}
        strokeWidth="1.6"
        fill="none"
        opacity={0.42 - i * 0.045}
      />
    ))}
    {/* Light spilling across the water toward the viewer. */}
    <polygon points={`184,${y} 216,${y} 268,${H} 132,${H}`} fill={p.glow} opacity="0.24" />
  </g>
)

const rainbow = (p: Palette) => {
  const bands = ['#ff6b6b', '#ff9f1c', '#ffd23f', '#6fce7f', '#4ecdc4', '#5b7cf0', '#a06bff']
  return (
    <g key="rainbow" opacity="0.72">
      {bands.map((c, i) => (
        <path key={c} d={`M-20 ${210} A 220 200 0 0 1 ${W + 20} ${210}`} stroke={c} strokeWidth="9" fill="none"
          opacity="0.85" transform={`translate(0 ${i * 9})`} />
      ))}
    </g>
  )
}

const clouds = (p: Palette, opacity = 0.4) => (
  <g key="clouds" opacity={opacity}>
    <ellipse cx="70" cy="56" rx="54" ry="20" fill={p.glow} />
    <ellipse cx="108" cy="48" rx="38" ry="17" fill={p.glow} />
    <ellipse cx="318" cy="40" rx="46" ry="16" fill={p.glow} />
  </g>
)

// Fire licking up from the bottom edge.
const flames = (p: Palette) => (
  <g key="flames">
    {[40, 118, 200, 286, 356].map((x, i) => (
      <path
        key={x}
        d={`M${x} ${H} C ${x - 30} ${H - 52}, ${x - 12} ${H - 74}, ${x} ${H - 116} C ${x + 14} ${H - 74}, ${x + 32} ${H - 52}, ${x} ${H} Z`}
        fill={p.glow}
        opacity={0.34 + (i % 3) * 0.14}
      />
    ))}
    {[74, 160, 242, 322].map((x, i) => (
      <path
        key={`i${x}`}
        d={`M${x} ${H} C ${x - 16} ${H - 30}, ${x - 6} ${H - 44}, ${x} ${H - 68} C ${x + 8} ${H - 44}, ${x + 18} ${H - 30}, ${x} ${H} Z`}
        fill={p.accent}
        opacity={0.5 + (i % 2) * 0.2}
      />
    ))}
  </g>
)

// Embers drifting upward.
const sparks = (p: Palette, count = 22) => (
  <g key="sparks">
    {Array.from({ length: count }, (_, i) => {
      const x = ((i * 73 + 19) % 392) + 4
      const y = ((i * 41 + 7) % 190) + 20
      return <circle key={i} cx={x} cy={y} r={((i * 11) % 7) / 5 + 0.6} fill={p.accent} opacity={0.25 + ((i * 3) % 10) / 14} />
    })}
  </g>
)

// A single lamp flame in the dark, with its pool of light.
const lampLight = (p: Palette, id: string, cx = 300, cy = 120) => (
  <g key="lamp">
    <defs>
      <radialGradient id={`${id}-lamp`}>
        <stop offset="0%" stopColor={p.glow} stopOpacity="0.85" />
        <stop offset="100%" stopColor={p.glow} stopOpacity="0" />
      </radialGradient>
    </defs>
    <circle cx={cx} cy={cy} r="150" fill={`url(#${id}-lamp)`} />
    <path d={`M${cx} ${cy - 34} C ${cx - 15} ${cy - 8}, ${cx - 11} ${cy + 12}, ${cx} ${cy + 18} C ${cx + 11} ${cy + 12}, ${cx + 15} ${cy - 8}, ${cx} ${cy - 34} Z`} fill={p.glow} />
  </g>
)

// Temple colonnade in silhouette.
const pillars = (p: Palette) => (
  <g key="pillars">
    <rect y="196" width={W} height="44" fill={p.land} />
    {[26, 96, 166, 236, 306, 366].map((x) => (
      <g key={x}>
        <rect x={x} y="74" width="26" height="124" fill={p.land} opacity="0.92" />
        <rect x={x - 5} y="66" width="36" height="10" fill={p.land} />
      </g>
    ))}
    <polygon points={`0,66 ${W},66 ${W},46 0,46`} fill={p.land} opacity="0.7" />
  </g>
)

// Two stone slabs — the tablets.
const tablets = (p: Palette) => (
  <g key="tablets">
    <path d="M132 208 L132 108 A 26 26 0 0 1 184 108 L184 208 Z" fill={p.land} opacity="0.95" />
    <path d="M216 208 L216 108 A 26 26 0 0 1 268 108 L268 208 Z" fill={p.land} opacity="0.95" />
    {[128, 146, 164, 182].map((y) => (
      <g key={y}>
        <rect x="142" y={y} width="32" height="3" rx="1.5" fill={p.accent} opacity="0.4" />
        <rect x="226" y={y} width="32" height="3" rx="1.5" fill={p.accent} opacity="0.4" />
      </g>
    ))}
  </g>
)

// Parchment: warm bands + a rolled edge.
const parchment = (p: Palette) => (
  <g key="parchment">
    <rect y="60" width={W} height="150" fill={p.land} opacity="0.9" />
    {Array.from({ length: 9 }, (_, i) => (
      <rect key={i} x="52" y={78 + i * 15} width={i % 3 === 2 ? 200 : 296} height="3" rx="1.5" fill={p.accent} opacity="0.22" />
    ))}
    <rect y="60" width={W} height="14" fill={p.accent} opacity="0.25" />
    <rect y="196" width={W} height="14" fill={p.accent} opacity="0.25" />
  </g>
)

// Wheat / grain stalks along the bottom.
const field = (p: Palette) => (
  <g key="field">
    <rect y="180" width={W} height="60" fill={p.land} opacity="0.8" />
    {Array.from({ length: 26 }, (_, i) => {
      const x = i * 16 + 8
      const h = 46 + ((i * 17) % 26)
      return (
        <g key={i}>
          <path d={`M${x} ${H} L${x} ${H - h}`} stroke={p.accent} strokeWidth="2" opacity="0.55" />
          <ellipse cx={x} cy={H - h - 5} rx="4" ry="9" fill={p.glow} opacity="0.6" />
        </g>
      )
    })}
  </g>
)

// Vines curling in from the edges.
const garden = (p: Palette) => (
  <g key="garden" opacity="0.75">
    {[
      'M-10 200 C 60 170, 90 210, 150 176',
      'M410 60 C 340 40, 320 96, 258 74',
      'M-10 40 C 60 20, 92 70, 148 46',
    ].map((d, i) => (
      <g key={i}>
        <path d={d} stroke={p.land} strokeWidth="4" fill="none" />
        {[0.2, 0.45, 0.7, 0.95].map((t, j) => (
          <ellipse key={j} cx={i === 1 ? 410 - t * 160 : -10 + t * 160} cy={i === 0 ? 200 - t * 26 : i === 1 ? 60 + t * 16 : 40 + t * 8}
            rx="9" ry="5" fill={p.glow} opacity="0.7" transform={`rotate(${j * 40} ${i === 1 ? 410 - t * 160 : -10 + t * 160} ${i === 0 ? 200 - t * 26 : i === 1 ? 60 + t * 16 : 40 + t * 8})`} />
        ))}
      </g>
    ))}
  </g>
)

// Storm clouds with a shaft of light breaking through.
const storm = (p: Palette) => (
  <g key="storm">
    <polygon points="176,40 236,40 320,240 96,240" fill={p.glow} opacity="0.22" />
    <ellipse cx="90" cy="52" rx="86" ry="30" fill={p.land} opacity="0.85" />
    <ellipse cx="196" cy="36" rx="96" ry="28" fill={p.land} opacity="0.9" />
    <ellipse cx="330" cy="54" rx="88" ry="30" fill={p.land} opacity="0.85" />
  </g>
)

// A radiant crown of light — the throne.
const radiance = (p: Palette, id: string) => (
  <g key="radiance">
    <defs>
      <radialGradient id={`${id}-rad`}>
        <stop offset="0%" stopColor={p.glow} stopOpacity="0.9" />
        <stop offset="60%" stopColor={p.glow} stopOpacity="0.22" />
        <stop offset="100%" stopColor={p.glow} stopOpacity="0" />
      </radialGradient>
    </defs>
    <circle cx="200" cy="120" r="190" fill={`url(#${id}-rad)`} />
    {Array.from({ length: 24 }, (_, i) => {
      const a = (i * Math.PI * 2) / 24
      return (
        <polygon key={i}
          points={`200,120 ${200 + Math.cos(a - 0.03) * 400},${120 + Math.sin(a - 0.03) * 400} ${200 + Math.cos(a + 0.03) * 400},${120 + Math.sin(a + 0.03) * 400}`}
          fill={p.glow} opacity="0.2" />
      )
    })}
  </g>
)

// Deep water / abyss with light far above.
const deep = (p: Palette, id: string) => (
  <g key="deep">
    <defs>
      <radialGradient id={`${id}-deep`} cx="0.5" cy="0">
        <stop offset="0%" stopColor={p.glow} stopOpacity="0.55" />
        <stop offset="100%" stopColor={p.glow} stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect width={W} height={H} fill={`url(#${id}-deep)`} />
    {Array.from({ length: 18 }, (_, i) => {
      const x = ((i * 89 + 13) % 390) + 5
      const y = ((i * 47) % 200) + 20
      return <circle key={i} cx={x} cy={y} r={((i * 7) % 6) / 2 + 1.4} fill={p.accent} opacity="0.22" />
    })}
  </g>
)

// ── Scene composition ──────────────────────────────────────────────────────

function layersFor(scene: Scene, p: Palette, id: string): ReactNode[] {
  switch (scene) {
    case 'sunrise': return [sky(p, id), sunRays(p, 300, 150), sunDisc(p, id, 300, 150, 34), hills(p, 168)]
    case 'night': return [sky(p, id), stars(p), moon(p), hills(p, 182, 0.5)]
    // One great star over the hills — no moon competing with it.
    case 'star': return [sky(p, id), stars(p, 40, 11), starburst(p, 268, 68, 26), hills(p, 186, 0.55)]
    case 'flames': return [sky(p, id), sparks(p), flames(p)]
    case 'water': return [sky(p, id), sunDisc(p, id, 200, 96, 26), clouds(p, 0.22), waves(p, 158)]
    case 'rainbow': return [sky(p, id), clouds(p, 0.35), rainbow(p), hills(p, 190, 0.6)]
    case 'mountain': return [sky(p, id), sunDisc(p, id, 320, 70, 24), peaks(p)]
    case 'temple': return [sky(p, id), sunDisc(p, id, 200, 120, 30), pillars(p)]
    case 'scroll': return [sky(p, id), parchment(p)]
    case 'lamp': return [sky(p, id), stars(p, 26, 3), lampLight(p, id), hills(p, 196, 0.7)]
    case 'radiance': return [sky(p, id), radiance(p, id), hills(p, 200, 0.4)]
    case 'field': return [sky(p, id), sunDisc(p, id, 96, 78, 26), field(p)]
    case 'storm': return [sky(p, id), storm(p), hills(p, 196, 0.65)]
    case 'stone': return [sky(p, id), radiance(p, id), tablets(p)]
    case 'garden': return [sky(p, id), sunDisc(p, id, 200, 60, 22), garden(p), hills(p, 198, 0.6)]
    case 'deep': return [sky(p, id), deep(p, id), waves(p, 196)]
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
