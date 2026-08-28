import { GENERATED_ART } from '@/data/generatedArt'
import { furnishingById, roomTierName, type RoomMount } from '@/data/room'
import { unpackDecor } from '@/data/placement'

// The Upper Room and its furnishings — drawn, not generated.
//
// Same constraints as KeepArt and ChurchArt, and they are not stylistic: flat
// fills only, no <defs>, no gradients or filters. Two reasons here, and the
// second one is new:
//
//   1. Shared <defs> ids across SVG instances is a classic way to get one
//      instance silently painting another's colours, and this scene renders
//      twice on one screen when you visit a room from your own profile.
//   2. THE POSTCARD. lib/postcard.ts serialises this scene into an <img> and
//      draws it to a canvas, and an SVG loaded as an image never fetches
//      external resources — so a room made of <image href> exports blank. The
//      chamber painting below is allowed to be a raster because the postcard
//      falls back to the drawn room; the FURNISHINGS must stay drawn.
//
// The room is a 560x300 interior. Props are drawn around their GROUND POINT
// (0,0 = where they meet their anchor) and translated into place, so a prop
// never needs to know where it stands. Only `wall` pieces straddle the point.

// ── Palette ─────────────────────────────────────────────────────────────────
// Warm clay and lamplight, deliberately unlike the keep's cool stone: these are
// two different places and they should not read as one room recoloured.
const CLAY = '#6f5a44'
const CLAY_DARK = '#54432f'
const PLASTER = '#8a7358'
const FLOOR = '#5a4732'
const FLOOR_DARK = '#463627'
const WOOD = '#6b4f30'
const WOOD_DARK = '#4a3722'
const NIGHT = '#241a3a'
const STAR = '#f4e3a1'
const FLAME = '#ff9f1c'
const FLAME_HOT = '#ffd23f'
const GOLD = '#e8b64c'
const GOLD_DEEP = '#c08a2a'
const CLOTH = '#9c5f4a'
const CLOTH_2 = '#4f6f6a'
const LINEN = '#e4d6b4'
const IRON = '#6a7080'
const BRASS = '#c9a24a'
const GREEN = '#6f8f52'

/** Five rooms, each a real change of silhouette rather than a recolour. */
interface RoomTierStyle {
  wall: string
  wallDark: string
  floor: string
  floorDark: string
  /** Plastered walls instead of bare brick coursing. */
  plastered: boolean
  /** A real arched window rather than a slit. */
  window: boolean
  /** Ceiling beams. */
  beams: boolean
  /** A second window, and a step up into the alcove. */
  upper: boolean
  /** Gilt trim, and the parapet outside. */
  gilt: boolean
}

const TIERS: RoomTierStyle[] = [
  { wall: '#4c3d2c', wallDark: '#3a2f22', floor: '#3f3324', floorDark: '#2f261b',
    plastered: false, window: false, beams: false, upper: false, gilt: false },
  { wall: '#5b4a35', wallDark: '#463829', floor: '#4a3b2a', floorDark: '#382c1f',
    plastered: true, window: false, beams: false, upper: false, gilt: false },
  { wall: '#6a5740', wallDark: '#514231', floor: '#54432f', floorDark: '#3f3223',
    plastered: true, window: true, beams: false, upper: false, gilt: false },
  { wall: '#77624a', wallDark: '#5b4a38', floor: '#5d4a34', floorDark: '#463726',
    plastered: true, window: true, beams: true, upper: true, gilt: false },
  { wall: '#846d52', wallDark: '#65523d', floor: '#65503a', floorDark: '#4c3c2a',
    plastered: true, window: true, beams: true, upper: true, gilt: true },
]

export const roomTierCount = TIERS.length

/**
 * A painting for this tier if one has been generated (art/upper-room.json →
 * `room-1` … `room-5`), otherwise nothing — the drawn chamber underneath is
 * always rendered, so a tier without art still reads as its own room rather
 * than as the wrong one. Wiring is automatic: the generator writes
 * data/generatedArt.ts, so a room starts being painted the moment its file
 * lands and no id can point at a 404.
 */
const roomImage = (tier: number): string | null => GENERATED_ART[`room-${tier + 1}`] ?? null

