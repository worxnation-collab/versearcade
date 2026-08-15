import { motion } from 'framer-motion'
import { CHURCH_TIERS, tierForLevel, type ChurchTierId } from './levels'

// The building your church has earned. Eight of them, each a bigger, grander
// house than the last — this is what all those points are actually buying.
//
// Everything is drawn with flat fills and no <defs>: these render at thumbnail
// size in leaderboard rows, many to a page, and shared gradient/filter ids
// across instances are a classic way to get one row silently painting another's
// colours. Flat shapes also stay crisp at 40px.

const WALL = '#f3ecdd'
const WALL_SHADE = '#cfc3ad'
const STONE = '#ddd5ef'
const STONE_SHADE = '#b6a9d6'
const ROOF = '#7a3ff2'
const ROOF_DARK = '#4a2a9e'
const DOOR = '#33206b'
const GLASS = '#ffd23f'
const GLASS_DEEP = '#ff9f1c'
const GOLD = '#ffd23f'

function Cross({ x, y, h, w, sw = 3, fill = GOLD }: { x: number; y: number; h: number; w?: number; sw?: number; fill?: string }) {
  const arm = w ?? h * 0.62
  return (
    <g fill={fill}>
      <rect x={x - sw / 2} y={y} width={sw} height={h} rx={sw / 2} />
      <rect x={x - arm / 2} y={y + h * 0.26} width={arm} height={sw} rx={sw / 2} />
    </g>
  )
}

/** A round-topped window/door. `x` is the centre, `y` the top of the arch. */
function Arch({ x, y, w, h, fill = GLASS }: { x: number; y: number; w: number; h: number; fill?: string }) {
  const r = w / 2
  return <path d={`M${x - r} ${y + h} V${y + r} a${r} ${r} 0 0 1 ${w} 0 V${y + h} Z`} fill={fill} />
}

function Rose({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const spokes = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4
    return (
      <line
        key={i}
        x1={cx}
        y1={cy}
        x2={cx + Math.cos(a) * r}
        y2={cy + Math.sin(a) * r}
        stroke={GLASS_DEEP}
        strokeWidth={r * 0.14}
      />
    )
  })
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={GLASS_DEEP} />
      <circle cx={cx} cy={cy} r={r * 0.86} fill={GLASS} />
      {spokes}
      <circle cx={cx} cy={cy} r={r * 0.26} fill={GLASS_DEEP} />
    </g>
  )
}

const Ground = ({ rx = 46 }: { rx?: number }) => (
  <ellipse cx="100" cy="151" rx={rx} ry="7" fill="#0b0720" opacity="0.4" />
)

// 1 — House Gathering ------------------------------------------------------
const Gathering = () => (
  <g>
    <Ground rx={40} />
    <rect x="66" y="106" width="68" height="42" rx="2" fill={WALL} />
    <rect x="100" y="106" width="34" height="42" fill={WALL_SHADE} opacity="0.35" />
    <path d="M100 74 L148 110 L52 110 Z" fill={ROOF} />
    <path d="M100 74 L148 110 L100 110 Z" fill={ROOF_DARK} opacity="0.5" />
    <path d="M92 148 v-20 a8 8 0 0 1 16 0 v20 z" fill={DOOR} />
    <rect x="74" y="118" width="11" height="11" rx="2" fill={GLASS} />
    <rect x="115" y="118" width="11" height="11" rx="2" fill={GLASS} />
    <Cross x={100} y={60} h={13} sw={2.6} />
  </g>
)

// 2 — Little Chapel --------------------------------------------------------
const Chapel = () => (
  <g>
    <Ground rx={44} />
    <rect x="62" y="100" width="76" height="48" rx="2" fill={WALL} />
    <rect x="100" y="100" width="38" height="48" fill={WALL_SHADE} opacity="0.3" />
    <path d="M100 66 L152 104 L48 104 Z" fill={ROOF} />
    <path d="M100 66 L152 104 L100 104 Z" fill={ROOF_DARK} opacity="0.5" />
    {/* bell cote on the ridge */}
    <rect x="93" y="48" width="14" height="18" rx="2" fill={WALL} />
    <path d="M100 38 L110 49 L90 49 Z" fill={ROOF_DARK} />
    <circle cx="100" cy="58" r="4" fill={GLASS_DEEP} />
    <Cross x={100} y={24} h={14} sw={2.6} />
    <Arch x={100} y={118} w={20} h={30} fill={DOOR} />
    <Arch x={75} y={114} w={13} h={18} />
    <Arch x={125} y={114} w={13} h={18} />
  </g>
)

