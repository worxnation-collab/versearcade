# Layered avatar wardrobe

The art for a mix-and-match character: one locked body per figure and every
item as its own transparent layer, all registered to the same canvas, so any
hat goes with any hair goes with any robe. The existing full skins (Moses,
Esther, Gabriel…) stay as **Legendary Looks** that replace the whole figure,
as they do today.

**Status: art only.** Nothing in the app reads `public/avatar/` yet. The slots,
the layered renderer, the unlock rules and the "see someone's full outfit"
player-card view are the next pieces.

## Files

| Path | What |
|---|---|
| `art/avatar/bases/{masc,fem}.png` | The locked base bodies (720x1456, magenta). **Never regenerate these**: every layer is registered to them. |
| `art/avatar/bases/{fig}_green.png` | The same body in a bright green suit, the subtraction reference for clothing. |
| `art/avatar/items.json` | The manifest: id, slot, `tint`, prompt. |
| `scripts/avatar/layers.py` | `gen` / `extract` / `sheet`. |
| `art/avatar/.raw/` | Raw Kontext edits (gitignored, ~1MB each). Delete one to re-roll it. |
| `public/avatar/{fig}/{id}.webp` | The layers, trimmed, at half resolution (360x728 canvas). |
| `public/avatar/index.json` | Each layer's box on that canvas, plus each item's slot and tint flag. |

## How a layer is made

1. **Edit, don't draw.** Flux Kontext (fal.ai, `fal-ai/flux-pro/kontext`) gets
   the base body and "add ONLY this hat; keep everything else identical".
   Drawing an item on its own puts it at a random size and angle; editing the
   body puts it exactly where it sits on the body.
2. **Subtract.** The edit minus the base is the item, already in place.
3. **Clothing subtracts against the green suit.** A grey robe over a grey suit
   barely differs from it, which shipped holes in the pilot; over bright green
   any garment stands out, and green pixels are discarded.
4. **Tint, don't multiply renders.** `tint: true` items are drawn in grey and
   coloured at runtime by their luminance: ten hair colours from one render.
   Gold armour, wings and crowns are `tint: false` and keep their own colours.

Stack order (back to front): `back` → body → `legs` → `shoes` → `top` → `belt`
→ `hair` → `head` → `held`. A back item extracted against the body will include
anything it overlapped in front; that is fine because the body is drawn above it.

## Running it

```bash
python3 scripts/avatar/layers.py gen            # everything not yet rendered
python3 scripts/avatar/layers.py gen --only head_crown,hair_bun --force
python3 scripts/avatar/layers.py extract
python3 scripts/avatar/layers.py sheet          # contact sheets in art/avatar/.raw/
```

Needs `numpy`, `scipy`, `Pillow`. The fal.ai key is a network secret on the
cloud environment, injected by its proxy for `queue.fal.run`; no file holds it.
About $0.04 a render.

## Known limits

- **Hats are fitted to a bald head.** On big hair (afro, space buns) a hat
  sits inside the hair. Fix in the renderer (hide hair above the brim, or a
  per-hairstyle lift), not by re-rendering.
- **Kontext ignores negatives sometimes**: it gave the vest sleeves and the
  cloak a hood in the pilot. The prompts now say so in capitals; check the
  sheet and re-roll.
- **One body per figure for now.** Builds (slim, sturdy) and ages need their
  own bases and their own garment fits; a hat or hair can likely be shared
  across builds if the head does not move. Height is a runtime stretch.
- **Skin tone is not layered yet**: the body is drawn in one tone. The plan is
  the same tint trick on a skin mask.
