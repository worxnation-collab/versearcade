// The keep's hall and its decorations — drawn, not generated.
//
// Same constraints as ChurchArt, and they are not stylistic: flat fills only,
// no <defs>, no gradients or filters. Halls render inside a sheet that can sit
// over a board of rows, and shared <defs> ids across SVG instances are a
// classic way to get one instance silently painting another's colours.
//
// The hall is a 560x300 interior. Decor props are small <g>s drawn around
// their GROUND POINT (0,0 = where they meet their anchor) and translated into
// place by DecorProp, so a prop never needs to know where it hangs.
//
// The one faction-specific element is colour: the gonfalons and the destrier's
// barding take denominationColor(), which is already measured to clear ΔE 9
// from every other faction under normal, deutan and protan vision.

// Palette — warm stone interior against the app's dark chrome.
const WALL = '#3a3350'
const WALL_DARK = '#2c2740'
const STONE_LINE = '#4a4260'
const BEAM = '#4a3626'
const BEAM_DARK = '#3a2a1e'
const FLOOR = '#4e4030'
const FLOOR_DARK = '#3c3226'
const WOOD = '#6b4f30'
const WOOD_DARK = '#543d24'
const IRON = '#6a7080'
const IRON_DARK = '#4a505e'
const GOLD = '#e8b64c'
const GOLD_DEEP = '#c08a2a'
const FLAME = '#ff9f1c'
const FLAME_HOT = '#ffd23f'
const CLOTH = '#8a6f42'
const PAGE = '#efe4c8'

/**
 * The room itself. The interior is a Nano Banana painting (public/keep/
 * hall.jpg — generated bare on purpose, so every furnishing the player sees
 * was earned) with the drawn hall underneath as the loading/offline fallback.
 * The gonfalon stays DRAWN on top: it takes denominationColor() at runtime,
 * which a baked image can't.
 */
export function KeepHall({ color }: { color: string }) {
  return (
    <g>
      <PaintedOrDrawnHall color={color} />
      {/* the faction gonfalon — on the chimney breast, always present, the one
          element that says whose hall this is. Colour is the whole identity:
          no crest is invented per faction, so none can be wrong. */}
      <g transform="translate(95, 52)">
        <rect x="-26" y="0" width="52" height="5" fill={WOOD_DARK} />
        <path d="M-20 5 h40 v46 l-20 -12 -20 12 z" fill={color} />
        <path d="M-20 5 h40 v7 h-40 z" fill="#ffffff" opacity="0.22" />
      </g>
    </g>
  )
}

function PaintedOrDrawnHall({ color }: { color: string }) {
  return (
    <g>
      <DrawnHall color={color} />
      <image
        href="/keep/hall.jpg"
        x="0"
        y="0"
        width="560"
        height="300"
        preserveAspectRatio="xMidYMid slice"
      />
    </g>
  )
}

/** The original flat-SVG hall — the fallback while (or if) the painting never
 *  loads, and the proof the sheet still works fully offline. */
function DrawnHall({ color }: { color: string }) {
  void color
  return (
    <g>
      {/* back wall */}
      <rect x="0" y="0" width="560" height="264" fill={WALL} />
      {/* stone coursing — sparse lines, not a grid */}
      <g stroke={STONE_LINE} strokeWidth="2" opacity="0.5">
        <path d="M0 70 H560 M0 136 H560 M0 202 H560" fill="none" />
        <path d="M90 70 V136 M230 70 V136 M370 70 V136 M500 70 V136" fill="none" />
        <path d="M40 136 V202 M180 136 V202 M320 136 V202 M460 136 V202" fill="none" />
      </g>
      {/* rafters */}
      <rect x="0" y="0" width="560" height="26" fill={BEAM} />
      <rect x="0" y="22" width="560" height="6" fill={BEAM_DARK} />
      <rect x="130" y="0" width="14" height="44" fill={BEAM} />
      <rect x="280" y="0" width="14" height="44" fill={BEAM} />
      <rect x="430" y="0" width="14" height="44" fill={BEAM} />

      {/* hearth — left wall, fire always lit */}
      <g transform="translate(40, 176)">
        <rect x="0" y="0" width="86" height="88" fill={WALL_DARK} />
        <rect x="-6" y="-8" width="98" height="10" fill={STONE_LINE} />
        <rect x="6" y="8" width="74" height="80" fill="#181226" />
        <path d="M22 86 q-5 -22 13 -34 q-3 15 7 19 q9 -7 5 -19 q16 14 9 34 z" fill={FLAME} />
        <path d="M32 86 q-2 -12 8 -18 q6 8 3 18 z" fill={FLAME_HOT} />
      </g>

      {/* long table — centre, with benches */}
      <g transform="translate(150, 196)">
        <rect x="0" y="0" width="160" height="10" fill={WOOD} />
        <rect x="0" y="10" width="160" height="4" fill={WOOD_DARK} />
        <rect x="10" y="14" width="10" height="42" fill={WOOD_DARK} />
        <rect x="140" y="14" width="10" height="42" fill={WOOD_DARK} />
        <rect x="18" y="34" width="124" height="7" fill={WOOD} opacity="0.8" />
      </g>

      {/* stable arch — right, opening into the dark */}
      <g transform="translate(414, 264)">
        <path d="M8 0 v-96 a48 48 0 0 1 96 0 v96 z" fill={WALL_DARK} />
        <path d="M16 0 v-90 a40 40 0 0 1 80 0 v90 z" fill="#171021" />
        <rect x="0" y="-100" width="8" height="100" fill={STONE_LINE} />
        <rect x="104" y="-100" width="8" height="100" fill={STONE_LINE} />
      </g>

      {/* floor */}
      <rect x="0" y="264" width="560" height="36" fill={FLOOR} />
      <rect x="0" y="264" width="560" height="4" fill={FLOOR_DARK} />
      <path d="M120 268 H480 M60 282 H500 M160 294 H420" stroke={FLOOR_DARK} strokeWidth="2" opacity="0.6" fill="none" />
    </g>
  )
}

