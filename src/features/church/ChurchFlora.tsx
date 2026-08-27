import { FLORA, PLOTS, floraById, plotHeight, type Plantings } from './yard'

// The churchyard's landscaping — drawn, not generated.
//
// Same constraints as ChurchArt and KeepArt, and for the same reason: flat
// fills, no <defs>, no gradients or filters. Several of these render at once
// inside a scene that itself renders inside a sheet over a board of rows, and
// shared <defs> ids across SVG instances are a classic way to get one instance
// silently painting another's colours.
//
// Every plant is drawn in a 40x48 box around its GROUND POINT (20,48), so a
// plant never needs to know which plot it's in — the layer places it. Sizes
// come from the plot's depth (plotHeight) times the plant's own scale, which is
// what keeps a dogwood a tree and the planters a pair of pots.
//
// The layer sits BETWEEN the building and the crowd: flowers are planted in
// front of the wall, and people walk in front of the flowers.

// Night palette. The grass is a dark teal (#24404a → #16262f), so foliage runs
// warmer and lighter than real leaves would and the blooms are picked to carry
// at 20px against it — brightness does the work, not hue, which is also what
// keeps them apart for a deutan viewer.
const LEAF = '#5b9b63'
const LEAF_DARK = '#3d6f4a'
const STEM = '#4e8a56'
const BARK = '#6b503a'
const BARK_DARK = '#513c2b'
const SOIL = '#3a2c22'
const TERRACOTTA = '#c2714a'
const TERRACOTTA_DARK = '#9a5637'
const BLOOM_GOLD = '#f2b32e'
const BLOOM_CORAL = '#ef6f5a'
const BLOOM_CREAM = '#f6efd8'
const BLOOM_PINK = '#f0a7c4'
const IRON = '#5d6472'
const FLAME = '#ffd23f'

