// How a church's building is *painted*, as opposed to how big it is.
//
// The eight buildings in `levels.ts` are the ladder: a congregation climbs them
// by playing, and nobody can buy their way up it. A skin is the other axis and
// the only one money touches — it changes the material the same building is
// made of, never its size, its level, or where it sits on the board. That split
// is deliberate: a church that pays gets to look like *itself*, and a church
// that doesn't still gets the whole ladder. Nothing here can outrank anybody.
//
// Every skin has to work at both ends of the range it's drawn at: 44px in a
// leaderboard row and 220px as the hero on your own church tab.
//
// These used to be the ONLY rendering — "palettes, not pictures" — because 32
// images was a cost and 44px legibility was a worry. Both broke: the art
// pipeline made 32 renders an afternoon, and the renders are prompted (and
// checked by eye on the real board) to hold their silhouette at 44px. So the
// buildings are Nano Banana paintings now (art/church-buildings.json, keyed on
// church_<skin>_<tier> through GENERATED_ART in ChurchArt), and everything in
// this file is the DRAWN FALLBACK plus the palette the rest of the church UI
// still reads — the ground ellipse under the render, the locked preview, and
// any (skin, tier) whose PNG hasn't landed or fails to load. The kit is one
// map entry away, not a rewrite away; do not delete it.
//
// See docs/CHURCH-SKINS.md for how a church ends up wearing one.

export type ChurchSkinId = 'classic' | 'modern' | 'glass' | 'tile'

/** The default every church wears until it's given another one. */
export const DEFAULT_CHURCH_SKIN: ChurchSkinId = 'classic'

/**
 * What a church can ASK for, which is the four skins plus `custom` — "draw our
 * actual building". `custom` is not something `ChurchArt` can render: it's a
 * request for a drawing that doesn't exist yet, so a church whose page is set
 * to it keeps wearing the default until the artwork lands as a real skin.
 */
export type ChurchSkinChoice = ChurchSkinId | 'custom'

/**
 * The colours a skin paints with.
 *
 * Flat fills only, and no gradients or filters anywhere downstream: church art
 * renders many-to-a-page in leaderboard rows, and shared `<defs>` ids across
 * instances are a classic way to get one row silently painting another's
 * colours (see the note at the top of ChurchArt).
 */
export interface ChurchPalette {
  /** Main wall. */
  wall: string
  /** The shaded half of a wall — the same wall out of the light. */
  wallShade: string
  /** Heavier masonry: towers, buttresses, the later tiers. */
  stone: string
  stoneShade: string
  /** Roof, lit and shaded. */
  roof: string
  roofDark: string
  /** Doorways and other openings you can't see into. */
  door: string
  /** Lit window glass, and the deeper tone inside it. */
  glass: string
  glassDeep: string
  /** Crosses, finials, and anything that catches the light. */
  trim: string
  /** Sits under the building on the board row and the scene. */
  ground: string
}

/**
 * How a skin builds, as opposed to how it's coloured.
 *
 * Colour alone doesn't make a modern church read as modern — a violet steeple
 * in grey is still a steeple. Each trait picks a different primitive in
 * `ChurchArt`, so the same tier composition comes out a genuinely different
 * shape on each skin.
 */
export interface ChurchTraits {
  /** Roof over a span: a pitched gable, a flat parapet slab, or barrel tile. */
  roof: 'gable' | 'flat' | 'tile'
  /** Windows and doors: round arch, tall slot, leaded jewel, mission arch. */
  opening: 'arch' | 'slot' | 'leaded' | 'mission'
  /** The big round window: spoked rose, plain oculus, petal rose, quatrefoil. */
  wheel: 'rose' | 'oculus' | 'petals' | 'quatrefoil'
  /** Steeple cap: pyramid, needle blade, tiled pyramid with hips. */
  spire: 'pyramid' | 'blade' | 'tiled'
  /** Wall texture: none, a glass band, coursed stone, stucco. */
  courses: 'plain' | 'band' | 'stone' | 'stucco'
}