/**
 * One placed decoration, translated to its anchor's ground point.
 *
 * Most props are Nano Banana renders (magenta-keyed through scripts/
 * gen-art.mjs, like the skins). The kite shield and the destrier stay DRAWN:
 * their colour IS the faction's — measured for colourblind separation — and a
 * generated image can't take a runtime colour.
 */
export function DecorProp({ id, x, y, color }: { id: string; x: number; y: number; color: string }) {
  const raster = RASTER_DECOR[id]
  if (raster) {
    const { src, w, h, mode } = raster
    const px = x - w / 2
    const py = mode === 'hang' ? y : mode === 'center' ? y - h / 2 : y - h
    return <image href={src} x={px} y={py} width={w} height={h} preserveAspectRatio="xMidYMid meet" />
  }
  const prop = PROPS[id]
  if (!prop) return null
  return <g transform={`translate(${x}, ${y})`}>{prop(color)}</g>
}

// Display boxes in viewBox units, from each render's real aspect ratio.
// `mode`: hang = top at the anchor, center = centred on it, stand = feet on it.
const RASTER_DECOR: Record<string, { src: string; w: number; h: number; mode: 'hang' | 'center' | 'stand' }> = {
  keep_sheaf_banner: { src: '/keep/sheaf_banner.png', w: 31, h: 52, mode: 'hang' },
  keep_tapestry: { src: '/keep/tapestry.png', w: 72, h: 46, mode: 'center' },
  keep_armor_rack: { src: '/keep/armor_rack.png', w: 59, h: 48, mode: 'center' },
  keep_chandelier: { src: '/keep/chandelier.png', w: 56, h: 46, mode: 'hang' },
  keep_lanterns: { src: '/keep/lanterns.png', w: 21, h: 42, mode: 'hang' },
  keep_oil_lamp: { src: '/keep/oil_lamp.png', w: 32, h: 13, mode: 'stand' },
  keep_rosary: { src: '/keep/rosary.png', w: 24, h: 13, mode: 'stand' },
  keep_open_bible: { src: '/keep/open_bible.png', w: 37, h: 20, mode: 'stand' },
  keep_chess: { src: '/keep/chess.png', w: 34, h: 18, mode: 'stand' },
  keep_brazier: { src: '/keep/brazier.png', w: 39, h: 34, mode: 'stand' },
  keep_barrels: { src: '/keep/barrels.png', w: 44, h: 38, mode: 'stand' },
  keep_woven_rug: { src: '/keep/rug.png', w: 38, h: 20, mode: 'stand' },
}

