// Wearable items, as DATA — the one drawn thing in this app a season can add.
//
// Every `item_*` used to be a hardcoded block of SVG inside Character.tsx, one
// `items.held === 'item_staff' &&` branch per object. That made an item the
// CHEAPEST cosmetic in the game to design and the ONLY one that needed an App
// Store release to ship: a road could hand out skins, cosmetics, boosts,
// freezes and mementos, but not a hat. This is that gap closed.
//
// The vocabulary is deliberately tiny, and its smallness is the security
// argument, not a shortcut. An item is a list of primitives — path, rect,
// circle, ellipse — with numbers and `#rrggbb` colours and nothing else. There
// is no href, no url(), no var(), no transform beyond a rotation, no arbitrary
// attribute passthrough and no text. So the worst a bad or hostile catalog row
// can do is draw an ugly shape on one player's own avatar, which is the
// catalog's "code is not content" rule applied to a drawing instead of a link.
//
// It fails closed per SHAPE and per ITEM (`sanitizeItemArt`): an unreadable
// primitive is dropped and the rest of the object still renders; an item with
// nothing left renders as no item, never as a crash and never as an empty slot
// the player can't take off. Same bargain every other sanitiser in
// data/catalog.ts makes.
//
// One rendering difference from the JSX this replaced, checked rather than
// assumed: a shape with no `fill` now draws `fill="none"`, where the old markup
// omitted the attribute and got SVG's default of black. Every bundled item was
// diffed node by node against the previous build — eight are byte-identical and
// the three that differ (item_lamp, item_winnowing_fork, item_gleaner_shawl)
// differ ONLY on that attribute, on paths with zero area, where a black fill
// renders nothing. `none` is also the right default going forward: a catalog
// author writing a closed path and no fill should get an outline, not a black
// blob.
//
// The coordinate space is Character.tsx's own 120x160 viewBox, which is why
// these numbers look like they do: the head is around y=40, the hands around
// y=100, the feet at y=152. A new item is authored against that or it floats.

import { catalogOverlay } from './catalog'

/** The colours a shape may carry are `#rgb` / `#rrggbb` and nothing else —
 *  enforced by `sanitizeItemArt` in data/catalog.ts. */
export interface ShapeBase {
  fill?: string
  stroke?: string
  /** strokeWidth. */
  sw?: number
  /** strokeLinecap. */
  cap?: 'round' | 'butt' | 'square'
  /** strokeDasharray, as `3 3`. */
  dash?: string
  opacity?: number
  /** A rotation, as [degrees, cx, cy]. The only transform there is. */
  rot?: [number, number, number]
}

export type ItemShape =
  | ({ t: 'path'; d: string } & ShapeBase)
  | ({ t: 'rect'; x: number; y: number; w: number; h: number; rx?: number } & ShapeBase)
  | ({ t: 'circle'; cx: number; cy: number; r: number } & ShapeBase)
  | ({ t: 'ellipse'; cx: number; cy: number; rx: number; ry: number } & ShapeBase)

// ── The bundled art ──────────────────────────────────────────────────────────
// Lifted verbatim out of Character.tsx, coordinate for coordinate, so the
// eleven items that already existed draw exactly as they always have. A
// catalog entry overrides one of these by id; it can never remove one, which is
// the catalog's merge rule and the reason an equipped item can't vanish.