export interface ChurchSkin {
  id: ChurchSkinId
  name: string
  /** One line, written for the church choosing it — not for the player. */
  blurb: string
  palette: ChurchPalette
  traits: ChurchTraits
  /**
   * Extra glass colours for `leaded` openings. Picked by a stable per-window
   * index so a window is the same colour on every render — a church whose
   * windows shuffle on a re-render looks broken, not lively.
   */
  jewels?: string[]
}

export const CHURCH_SKINS: ChurchSkin[] = [
  {
    id: 'classic',
    name: 'Classic',
    blurb: 'Cream walls, a violet roof and a gold cross. The house style.',
    palette: {
      wall: '#f3ecdd',
      wallShade: '#cfc3ad',
      stone: '#ddd5ef',
      stoneShade: '#b6a9d6',
      roof: '#7a3ff2',
      roofDark: '#4a2a9e',
      door: '#33206b',
      glass: '#ffd23f',
      glassDeep: '#ff9f1c',
      trim: '#ffd23f',
      ground: '#0b0720',
    },
    traits: { roof: 'gable', opening: 'arch', wheel: 'rose', spire: 'pyramid', courses: 'plain' },
  },
  {
    id: 'modern',
    name: 'Modern',
    blurb: 'Pale concrete, flat roofs and tall glass. A building from this century.',
    palette: {
      wall: '#eef1f6',
      wallShade: '#c0c9d8',
      stone: '#dde3ed',
      stoneShade: '#a7b2c4',
      roof: '#3d4657',
      roofDark: '#262d3a',
      door: '#2b3242',
      glass: '#8fe6e0',
      glassDeep: '#35a8ad',
      trim: '#e3ecf7',
      ground: '#0b0720',
    },
    traits: { roof: 'flat', opening: 'slot', wheel: 'oculus', spire: 'blade', courses: 'band' },
  },
  {
    id: 'glass',
    name: 'Stained glass',
    blurb: 'Pale stone under a lead roof, lit from inside by jewelled windows.',
    palette: {
      wall: '#e4dcf0',
      wallShade: '#b3a6cd',
      stone: '#ece6f6',
      stoneShade: '#b9abd8',
      roof: '#4d5a7a',
      roofDark: '#2f3950',
      door: '#2a2350',
      glass: '#ffd23f',
      glassDeep: '#c8462f',
      trim: '#ffd23f',
      ground: '#0b0720',
    },
    // Ruby, sapphire, emerald, amber, violet — deep enough to read as glass
    // against a pale stone wall rather than as painted shutters.
    jewels: ['#e0405f', '#3f6fe0', '#2fa877', '#f0a828', '#8a54d6'],
    traits: { roof: 'gable', opening: 'leaded', wheel: 'petals', spire: 'pyramid', courses: 'stone' },
  },
  {
    id: 'tile',
    name: 'Tile roof',
    blurb: 'Warm stucco under terracotta barrel tile. Mission bells and a walnut door.',
    palette: {
      wall: '#f7e8d1',
      wallShade: '#d7b98f',
      stone: '#f0dec1',
      stoneShade: '#c9a879',
      roof: '#d2622f',
      roofDark: '#9c3f1c',
      door: '#4a2c1a',
      glass: '#ffdda0',
      glassDeep: '#e08a2c',
      trim: '#e8b44c',
      ground: '#0b0720',
    },
    traits: { roof: 'tile', opening: 'mission', wheel: 'quatrefoil', spire: 'tiled', courses: 'stucco' },
  },
]

const BY_ID = new Map(CHURCH_SKINS.map((s) => [s.id, s]))

/**
 * The skin to draw with. Anything unknown — a null from a church with no page,
 * a `custom` that hasn't been drawn yet, or a value from a newer build — falls
 * back to the default rather than rendering nothing.
 */
export function churchSkin(id?: string | null): ChurchSkin {
  return BY_ID.get((id ?? '') as ChurchSkinId) ?? BY_ID.get(DEFAULT_CHURCH_SKIN)!
}

/** Is this a skin the app can actually draw (as opposed to `custom`)? */
export const isChurchSkinId = (v: unknown): v is ChurchSkinId => BY_ID.has(v as ChurchSkinId)

/** Every value the inquiry may send — mirrored by the check in migration 0051. */
export const CHURCH_SKIN_CHOICES: ChurchSkinChoice[] = [...CHURCH_SKINS.map((s) => s.id), 'custom']
