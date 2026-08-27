import { motion } from 'framer-motion'
import { CHURCH_TIERS, tierForLevel, type ChurchTierId } from './levels'
import { churchSkin, type ChurchSkin } from './skins'

// The building your church has earned, in whichever material it wears.
//
// Two axes, and only one of them is for sale. `levels.ts` decides WHICH of the
// eight buildings this is — that's the ladder a congregation climbs by playing,
// and no amount of money moves it. `skins.ts` decides what the building is made
// of. A skinned church is not a bigger church.
//
// Everything is drawn with flat fills and no <defs>: these render at thumbnail
// size in leaderboard rows, many to a page, and shared gradient/filter ids
// across instances are a classic way to get one row silently painting another's
// colours. Flat shapes also stay crisp at 40px.
//
// The eight tiers don't draw shapes directly. They compose a `Kit` — Wall,
// Gable, Opening, Wheel, Spire, Topper — which the skin builds. That's what
// makes a skin a real change rather than a recolour: `Gable` is a pitched roof
// on Classic, a barrel-tiled one with deep eaves on Tile, and a flat-capped
// clerestory box on Modern, so the same composition comes out a different
// silhouette. Add a tier by composing the kit; add a skin by adding a branch to
// each primitive. Neither one touches the other.

// ---------------------------------------------------------------------------
// The kit
// ---------------------------------------------------------------------------
interface WallProps {
  x: number
  y: number
  w: number
  h: number
  /** Heavier masonry — towers and the later tiers use it. */
  stone?: boolean
  /** Skip the skin's wall texture (for narrow towers where it just adds noise). */
  bare?: boolean
}

interface GableProps {
  /** The wall this roof sits on: left edge and width. The ridge is its centre. */
  wx: number
  ww: number
  /** Top of the roof, and the eaves line it lands on. */
  apexY: number
  baseY: number
  /** How far the eaves reach past the wall on each side. */
  spread?: number
  /** The wall below is masonry — a flat roof's clerestory has to match it. */
  stone?: boolean
}

type Tone = 'glass' | 'deep' | 'door'

interface OpeningProps {
  /** Centre x, and the top of the head. */
  x: number
  y: number
  w: number
  h: number
  tone?: Tone
  /** A doorway is a hole in every skin; a window is where the glass goes. */
  door?: boolean
}

interface Kit {
  skin: ChurchSkin
  Wall: (p: WallProps) => JSX.Element
  Gable: (p: GableProps) => JSX.Element
  Opening: (p: OpeningProps) => JSX.Element
  Wheel: (p: { cx: number; cy: number; r: number }) => JSX.Element
  Spire: (p: { x: number; topY: number; baseY: number; halfW: number }) => JSX.Element
  Topper: (p: { x: number; y: number; h: number; sw?: number }) => JSX.Element
  Ground: (p: { rx?: number }) => JSX.Element
}

/** A round-topped opening. `x` is the centre, `y` the top of the arch. */
function archPath(x: number, y: number, w: number, h: number): string {
  const r = w / 2
  return `M${x - r} ${y + h} V${y + r} a${r} ${r} 0 0 1 ${w} 0 V${y + h} Z`
}