export function RoomChamber({ tier = 0, flat = false }: { tier?: number; flat?: boolean }) {
  const t = Math.min(TIERS.length - 1, Math.max(0, tier))
  const painting = flat ? null : roomImage(t)
  return (
    <>
      <DrawnChamber tier={t} />
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
    </>
  )
}

/**
 * The room itself. Everything a furnishing can stand on is drawn here.
 *
 * THREE FIXTURES, THREE BANDS OF THE BACK WALL, and they must never overlap:
 * the shelf on the left (110..214), the window right of centre (400..460), the
 * alcove on the far right (470..540). The first version put the window and the
 * alcove on top of each other and drew two arches in the same place; the anchor
 * table in data/room.ts carries the same warning.
 */
function DrawnChamber({ tier }: { tier: number }) {
  const s = TIERS[tier]
  return (
    <g>
      {/* Back wall + floor */}
      <rect x="0" y="0" width="560" height="300" fill={s.wall} />
      {/* The wall darkens toward the ceiling, so a flat fill doesn't read as a
          blank rectangle behind everything. */}
      <rect x="0" y="0" width="560" height="46" fill={s.wallDark} />
      <rect x="0" y="46" width="560" height="10" fill={s.wallDark} opacity="0.45" />
      <rect x="0" y="216" width="560" height="84" fill={s.floor} />
      <rect x="0" y="216" width="560" height="6" fill={s.floorDark} />

      {/* Brick coursing on the bare chamber; smooth plaster above it. */}
      {!s.plastered && (
        <g stroke={s.wallDark} strokeWidth="1.4" opacity="0.65">
          {[62, 92, 122, 152, 182].map((y) => (
            <line key={y} x1="0" y1={y} x2="560" y2={y} />
          ))}
          {[0, 1, 2, 3, 4].map((r) =>
            [0, 1, 2, 3, 4, 5, 6, 7].map((c) => (
              <line
                key={`${r}-${c}`}
                x1={c * 70 + (r % 2 ? 35 : 0)}
                y1={62 + r * 30}
                x2={c * 70 + (r % 2 ? 35 : 0)}
                y2={92 + r * 30}
              />
            )),
          )}
        </g>
      )}

      {/* Floorboards, once the floor is boarded rather than beaten earth. */}
      {s.plastered && (
        <g stroke={s.floorDark} strokeWidth="1.2" opacity="0.5">
          {[236, 256, 278, 296].map((y) => (
            <line key={y} x1="0" y1={y} x2="560" y2={y} />
          ))}
        </g>
      )}

      {/* Ceiling beams */}
      {s.beams && (
        <g>
          <rect x="0" y="0" width="560" height="15" fill={WOOD} />
          <g fill={WOOD_DARK}>
            {[70, 190, 310, 430].map((x) => (
              <rect key={x} x={x} y="0" width="16" height="34" />
            ))}
          </g>
        </g>
      )}

      {/* THE WINDOW — 400..460. A slit in the bare chamber; a real arch from
          the Lit Chamber up. Night sky, because the app is dark and a bright
          noon window would be the brightest thing on the screen by a mile. */}
      {s.window ? (
        <g>
          <path d="M400 150 v-52 a30 30 0 0 1 60 0 v52 z" fill={NIGHT} />
          <path
            d="M400 150 v-52 a30 30 0 0 1 60 0 v52 z"
            fill="none"
            stroke={s.gilt ? GOLD_DEEP : s.wallDark}
            strokeWidth="5"
          />
          <circle cx="444" cy="110" r="6.5" fill={STAR} opacity="0.85" />
          <circle cx="415" cy="126" r="2" fill={STAR} opacity="0.7" />
          <circle cx="428" cy="96" r="1.6" fill={STAR} opacity="0.55" />
          {s.upper && <rect x="428" y="72" width="4" height="78" fill={s.wallDark} />}
          {/* The sill the sill-mount anchor stands on. */}
          <rect x="392" y="148" width="76" height="7" rx="2" fill={s.gilt ? GOLD_DEEP : WOOD} />
          <rect x="392" y="155" width="76" height="3" fill={WOOD_DARK} />
        </g>
      ) : (
        <g>
          <rect x="420" y="86" width="20" height="58" rx="9" fill={NIGHT} />
          <circle cx="430" cy="104" r="2" fill={STAR} opacity="0.6" />
          <rect x="396" y="146" width="68" height="7" rx="2" fill={WOOD_DARK} />
        </g>
      )}

      {/* THE SHELF — 110..214 on the left wall. Two anchors stand on it. */}
      <g>
        <rect x="110" y="126" width="104" height="7" rx="2" fill={WOOD} />
        <rect x="110" y="133" width="104" height="3" fill={WOOD_DARK} />
        <rect x="118" y="136" width="6" height="10" fill={WOOD_DARK} />
        <rect x="200" y="136" width="6" height="10" fill={WOOD_DARK} />
        {s.gilt && <rect x="110" y="123.5" width="104" height="2.5" fill={GOLD_DEEP} />}
      </g>

      {/* THE ALCOVE — 470..540 on the far right, clear of the window. */}
      <g>
        <path d="M470 248 v-62 a35 35 0 0 1 70 0 v62 z" fill={s.wallDark} />
        <path d="M474 248 v-60 a31 31 0 0 1 62 0 v60 z" fill="#241d15" opacity="0.7" />
        <path
          d="M470 248 v-62 a35 35 0 0 1 70 0 v62 z"
          fill="none"
          stroke={s.gilt ? GOLD_DEEP : s.floorDark}
          strokeWidth="4"
        />
        {s.upper && <rect x="464" y="246" width="82" height="8" rx="2" fill={s.floorDark} />}
      </g>

      {/* THE LOW TABLE, mid-floor. Two anchors stand on its top. */}
      <g>
        <rect x="262" y="212" width="104" height="9" rx="3" fill={WOOD} />
        <rect x="262" y="221" width="104" height="4" fill={WOOD_DARK} />
        <rect x="272" y="225" width="8" height="28" fill={WOOD_DARK} />
        <rect x="348" y="225" width="8" height="28" fill={WOOD_DARK} />
        {s.gilt && <rect x="262" y="209.5" width="104" height="2.5" fill={GOLD_DEEP} />}
      </g>

      {/* Gilt trim where the wall meets the floor — the top room only. */}
      {s.gilt && <rect x="0" y="212" width="560" height="3" fill={GOLD_DEEP} opacity="0.85" />}
    </g>
  )
}

