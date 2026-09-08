// Overlay skins — the looks that layer ONTO the player's character rather than
// replacing it.
//
// Every other skin swaps the whole figure out: equip Moses and you are Moses,
// and the 72 starter renders, the six skin tones, the six hair colours and all
// eleven items go dark. That is the wardrobe's biggest content investment being
// switched off by its second biggest, and it is why "Take Up Your Cross" was
// built the other way round from the start — the cross is drawn behind YOUR
// character, in your robe and your tone, because the look is "my character
// carrying a cross" rather than a stranger carrying one.
//
// This is that one exception generalised. `cross` used to be a hardcoded branch
// in Character.tsx and the comment on it said so ("adding one here is half the
// job: Character has to know how to draw it"). Now an overlay is a ROW: where
// its art sits, what rotation it takes, and the drawn fallback underneath. Same
// move data/itemArt.tsx made for wearable items, for the same reason — the
// cheapest thing to design should not be the thing that costs a release.
//
// Three rules:
//
//  - **An overlay never resolves through `skinArtUrl`.** That path draws a
//    whole replacement figure, so a render sitting on the skin's own id would
//    quietly delete the character built at the front door — the exact thing
//    these exist not to do. The art is keyed separately (`art`, below).
//  - **It prefers a generated render and falls back to DRAWN paths**, the
//    `GENERATED_ART` bargain: the batch can ship late and nothing breaks.
//  - **It is drawn BEHIND the figure**, always, so the character stays the
//    subject. An overlay that covered the face would be a replacement skin
//    wearing a costume.
//
// Coordinates are Character.tsx's 120x170 viewBox.

import type { ItemShape } from './itemArt'

export interface OverlayDef {
  /** The skin id this layers for. */
  id: string
  /** `GENERATED_ART` key for the render. Deliberately NOT the skin id. */
  art: string
  /**
   * Where the render sits, and how it is turned onto the drawn axis.
   *
   * `mirror` draws the SAME render twice, the second flipped about x = 60 (the
   * centre of Character's 120-wide viewBox — the same mirror the figure's own
   * facing flip uses). It exists because the wings came back from the generator
   * as ONE wing rather than the spread pair the prompt asked for, and one wing
   * mirrored is strictly better than a pair in a single image: it is
   * symmetrical by construction, the gap down the middle where the character
   * stands can't drift, and there is no chance of a body appearing between them
   * — which is the failure a person-shaped prompt keeps inviting.
   */
  box: { x: number; y: number; w: number; h: number; rotate?: [number, number, number]; mirror?: boolean }
  /** Painted under both the render and the fallback — a halo, a wash, a fire. */
  glow?: ItemShape[]
  /** Applied to the glow group, for the pulse in index.css. */
  glowClass?: string
  /** The drawn version, used until the render exists (or if it 404s). */
  drawn: ItemShape[]
}

// Lifted verbatim from Character.tsx, where they used to live. These exact
// values are what the drawn cross has always been.
const CROSS_WOOD = '#6B4E2E'
const CROSS_GRAIN = '#4E3A22'