// 3 — Country Church -------------------------------------------------------
const Country = () => (
  <g>
    <Ground rx={50} />
    {/* nave */}
    <rect x="72" y="102" width="80" height="46" rx="2" fill={WALL} />
    <rect x="112" y="102" width="40" height="46" fill={WALL_SHADE} opacity="0.28" />
    <path d="M112 72 L160 106 L64 106 Z" fill={ROOF} />
    <path d="M112 72 L160 106 L112 106 Z" fill={ROOF_DARK} opacity="0.5" />
    {/* steeple */}
    <rect x="44" y="80" width="30" height="68" rx="2" fill={WALL} />
    <rect x="62" y="80" width="12" height="68" fill={WALL_SHADE} opacity="0.3" />
    <path d="M59 30 L78 82 L40 82 Z" fill={ROOF_DARK} />
    <path d="M59 30 L78 82 L59 82 Z" fill="#2f1c6b" opacity="0.5" />
    <Cross x={59} y={14} h={17} sw={2.8} />
    <Arch x={59} y={92} w={14} h={20} fill={GLASS_DEEP} />
    <Arch x={59} y={126} w={16} h={22} fill={DOOR} />
    <Arch x={92} y={114} w={14} h={20} />
    <Arch x={116} y={114} w={14} h={20} />
    <Arch x={140} y={114} w={14} h={20} />
  </g>
)

// 4 — Parish Church --------------------------------------------------------
const Parish = () => (
  <g>
    <Ground rx={58} />
    {/* nave */}
    <rect x="60" y="96" width="78" height="52" rx="2" fill={WALL} />
    <rect x="99" y="96" width="39" height="52" fill={WALL_SHADE} opacity="0.28" />
    <path d="M99 64 L146 100 L52 100 Z" fill={ROOF} />
    <path d="M99 64 L146 100 L99 100 Z" fill={ROOF_DARK} opacity="0.5" />
    {/* side wing, drawn over the nave so it reads as an annex rather than a stub */}
    <rect x="136" y="112" width="32" height="36" rx="2" fill={WALL_SHADE} />
    <path d="M152 88 L174 114 L130 114 Z" fill={ROOF} />
    <path d="M152 88 L174 114 L152 114 Z" fill={ROOF_DARK} opacity="0.5" />
    <Arch x={152} y={122} w={13} h={26} />
    {/* bell tower */}
    <rect x="30" y="62" width="36" height="86" rx="2" fill={STONE} />
    <rect x="51" y="62" width="15" height="86" fill={STONE_SHADE} opacity="0.45" />
    <path d="M48 30 L72 64 L24 64 Z" fill={ROOF_DARK} />
    <Cross x={48} y={13} h={18} sw={3} />
    <circle cx="48" cy="80" r="8" fill={GLASS} />
    <circle cx="48" cy="80" r="2.4" fill={DOOR} />
    <Arch x={48} y={98} w={16} h={22} fill={GLASS_DEEP} />
    <Arch x={99} y={116} w={22} h={32} fill={DOOR} />
    <Arch x={78} y={110} w={14} h={20} />
    <Arch x={122} y={110} w={14} h={20} />
  </g>
)

// 5 — Stone Church ---------------------------------------------------------
const Stone = () => (
  <g>
    <Ground rx={62} />
    {/* buttresses */}
    <path d="M44 148 v-46 l10 -6 v52 z" fill={STONE_SHADE} />
    <path d="M156 148 v-46 l-10 -6 v52 z" fill={STONE_SHADE} />
    {/* nave */}
    <rect x="52" y="88" width="96" height="60" rx="2" fill={STONE} />
    <rect x="100" y="88" width="48" height="60" fill={STONE_SHADE} opacity="0.4" />
    <path d="M100 54 L160 92 L40 92 Z" fill={ROOF} />
    <path d="M100 54 L160 92 L100 92 Z" fill={ROOF_DARK} opacity="0.5" />
    {/* ridge spire */}
    <path d="M100 26 L110 56 L90 56 Z" fill={ROOF_DARK} />
    <Cross x={100} y={10} h={17} sw={2.8} />
    <Rose cx={100} cy={106} r={13} />
    <Arch x={100} y={126} w={24} h={22} fill={DOOR} />
    <Arch x={68} y={104} w={15} h={26} />
    <Arch x={132} y={104} w={15} h={26} />
    {/* stone courses */}
    <g stroke={STONE_SHADE} strokeWidth="1" opacity="0.5">
      <line x1="52" y1="122" x2="148" y2="122" />
      <line x1="52" y1="138" x2="148" y2="138" />
    </g>
  </g>
)

