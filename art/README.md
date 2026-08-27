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

`kind` picks the pipeline (see `docs/RASTER-SKINS.md`):

- **`scene`** — a full-bleed background. No keying, no isolating; capped at
  640px tall. Prompts must say *bare*, loudly and more than once: every hall is
  a room the player furnishes, so anything the generator hangs on the wall is a
  decoration nobody earned.
- **`prop`** — one object on flat magenta, keyed to transparency and cropped
  tight. Capped at 150px tall.
- **`skin`** / **`item`** — the avatar pipeline, unchanged.

## Wiring a generated file up

Generated art never replaces the drawn fallback, it layers over it — so a batch
that hasn't been run yet degrades to something correct rather than to nothing:

- **Halls:** add the tier's index to `PAINTED_TIERS` in
  `src/features/arena/KeepArt.tsx` once its file exists. Not before — an
  `<image>` pointing at a 404 is a flash of the fallback on every open.
- **Flora:** add the id to `RASTER_FLORA` in
  `src/features/church/ChurchFlora.tsx`; anything not listed keeps drawing its
  SVG.

## Two things stay drawn, and it isn't laziness

- **Anything that takes a runtime colour.** The kite shield, the destrier's
  barding and the faction gonfalon are painted in `denominationColor()`, which
  is measured for colourblind separation and is not knowable at generation
  time. A baked image cannot take a colour.
- **Church buildings (`ChurchArt`).** Eight tiers x four skins is 32 images for
  something that also has to read at 44px in a leaderboard row, and a picture
  that reads at 44px is a different picture from one that reads at 220px. See
  the note at the top of `features/church/skins.ts`.