/** One planted plot, drawn around its ground point at (20,48). */
const PLANTS: Record<string, JSX.Element> = {
  yard_planters: (
    <g>
      <path d="M3 32 h16 l-3 16 h-10 z" fill={TERRACOTTA} />
      <rect x="1" y="28" width="20" height="5" rx="1.6" fill={TERRACOTTA_DARK} />
      <path d="M23 35 h14 l-2 13 h-10 z" fill={TERRACOTTA} />
      <rect x="21" y="31" width="18" height="5" rx="1.6" fill={TERRACOTTA_DARK} />
      <circle cx="6" cy="23" r="4.4" fill={BLOOM_CORAL} />
      <circle cx="15" cy="21" r="4" fill={BLOOM_GOLD} />
      <circle cx="11" cy="26" r="3.6" fill={LEAF} />
      <circle cx="27" cy="26" r="4" fill={BLOOM_CREAM} />
      <circle cx="34" cy="27" r="3.6" fill={LEAF} />
    </g>
  ),
  yard_marigolds: (
    <g>
      <ellipse cx="20" cy="46" rx="18" ry="4" fill={SOIL} />
      <path d="M7 44 v-7 M13 44 v-9 M20 44 v-11 M27 44 v-9 M33 44 v-7" stroke={STEM} strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="7" cy="35" r="4" fill={BLOOM_GOLD} />
      <circle cx="13" cy="33" r="4.4" fill={BLOOM_CORAL} />
      <circle cx="20" cy="31" r="4.8" fill={BLOOM_GOLD} />
      <circle cx="27" cy="33" r="4.4" fill={BLOOM_CORAL} />
      <circle cx="33" cy="35" r="4" fill={BLOOM_GOLD} />
      <circle cx="20" cy="31" r="1.8" fill={BLOOM_CREAM} />
    </g>
  ),
  yard_lilies: (
    <g>
      <ellipse cx="20" cy="46" rx="15" ry="3.6" fill={SOIL} />
      <path d="M11 45 q-1 -12 3 -18 M20 45 v-22 M29 45 q1 -12 -3 -18" stroke={STEM} strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M6 42 q6 -4 10 -1 M34 42 q-6 -4 -10 -1" stroke={LEAF} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      {/* three trumpets, each a fan of petals around a gold throat */}
      <g fill={BLOOM_CREAM}>
        <path d="M14 27 l-6 -5 l6 -3 l6 3 z" />
        <path d="M20 23 l-6 -6 l6 -3 l6 3 z" />
        <path d="M26 27 l-6 -5 l6 -3 l6 3 z" />
      </g>
      <circle cx="14" cy="24" r="1.4" fill={BLOOM_GOLD} />
      <circle cx="20" cy="20" r="1.4" fill={BLOOM_GOLD} />
      <circle cx="26" cy="24" r="1.4" fill={BLOOM_GOLD} />
    </g>
  ),
  yard_rosebush: (
    <g>
      <ellipse cx="20" cy="46" rx="14" ry="3.4" fill={SOIL} />
      <path d="M20 46 v-10" stroke={BARK_DARK} strokeWidth="2.4" />
      <circle cx="20" cy="28" r="12" fill={LEAF_DARK} />
      <circle cx="14" cy="24" r="7" fill={LEAF} />
      <circle cx="27" cy="26" r="6" fill={LEAF} />
      <circle cx="13" cy="22" r="3.2" fill={BLOOM_CORAL} />
      <circle cx="24" cy="20" r="3" fill={BLOOM_PINK} />
      <circle cx="28" cy="29" r="2.8" fill={BLOOM_CORAL} />
      <circle cx="17" cy="32" r="2.6" fill={BLOOM_PINK} />
    </g>
  ),
  yard_hedge: (
    <g>
      <rect x="1" y="20" width="38" height="26" rx="4" fill={LEAF_DARK} />
      <rect x="1" y="20" width="38" height="9" rx="4" fill={LEAF} />
      <path d="M8 26 v18 M15 24 v20 M22 24 v20 M29 24 v20 M35 26 v18" stroke={LEAF_DARK} strokeWidth="1.8" opacity="0.75" />
      <rect x="1" y="44" width="38" height="3" rx="1.5" fill={SOIL} />
    </g>
  ),
  yard_lamp: (
    <g>
      <ellipse cx="20" cy="46" rx="8" ry="3" fill={SOIL} />
      <rect x="16" y="41" width="8" height="5" rx="1.6" fill={IRON} />
      <rect x="18.4" y="14" width="3.2" height="28" fill={IRON} />
      <path d="M13 14 h14 l-3 -5 h-8 z" fill={IRON} />
      <rect x="14.5" y="4" width="11" height="6" rx="1.4" fill={FLAME} />
      <path d="M14 4 h12 l-6 -4 z" fill={IRON} />
      <circle cx="20" cy="7" r="2" fill={BLOOM_CREAM} />
    </g>
  ),
  yard_sunflowers: (
    <g>
      <ellipse cx="20" cy="46" rx="13" ry="3.4" fill={SOIL} />
      <path d="M11 45 v-20 M21 45 v-28 M30 45 v-16" stroke={STEM} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M11 34 q-6 -3 -8 2 M21 28 q7 -3 9 2 M30 36 q6 -2 7 3" stroke={LEAF} strokeWidth="3" fill="none" strokeLinecap="round" />
      <g fill={BLOOM_GOLD}>
        <circle cx="11" cy="23" r="5.4" />
        <circle cx="21" cy="15" r="6.4" />
        <circle cx="30" cy="28" r="4.8" />
      </g>
      <g fill={BARK_DARK}>
        <circle cx="11" cy="23" r="2.4" />
        <circle cx="21" cy="15" r="3" />
        <circle cx="30" cy="28" r="2.2" />
      </g>
    </g>
  ),
  yard_dogwood: (
    <g>
      <ellipse cx="20" cy="46" rx="11" ry="3.2" fill={SOIL} />
      <path d="M18 46 v-16 l-6 -8 M22 46 v-18 l7 -7" stroke={BARK} strokeWidth="3" fill="none" strokeLinecap="round" />
      <rect x="17.5" y="30" width="5" height="16" fill={BARK_DARK} />
      <circle cx="20" cy="18" r="14" fill={LEAF_DARK} />
      <circle cx="12" cy="14" r="8" fill={LEAF} />
      <circle cx="28" cy="16" r="7" fill={LEAF} />
      <g fill={BLOOM_CREAM}>
        <circle cx="11" cy="10" r="2.6" />
        <circle cx="21" cy="7" r="2.8" />
        <circle cx="30" cy="13" r="2.4" />
        <circle cx="15" cy="20" r="2.4" />
        <circle cx="26" cy="23" r="2.6" />
      </g>
      <g fill={BLOOM_PINK}>
        <circle cx="21" cy="7" r="1.2" />
        <circle cx="26" cy="23" r="1.1" />
      </g>
    </g>
  ),
}

/** Every plant id this file can draw — used to check the catalog in dev. */
export const DRAWN_FLORA = Object.keys(PLANTS)

// Generated art, when it exists. Every image in the project comes from Nano
// Banana (art/churchyard-flora.json → scripts/gen-art.mjs); a plant listed here
// renders as its render, and anything not listed keeps drawing the SVG above.
// That's the same fallback shape as RASTER_DECOR in KeepArt and RASTER_SKINS in
// Character: a batch that hasn't been generated yet degrades to something
// correct rather than to a hole in the yard.
//
// Add an id here only once its PNG is actually in public/keep/ — an <img> at a
// 404 is a blank plot on every render.
const RASTER_FLORA: Record<string, string> = {}

