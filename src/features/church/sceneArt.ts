import { churchSkin, type ChurchSkinId } from './skins'
import { tierIndexForLevel, CHURCH_TIERS } from './levels'

// The churchyard paintings: one FIXED scene per skin, each an EMPTY yard —
// ChurchScene stands the drawn building and path on top, so the level ladder
// still shows.
//
// SUPPLIED by the app's owner as finished art (2026-10-21), not generated
// through scripts/gen-art.mjs, so this is a hand-kept table rather than rows
// in GENERATED_ART — the rewardArt.ts rule: a generator run must never be able
// to overwrite or un-wire them.
//
// Fixed, not a rotator: the scene is a pure function of (skin, tier), never of
// the date or a roll, so a church looks the same to everybody every day. The
// only tier split is the tile skin's, which moves to the parish painting from
// Parish Church (level 8) up — the tier the existing ladder already names.
//
// The skin goes through churchSkin(), so null, `custom` and an unknown id all
// land on the default's painting by the same road ChurchArt takes.
const SCENES: Record<ChurchSkinId, string> = {
  tile: '/church/scene_tile.jpg',
  classic: '/church/scene_classic.jpg',
  modern: '/church/scene_modern.jpg',
  glass: '/church/scene_glass.jpg',
}
const TILE_PARISH = '/church/scene_parish.jpg'
const PARISH_INDEX = CHURCH_TIERS.findIndex((t) => t.id === 'parish')

export function churchSceneArt(level: number, skin?: string | null): string {
  const id = churchSkin(skin).id
  if (id === 'tile' && tierIndexForLevel(level) >= PARISH_INDEX) return TILE_PARISH
  return SCENES[id]
}
