// How the Upper Room is MADE, as opposed to how far it has come.
//
// The five rooms in data/room.ts are the ladder: level 1, 5, 12, 25 and 40, and
// each one is a real change of silhouette — plaster over brick, then a window,
// then beams, then gilt. That is earned by playing and nothing chooses it.
//
// A skin is the other axis, and it is the exact split the church already makes
// between `levels.ts` and `skins.ts`: it changes the MATERIAL the same room is
// made of, never its size, its tier, or anything anybody could rank. The church
// has had four material languages for its building since 0051; the one space in
// this app that belongs to the player alone had exactly one.
//
// Two decisions that are the whole design:
//
//  - **Every skin is FREE, from the first minute.** This is the character
//    builder's rule, not the church's: "the axes are deliberately three —
//    figure, six skin tones, six hair colours. All free, none of them a number."
//    A room material is a taste, and tastes do not rank. Gating them would add
//    a fifth ladder to a screen whose whole point is that it is yours and not
//    pooled with anybody, and there is nothing here for a gate to protect —
//    every skin is the same room.
//  - **A skin may only repaint what the TIER already draws.** It supplies
//    colours; it never touches `plastered`, `window`, `beams`, `upper` or
//    `gilt`. So a Bare Chamber in cedar is still a bare chamber, and no skin
//    can make a low room look like a high one. Same guarantee "a skinned church
//    is not a bigger church" gives, enforced by the shape of the data rather
//    than by care.

export type RoomSkinId = 'clay' | 'limestone' | 'cedar' | 'dusk'

/** What every room is made of until somebody chooses otherwise. */
export const DEFAULT_ROOM_SKIN: RoomSkinId = 'clay'

/**
 * The colours a skin paints with. Deliberately only the surfaces — walls and
 * floor — plus the wood the fixtures are cut from. Lamplight, gold, cloth and
 * the night sky outside the window are NOT here: they are the room's warmth
 * and they should read the same in every material, or a skin starts changing
 * how lit the room is rather than what it is built from.
 */
export interface RoomPalette {
  /** Lit wall and its shaded half. */
  wall: string
  wallDark: string
  /** Floor, lit and shaded. */
  floor: string
  floorDark: string
  /** Shelf, beams, doorframe — the room's own fixtures, not the player's
   *  furnishings, which stay themselves under every skin. */
  wood: string
  woodDark: string
}

export interface RoomSkinDef {
  id: RoomSkinId
  name: string
  blurb: string
  /**
   * Per-tier walls and floors, five deep — a material still has to get lighter
   * and better-finished as the room climbs, or the ladder stops reading. Only
   * these four values change per tier; the rest of the palette is the skin's.
   */
  tiers: { wall: string; wallDark: string; floor: string; floorDark: string }[]
  wood: string
  woodDark: string
}

// `clay` is the room exactly as it has always been drawn — the five tier rows
// are lifted verbatim from TIERS in RoomArt.tsx, so choosing nothing changes
// nothing. Do not "tidy" these numbers.
export const ROOM_SKINS: RoomSkinDef[] = [
  {
    id: 'clay',
    name: 'Clay',
    blurb: 'Warm mudbrick and lamplight. The room as it was built.',
    tiers: [
      { wall: '#4c3d2c', wallDark: '#3a2f22', floor: '#3f3324', floorDark: '#2f261b' },
      { wall: '#5b4a35', wallDark: '#463829', floor: '#4a3b2a', floorDark: '#382c1f' },
      { wall: '#6a5740', wallDark: '#514231', floor: '#54432f', floorDark: '#3f3223' },
      { wall: '#77624a', wallDark: '#5b4a38', floor: '#5d4a34', floorDark: '#463726' },
      { wall: '#846d52', wallDark: '#65523d', floor: '#65503a', floorDark: '#4c3c2a' },
    ],
    wood: '#6b4f30',
    woodDark: '#4a3722',
  },
  {
    id: 'limestone',
    name: 'Limestone',
    blurb: 'Pale dressed stone, cool against the lamp.',
    tiers: [
      { wall: '#4f4d47', wallDark: '#3c3b36', floor: '#454340', floorDark: '#333230' },
      { wall: '#5f5c54', wallDark: '#494741', floor: '#524f4a', floorDark: '#3e3c38' },
      { wall: '#706c62', wallDark: '#56534b', floor: '#5f5b55', floorDark: '#48453f' },
      { wall: '#807b6f', wallDark: '#625e55', floor: '#6b665f', floorDark: '#514d47' },
      { wall: '#918b7d', wallDark: '#6f6a5f', floor: '#77716a', floorDark: '#5a554f' },
    ],
    wood: '#7a6647',
    woodDark: '#584a33',
  },
  {
    id: 'cedar',
    name: 'Cedar',
    blurb: 'Boarded floor to ceiling, the way the temple was lined.',
    tiers: [
      { wall: '#4a3524', wallDark: '#38281b', floor: '#3e2d1f', floorDark: '#2e2117' },
      { wall: '#5a4029', wallDark: '#45311f', floor: '#4b371f', floorDark: '#392a18' },
      { wall: '#6b4c2f', wallDark: '#523a24', floor: '#573f26', floorDark: '#42301d' },
      { wall: '#7b5836', wallDark: '#5e4429', floor: '#63482b', floorDark: '#4b3721' },
      { wall: '#8c653e', wallDark: '#6b4d2f', floor: '#6f5131', floorDark: '#543d25' },
    ],
    wood: '#8a6438',
    woodDark: '#5f4526',
  },
  {
    id: 'dusk',
    name: 'Dusk',
    blurb: 'Blue-shadowed walls, the hour after the sun goes.',
    tiers: [
      { wall: '#39364f', wallDark: '#2b293d', floor: '#332f45', floorDark: '#262335' },
      { wall: '#45415e', wallDark: '#343149', floor: '#3d3952', floorDark: '#2e2b3e' },
      { wall: '#524d6d', wallDark: '#3e3a54', floor: '#48435f', floorDark: '#363248' },
      { wall: '#5e587b', wallDark: '#48425f', floor: '#524c6b', floorDark: '#3e3952' },
      { wall: '#6b648a', wallDark: '#524c6c', floor: '#5c5578', floorDark: '#46415c' },
    ],
    wood: '#5d5170',
    woodDark: '#413a50',
  },
]

export const roomSkinById = (id?: string | null): RoomSkinDef =>
  ROOM_SKINS.find((s) => s.id === id) ?? ROOM_SKINS[0]

/**
 * The palette for one (skin, tier). Falls back to the default skin and clamps
 * the tier, so an unknown id, a null and a tier from a newer build all land on
 * a real room rather than on undefined — the church kit's `kit.skin.id` rule.
 */
export function roomPalette(skin: string | null | undefined, tier: number): RoomPalette {
  const def = roomSkinById(skin)
  const t = def.tiers[Math.min(def.tiers.length - 1, Math.max(0, tier))]
  return { ...t, wood: def.wood, woodDark: def.woodDark }
}
