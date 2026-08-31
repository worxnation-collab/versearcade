# Art manifests

Every image in this project is generated through **Nano Banana** (Gemini image
models) by `scripts/gen-art.mjs`, so the whole app looks like one hand. A
manifest here is the prompt set for one batch:

```bash
GEMINI_API_KEY=... node scripts/gen-art.mjs art/keep-halls.json
GEMINI_API_KEY=... node scripts/gen-art.mjs art/churchyard-flora.json --only yard_dogwood
```

The key comes only from the environment — `.env.local` is gitignored, and it
must never be written into a tracked file.

| Manifest | What it makes | Lands in |
|---|---|---|
| `keep-halls.json` | halls 2–6 of the keep's six-tier ladder (hall 1 is the existing `hall.jpg`) | `public/keep/hall-<n>.png` |
| `churchyard-flora.json` | the eight plants a giver can put in a churchyard | `public/keep/yard_*.png` |
| `pets.json` | the six companions that stand beside you on the You tab | `public/items/pet_*.png` |
| `keep-props.json` | every picture-backed decoration in the keep's hall | `public/keep/<id>.png` |
| `library.json` | the Study tab (a library), the librarian in it, and the satchel on its floor | `public/keep/study-library.jpg`, `public/keep/study_satchel.png`, `public/skins/librarian.png` |
| `skins-porchlight.json` | the Porchlight creator-collab skin (curls, cream knit, ukulele) | `public/skins/porchlight.png` |
| `arcade.json` | the backdrops of the three arcade machines — the wilderness, the blank page, the workshop wall | `public/arcade/arcade_*.jpg` |

**Check what came back**, every time:

```bash
node scripts/check-art.mjs
```

A model that ignores the chroma-key instruction still returns a fine-looking
file, and it still wires itself into the app — it just renders as an opaque
rectangle behind the object. Two of the keep's props shipped that way and drew
grey boxes on the long table for months before this script found them.

`refs` on an entry passes reference images to the model. That's how the halls
are held to one composition: the anchor coordinates in `src/data/keep.ts` are
measured against a single painting, so every other hall has to put its hearth,
table and arch in the same places or a rug hangs in mid-air. Describing that in
words does not work; showing `hall.jpg` does.

`kind` picks the pipeline (see `docs/RASTER-SKINS.md`):

- **`scene`** — a full-bleed background. No keying, no isolating; capped at
  640px tall. Prompts must say *bare*, loudly and more than once: every hall is
  a room the player furnishes, so anything the generator hangs on the wall is a
  decoration nobody earned.
- **`prop`** — one object on flat magenta, keyed to transparency and cropped
  tight. Capped at 150px tall.
- **`road`** / **`room`** / **`church`** / **`arcade`** — a scene with a folder
  of its own (`public/road`, `public/room`, `public/church`, `public/arcade`),
  always JPEG. Adding another is one row in `gen-art.mjs`'s `SCENE_DIRS` **and**
  one in `check-art.mjs` — that script reads PNG only, so a kind it doesn't know
  about sends it looking for a file the generator never wrote.

**A backdrop the game draws on must be prompted EMPTY, and that is the whole
craft of the arcade batch.** Every arcade painting is under something live: the
manna flakes stand on the wilderness sand, the words lie on the page, the cross
stands on the workshop wall. A flake painted into the sand cannot be tapped, a
word painted onto the page cannot be placed, and a painted cross sits under the
real one — so each prompt lists what must not be in it at least twice and says
plainly that things are drawn on top. Same discipline as the keep's halls saying
*bare* three times, for the same reason.

A scene's ASPECT is worth prompting for deliberately, because the frame has one.
The two tap games' fields are `aspectRatio: 10/15` boxes (`TapRunner`), so their
paintings ask for a 2:3 upright and the wilderness asks for its horizon two
fifths down — where the drawn horizon is, and where `MANNA_PLOTS` start.
`study-library` fills the whole Study tab, so a 16:9 render was a picture of a
room rather than the room; it took two re-prompts (16:9 → 4:5 → **5:8**, asking
in words and giving an example ratio) to land at 398x640, which fills a phone's
content area with nothing cropped. The model follows an explicit ratio well when
it is stated first, in caps, with what it must NOT be.

`"format": "jpg"` on a **scene** gets the road's JPEG encoding without moving to
the road's folder. A full-bleed opaque painting has no use for an alpha channel
and PNG costs a lot for it: `study-library` came back at 1,008KB as a PNG and
166KB as a JPEG at quality 82, visually indistinguishable, on a tab people open
every day. The keep's halls predate the flag and are still PNG. Ignored on
skins, items and props, which are cut-outs and genuinely need the alpha.
- **`skin`** / **`item`** — the avatar pipeline, unchanged.

## Wiring a generated file up

**There is nothing to do.** The generator writes `src/data/generatedArt.ts`
itself — an id → public-path map — and every surface that can show generated art
looks itself up in it. So a render reaches the player the moment it is produced,
and no id can ever point at a file that isn't there.

That file is generated: don't hand-edit it. Entries are **merged**, so running
one manifest (or one `--only`) never un-wires art an earlier batch produced.

