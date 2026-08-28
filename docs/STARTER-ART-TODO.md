# Starter art — what's left to finish

The onboarding character work (picker, raster base, Nano Banana batch) shipped
with **52 of 72** starter renders. This is the runbook for finishing it in a
later session. Background: the "starter character" section in `CLAUDE.md`, the
manifest at `art/starter.json`, and the wiring in `components/Character.tsx`.

## 1. Generate the 20 missing renders (blocked on billing)

The batch died at render 53 with `429 RESOURCE_EXHAUSTED` — *"Your prepayment
credits are depleted"* on the Gemini key. The missing 20 are every **female
hair variant for amber, bronze, umber and ebony** (their espresso bases all
landed). Until they exist, those combinations render the drawn SVG fallback —
correct, just not the painted art.

Steps, once credits are topped up at AI Studio (ai.studio/projects):

```bash
# GEMINI_API_KEY goes in .env.local (gitignored) — never in a tracked file.
set -a; . ./.env.local; set +a
for id in $(node -e "const fs=require('fs');JSON.parse(fs.readFileSync('art/starter.json')).forEach(e=>{if(!fs.existsSync('public/skins/'+e.id+'.png'))console.log(e.id)})"); do
  node scripts/gen-art.mjs art/starter.json --only $id
done
node scripts/check-art.mjs
```

Rules that matter here:

- **Only `--only` the missing ids.** Re-running the whole manifest regenerates
  everything, including the two pilot masters
  (`starter_masc_sand.png` / `starter_fem_sand.png`) that the entire set is
  reference-chained from — regenerating those restyles everything after them.
- Each missing id's reference (its tone's espresso base) already exists on
  disk, so consistency is preserved regardless of generation order.
- After generating: `check-art.mjs` for the chroma key, then an actual look at
  the images — the key check can't see identity drift (the pilot's female
  renders once came back barefoot; the prompts now forbid it, but look).
- Commit the PNGs together with the updated `src/data/generatedArt.ts` (the
  generator rewrites it; that map entry is what switches each render on).

## 2. Decide the Armor of God skin (art exists, unwired)

`public/skins/armor_of_god.png` is a finished, checked render — one full-look
figure wearing all six Ephesians 6 pieces (see `art/armor.json`). It is
deliberately not equippable: wiring it means deciding **what earns it**. The
natural fit is the old gating (pieces unlocked at 7- and 30-day longest
streaks, so a 30-day "full armor" skin honors anyone who'd earned pieces
before `ARMOR_ENABLED` parked them). Wiring is small once decided: a
`FULL_SKINS` entry + the raster mapping + the server-side ownership check the
other earned skins use.

## 3. Housekeeping

- **The Gemini key was pasted into chat twice** — treat it as exposed and
  rotate it in AI Studio, then update `.env.local`. For future remote
  sessions, set `GEMINI_API_KEY` as an environment variable on the Claude
  Code environment instead of re-pasting (the container's `.env.local` does
  not survive between sessions).
- The season catalog (PR #139) can now serve skin art via `skinArtUrl()`;
  the starter base deliberately does **not** go through the catalog — its
  lookup is `GENERATED_ART` directly, because the starter is identity, not
  content to be published or expired.

Delete this file when all of the above is done.
