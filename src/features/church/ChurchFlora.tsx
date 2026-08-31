import { GENERATED_ART } from '@/data/generatedArt'
import { SceneRemoveButton } from '@/components/SceneRemoveBadge'
import { unpackPercent } from '@/data/placement'
import { percentSpace, useSceneDrag } from '@/lib/sceneDrag'
import {
  FLORA,
  PLOTS,
  YARD_BAND,
  floraById,
  plantingAt,
  plotById,
  plotHeight,
  type Plantings,
  type PlotDef,
} from './yard'

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

/** The yard's coordinate system — fixed, so it is built once. */
const YARD_SPACE = percentSpace(YARD_BAND)

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
// Added with the second six plants. Lilac carries at 20px against the teal
// grass the way the golds and corals do; the silver-green is the olive's, kept
// distinct from LEAF so a sapling does not read as a small shrub; the stone
// matches the statues so a birdbath and a plinth look quarried together.
const BLOOM_LILAC = '#b48ce0'
const BLOOM_LILAC_DARK = '#8c66b8'
const LEAF_SILVER = '#8fae8a'
const STONE = '#cfc4ad'
const STONE_DARK = '#a89a80'
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
  // ── The second six ────────────────────────────────────────────────────────
  // Drawn as well as rendered, like the first eight. A plant that existed only
  // as a PNG would vanish from its plot the moment the file 404'd — and the
  // dev guard below is what caught these going in raster-only.
  yard_ivy: (
    <g>
      <ellipse cx="20" cy="46" rx="17" ry="3.4" fill={SOIL} />
      <path d="M20 45 q-8 -3 -14 -8 M20 45 q8 -3 14 -8 M20 45 q-2 -8 -1 -13" stroke={STEM} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <circle cx="6" cy="37" r="3.4" fill={LEAF_DARK} />
      <circle cx="12" cy="41" r="3" fill={LEAF} />
      <circle cx="34" cy="37" r="3.4" fill={LEAF_DARK} />
      <circle cx="28" cy="41" r="3" fill={LEAF} />
      <circle cx="19" cy="32" r="3.2" fill={LEAF} />
      <circle cx="22" cy="38" r="2.8" fill={LEAF_DARK} />
    </g>
  ),
  yard_lavender: (
    <g>
      <ellipse cx="20" cy="46" rx="15" ry="3.4" fill={SOIL} />
      <path d="M9 45 v-9 M14 45 v-12 M20 45 v-14 M26 45 v-12 M31 45 v-9" stroke={LEAF_SILVER} strokeWidth="1.7" strokeLinecap="round" />
      <rect x="7.4" y="26" width="3.2" height="11" rx="1.6" fill={BLOOM_LILAC_DARK} />
      <rect x="12.4" y="22" width="3.2" height="12" rx="1.6" fill={BLOOM_LILAC} />
      <rect x="18.4" y="19" width="3.2" height="13" rx="1.6" fill={BLOOM_LILAC} />
      <rect x="24.4" y="22" width="3.2" height="12" rx="1.6" fill={BLOOM_LILAC} />
      <rect x="29.4" y="26" width="3.2" height="11" rx="1.6" fill={BLOOM_LILAC_DARK} />
    </g>
  ),
  yard_olive: (
    <g>
      <ellipse cx="20" cy="46" rx="9" ry="3" fill={SOIL} />
      <path d="M20 45 v-19" stroke={BARK} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M20 30 l-6 -5 M20 27 l6 -6 M20 34 l-5 -4" stroke={BARK_DARK} strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="13" cy="22" rx="6" ry="4.2" fill={LEAF_SILVER} />
      <ellipse cx="27" cy="19" rx="6.4" ry="4.4" fill={LEAF_SILVER} />
      <ellipse cx="20" cy="14" rx="7" ry="4.6" fill={LEAF} />
      <ellipse cx="20" cy="21" rx="5.4" ry="3.8" fill={LEAF_DARK} />
    </g>
  ),
  yard_bench: (
    <g>
      <rect x="3" y="42" width="3.4" height="5" rx="1.2" fill={IRON} />
      <rect x="33.6" y="42" width="3.4" height="5" rx="1.2" fill={IRON} />
      <rect x="4" y="36" width="32" height="3.4" rx="1.6" fill={BARK} />
      <rect x="4" y="30" width="32" height="2.8" rx="1.4" fill={BARK_DARK} />
      <rect x="4" y="25" width="32" height="2.8" rx="1.4" fill={BARK} />
      <rect x="4.5" y="24" width="2.6" height="14" rx="1.2" fill={IRON} />
      <rect x="32.9" y="24" width="2.6" height="14" rx="1.2" fill={IRON} />
    </g>
  ),
  yard_birdbath: (
    <g>
      <ellipse cx="20" cy="46" rx="11" ry="3.2" fill={SOIL} />
      <rect x="13" y="41" width="14" height="4.4" rx="1.4" fill={STONE_DARK} />
      <rect x="17.2" y="24" width="5.6" height="18" rx="2" fill={STONE} />
      <ellipse cx="20" cy="23" rx="12" ry="4.4" fill={STONE} />
      <ellipse cx="20" cy="21.6" rx="8.6" ry="2.8" fill={STONE_DARK} />
      <path d="M11 44 q3 -2 5 0" stroke={LEAF_DARK} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </g>
  ),
  yard_wisteria: (
    <g>
      <ellipse cx="20" cy="46" rx="12" ry="3.2" fill={SOIL} />
      <rect x="5" y="14" width="2.6" height="31" rx="1.2" fill={BARK_DARK} />
      <rect x="32.4" y="14" width="2.6" height="31" rx="1.2" fill={BARK_DARK} />
      <rect x="4" y="12" width="32" height="2.8" rx="1.4" fill={BARK} />
      <path d="M20 45 q-3 -16 -8 -30" stroke={BARK} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M10 16 v10 M16 16 v13 M23 16 v11 M30 16 v9" stroke={BLOOM_LILAC} strokeWidth="4" strokeLinecap="round" />
      <path d="M13 16 v7 M27 16 v8" stroke={BLOOM_LILAC_DARK} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M8 18 q5 2 10 0" stroke={LEAF} strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </g>
  ),
}