function buildKit(skin: ChurchSkin): Kit {
  const p = skin.palette
  const t = skin.traits
  const jewels = skin.jewels ?? [p.glass]
  // Stable per-window colour: derived from the window's own x, so it never
  // changes between renders and neighbouring windows still differ.
  const jewel = (x: number) => jewels[Math.abs(Math.round(x)) % jewels.length]

  const toneOf = (tone: Tone, x: number): string => {
    if (tone === 'door') return p.door
    if (t.opening === 'leaded') return jewel(tone === 'deep' ? x + 2 : x)
    return tone === 'deep' ? p.glassDeep : p.glass
  }

  // --- walls -------------------------------------------------------------
  const Wall = ({ x, y, w, h, stone = false, bare = false }: WallProps) => {
    const face = stone ? p.stone : p.wall
    const shade = stone ? p.stoneShade : p.wallShade
    return (
      <g>
        <rect x={x} y={y} width={w} height={h} rx={2} fill={face} />
        {/* The same wall out of the light, so the building has a lit side. */}
        <rect x={x + w / 2} y={y} width={w / 2} height={h} fill={shade} opacity={stone ? 0.42 : 0.32} />
        {!bare && t.courses === 'stone' && (
          <g stroke={shade} strokeWidth={1} opacity={0.55}>
            {courseLines(y, h).map((cy) => (
              <line key={cy} x1={x + 1} y1={cy} x2={x + w - 1} y2={cy} />
            ))}
          </g>
        )}
        {!bare && t.courses === 'stucco' && (
          // A rendered skirt at the base, the way stucco is finished so rain
          // doesn't undercut it. Reads as a plinth at thumbnail size.
          <rect x={x} y={y + h - 6} width={w} height={6} fill={shade} opacity={0.5} />
        )}
        {!bare && t.courses === 'band' && (
          <>
            {/* A shadow reveal under the slab and a dark plinth: the two lines
                that make flat concrete read as concrete rather than as paper. */}
            <rect x={x} y={y} width={w} height={1.6} fill={p.roofDark} opacity={0.45} />
            <rect x={x} y={y + h - 4} width={w} height={4} fill={p.roofDark} opacity={0.35} />
          </>
        )}
      </g>
    )
  }

  /** Two or three courses, spaced to the wall rather than at fixed heights. */
  function courseLines(y: number, h: number): number[] {
    const n = h > 54 ? 3 : 2
    return Array.from({ length: n }, (_, i) => Math.round(y + (h * (i + 1)) / (n + 1)))
  }

  // --- roofs -------------------------------------------------------------
  const Gable = ({ wx, ww, apexY, baseY, spread = 12, stone = false }: GableProps) => {
    const mid = wx + ww / 2
    const left = wx - spread
    const right = wx + ww + spread

    if (t.roof === 'flat') {
      // No pitch at all: the roof volume becomes another storey of wall with a
      // capping slab and a glazed band, which is what a church built this
      // century actually looks like. It fills the same envelope, so the
      // silhouette stays balanced against the other skins.
      const top = apexY + (baseY - apexY) * 0.34
      const h = baseY - top
      const glazeH = Math.min(9, h * 0.42)
      return (
        <g>
          <rect x={wx} y={top} width={ww} height={h + 1} rx={1} fill={stone ? p.stone : p.wall} />
          <rect
            x={mid}
            y={top}
            width={ww / 2}
            height={h + 1}
            fill={stone ? p.stoneShade : p.wallShade}
            opacity={stone ? 0.42 : 0.32}
          />
          {/* Clerestory: the band of light along the top of the nave. */}
          <rect x={wx + 4} y={top + 4} width={ww - 8} height={glazeH} rx={1} fill={p.glassDeep} />
          <rect x={wx + 4} y={top + 4} width={(ww - 8) / 2} height={glazeH} fill={p.glass} opacity={0.75} />
          {mullions(wx + 4, ww - 8).map((mx) => (
            <rect key={mx} x={mx} y={top + 4} width={1.4} height={glazeH} fill={p.wall} opacity={0.85} />
          ))}
          {/* Capping slab, oversailing the wall on both sides. */}
          <rect x={left + spread * 0.35} y={top - 5} width={right - left - spread * 0.7} height={5.5} rx={1} fill={p.roof} />
          <rect x={left + spread * 0.35} y={top - 5} width={right - left - spread * 0.7} height={1.8} rx={0.9} fill={p.trim} opacity={0.5} />
        </g>
      )
    }

    // Pitched. Tile hangs its eaves further out and lands them on a thick
    // fascia — the deep shadow line under a tiled roof is most of what makes it
    // read as tile at 44px.
    const over = t.roof === 'tile' ? 4 : 0
    const l = left - over
    const r = right + over
    return (
      <g>
        <path d={`M${mid} ${apexY} L${r} ${baseY} L${l} ${baseY} Z`} fill={p.roof} />
        <path d={`M${mid} ${apexY} L${r} ${baseY} L${mid} ${baseY} Z`} fill={p.roofDark} opacity={0.5} />
        {t.roof === 'tile' && (
          <>
            {/* Courses of barrel tile, parallel to the eaves. */}
            <g stroke={p.roofDark} strokeWidth={1} opacity={0.55}>
              {[0.42, 0.62, 0.82].map((f) => {
                const y = apexY + (baseY - apexY) * f
                const half = ((r - l) / 2) * f
                return <line key={f} x1={mid - half} y1={y} x2={mid + half} y2={y} />
              })}
            </g>
            <rect x={l} y={baseY - 2.4} width={r - l} height={2.8} rx={1.2} fill={p.roofDark} />
            {/* Ridge cap. */}
            <circle cx={mid} cy={apexY + 1.5} r={1.8} fill={p.roofDark} />
          </>
        )}
        {t.roof === 'gable' && (
          // A barge board along the lit slope. One line, but it's the
          // difference between a roof and a triangle.
          <path
            d={`M${mid} ${apexY} L${l} ${baseY}`}
            stroke={p.trim}
            strokeWidth={1.3}
            opacity={0.35}
            fill="none"
          />
        )}
      </g>
    )
  }

  /** Evenly spaced glazing bars across a span, skipping the ends. */
  function mullions(x: number, w: number): number[] {
    const n = Math.max(1, Math.round(w / 13))
    return Array.from({ length: n - 1 }, (_, i) => Math.round(x + (w * (i + 1)) / n))
  }

  // --- openings ----------------------------------------------------------
  const Opening = ({ x, y, w, h, tone = 'glass', door = false }: OpeningProps) => {
    const fill = toneOf(door ? 'door' : tone, x)
    const r = w / 2

    if (t.opening === 'slot') {
      // Square-headed and narrower than the span it's given: modern openings
      // are slots cut in a plane, not holes punched under an arch.
      const nw = w * 0.82
      return (
        <g>
          <rect x={x - nw / 2} y={y} width={nw} height={h} rx={1} fill={fill} />
          {!door && h > 14 && (
            <rect x={x - 0.7} y={y} width={1.4} height={h} fill={p.wall} opacity={0.7} />
          )}
          {!door && <rect x={x - nw / 2 - 1} y={y + h - 1.4} width={nw + 2} height={1.6} rx={0.8} fill={p.wallShade} />}
        </g>
      )
    }

    if (t.opening === 'mission') {
      // Arched, but sunk in a thick plastered surround — the reveal is deep
      // enough to throw its own shadow, which is the mission tell.
      return (
        <g>
          <path d={archPath(x, y - 1.6, w + 3.2, h + 1.6)} fill={p.trim} opacity={0.85} />
          <path d={archPath(x, y, w, h)} fill={fill} />
          {!door && <path d={archPath(x, y + 1.4, w * 0.62, Math.max(2, h - 2.6))} fill={p.glass} opacity={0.45} />}
        </g>
      )
    }

    if (t.opening === 'leaded' && !door) {
      // Leaded lights: a jewel ground, a lancet head in a second colour, and
      // the cames that hold them. Two colours per window is what separates
      // stained glass from a painted shutter.
      const head = jewel(x + 5)
      return (
        <g>
          <path d={archPath(x, y, w, h)} fill={fill} />
          <path d={`M${x - r} ${y + r} V${y + r} a${r} ${r} 0 0 1 ${w} 0 Z`} fill={head} opacity={0.9} />
          <g stroke={p.stoneShade} strokeWidth={0.9} opacity={0.85}>
            <line x1={x} y1={y + 1} x2={x} y2={y + h} />
            <line x1={x - r} y1={y + r} x2={x + r} y2={y + r} />
            {h > 22 && <line x1={x - r} y1={y + h * 0.72} x2={x + r} y2={y + h * 0.72} />}
          </g>
          <path d={archPath(x, y, w, h)} fill="none" stroke={p.stoneShade} strokeWidth={1} opacity={0.7} />
        </g>
      )
    }

    return <path d={archPath(x, y, w, h)} fill={fill} />
  }

  // --- the big round window ----------------------------------------------
  const Wheel = ({ cx, cy, r }: { cx: number; cy: number; r: number }) => {
    if (t.wheel === 'oculus') {
      return (
        <g>
          <circle cx={cx} cy={cy} r={r} fill={p.wallShade} />
          <circle cx={cx} cy={cy} r={r * 0.86} fill={p.glassDeep} />
          <circle cx={cx} cy={cy} r={r * 0.62} fill={p.glass} opacity={0.8} />
          <g stroke={p.wall} strokeWidth={r * 0.11}>
            <line x1={cx - r * 0.86} y1={cy} x2={cx + r * 0.86} y2={cy} />
            <line x1={cx} y1={cy - r * 0.86} x2={cx} y2={cy + r * 0.86} />
          </g>
        </g>
      )
    }

    if (t.wheel === 'petals') {
      // Eight lights around a boss. Circles rather than tracery wedges: at the
      // 13–20px this is actually drawn at, wedges turn to mush and eight
      // distinct colours don't.
      const petals = Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4 - Math.PI / 2
        return (
          <circle
            key={i}
            cx={cx + Math.cos(a) * r * 0.6}
            cy={cy + Math.sin(a) * r * 0.6}
            r={r * 0.29}
            fill={jewels[i % jewels.length]}
          />
        )
      })
      return (
        <g>
          <circle cx={cx} cy={cy} r={r} fill={p.stoneShade} />
          <circle cx={cx} cy={cy} r={r * 0.9} fill={p.door} />
          {petals}
          <circle cx={cx} cy={cy} r={r * 0.26} fill={p.trim} />
        </g>
      )
    }

    if (t.wheel === 'quatrefoil') {
      const d = r * 0.46
      return (
        <g>
          <circle cx={cx} cy={cy} r={r} fill={p.trim} opacity={0.9} />
          <circle cx={cx} cy={cy} r={r * 0.84} fill={p.glassDeep} />
          {([[0, -1], [1, 0], [0, 1], [-1, 0]] as const).map(([ox, oy], i) => (
            <circle key={i} cx={cx + ox * d} cy={cy + oy * d} r={r * 0.38} fill={p.glass} />
          ))}
          <circle cx={cx} cy={cy} r={r * 0.2} fill={p.glassDeep} />
        </g>
      )
    }

    // Spoked rose — the house default.
    const spokes = Array.from({ length: 8 }, (_, i) => {
      const a = (i * Math.PI) / 4
      return (
        <line
          key={i}
          x1={cx}
          y1={cy}
          x2={cx + Math.cos(a) * r}
          y2={cy + Math.sin(a) * r}
          stroke={p.glassDeep}
          strokeWidth={r * 0.14}
        />
      )
    })
    return (
      <g>
        <circle cx={cx} cy={cy} r={r} fill={p.glassDeep} />
        <circle cx={cx} cy={cy} r={r * 0.86} fill={p.glass} />
        {spokes}
        <circle cx={cx} cy={cy} r={r * 0.26} fill={p.glassDeep} />
      </g>
    )
  }

  // --- steeple caps ------------------------------------------------------
  const Spire = ({ x, topY, baseY, halfW }: { x: number; topY: number; baseY: number; halfW: number }) => {
    if (t.spire === 'blade') {
      // A blade, not a cone: a thin fin standing on a low collar.
      const w = halfW * 0.34
      return (
        <g>
          <rect x={x - halfW} y={baseY - 4} width={halfW * 2} height={4.5} rx={1} fill={p.roof} />
          <path d={`M${x} ${topY} L${x + w} ${baseY - 3} L${x - w} ${baseY - 3} Z`} fill={p.roof} />
          <path d={`M${x} ${topY} L${x + w} ${baseY - 3} L${x} ${baseY - 3} Z`} fill={p.roofDark} opacity={0.55} />
        </g>
      )
    }
    if (t.spire === 'tiled') {
      return (
        <g>
          <path d={`M${x} ${topY} L${x + halfW} ${baseY} L${x - halfW} ${baseY} Z`} fill={p.roof} />
          <path d={`M${x} ${topY} L${x + halfW} ${baseY} L${x} ${baseY} Z`} fill={p.roofDark} opacity={0.5} />
          <g stroke={p.roofDark} strokeWidth={0.9} opacity={0.6}>
            {[0.5, 0.78].map((f) => {
              const y = topY + (baseY - topY) * f
              return <line key={f} x1={x - halfW * f} y1={y} x2={x + halfW * f} y2={y} />
            })}
          </g>
          <rect x={x - halfW - 1.5} y={baseY - 2} width={halfW * 2 + 3} height={2.6} rx={1.2} fill={p.roofDark} />
        </g>
      )
    }
    return (
      <g>
        <path d={`M${x} ${topY} L${x + halfW} ${baseY} L${x - halfW} ${baseY} Z`} fill={p.roofDark} />
        <path d={`M${x} ${topY} L${x + halfW} ${baseY} L${x} ${baseY} Z`} fill={p.door} opacity={0.45} />
      </g>
    )
  }

  // --- the cross ---------------------------------------------------------
  const Topper = ({ x, y, h, sw = 3 }: { x: number; y: number; h: number; sw?: number }) => {
    const weight = t.spire === 'blade' ? sw * 0.68 : sw
    const arm = h * 0.62
    return (
      <g fill={p.trim}>
        <rect x={x - weight / 2} y={y} width={weight} height={h} rx={weight / 2} />
        <rect x={x - arm / 2} y={y + h * 0.26} width={arm} height={weight} rx={weight / 2} />
      </g>
    )
  }

  const Ground = ({ rx = 46 }: { rx?: number }) => (
    <ellipse cx="100" cy="151" rx={rx} ry="7" fill={p.ground} opacity="0.4" />
  )

  return { skin, Wall, Gable, Opening, Wheel, Spire, Topper, Ground }
}