export const OVERLAYS: OverlayDef[] = [
  {
    // Byte-for-byte the render that shipped: the beam is generated UPRIGHT
    // (art/cross.json) and rotated onto the same axis the drawn version uses —
    // (22,160) to (96,40), midpoint (59,100), 31.7 degrees off vertical — so
    // swapping one for the other moves nothing.
    id: 'cross',
    art: 'cross_beam',
    box: { x: 15, y: 27, w: 88, h: 146, rotate: [31.7, 59, 100] },
    glowClass: 'va-cross-glow',
    glow: [
      { t: 'path', d: 'M22 160 L96 40', stroke: '#FFE7A0', sw: 28, cap: 'round', opacity: 0.3 },
      { t: 'path', d: 'M69 46 L103 60', stroke: '#FFE7A0', sw: 25, cap: 'round', opacity: 0.3 },
      { t: 'path', d: 'M22 160 L96 40', stroke: '#FFD23F', sw: 19, cap: 'round', opacity: 0.48 },
      { t: 'path', d: 'M69 46 L103 60', stroke: '#FFD23F', sw: 17, cap: 'round', opacity: 0.48 },
      { t: 'path', d: 'M22 160 L96 40', stroke: '#FFF6CE', sw: 13, cap: 'round', opacity: 0.6 },
      { t: 'path', d: 'M69 46 L103 60', stroke: '#FFF6CE', sw: 11, cap: 'round', opacity: 0.6 },
    ],
    drawn: [
      { t: 'path', d: 'M22 160 L96 40', stroke: CROSS_WOOD, sw: 11, cap: 'round' },
      { t: 'path', d: 'M69 46 L103 60', stroke: CROSS_WOOD, sw: 9, cap: 'round' },
      { t: 'path', d: 'M27 156 L92 46', stroke: CROSS_GRAIN, sw: 1.3, opacity: 0.5 },
      { t: 'path', d: 'M71 49 L100 60', stroke: CROSS_GRAIN, sw: 1.1, opacity: 0.5 },
    ],
  },
  {
    // John 15:5 — the vine climbing behind the figure, fruit on both sides.
    id: 'vine',
    art: 'overlay_vine',
    box: { x: 6, y: 24, w: 108, h: 146 },
    drawn: [
      { t: 'path', d: 'M20 168 q6 -40 -2 -62 q-6 -18 4 -34', stroke: '#4a6b3a', sw: 4.5, cap: 'round' },
      { t: 'path', d: 'M100 168 q-6 -40 2 -62 q6 -18 -4 -34', stroke: '#4a6b3a', sw: 4.5, cap: 'round' },
      { t: 'path', d: 'M22 108 q-12 -8 -10 -22', stroke: '#5f8a49', sw: 3, cap: 'round' },
      { t: 'path', d: 'M98 108 q12 -8 10 -22', stroke: '#5f8a49', sw: 3, cap: 'round' },
      { t: 'ellipse', cx: 13, cy: 84, rx: 5, ry: 4, fill: '#6f9b52' },
      { t: 'ellipse', cx: 107, cy: 84, rx: 5, ry: 4, fill: '#6f9b52' },
      { t: 'circle', cx: 16, cy: 120, r: 3.4, fill: '#7a5aa8' },
      { t: 'circle', cx: 21, cy: 126, r: 3.4, fill: '#6a4c98' },
      { t: 'circle', cx: 12, cy: 127, r: 3.2, fill: '#6a4c98' },
      { t: 'circle', cx: 104, cy: 120, r: 3.4, fill: '#7a5aa8' },
      { t: 'circle', cx: 99, cy: 126, r: 3.4, fill: '#6a4c98' },
      { t: 'circle', cx: 108, cy: 127, r: 3.2, fill: '#6a4c98' },
    ],
  },
  {
    // Exodus 13:21 — the pillar that went before them, cloud above and fire
    // below, standing behind the figure rather than around it.
    id: 'pillar',
    art: 'overlay_pillar',
    // Pushed ABOVE the frame's top and widened: the render is a tall thin
    // column (101x220), so `meet` inside a shorter box shrinks it until the
    // cloud lands square on the character's head like a hat. Starting at
    // y = -10 puts the cloud behind and above the head where it belongs, and
    // the flame runs the length of the body.
    box: { x: 10, y: -10, w: 100, h: 180 },
    glowClass: 'va-cross-glow',
    glow: [
      { t: 'ellipse', cx: 60, cy: 104, rx: 34, ry: 60, fill: '#ff9f1c', opacity: 0.22 },
      { t: 'ellipse', cx: 60, cy: 122, rx: 24, ry: 42, fill: '#ffd23f', opacity: 0.26 },
    ],
    drawn: [
      { t: 'path', d: 'M44 166 q-6 -46 6 -70 q10 -20 4 -40 q-4 -14 6 -26 q10 12 6 26 q-6 20 4 40 q12 24 6 70 z', fill: '#ffb347', opacity: 0.85 },
      { t: 'path', d: 'M50 166 q-4 -40 4 -60 q8 -16 3 -32 q9 12 4 32 q8 20 4 60 z', fill: '#ffe08a', opacity: 0.9 },
      { t: 'ellipse', cx: 60, cy: 30, rx: 26, ry: 13, fill: '#cdd3e0', opacity: 0.55 },
      { t: 'ellipse', cx: 48, cy: 24, rx: 15, ry: 9, fill: '#e2e6ef', opacity: 0.5 },
      { t: 'ellipse', cx: 73, cy: 25, rx: 14, ry: 8, fill: '#e2e6ef', opacity: 0.5 },
    ],
  },
  {
    // Psalm 17:8 — "the shadow of your wings". Deliberately NOT an angel: the
    // wings shelter the player's own character from behind, and no angel skin
    // reads as something you are wearing.
    id: 'refuge',
    art: 'overlay_refuge',
    // One wing on the left, the same render mirrored on the right, and 26 units
    // of clear space between them for the figure.
    box: { x: 0, y: 26, w: 47, h: 118, mirror: true },
    drawn: [
      { t: 'path', d: 'M52 74 q-30 -14 -46 8 q22 -2 30 8 q-22 2 -28 18 q20 -6 30 4 q-16 8 -18 22 q18 -12 34 -6 z', fill: '#d9cfe8', opacity: 0.9, stroke: '#b7a9d3', sw: 1 },
      { t: 'path', d: 'M68 74 q30 -14 46 8 q-22 -2 -30 8 q22 2 28 18 q-20 -6 -30 4 q16 8 18 22 q-18 -12 -34 -6 z', fill: '#d9cfe8', opacity: 0.9, stroke: '#b7a9d3', sw: 1 },
      { t: 'path', d: 'M52 82 q-18 -6 -30 4', stroke: '#b7a9d3', sw: 1, opacity: 0.7 },
      { t: 'path', d: 'M68 82 q18 -6 30 4', stroke: '#b7a9d3', sw: 1, opacity: 0.7 },
    ],
  },
]

const BY_ID: Record<string, OverlayDef> = Object.fromEntries(OVERLAYS.map((o) => [o.id, o]))

/** The overlay for a skin id, or undefined if it is a replacement skin. */
export const overlayFor = (skinId?: string | null): OverlayDef | undefined =>
  skinId ? BY_ID[skinId] : undefined