/** Every plant id this file can draw — used to check the catalog in dev. */
export const DRAWN_FLORA = Object.keys(PLANTS)

// Generated art, when it exists. Every image in the project comes from Nano
// Banana (art/churchyard-flora.json → scripts/gen-art.mjs), and the generator
// writes its own output into GENERATED_ART — so a plant starts rendering as its
// render the moment one is produced, and an id can never point at a file that
// isn't there. Anything ungenerated keeps drawing the SVG above.

/**
 * The picture for one plant: its render if we have one, else its drawing.
 *
 * The two are sized differently on purpose. The drawings all live in one 40x48
 * box, so they can be given a box. A render is cropped tight to the plant and
 * every one comes out a different shape — a hedge is wide, a lamp post is a
 * sliver — so it gets a HEIGHT and lets its own width follow. Forcing a render
 * into the drawings' box letterboxes it, and a hedge that has to fit a portrait
 * frame ends up half the size of the bed it's meant to fill.
 */
function PlantArt({ id, height }: { id: string; height: number }) {
  const raster = GENERATED_ART[id]
  if (raster) {
    // draggable={false} is load-bearing, not tidiness: an <img> starts a NATIVE
    // image drag, and the browser cancels the pointer stream to do it — so the
    // first pointermove of a real drag arrived as a lostpointercapture and the
    // plant simply refused to move. The rooms never hit this because their
    // props are SVG. Found by driving the real yard.
    return <img src={raster} alt="" draggable={false} style={{ display: 'block', height, width: 'auto' }} />
  }
  const art = PLANTS[id]
  if (!art) return null
  return (
    <svg
      viewBox="0 0 40 48"
      width={height * (40 / 48)}
      height={height}
      style={{ display: 'block', overflow: 'visible' }}
    >
      {art}
    </svg>
  )
}

/**
 * The planted layer of a churchyard.
 *
 * Absolutely positioned inside the scene, one small picture per filled plot,
 * standing wherever its value says (features/church/yard.ts) — or on its plot,
 * for every bed planted before positions were free.
 *
 * Non-interactive by default, and that default is the safe one: a flower bed
 * you can tap in somebody else's yard is the first step towards writing on
 * their page, which is the rule the whole church feature is built around. Only
 * the preview on your OWN church tab passes `editable`, and there tapping a
 * plant picks it up, DRAGGING it plants it where you let go, tapping a plot
 * sets it down, and the ✕ takes it out — the same gestures as the keep's hall
 * and the Upper Room, over the same hook, so the three can't drift apart.
 */