// ---------------------------------------------------------------------------
// The eight buildings
// ---------------------------------------------------------------------------
// Geometry is shared across skins on purpose: a church that pays doesn't get a
// bigger footprint, only a different material. Every roof here is symmetric
// about its wall's centre, which is what lets `Gable` place the ridge itself.

// 1 — House Gathering ------------------------------------------------------
const Gathering = (k: Kit) => (
  <g>
    <k.Ground rx={40} />
    <k.Wall x={66} y={106} w={68} h={42} />
    <k.Gable wx={66} ww={68} apexY={74} baseY={110} spread={14} />
    <k.Opening x={100} y={128} w={16} h={20} door />
    <k.Opening x={79} y={118} w={12} h={12} />
    <k.Opening x={121} y={118} w={12} h={12} tone="deep" />
    <k.Topper x={100} y={60} h={13} sw={2.6} />
  </g>
)

// 2 — Little Chapel --------------------------------------------------------
const Chapel = (k: Kit) => (
  <g>
    <k.Ground rx={44} />
    <k.Wall x={62} y={100} w={76} h={48} />
    <k.Gable wx={62} ww={76} apexY={66} baseY={104} spread={14} />
    {/* Bell cote on the ridge. */}
    <k.Wall x={93} y={48} w={14} h={18} bare />
    <k.Spire x={100} topY={38} baseY={49} halfW={10} />
    <circle cx={100} cy={58} r={4} fill={k.skin.palette.glassDeep} />
    <k.Topper x={100} y={24} h={14} sw={2.6} />
    <k.Opening x={100} y={118} w={20} h={30} door />
    <k.Opening x={75} y={114} w={13} h={18} />
    <k.Opening x={125} y={114} w={13} h={18} tone="deep" />
  </g>
)