// ── Furnishings ─────────────────────────────────────────────────────────────
// Every one drawn around its GROUND POINT, except `wall` pieces which straddle
// it. Small: these render at roughly 40px inside a 520px-wide card.

type Prop = () => JSX.Element

const PROPS: Record<string, Prop> = {
  room_reed_mat: () => (
    <g>
      <ellipse cx="0" cy="-3" rx="34" ry="9" fill="#9a8455" />
      <ellipse cx="0" cy="-4" rx="28" ry="6.5" fill="#b39a66" />
      <g stroke="#7d6a44" strokeWidth="1">
        <line x1="-24" y1="-4" x2="24" y2="-4" />
        <line x1="-20" y1="-7" x2="20" y2="-7" />
        <line x1="-20" y1="-1" x2="20" y2="-1" />
      </g>
    </g>
  ),
  room_stool: () => (
    <g>
      <ellipse cx="0" cy="-1" rx="15" ry="4" fill={WOOD_DARK} opacity="0.5" />
      <rect x="-13" y="-20" width="26" height="6" rx="2" fill={WOOD} />
      <rect x="-11" y="-14" width="4" height="14" fill={WOOD_DARK} />
      <rect x="7" y="-14" width="4" height="14" fill={WOOD_DARK} />
      <rect x="-2" y="-14" width="4" height="13" fill={WOOD_DARK} />
    </g>
  ),
  room_water_jar: () => (
    <g>
      <ellipse cx="0" cy="-1" rx="13" ry="4" fill={WOOD_DARK} opacity="0.4" />
      <path d="M-11 -4 q-4 -18 4 -24 h14 q8 6 4 24 z" fill="#a2603f" />
      <path d="M-7 -26 h14 v4 h-14 z" fill="#8a4f33" />
      <ellipse cx="0" cy="-26" rx="7" ry="2.6" fill="#7a4429" />
      <path d="M-11 -12 q11 4 22 0" stroke="#8a4f33" strokeWidth="1.6" fill="none" />
    </g>
  ),
  room_loom: () => (
    <g>
      <rect x="-18" y="-34" width="4" height="34" fill={WOOD_DARK} />
      <rect x="14" y="-34" width="4" height="34" fill={WOOD_DARK} />
      <rect x="-20" y="-36" width="40" height="4" rx="1" fill={WOOD} />
      <rect x="-14" y="-30" width="28" height="17" fill={CLOTH_2} />
      <g stroke={LINEN} strokeWidth="1" opacity="0.75">
        <line x1="-12" y1="-30" x2="-12" y2="-6" />
        <line x1="-6" y1="-30" x2="-6" y2="-6" />
        <line x1="0" y1="-30" x2="0" y2="-6" />
        <line x1="6" y1="-30" x2="6" y2="-6" />
        <line x1="12" y1="-30" x2="12" y2="-6" />
      </g>
    </g>
  ),
  room_lampstand: () => (
    <g>
      <ellipse cx="0" cy="-1" rx="9" ry="3" fill={BRASS} />
      <rect x="-2" y="-26" width="4" height="25" fill={BRASS} />
      <path d="M-11 -26 q11 -7 22 0 z" fill={BRASS} />
      <ellipse cx="0" cy="-27" rx="6" ry="2.4" fill="#a8842f" />
      <path d="M0 -40 q6 6 0 11 q-6 -5 0 -11 z" fill={FLAME} />
      <path d="M0 -36 q3 3 0 6 q-3 -3 0 -6 z" fill={FLAME_HOT} />
    </g>
  ),
  room_open_scroll: () => (
    <g>
      <rect x="-20" y="-8" width="40" height="8" rx="2" fill={LINEN} />
      <rect x="-23" y="-10" width="6" height="12" rx="3" fill={WOOD} />
      <rect x="17" y="-10" width="6" height="12" rx="3" fill={WOOD} />
      <g stroke="#9a8a63" strokeWidth="1">
        <line x1="-14" y1="-6" x2="12" y2="-6" />
        <line x1="-14" y1="-3.5" x2="8" y2="-3.5" />
      </g>
    </g>
  ),
  room_censer: () => (
    <g>
      <path d="M-9 -8 q0 -10 9 -10 q9 0 9 10 z" fill={BRASS} />
      <rect x="-10" y="-9" width="20" height="3" rx="1.5" fill="#a8842f" />
      <path d="M0 -18 v-8" stroke="#a8842f" strokeWidth="1.6" />
      <path d="M-4 -26 q4 -6 8 -2 q-3 5 -8 2 z" fill="#cfd6e6" opacity="0.55" />
      <path d="M-2 -34 q5 -5 7 0" stroke="#cfd6e6" strokeWidth="1.4" fill="none" opacity="0.4" />
    </g>
  ),
  room_olive_jar: () => (
    <g>
      <path d="M-8 -3 q-3 -13 3 -17 h10 q6 4 3 17 z" fill={GREEN} />
      <rect x="-5" y="-22" width="10" height="3" fill="#5c7844" />
      <ellipse cx="0" cy="-22" rx="5" ry="1.8" fill="#4e6839" />
      <ellipse cx="0" cy="-11" rx="8.5" ry="3" fill="#7fa05e" opacity="0.5" />
    </g>
  ),
  room_scroll_rack: () => (
    <g>
      <rect x="-16" y="-22" width="32" height="22" rx="2" fill={WOOD} />
      <rect x="-16" y="-22" width="32" height="3" fill={WOOD_DARK} />
      <g fill={LINEN}>
        <rect x="-12" y="-17" width="6" height="15" rx="3" />
        <rect x="-3" y="-17" width="6" height="15" rx="3" />
        <rect x="6" y="-17" width="6" height="15" rx="3" />
      </g>
      <g fill="#c7b184">
        <circle cx="-9" cy="-17" r="3" />
        <circle cx="0" cy="-17" r="3" />
        <circle cx="9" cy="-17" r="3" />
      </g>
    </g>
  ),
  room_clay_lamps: () => (
    <g>
      {[-14, 0, 14].map((x) => (
        <g key={x} transform={`translate(${x},0)`}>
          <path d="M-6 -4 q0 -5 6 -5 q6 0 6 5 z" fill="#a2603f" />
          <path d="M6 -6 l4 1 l-4 1 z" fill="#8a4f33" />
          <path d="M9 -9 q3 3 0 5 q-3 -2 0 -5 z" fill={FLAME} />
        </g>
      ))}
    </g>
  ),
  room_lattice: () => (
    <g>
      <rect x="-26" y="-30" width="52" height="30" rx="2" fill={WOOD_DARK} opacity="0.9" />
      <rect x="-23" y="-27" width="46" height="24" fill={NIGHT} />
      <g stroke={WOOD} strokeWidth="2">
        <line x1="-23" y1="-15" x2="23" y2="-15" />
        <line x1="-8" y1="-27" x2="-8" y2="-3" />
        <line x1="8" y1="-27" x2="8" y2="-3" />
      </g>
      <circle cx="0" cy="-21" r="2" fill={STAR} opacity="0.7" />
    </g>
  ),
  room_dovecote: () => (
    <g>
      <rect x="-16" y="-26" width="32" height="26" rx="2" fill={WOOD} />
      <path d="M-19 -26 h38 l-19 -12 z" fill={WOOD_DARK} />
      <circle cx="-7" cy="-16" r="4.5" fill={NIGHT} />
      <circle cx="7" cy="-16" r="4.5" fill={NIGHT} />
      <rect x="-16" y="-8" width="32" height="3" fill={WOOD_DARK} />
      <g fill={LINEN}>
        <ellipse cx="14" cy="-30" rx="6" ry="4" />
        <circle cx="19" cy="-33" r="2.6" />
        <path d="M9 -31 q4 -5 8 -1 z" fill="#cfc4a8" />
      </g>
    </g>
  ),
  room_sleeping_mat: () => (
    <g>
      <ellipse cx="0" cy="-2" rx="30" ry="8" fill="#7a6448" />
      <rect x="-28" y="-12" width="56" height="10" rx="5" fill={CLOTH} />
      <rect x="-28" y="-12" width="20" height="10" rx="5" fill={LINEN} />
      <path d="M-26 -12 q26 -6 52 0" stroke="#7d4636" strokeWidth="1.4" fill="none" />
    </g>
  ),
  room_cedar_chest: () => (
    <g>
      <rect x="-24" y="-24" width="48" height="24" rx="2" fill="#7b5230" />
      <path d="M-24 -24 q24 -10 48 0 z" fill="#8d6039" />
      <rect x="-24" y="-13" width="48" height="4" fill={BRASS} />
      <rect x="-3" y="-16" width="6" height="9" rx="1" fill={BRASS} />
      <g fill={BRASS}>
        <rect x="-24" y="-24" width="4" height="24" />
        <rect x="20" y="-24" width="4" height="24" />
      </g>
    </g>
  ),
  // ── Wall pieces: drawn AROUND the point, not standing on it ──
  room_hanging: () => (
    <g>
      <rect x="-22" y="-26" width="44" height="4" rx="2" fill={WOOD_DARK} />
      <path d="M-20 -22 h40 v40 l-20 -8 l-20 8 z" fill={CLOTH} />
      <rect x="-20" y="-14" width="40" height="6" fill={CLOTH_2} />
      <rect x="-20" y="2" width="40" height="5" fill={CLOTH_2} />
      <circle cx="0" cy="-4" r="5" fill={LINEN} opacity="0.85" />
    </g>
  ),
  room_psaltery: () => (
    <g>
      <path d="M-18 14 q-6 -30 18 -32 q24 2 18 32 z" fill="#8d6039" />
      <path d="M-13 10 q-4 -23 13 -25 q17 2 13 25 z" fill="#a5733f" />
      <g stroke={LINEN} strokeWidth="1" opacity="0.85">
        {[-9, -6, -3, 0, 3, 6, 9].map((x) => (
          <line key={x} x1={x} y1="-13" x2={x} y2="9" />
        ))}
      </g>
      <rect x="-16" y="-18" width="32" height="4" rx="2" fill={BRASS} />
    </g>
  ),
  room_land_map: () => (
    <g>
      <rect x="-26" y="-20" width="52" height="40" rx="2" fill={LINEN} />
      <rect x="-26" y="-20" width="52" height="40" rx="2" fill="none" stroke="#b8a37a" strokeWidth="2" />
      <path d="M-16 12 q4 -20 -2 -30" stroke="#7f96a8" strokeWidth="2.4" fill="none" />
      <path d="M6 -14 q10 12 4 26" stroke="#a8956c" strokeWidth="1.6" fill="none" />
      <circle cx="-4" cy="-2" r="2.4" fill={CLOTH} />
      <circle cx="10" cy="8" r="2" fill={CLOTH} />
    </g>
  ),
  room_palm_wreath: () => (
    <g>
      <circle cx="0" cy="0" r="19" fill="none" stroke={GREEN} strokeWidth="6" />
      <circle cx="0" cy="0" r="19" fill="none" stroke="#87a866" strokeWidth="2" />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <ellipse
          key={a}
          cx={Math.cos((a * Math.PI) / 180) * 19}
          cy={Math.sin((a * Math.PI) / 180) * 19}
          rx="6"
          ry="3"
          fill="#87a866"
          transform={`rotate(${a} ${Math.cos((a * Math.PI) / 180) * 19} ${Math.sin((a * Math.PI) / 180) * 19})`}
        />
      ))}
      <rect x="-3" y="-24" width="6" height="6" rx="2" fill={CLOTH} />
    </g>
  ),
}