export const ITEM_ART: Record<string, ItemShape[]> = {
  // ——— cape (drawn BEHIND the body) ———
  item_cloak: [
    { t: 'path', d: 'M40 64 Q60 60 80 64 L94 152 L26 152 Z', fill: '#6B5030' },
    { t: 'rect', x: 53, y: 63, w: 14, h: 4, rx: 2, fill: '#8A6A3E' },
  ],
  item_gleaner_shawl: [
    { t: 'path', d: 'M42 63 Q60 58 78 63 L90 148 L30 148 Z', fill: '#B49B6C' },
    { t: 'path', d: 'M32 144 L88 144', stroke: '#8A6F42', sw: 2, dash: '3 3' },
    { t: 'rect', x: 54, y: 62, w: 12, h: 4, rx: 2, fill: '#CBB584' },
  ],

  // ——— held (the right hand) ———
  item_staff: [
    { t: 'rect', x: 83, y: 52, w: 3.6, h: 98, rx: 1.8, fill: '#7A5A34' },
    { t: 'path', d: 'M84.8 52 q7 -3 7 5 q0 6 -6 6', stroke: '#7A5A34', sw: 3.4, cap: 'round' },
  ],
  item_scroll: [
    { t: 'rect', x: 79, y: 98, w: 14, h: 7, rx: 3.5, fill: '#EBE0C6', stroke: '#B9A67E' },
    { t: 'circle', cx: 79, cy: 101.5, r: 3.6, fill: '#DED0AE', stroke: '#B9A67E' },
    { t: 'circle', cx: 93, cy: 101.5, r: 3.6, fill: '#DED0AE', stroke: '#B9A67E' },
  ],
  item_lamp: [
    { t: 'ellipse', cx: 85, cy: 104, rx: 7, ry: 4, fill: '#C99A2E', stroke: '#9E7716' },
    { t: 'path', d: 'M91 104 h4', stroke: '#9E7716', sw: 2 },
    { t: 'ellipse', cx: 80, cy: 99, rx: 1.8, ry: 3.4, fill: '#FFB33E' },
  ],
  item_sickle: [
    { t: 'rect', x: 82.5, y: 96, w: 4, h: 18, rx: 2, fill: '#7A5A34' },
    { t: 'path', d: 'M84.5 96 q-14 -14 0 -26 q4 10 10 14 q-2 8 -10 12 z', fill: '#B98A3C', stroke: '#8A6420', sw: 1.2 },
  ],
  item_winnowing_fork: [
    { t: 'rect', x: 83, y: 60, w: 3.6, h: 90, rx: 1.8, fill: '#8A6438' },
    { t: 'path', d: 'M78 60 v-14 M84.8 62 v-18 M91.5 60 v-14', stroke: '#8A6438', sw: 3, cap: 'round' },
    { t: 'path', d: 'M77 61 h15', stroke: '#8A6438', sw: 3.4, cap: 'round' },
  ],
  item_water_skin: [
    { t: 'path', d: 'M80 96 q10 -3 12 6 q2 9 -7 10 q-9 1 -10 -7 q-1 -7 5 -9 z', fill: '#A66A38', stroke: '#7C4C22', sw: 1.2 },
    { t: 'rect', x: 88.5, y: 92, w: 4, h: 6, rx: 1.5, fill: '#7C4C22' },
    { t: 'path', d: 'M80 98 q6 6 11 3', stroke: '#C89864', sw: 1.4 },
  ],

  // ——— hat (the crown of the head) ———
  item_harvest_headscarf: [
    { t: 'path', d: 'M47 47 a13 13 0 0 1 26 0 l0 4 a13 13 0 0 0-26 0 z', fill: '#E4D2A8', stroke: '#B8A06C', sw: 0.8 },
    { t: 'path', d: 'M48 44 a12 12 0 0 1 24 0', stroke: '#C8863C', sw: 2.2 },
    { t: 'path', d: 'M71 48 q6 9 1 21 l-5 -2 q4 -10 0 -17 z', fill: '#E4D2A8', stroke: '#B8A06C', sw: 0.8 },
  ],
  item_headwrap: [
    { t: 'path', d: 'M47 47 a13 13 0 0 1 26 0 l0 3 a13 13 0 0 0-26 0 z', fill: '#CDB183', stroke: '#A98C5C', sw: 0.8 },
    { t: 'path', d: 'M70 46 q7 8 3 22 l-5 -1 q3 -12 -2 -20 z', fill: '#CDB183', stroke: '#A98C5C', sw: 0.8 },
  ],
  item_olive_wreath: [
    { t: 'path', d: 'M47 47 q13 -11 26 0', stroke: '#5E7D1E', sw: 3.4, cap: 'round' },
    { t: 'ellipse', cx: 51, cy: 44, rx: 2.4, ry: 1.4, fill: '#7BA02E', rot: [-35, 51, 44] },
    { t: 'ellipse', cx: 60, cy: 40.5, rx: 2.4, ry: 1.4, fill: '#7BA02E' },
    { t: 'ellipse', cx: 69, cy: 44, rx: 2.4, ry: 1.4, fill: '#7BA02E', rot: [35, 69, 44] },
  ],
}