// 3 — Country Church -------------------------------------------------------
const Country = (k: Kit) => (
  <g>
    <k.Ground rx={50} />
    <k.Wall x={72} y={102} w={80} h={46} />
    <k.Gable wx={72} ww={80} apexY={72} baseY={106} spread={8} />
    {/* Steeple, off to one side — the shape you see from the road. */}
    <k.Wall x={44} y={80} w={30} h={68} bare />
    <k.Spire x={59} topY={30} baseY={82} halfW={19} />
    <k.Topper x={59} y={14} h={17} sw={2.8} />
    <k.Opening x={59} y={92} w={14} h={20} tone="deep" />
    <k.Opening x={59} y={126} w={16} h={22} door />
    <k.Opening x={92} y={114} w={14} h={20} />
    <k.Opening x={116} y={114} w={14} h={20} tone="deep" />
    <k.Opening x={140} y={114} w={14} h={20} />
  </g>
)

// 4 — Parish Church --------------------------------------------------------
const Parish = (k: Kit) => (
  <g>
    <k.Ground rx={58} />
    <k.Wall x={60} y={96} w={78} h={52} />
    <k.Gable wx={60} ww={78} apexY={64} baseY={100} spread={8} />
    {/* Side wing, drawn over the nave so it reads as an annex, not a stub. */}
    <k.Wall x={136} y={112} w={32} h={36} />
    <k.Gable wx={136} ww={32} apexY={88} baseY={114} spread={6} />
    <k.Opening x={152} y={122} w={13} h={26} />
    {/* Bell tower. */}
    <k.Wall x={30} y={62} w={36} h={86} stone bare />
    <k.Spire x={48} topY={30} baseY={64} halfW={24} />
    <k.Topper x={48} y={13} h={18} sw={3} />
    <circle cx={48} cy={80} r={8} fill={k.skin.palette.glass} />
    <circle cx={48} cy={80} r={2.4} fill={k.skin.palette.door} />
    <k.Opening x={48} y={98} w={16} h={22} tone="deep" />
    <k.Opening x={99} y={116} w={22} h={32} door />
    <k.Opening x={78} y={110} w={14} h={20} />
    <k.Opening x={122} y={110} w={14} h={20} tone="deep" />
  </g>
)