/** Every furnishing id RoomArt can draw — used to sanity-check the catalog. */
export const DRAWN_FURNISHINGS = Object.keys(PROPS)

/** Plain, Fine, Grand. Small steps: this has to stay recognisably the same mat. */
const TIER_SCALE = [1, 1.12, 1.24]

/**
 * What "finer" looks like, in flat fills like everything else in here. Ground
 * pieces gain a gilt mat under them; hung pieces gain a gilt mounting behind.
 * Grand adds a second ring and studs — the SHAPE changes, so the step never
 * relies on colour alone (the chart rule).
 */
function TierAccent({ tier, mount }: { tier: number; mount?: RoomMount }) {
  if (mount === 'wall') {
    return (
      <g>
        <circle cx="0" cy="0" r="26" fill={GOLD_DEEP} opacity="0.26" />
        {tier > 2 && (
          <g fill={GOLD}>
            <circle cx="0" cy="0" r="30" opacity="0.18" />
            <circle cx="-21" cy="-21" r="2" />
            <circle cx="21" cy="-21" r="2" />
            <circle cx="-21" cy="21" r="2" />
            <circle cx="21" cy="21" r="2" />
          </g>
        )}
      </g>
    )
  }
  return (
    <g>
      <ellipse cx="0" cy="0" rx="26" ry="7" fill={GOLD_DEEP} opacity="0.3" />
      {tier > 2 && <ellipse cx="0" cy="0" rx="31" ry="9" fill={GOLD} opacity="0.2" />}
    </g>
  )
}