export function ChurchFlora({
  plantings,
  editable = false,
  picked = null,
  onPick,
  onDrop,
  onDropAt,
  onRemove,
}: {
  plantings: Plantings
  editable?: boolean
  /** The plot whose plant is currently lifted. */
  picked?: string | null
  onPick?: (plot: string) => void
  onDrop?: (plot: string) => void
  /** Where a dragged plant was let go, in percent. Passing it enables dragging. */
  onDropAt?: (x: number, b: number) => void
  /** The ✕ on the lifted plant. */
  onRemove?: (plot: string) => void
}) {
  const drag = useSceneDrag({
    space: YARD_SPACE,
    picked,
    enabled: !!(editable && onDropAt),
    onCommit: (_plot, x, b) => onDropAt?.(x, b),
  })

  const filled = PLOTS.filter((p) => floraById(plantings[p.id]))
  // Targets only exist while carrying, so an idle yard is still just a yard.
  const targets = editable && picked ? PLOTS.filter((p) => p.id !== picked) : []
  const pickedPlot = picked ? plotById(picked) : undefined
  const pickedFlora = picked ? floraById(plantings[picked]) : undefined
  if (filled.length === 0 && targets.length === 0) return null

  return (
    <div
      ref={drag.sceneRef}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}
    >
      {filled.map((plot) => {
        const value = plantings[plot.id]
        const flora = floraById(value)!
        if (!PLANTS[flora.id] && !GENERATED_ART[flora.id]) return null
        const lifted = picked === plot.id
        // Mid-drag the plant follows the finger; otherwise it stands where its
        // value says, or on its plot when the value carries no position.
        const at = drag.live?.anchor === plot.id ? { x: drag.live.x, b: drag.live.y } : plantingAt(value, plot)
        const dragging = !!drag.live && drag.live.anchor === plot.id
        // Depth is where it STANDS, not which row it is stored under: drag a
        // sapling to the front of the lawn and it has to grow, or the yard
        // stops reading as a yard.
        const h = plotHeight(at.b) * flora.scale * (unpackPercent(value).s ?? 1)
        const Tag = editable ? 'button' : 'span'
        return (
          <Tag
            key={plot.id}
            {...(editable
              ? {
                  onClick: () => {
                    // The click a finished drag fires is not a tap: letting it
                    // through would put down what you just dragged.
                    if (drag.consumeClick()) return
                    picked && picked !== plot.id ? onDrop?.(plot.id) : onPick?.(plot.id)
                  },
                  'aria-label': `${flora.name}, ${plot.label}`,
                  ...drag.bind(plot.id, 'yard', at.x, at.b),
                }
              : {})}
            style={{
              position: 'absolute',
              left: `${at.x}%`,
              bottom: `${at.b}%`,
              // No width: the art inside sets it, so a wide hedge and a narrow
              // lamp post both sit centred on the plot at the right size.
              lineHeight: 0,
              transform: `translateX(-50%)${lifted && !dragging ? ' translateY(-6px) scale(1.08)' : ''}`,
              // A dragged plant tracks the finger; anything else eases.
              transition: dragging ? 'none' : 'transform 160ms ease-out',
              pointerEvents: editable ? 'auto' : 'none',
              padding: 0,
              border: lifted ? '1px dashed var(--gold)' : 'none',
              borderRadius: 8,
              background: 'transparent',
              cursor: editable ? (dragging ? 'grabbing' : lifted ? 'grab' : 'pointer') : 'default',
              // A lifted plant draws over the beds around it, so the thing you
              // are holding is never behind the thing you are dragging it past.
              zIndex: lifted ? 3 : undefined,
            }}
          >
            <PlantArt id={flora.id} height={h} />
          </Tag>
        )
      })}

      {/* The ✕ on the lifted plant, drawn AFTER the targets below it for the
          reason the rooms' badge is the scene's last layer: a target ring over
          the ✕ turns "take this out" into "move it one plot left". */}

      {/* Where a lifted plant can go. An occupied plot trades places rather
          than overwriting, so no tap can lose a plant. */}
      {targets.map((plot) => (
        <button
          key={`t-${plot.id}`}
          onClick={() => onDrop?.(plot.id)}
          aria-label={`Move here: ${plot.label}`}
          style={{
            position: 'absolute',
            ...plotStyle(plantings[plot.id], plot),
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

      {editable && onRemove && picked && pickedPlot && pickedFlora && !drag.live && (
        <SceneRemoveButton
          {...plantingAt(plantings[picked], pickedPlot)}
          height={plotHeight(plantingAt(plantings[picked], pickedPlot).b) * pickedFlora.scale}
          label={`Take the ${pickedFlora.name} out of the yard`}
          onRemove={() => onRemove(picked)}
        />
      )}
    </div>
  )
}

/** A target ring stands where its plot's plant does, so "move here" points at
 *  the place the plant would actually go rather than at the row it is filed
 *  under. */
function plotStyle(value: string | undefined, plot: PlotDef): { left: string; bottom: string } {
  const at = plantingAt(value, plot)
  return { left: `${at.x}%`, bottom: `${at.b}%` }
}

/** One plant on its own, for the picker rows and the ladder. */
export function FloraIcon({ id, size = 40 }: { id: string; size?: number }) {
  if (!PLANTS[id] && !GENERATED_ART[id]) return null
  return (
    <span style={{ display: 'block', flexShrink: 0, lineHeight: 0 }} aria-hidden>
      <PlantArt id={id} height={size} />
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