// 6 — Great Church ---------------------------------------------------------
const Great = () => (
  <g>
    <Ground rx={68} />
    {/* flanking spires */}
    <rect x="30" y="86" width="26" height="62" rx="2" fill={STONE} />
    <path d="M43 44 L60 88 L26 88 Z" fill={ROOF_DARK} />
    <Cross x={43} y={30} h={14} sw={2.4} />
    <rect x="144" y="86" width="26" height="62" rx="2" fill={STONE} />
    <rect x="157" y="86" width="13" height="62" fill={STONE_SHADE} opacity="0.45" />
    <path d="M157 44 L174 88 L140 88 Z" fill={ROOF_DARK} />
    <Cross x={157} y={30} h={14} sw={2.4} />
    {/* nave */}
    <rect x="58" y="76" width="84" height="72" rx="2" fill={STONE} />
    <rect x="100" y="76" width="42" height="72" fill={STONE_SHADE} opacity="0.38" />
    <path d="M100 38 L152 80 L48 80 Z" fill={ROOF} />
    <path d="M100 38 L152 80 L100 80 Z" fill={ROOF_DARK} opacity="0.5" />
    <Cross x={100} y={18} h={19} sw={3} />
    <Rose cx={100} cy={98} r={16} />
    <Arch x={100} y={122} w={26} h={26} fill={DOOR} />
    <Arch x={74} y={124} w={16} h={24} fill={DOOR} />
    <Arch x={126} y={124} w={16} h={24} fill={DOOR} />
    <Arch x={68} y={92} w={12} h={20} />
    <Arch x={132} y={92} w={12} h={20} />
    <Arch x={43} y={100} w={12} h={18} fill={GLASS_DEEP} />
    <Arch x={157} y={100} w={12} h={18} fill={GLASS_DEEP} />
  </g>
)

// 7 — Cathedral ------------------------------------------------------------
const Cathedral = () => (
  <g>
    <circle cx="100" cy="88" r="72" fill={GOLD} opacity="0.06" />
    <Ground rx={80} />
    {/* towers, taller and wider apart than the Great Church's spires */}
    <rect x="16" y="60" width="36" height="88" rx="2" fill={STONE} />
    <path d="M34 17 L54 62 L14 62 Z" fill={ROOF_DARK} />
    <Cross x={34} y={2} h={14} sw={2.4} />
    <rect x="148" y="60" width="36" height="88" rx="2" fill={STONE} />
    <rect x="166" y="60" width="18" height="88" fill={STONE_SHADE} opacity="0.45" />
    <path d="M166 17 L186 62 L146 62 Z" fill={ROOF_DARK} />
    <Cross x={166} y={2} h={14} sw={2.4} />
    {/* nave */}
    <rect x="52" y="68" width="96" height="80" rx="2" fill={STONE} />
    <rect x="100" y="68" width="48" height="80" fill={STONE_SHADE} opacity="0.35" />
    <path d="M100 32 L154 72 L46 72 Z" fill={ROOF} />
    <path d="M100 32 L154 72 L100 72 Z" fill={ROOF_DARK} opacity="0.5" />
    <Cross x={100} y={12} h={20} sw={3.2} />
    <Rose cx={100} cy={92} r={20} />
    {/* arcade of small arches across the facade — the cathedral tell */}
    <g>
      {[64, 78, 122, 136].map((x) => (
        <Arch key={x} x={x} y={82} w={10} h={16} fill={GLASS_DEEP} />
      ))}
    </g>
    {/* triple portal */}
    <Arch x={100} y={116} w={32} h={32} fill={DOOR} />
    <Arch x={68} y={122} w={20} h={26} fill={DOOR} />
    <Arch x={132} y={122} w={20} h={26} fill={DOOR} />
    <Arch x={34} y={74} w={16} h={24} fill={GLASS_DEEP} />
    <Arch x={166} y={74} w={16} h={24} fill={GLASS_DEEP} />
    <Arch x={34} y={110} w={14} h={22} />
    <Arch x={166} y={110} w={14} h={22} />
  </g>
)