/**
 * The drawing for an item, catalog first — merge, never replace, so a bundled
 * item is never removed and an equipped one can never vanish. Unknown id (or
 * no id at all, which is the usual case: most slots are empty) draws nothing.
 */
export function itemArtFor(id?: string | null): ItemShape[] {
  if (!id) return []
  const fromCatalog = catalogOverlay().items.find((c) => c.id === id)
  return fromCatalog?.art ?? ITEM_ART[id] ?? []
}

// The sanitiser for a catalog's item art lives in data/catalog.ts rather than
// here, and that is not arbitrary: catalog.ts needs it, this file needs
// `catalogOverlay()`, and two runtime imports pointing at each other is a cycle
// whose failure mode is a module evaluating to undefined at load. The edge back
// from catalog.ts is `import type { ItemShape }`, which is erased.

// ── Rendering ────────────────────────────────────────────────────────────────

/**
 * One item's shapes as SVG nodes. Deliberately NOT a `<g>`: the caller decides
 * where in the stacking order these land, and a cape has to sit behind the body
 * while a hat sits in front of the head.
 */
export function itemNodes(shapes: ItemShape[], keyPrefix: string) {
  return shapes.map((s, i) => {
    // `key` is passed to each element directly rather than spread with the
    // rest: React warns on a spread object carrying one, and the warning is
    // right — a spread key is not a key.
    const key = `${keyPrefix}${i}`
    const common = {
      fill: s.fill ?? 'none',
      stroke: s.stroke,
      strokeWidth: s.sw,
      strokeLinecap: s.cap,
      strokeDasharray: s.dash,
      opacity: s.opacity,
      transform: s.rot ? `rotate(${s.rot[0]} ${s.rot[1]} ${s.rot[2]})` : undefined,
    }
    switch (s.t) {
      case 'path':
        return <path key={key} {...common} d={s.d} />
      case 'rect':
        return <rect key={key} {...common} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx} />
      case 'circle':
        return <circle key={key} {...common} cx={s.cx} cy={s.cy} r={s.r} />
      case 'ellipse':
        return <ellipse key={key} {...common} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} />
    }
  })
}

/**
 * A small picture of one item, for a shelf tile or a reward rail.
 *
 * Bundled items have a rendered PNG in `public/items`; a catalog item never
 * will, because the whole point of it is that it ships without a binary. So
 * this draws the item's own shapes, cropped to the part of the figure its slot
 * occupies — which is why the boxes differ per slot rather than one box being
 * used for all three (the keep's `DecorThumb` makes the same call for the same
 * reason: props are drawn around where they sit, not around their centre).
 */
// Measured against the bundled art rather than guessed: a headwrap's tail
// reaches y=68 while its cap starts at y=32, so a box cropped to the cap alone
// cuts the half that makes it a headwrap.
const SLOT_BOX: Record<string, string> = {
  hat: '43 30 36 40',
  held: '70 42 30 114',
  cape: '22 54 76 100',
}

export function ItemShapeThumb({ id, slot, size = 40 }: { id: string; slot: string; size?: number }) {
  const shapes = itemArtFor(id)
  if (!shapes.length) return null
  return (
    <svg
      width={size}
      height={size}
      viewBox={SLOT_BOX[slot] ?? '20 30 80 126'}
      aria-hidden
      style={{ display: 'block' }}
    >
      {itemNodes(shapes, `thumb-${id}-`)}
    </svg>
  )
}
