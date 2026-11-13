import { rewardLabel } from '@/data/season'
import { PIECE_PREFIX, layerName } from '@/data/layered'

/** The name of anything a road shows at a waystation: a reward from its
 *  data, or one of its wardrobe pieces (`piece_<layer id>`, data/layered.ts).
 *  Here rather than in rewardLabel because data/season must not import the
 *  wardrobe (data/layered already imports data/season for road names). */
export function rewardName(id: string): string {
  return id.startsWith(PIECE_PREFIX) ? layerName(id.slice(PIECE_PREFIX.length)) : rewardLabel(id).name
}
