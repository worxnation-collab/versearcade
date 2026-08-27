// GENERATED FILE — written by scripts/gen-art.mjs. Do not hand-edit.
//
// Every image in this project comes from Nano Banana (see art/README.md). This
// map is how a finished render reaches the app: the generator writes an entry
// here for each file it produces, and the components that can show generated
// art look themselves up in it.
//
// The point is that there is no second step to forget. Before this existed,
// wiring a batch up meant remembering to add ids to three different lists by
// hand, and an id added before its PNG existed meant a 404 on every render —
// so the list is now written by the only thing that knows what actually
// landed on disk.
//
// An id that isn't here keeps its drawn SVG fallback, which is why a
// half-generated batch degrades to something correct rather than to holes.

export const GENERATED_ART: Record<string, string> = {}