/** The picture for one plant: its render if we have one, else its drawing. */
function PlantArt({ id }: { id: string }) {
  const raster = RASTER_FLORA[id]
  if (raster) {
    return (
      <img
        src={raster}
        alt=""
        style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'bottom' }}
      />
    )
  }
  const art = PLANTS[id]
  if (!art) return null
  return (
    <svg viewBox="0 0 40 48" width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
      {art}
    </svg>
  )
}

/**
 * The planted layer of a churchyard.
 *
 * Absolutely positioned inside the scene, one small SVG per filled plot.
 *
 * Non-interactive by default, and that default is the safe one: a flower bed
 * you can tap in somebody else's yard is the first step towards writing on
 * their page, which is the rule the whole church feature is built around. Only
 * the preview on your OWN church tab passes `editable`, and there tapping a
 * plant picks it up and tapping a plot sets it down — the same move-it-by-
 * tapping as the keep's hall, so the two scenes can't drift apart.
 */
export function ChurchFlora({
  plantings,
  editable = false,
  picked = null,
  onPick,
  onDrop,
}: {
  plantings: Plantings
  editable?: boolean
  /** The plot whose plant is currently lifted. */
  picked?: string | null
  onPick?: (plot: string) => void
  onDrop?: (plot: string) => void
}) {
  const filled = PLOTS.filter((p) => floraById(plantings[p.id]))
  // Targets only exist while carrying, so an idle yard is still just a yard.
  const targets = editable && picked ? PLOTS.filter((p) => p.id !== picked) : []
  if (filled.length === 0 && targets.length === 0) return null

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {filled.map((plot) => {
        const flora = floraById(plantings[plot.id])!
        if (!PLANTS[flora.id] && !RASTER_FLORA[flora.id]) return null
        const h = plotHeight(plot.b) * flora.scale
        const lifted = picked === plot.id
        const Tag = editable ? 'button' : 'span'
        return (
          <Tag
            key={plot.id}
            {...(editable
              ? {
                  onClick: () => (picked && picked !== plot.id ? onDrop?.(plot.id) : onPick?.(plot.id)),
                  'aria-label': `${flora.name}, ${plot.label}`,
                }
              : {})}
            style={{
              position: 'absolute',
              left: `${plot.x}%`,
              bottom: `${plot.b}%`,
              width: h * (40 / 48),
              height: h,
              transform: `translateX(-50%)${lifted ? ' translateY(-6px) scale(1.08)' : ''}`,
              transition: 'transform 160ms ease-out',
              pointerEvents: editable ? 'auto' : 'none',
              padding: 0,
              border: lifted ? '1px dashed var(--gold)' : 'none',
              borderRadius: 8,
              background: 'transparent',
              cursor: editable ? 'pointer' : 'default',
            }}
          >
            <PlantArt id={flora.id} />
          </Tag>
        )
      })}

      {/* Where a lifted plant can go. An occupied plot trades places rather
          than overwriting, so no tap can lose a plant. */}
      {targets.map((plot) => (
        <button
          key={`t-${plot.id}`}
          onClick={() => onDrop?.(plot.id)}
          aria-label={`Move here: ${plot.label}`}
          style={{
            position: 'absolute',
            left: `${plot.x}%`,
            bottom: `${plot.b}%`,
            width: 30,
            height: 30,
            marginBottom: -6,
            transform: 'translateX(-50%)',
            pointerEvents: 'auto',
            borderRadius: '50%',
            border: '2px dashed var(--gold)',
            // A taken plot gets a solid dark disc: a gold wash over a sunflower
            // reads as nothing at all.
            background: plantings[plot.id] ? 'rgba(10,5,26,0.86)' : 'rgba(255,210,63,0.16)',
            color: 'var(--gold)',
            fontSize: 15,
            fontWeight: 800,
            lineHeight: 1,
            cursor: 'pointer',
          }}
        >
          {plantings[plot.id] ? '⇄' : '+'}
        </button>
      ))}
    </div>
  )
}

/** One plant on its own, for the picker rows and the ladder. */
export function FloraIcon({ id, size = 40 }: { id: string; size?: number }) {
  if (!PLANTS[id] && !RASTER_FLORA[id]) return null
  return (
    <span style={{ display: 'block', width: size * (40 / 48), height: size, flexShrink: 0 }} aria-hidden>
      <PlantArt id={id} />
    </span>
  )
}

// A plant in the catalog with no artwork draws nothing and reads as a bug in
// the yard rather than a missing file, so say so at import in dev — the same
// guard checkTrackData() gives the soundtrack.
if (import.meta.env.DEV) {
  const missing = FLORA.filter((f) => !PLANTS[f.id]).map((f) => f.id)
  if (missing.length) console.error('[churchyard] flora with no art:', missing.join(', '))
  const orphans = DRAWN_FLORA.filter((id) => !FLORA.some((f) => f.id === id))
  if (orphans.length) console.error('[churchyard] art with no flora:', orphans.join(', '))
}
