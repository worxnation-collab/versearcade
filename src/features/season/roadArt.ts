// The road's painting, in one place.
//
// The Pilgrimage screen shows it full width at the top; the Play tab's strip
// shows a small window into the same picture. They have to be the same crop of
// the same file or the strip stops being a peek at the place you're about to
// open — which is the entire reason it's there.
//
// `center bottom` is load-bearing: it anchors to the walkable foreground path,
// so whatever a shorter box takes, it takes out of the sky rather than out of
// the ground the figure stands on.
import { catalogArtUrl } from '@/data/catalog'

export const ROAD_ART = '/road/harvest.jpg'

/** The `background` shorthand both surfaces use. The flat colour behind is the
 *  fallback while the painting loads, or if it never does. */
export const ROAD_BACKGROUND = `url(${ROAD_ART}) center bottom / cover no-repeat, #6b4a18`

/**
 * The painting for a given road.
 *
 * A season that can't change its own backdrop isn't really a season — an
 * Advent road drawn over a wheat field is the giveaway that the content is
 * only half data. So a road names a `scene` art id and this resolves it the
 * same way a skin resolves its render: catalog overlay, then bundled, then the
 * Harvest painting. Both surfaces call this, so the strip stays a window into
 * the same picture the screen opens.
 */
export function roadBackground(road?: { scene?: string } | null): string {
  const art = catalogArtUrl(road?.scene) ?? ROAD_ART
  return `url(${art}) center bottom / cover no-repeat, #6b4a18`
}