// 5 — Stone Church ---------------------------------------------------------
const Stone = (k: Kit) => (
  <g>
    <k.Ground rx={62} />
    {/* Buttresses, leaning in against the nave wall. */}
    <path d="M44 148 v-46 l10 -6 v52 z" fill={k.skin.palette.stoneShade} />
    <path d="M156 148 v-46 l-10 -6 v52 z" fill={k.skin.palette.stoneShade} />
    <k.Wall x={52} y={88} w={96} h={60} stone />
    <k.Gable wx={52} ww={96} apexY={54} baseY={92} spread={12} stone />
    <k.Spire x={100} topY={26} baseY={56} halfW={10} />
    <k.Topper x={100} y={10} h={17} sw={2.8} />
    <k.Wheel cx={100} cy={106} r={13} />
    <k.Opening x={100} y={126} w={24} h={22} door />
    <k.Opening x={68} y={104} w={15} h={26} />
    <k.Opening x={132} y={104} w={15} h={26} tone="deep" />
  </g>
)

// 6 — Great Church ---------------------------------------------------------
const Great = (k: Kit) => (
  <g>
    <k.Ground rx={68} />
    {/* Flanking spires. */}
    <k.Wall x={30} y={86} w={26} h={62} stone bare />
    <k.Spire x={43} topY={44} baseY={88} halfW={17} />
    <k.Topper x={43} y={30} h={14} sw={2.4} />
    <k.Wall x={144} y={86} w={26} h={62} stone bare />
    <k.Spire x={157} topY={44} baseY={88} halfW={17} />
    <k.Topper x={157} y={30} h={14} sw={2.4} />
    <k.Wall x={58} y={76} w={84} h={72} stone />
    <k.Gable wx={58} ww={84} apexY={38} baseY={80} spread={10} stone />
    <k.Topper x={100} y={18} h={19} sw={3} />
    <k.Wheel cx={100} cy={98} r={16} />
    <k.Opening x={100} y={122} w={26} h={26} door />
    <k.Opening x={74} y={124} w={16} h={24} door />
    <k.Opening x={126} y={124} w={16} h={24} door />
    <k.Opening x={68} y={92} w={12} h={20} />
    <k.Opening x={132} y={92} w={12} h={20} tone="deep" />
    <k.Opening x={43} y={100} w={12} h={18} tone="deep" />
    <k.Opening x={157} y={100} w={12} h={18} />
  </g>
)