// 8 — Basilica -------------------------------------------------------------
const Basilica = () => (
  <g>
    <circle cx="100" cy="82" r="80" fill={GOLD} opacity="0.09" />
    <Ground rx={82} />
    {/* corner towers */}
    <rect x="18" y="88" width="26" height="60" rx="2" fill={STONE} />
    <path d="M31 62 L46 90 L16 90 Z" fill={ROOF_DARK} />
    <Cross x={31} y={50} h={12} sw={2.2} />
    <rect x="156" y="88" width="26" height="60" rx="2" fill={STONE} />
    <rect x="169" y="88" width="13" height="60" fill={STONE_SHADE} opacity="0.45" />
    <path d="M169 62 L184 90 L154 90 Z" fill={ROOF_DARK} />
    <Cross x={169} y={50} h={12} sw={2.2} />
    {/* dome */}
    <path d="M66 82 a34 40 0 0 1 68 0 z" fill={GOLD} />
    <path d="M100 42 a34 40 0 0 1 34 40 h-34 z" fill={GLASS_DEEP} opacity="0.55" />
    <g stroke={GLASS_DEEP} strokeWidth="1.4" opacity="0.7" fill="none">
      <path d="M84 82 a24 40 0 0 1 0 -34" />
      <path d="M116 82 a24 40 0 0 0 0 -34" />
    </g>
    <rect x="62" y="80" width="76" height="8" rx="3" fill={STONE_SHADE} />
    {/* lantern */}
    <rect x="92" y="30" width="16" height="14" rx="2" fill={STONE} />
    <path d="M100 22 L110 32 L90 32 Z" fill={GOLD} />
    <Cross x={100} y={6} h={17} sw={2.8} />
    {/* drum + facade */}
    <rect x="44" y="88" width="112" height="60" rx="2" fill={STONE} />
    <rect x="100" y="88" width="56" height="60" fill={STONE_SHADE} opacity="0.3" />
    <path d="M100 86 L152 108 L48 108 Z" fill={STONE_SHADE} opacity="0.9" />
    {/* colonnade */}
    <g fill={WALL}>
      <rect x="54" y="112" width="8" height="36" rx="3" />
      <rect x="70" y="112" width="8" height="36" rx="3" />
      <rect x="122" y="112" width="8" height="36" rx="3" />
      <rect x="138" y="112" width="8" height="36" rx="3" />
    </g>
    <rect x="48" y="108" width="104" height="6" rx="2" fill={GOLD} opacity="0.8" />
    <Arch x={100} y={116} w={30} h={32} fill={DOOR} />
    <Arch x={100} y={118} w={20} h={22} fill={GLASS} />
  </g>
)

const TIER_ART: Record<ChurchTierId, () => JSX.Element> = {
  gathering: Gathering,
  chapel: Chapel,
  country: Country,
  parish: Parish,
  stone: Stone,
  great: Great,
  cathedral: Cathedral,
  basilica: Basilica,
}

interface Props {
  /** Church level; picks the building. Ignored when `tier` is given. */
  level?: number
  tier?: ChurchTierId
  /** Rendered width in px (the art keeps a 5:4 box). */
  size?: number
  /** Gentle float, for the hero. Off for list thumbnails. */
  animate?: boolean
  /** Draw it flat and dim — used to preview a building you haven't earned. */
  locked?: boolean
}

export function ChurchArt({ level = 1, tier, size = 200, animate = false, locked = false }: Props) {
  const tierId = tier ?? tierForLevel(level).id
  const Art = TIER_ART[tierId]
  const svg = (
    <svg
      viewBox="0 0 200 160"
      width={size}
      height={size * 0.8}
      role="img"
      aria-label={CHURCH_TIERS.find((t) => t.id === tierId)?.name ?? 'Church'}
      style={{
        display: 'block',
        filter: locked ? 'grayscale(1) brightness(0.55)' : undefined,
        opacity: locked ? 0.55 : 1,
      }}
    >
      <Art />
    </svg>
  )
  if (!animate) return svg
  return (
    <motion.div
      animate={{ y: [0, -5, 0] }}
      transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      style={{ display: 'inline-block' }}
    >
      {svg}
    </motion.div>
  )
}
