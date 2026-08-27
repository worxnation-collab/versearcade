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
export const ROAD_ART = '/road/harvest.jpg'

/** The `background` shorthand both surfaces use. The flat colour behind is the
 *  fallback while the painting loads, or if it never does. */
export const ROAD_BACKGROUND = `url(${ROAD_ART}) center bottom / cover no-repeat, #6b4a18`