// Each prop draws around its ground point: banners/rafters hang DOWN from
// (0,0); wall pieces centre on it; table/floor/stable pieces stand on it.
const PROPS: Record<string, (color: string) => JSX.Element> = {
  keep_sheaf_banner: () => (
    <g>
      <rect x="-26" y="-4" width="52" height="5" fill={WOOD_DARK} />
      <path d="M-20 1 h40 v46 l-20 -12 -20 12 z" fill={GOLD_DEEP} />
      <path d="M0 8 v22 M-6 12 q6 -6 12 0 M-7 19 q7 -7 14 0" stroke={PAGE} strokeWidth="2.4" fill="none" strokeLinecap="round" />
    </g>
  ),
  keep_kite_shield: (color) => (
    <g>
      <path d="M0 -22 q16 0 16 14 q0 20 -16 30 q-16 -10 -16 -30 q0 -14 16 -14 z" fill={color} />
      <path d="M0 -22 q16 0 16 14 q0 20 -16 30 z" fill="#000000" opacity="0.18" />
      <path d="M0 -14 v26 M-9 -2 h18" stroke={PAGE} strokeWidth="3" strokeLinecap="round" />
    </g>
  ),
  keep_crossed_spears: () => (
    <g>
      <path d="M-20 22 L20 -22 M20 22 L-20 -22" stroke={WOOD} strokeWidth="4" strokeLinecap="round" />
      <path d="M20 -22 l4 -6 l2 8 z M-20 -22 l-4 -6 l-2 8 z" fill={IRON} />
      <circle cx="0" cy="0" r="4" fill={IRON_DARK} />
    </g>
  ),
  keep_tapestry: () => (
    <g>
      <rect x="-24" y="-24" width="48" height="5" fill={WOOD_DARK} />
      <rect x="-20" y="-19" width="40" height="46" fill={CLOTH} />
      <rect x="-20" y="-19" width="40" height="12" fill="#7a9a4e" />
      <rect x="-20" y="-7" width="40" height="8" fill={GOLD_DEEP} />
      <path d="M-14 8 v10 M-4 6 v12 M6 8 v10 M14 6 v12" stroke={GOLD} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M-20 27 h40" stroke={WOOD_DARK} strokeWidth="3" strokeDasharray="3 4" />
    </g>
  ),
  keep_armor_rack: () => (
    <g>
      <rect x="-26" y="-26" width="52" height="4" fill={WOOD_DARK} />
      <rect x="-26" y="16" width="52" height="4" fill={WOOD_DARK} />
      {/* helmet */}
      <path d="M-16 -20 a7 7 0 0 1 14 0 l-2 4 h-10 z" fill={GOLD} />
      {/* breastplate */}
      <path d="M4 -22 q8 -3 16 0 l-1 14 q-7 4 -14 0 z" fill={GOLD} />
      {/* shield */}
      <circle cx="-12" cy="4" r="8" fill={GOLD} />
      <path d="M-12 -1 v10 M-17 4 h10" stroke={GOLD_DEEP} strokeWidth="2" />
      {/* sword */}
      <path d="M8 -4 v16 M4 0 h8" stroke={IRON} strokeWidth="3" strokeLinecap="round" />
      {/* belt + sandals on the lower rail */}
      <rect x="-20" y="20" width="16" height="4" rx="2" fill={GOLD_DEEP} />
      <path d="M6 20 h7 v4 h-7 z M15 20 h7 v4 h-7 z" fill={GOLD} />
    </g>
  ),
  keep_chandelier: () => (
    <g>
      <path d="M0 0 v18" stroke={IRON_DARK} strokeWidth="2.4" />
      <ellipse cx="0" cy="22" rx="20" ry="5" fill={IRON} />
      <ellipse cx="0" cy="20" rx="20" ry="5" fill={IRON_DARK} />
      <rect x="-19" y="10" width="4" height="9" fill={PAGE} />
      <rect x="-2" y="8" width="4" height="11" fill={PAGE} />
      <rect x="15" y="10" width="4" height="9" fill={PAGE} />
      <circle cx="-17" cy="8" r="2.4" fill={FLAME_HOT} />
      <circle cx="0" cy="6" r="2.4" fill={FLAME_HOT} />
      <circle cx="17" cy="8" r="2.4" fill={FLAME_HOT} />
    </g>
  ),
  keep_lanterns: () => (
    <g>
      <path d="M-12 0 v10 M12 0 v14" stroke={IRON_DARK} strokeWidth="2" />
      <rect x="-17" y="10" width="10" height="13" rx="2" fill={IRON} />
      <rect x="-15" y="12" width="6" height="9" fill={FLAME_HOT} />
      <rect x="7" y="14" width="10" height="13" rx="2" fill={IRON} />
      <rect x="9" y="16" width="6" height="9" fill={FLAME_HOT} />
    </g>
  ),
  keep_oil_lamp: () => (
    <g>
      <ellipse cx="0" cy="-4" rx="9" ry="5" fill={GOLD_DEEP} />
      <path d="M8 -5 h5" stroke={GOLD_DEEP} strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="-7" cy="-10" rx="2" ry="4" fill={FLAME_HOT} />
    </g>
  ),
  keep_rosary: () => (
    <g>
      <ellipse cx="0" cy="-5" rx="10" ry="6" fill="none" stroke="#8a5a38" strokeWidth="2.6" strokeDasharray="0.5 4" strokeLinecap="round" />
      <path d="M0 1 v6 M-3 4.5 h6" stroke={GOLD_DEEP} strokeWidth="2.4" strokeLinecap="round" />
    </g>
  ),
  keep_open_bible: () => (
    <g>
      <path d="M-12 -2 l12 -4 l12 4 v3 l-12 -4 l-12 4 z" fill={WOOD_DARK} />
      <path d="M-11 -4 q11 -6 22 0 l0 -3 q-11 -6 -22 0 z" fill={PAGE} />
      <path d="M-11 -7 q11 -6 22 0" stroke="#c9b98c" strokeWidth="1" fill="none" />
      <path d="M0 -10 v6" stroke="#a33" strokeWidth="1.6" />
    </g>
  ),
  keep_chess: () => (
    <g>
      <rect x="-11" y="-6" width="22" height="6" fill={PAGE} />
      <path d="M-11 -6 h5.5 v6 h-5.5 z M0 -6 h5.5 v6 h-5.5 z" fill={WOOD_DARK} />
      <rect x="-6" y="-13" width="3.4" height="7" rx="1.6" fill={IRON_DARK} />
      <circle cx="4" cy="-11" r="2.6" fill={PAGE} />
      <rect x="2.6" y="-10" width="2.8" height="4" fill={PAGE} />
    </g>
  ),
  keep_woven_rug: (color) => (
    <g>
      <ellipse cx="0" cy="0" rx="34" ry="10" fill={CLOTH} />
      <ellipse cx="0" cy="0" rx="24" ry="7" fill={color} opacity="0.55" />
      <ellipse cx="0" cy="0" rx="12" ry="3.6" fill={CLOTH} />
    </g>
  ),
  keep_brazier: () => (
    <g>
      <path d="M-12 -14 q12 6 24 0 l-3 8 h-18 z" fill={IRON} />
      <path d="M-8 -6 l3 6 M8 -6 l-3 6 M0 -5 v5" stroke={IRON_DARK} strokeWidth="2.4" />
      <path d="M-6 -14 q-2 -8 6 -11 q-1 5 3 7 q4 -3 2 -8 q8 5 3 12 z" fill={FLAME} />
      <circle cx="0" cy="-15" r="2.6" fill={FLAME_HOT} />
    </g>
  ),
  keep_barrels: () => (
    <g>
      <rect x="-22" y="-26" width="18" height="26" rx="7" fill={WOOD} />
      <rect x="-22" y="-19" width="18" height="3" fill={IRON_DARK} />
      <rect x="-22" y="-10" width="18" height="3" fill={IRON_DARK} />
      <rect x="0" y="-22" width="16" height="22" rx="6" fill={WOOD_DARK} />
      <rect x="0" y="-16" width="16" height="2.6" fill={IRON_DARK} />
      <rect x="0" y="-8" width="16" height="2.6" fill={IRON_DARK} />
    </g>
  ),
  keep_destrier: (color) => (
    <g>
      {/* legs first, so the caparison drapes over them */}
      <g fill="#54432f">
        <rect x="-24" y="-12" width="5" height="12" />
        <rect x="-11" y="-12" width="5" height="12" />
        <rect x="5" y="-12" width="5" height="12" />
        <rect x="17" y="-12" width="5" height="12" />
      </g>
      {/* body under a caparison in the faction colour */}
      <path d="M-28 -8 v-16 q0 -9 9 -10 l32 -2 q11 -1 11 9 v19 q-26 6 -52 0 z" fill={color} />
      <path d="M-27 -16 h51" stroke="#ffffff" strokeWidth="1.6" opacity="0.35" />
      <path d="M-26 -8 l5 -4 m6 4 l5 -4 m6 4 l5 -4 m6 4 l5 -4 m6 4 l5 -4" stroke="#ffffff" strokeWidth="1.4" opacity="0.3" fill="none" />
      {/* neck + armoured head (chanfron) */}
      <path d="M16 -32 l7 -16 q2 -4 6 -4 l7 1 q-3 5 -2 9 l4 9 q-7 7 -14 5 z" fill={IRON} />
      <path d="M33 -50 l3 -7 l4 8 z" fill={IRON_DARK} />
      <circle cx="35" cy="-43" r="1.7" fill="#181226" />
      {/* plume in the faction colour */}
      <path d="M36 -52 q5 -7 10 -4 q-3 6 -8 7 z" fill={color} />
      {/* tail */}
      <path d="M-28 -22 q-8 3 -7 14" stroke="#54432f" strokeWidth="3.4" fill="none" strokeLinecap="round" />
    </g>
  ),
}

/** Every prop id KeepArt can draw — used to sanity-check the catalog in dev. */
export const DRAWN_PROPS = Object.keys(PROPS)