/**
 * One furnishing, in the room. `value` is the PACKED placement
 * (`room_reed_mat.2`), so tier and id arrive together and no caller has to
 * remember to unpack. A merged piece is the same object grown and gilded rather
 * than a second drawing — 18 furnishings x 3 tiers would be 54 pictures for
 * something drawn at 40px.
 */
export function FurnishingProp({
  value,
  x,
  y,
  mount,
}: {
  value: string
  x: number
  y: number
  mount?: RoomMount
}) {
  const { id, tier } = unpackDecor(value)
  const art = PROPS[id]
  if (!art) return null
  const grown = TIER_SCALE[tier - 1] ?? 1
  return (
    <g transform={`translate(${x}, ${y})`}>
      {/* Behind the prop, so it reads as the object sitting on something finer
          rather than a highlight painted over it. */}
      {tier > 1 && <TierAccent tier={tier} mount={mount} />}
      <g transform={grown === 1 ? undefined : `scale(${grown})`}>{art()}</g>
    </g>
  )
}

/**
 * One furnishing on its own, for the shelf you pick from — the actual object at
 * thumbnail size rather than a name in a list, so what you tap is what you get.
 *
 * The viewBox is chosen per mount because props are drawn around their GROUND
 * POINT: a wall piece straddles (0,0) and everything else stands on it, so one
 * box for both would crop one of them.
 */
export function FurnishingThumb({ id, size = 56 }: { id: string; size?: number }) {
  const def = furnishingById(id)
  const prop = PROPS[id]
  if (!def || !prop) return null
  const box = def.mount === 'wall' ? '-32 -32 64 64' : '-32 -46 64 56'
  return (
    <svg width={size} height={size} viewBox={box} style={{ display: 'block' }} aria-hidden>
      {prop()}
    </svg>
  )
}

/** The room's name at a tier, for callers that only have the tier. */
export const roomNameForTier = roomTierName