// 7 — Cathedral ------------------------------------------------------------
const Cathedral = (k: Kit) => (
  <g>
    <circle cx="100" cy="88" r="72" fill={k.skin.palette.trim} opacity="0.06" />
    <k.Ground rx={80} />
    {/* Towers, taller and wider apart than the Great Church's spires. */}
    <k.Wall x={16} y={60} w={36} h={88} stone bare />
    <k.Spire x={34} topY={17} baseY={62} halfW={20} />
    <k.Topper x={34} y={2} h={14} sw={2.4} />
    <k.Wall x={148} y={60} w={36} h={88} stone bare />
    <k.Spire x={166} topY={17} baseY={62} halfW={20} />
    <k.Topper x={166} y={2} h={14} sw={2.4} />
    <k.Wall x={52} y={68} w={96} h={80} stone />
    <k.Gable wx={52} ww={96} apexY={32} baseY={72} spread={6} stone />
    <k.Topper x={100} y={12} h={20} sw={3.2} />
    <k.Wheel cx={100} cy={92} r={20} />
    {/* Arcade of small openings across the facade — the cathedral tell. */}
    {[64, 78, 122, 136].map((x) => (
      <k.Opening key={x} x={x} y={82} w={10} h={16} tone="deep" />
    ))}
    {/* Triple portal. */}
    <k.Opening x={100} y={116} w={32} h={32} door />
    <k.Opening x={68} y={122} w={20} h={26} door />
    <k.Opening x={132} y={122} w={20} h={26} door />
    <k.Opening x={34} y={74} w={16} h={24} tone="deep" />
    <k.Opening x={166} y={74} w={16} h={24} tone="deep" />
    <k.Opening x={34} y={110} w={14} h={22} />
    <k.Opening x={166} y={110} w={14} h={22} />
  </g>
)

