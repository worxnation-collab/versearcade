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
| `keep-props.json` | keep props that need regenerating (two shipped unkeyed) | `public/keep/<id>.png` |

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

The keep's props (`RASTER_DECOR` in `KeepArt.tsx`) stay a hand-written list.
They're older, and each one carries a display box and an anchor mode the map
has nowhere to put.

## Two things stay drawn, and it isn't laziness

- **Anything that takes a runtime colour.** The kite shield, the destrier's
  barding and the faction gonfalon are painted in `denominationColor()`, which
  is measured for colourblind separation and is not knowable at generation
  time. A baked image cannot take a colour.
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

`scripts/check-art.mjs` flags any skin whose ink is squarer than 1.05:1 with
`(BUST?)`. For calibration, all fifteen shipped skins are 1.08 (Michael, whose
wings are as wide as he is tall) to 2.71 (ruth_2). It's a heuristic — it cannot
tell a well-drawn bust from a well-drawn figure — so open the file.

Seasonal skins destined for the content catalog go to Supabase Storage rather
than `public/`; see `docs/CONTENT-CATALOG.md`.