Generated art never replaces the drawn fallback, it layers over it, so a batch
that hasn't been run yet degrades to something correct rather than to nothing —
an ungenerated hall still reads as its own room, an ungenerated plant still
grows in its plot. (Halls have one exception, commented where it lives: tier 1
is the original `hall.jpg`, which predates the map and is a `.jpg`.)

The keep's props keep a hand-written list beside the map
(`RASTER_DECOR` in `src/data/keepArt.ts`), because each one carries a display
box and an anchor mode the map has nowhere to put. Two things about that list:

- **The width is derived, not chosen.** The hall stretches a prop to whatever
  box it is given, so `w` must be `h x (png width / png height)` for the file
  that actually renders. Replacing a drawing with a render changes that ratio
  and nothing throws — the prop is just a little squashed forever. So
  `npm run check:decor` (in `npm run build`) runs the real table against the
  real files and prints the width to use. The crossed spears shipped 5% wide
  and the barrel stack 7% wide before it existed.
- **The list is only ever a fallback under the map.** `decorRaster` resolves
  `GENERATED_ART[id] ?? src`, so a render wired up under a decoration's own id
  wins and the old drawing stays underneath it. Anything that reads the table
  directly gets the wrong picture: `DecorThumb` did, which drew the shelf tile
  from the old file while the hall drew the new one, and drew nothing at all
  for the one prop that never had a drawing.

## Two things stay drawn, and it isn't laziness

- **Anything that takes a runtime colour.** The kite shield and the faction
  gonfalon are painted in `denominationColor()`, which is measured for
  colourblind separation and is not knowable at generation time. A baked image
  cannot take a colour — and the measurement is of FLAT SWATCHES, so painting
  one in would move every value and stop two close hues being the pair somebody
  checked.

  **But "takes a colour" no longer means "cannot be generated."** A prop can be
  painted everywhere the colour ISN'T and wear the colour as flat SVG on top —
  `PROP_OVERLAYS` in `KeepArt.tsx`, the same bargain `KeepHall` strikes with a
  painted room and a drawn gonfalon. That is how the destrier is done: the
  prompt asks for undyed cream cloth and explicitly no plume, and the trapper
  band and plume are drawn over the render in fractions of its display box, so
  they survive the render coming back at its own aspect ratio. The kite shield
  stays drawn because it is mostly the colour — lift that off and there is no
  picture left to paint.
- **Church buildings (`ChurchArt`).** Eight tiers x four skins is 32 images for
  something that also has to read at 44px in a leaderboard row, and a picture
  that reads at 44px is a different picture from one that reads at 220px. See
  the note at the top of `features/church/skins.ts`.

## What the models refuse, and what they ignore

Two things bite, both worked around in the manifests rather than fought:

- **False refusals.** `PROHIBITED_CONTENT` came back for "a young lion cub"
  (twice) and for the word "donkey" (twice, having succeeded once). Neither is a
  content problem; the filter is noisy on animal words. Rewording fixes it —
  "burro — a small long-eared member of the horse family" generated first try.
  The lion came back full-grown, so the pet is called *Lion*: naming the art
  what it is beats regenerating until the filter relents.
- **Ignored backgrounds.** Asking once for magenta is not enough — several
  came back on white, mauve, or a wash tinted by the subject's own glow. The
  prompts now put the background clause FIRST, in caps, listing what it must
  not be, and lamps get an extra line saying the glow may not spill onto the
  backdrop. `check-art.mjs` catches the rest.


## Skin manifests and the full-body rule

`art/skins-*.json` are the seasonal character sets (`kind: "skin"` → keyed,
isolated, padded 8% below the feet, capped at 400px tall → `public/skins/`).
Style references (`moses.png`, `esther.png`) ride along automatically on every
`skin` call, so a new road matches the fifteen skins it will stand next to.

**Every skin prompt must demand a full-length standing figure, head to feet,
with both feet at the bottom edge of the frame.** This is not a stylistic
preference. One PNG serves two frames: `Character` crops to a portrait for
avatar chips (`preserveAspectRatio: 'xMidYMin slice'`), and the little worlds —
the Harvest Road, the churchyard crowd, `ProfileHero` — render the same file
with `fullBody`. A bust renders perfectly in every avatar circle in the app and
turns into a floating torso the moment the character stands somewhere.

**A held object has to be described against what the model expects.** The
Porchlight skin needed three separate sentences insisting its instrument was a
*ukulele* — "four-string", "much smaller than a guitar", "about the length of
his forearm", plus "clearly a ukulele, not a guitar" — because the training
prior for "person holding a stringed instrument" is a full-size guitar and one
mention of the word does not beat it. Say the size, the string count and the
negative.

`scripts/check-art.mjs` flags any skin whose ink is squarer than 1.05:1 with
`(BUST?)`. For calibration, all fifteen shipped skins are 1.08 (Michael, whose
wings are as wide as he is tall) to 2.71 (ruth_2). It's a heuristic — it cannot
tell a well-drawn bust from a well-drawn figure — so open the file.

Seasonal skins destined for the content catalog go to Supabase Storage rather
than `public/`; see `docs/CONTENT-CATALOG.md`.