// 8 — Basilica -------------------------------------------------------------
const Basilica = (k: Kit) => {
  const p = k.skin.palette
  return (
    <g>
      <circle cx="100" cy="82" r="80" fill={p.trim} opacity="0.09" />
      <k.Ground rx={82} />
      {/* Corner towers. */}
      <k.Wall x={18} y={88} w={26} h={60} stone bare />
      <k.Spire x={31} topY={62} baseY={90} halfW={15} />
      <k.Topper x={31} y={50} h={12} sw={2.2} />
      <k.Wall x={156} y={88} w={26} h={60} stone bare />
      <k.Spire x={169} topY={62} baseY={90} halfW={15} />
      <k.Topper x={169} y={50} h={12} sw={2.2} />
      {/* Dome. Every skin keeps it: it's the top of the ladder, and the
          silhouette is how a player recognises a maxed church at 44px. */}
      <path d="M66 82 a34 40 0 0 1 68 0 z" fill={p.trim} />
      <path d="M100 42 a34 40 0 0 1 34 40 h-34 z" fill={p.glassDeep} opacity="0.55" />
      <g stroke={p.glassDeep} strokeWidth="1.4" opacity="0.7" fill="none">
        <path d="M84 82 a24 40 0 0 1 0 -34" />
        <path d="M116 82 a24 40 0 0 0 0 -34" />
      </g>
      <rect x="62" y="80" width="76" height="8" rx="3" fill={p.stoneShade} />
      {/* Lantern. */}
      <k.Wall x={92} y={30} w={16} h={14} stone bare />
      <path d="M100 22 L110 32 L90 32 Z" fill={p.trim} />
      <k.Topper x={100} y={6} h={17} sw={2.8} />
      {/* Drum + facade. */}
      <k.Wall x={44} y={88} w={112} h={60} stone />
      <path d="M100 86 L152 108 L48 108 Z" fill={p.stoneShade} opacity="0.9" />
      {/* Colonnade. */}
      <g fill={p.wall}>
        {[54, 70, 122, 138].map((x) => (
          <rect key={x} x={x} y="112" width="8" height="36" rx="3" />
        ))}
      </g>
      <rect x="48" y="108" width="104" height="6" rx="2" fill={p.trim} opacity="0.8" />
      <k.Opening x={100} y={116} w={30} h={32} door />
      <k.Opening x={100} y={118} w={20} h={22} />
    </g>
  )
}

const TIER_ART: Record<ChurchTierId, (k: Kit) => JSX.Element> = {
  gathering: Gathering,
  chapel: Chapel,
  country: Country,
  parish: Parish,
  stone: Stone,
  great: Great,
  cathedral: Cathedral,
  basilica: Basilica,
}

// One kit per skin, built once. The primitives close over the palette, so
// rebuilding them per render would hand React a new component type every time
// and throw away the whole subtree on each paint — in a leaderboard that's a
// hundred remounts a scroll.
const KITS = new Map<string, Kit>()
function kitFor(skinId?: string | null): Kit {
  const skin = churchSkin(skinId)
  let kit = KITS.get(skin.id)
  if (!kit) {
    kit = buildKit(skin)
    KITS.set(skin.id, kit)
  }
  return kit
}

interface Props {
  /** Church level; picks the building. Ignored when `tier` is given. */
  level?: number
  tier?: ChurchTierId
  /** What the building is made of. Unknown or absent ⇒ the default skin. */
  skin?: string | null
  /** Rendered width in px (the art keeps a 5:4 box). */
  size?: number
  /** Gentle float, for the hero. Off for list thumbnails. */
  animate?: boolean
  /** Draw it flat and dim — used to preview a building you haven't earned. */
  locked?: boolean
}

export function ChurchArt({ level = 1, tier, skin, size = 200, animate = false, locked = false }: Props) {
  const tierId = tier ?? tierForLevel(level).id
  const Art = TIER_ART[tierId]
  const kit = kitFor(skin)
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
      {Art(kit)}
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
